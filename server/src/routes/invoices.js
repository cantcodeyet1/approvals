import { Router } from 'express';
import multer from 'multer';
import { ZipArchive } from 'archiver';
import { randomUUID } from 'crypto';
import { supabase } from '../lib/supabaseAdmin.js';
import { uploadFile, downloadFile, signedUrl, deleteFolder } from '../lib/storage.js';
import { stampInvoicePdf } from '../lib/stampPdf.js';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });
const router = Router();
const BUCKET = 'invoices';
const SIGNATURES_BUCKET = 'signatures';

async function withUrls(invoice) {
  const [originalUrl, stampedUrl] = await Promise.all([
    signedUrl(BUCKET, invoice.original_file_path),
    signedUrl(BUCKET, invoice.stamped_file_path),
  ]);
  return { ...invoice, original_file_url: originalUrl, stamped_file_url: stampedUrl };
}

// Resolves the signer to stamp with: an explicit id, or the earliest-created
// signer as the default when the caller doesn't specify one (single-signer case).
async function getSigner(signerId) {
  let query = supabase.from('signers').select('id, full_name, signature_path, signature_width');
  query = signerId ? query.eq('id', signerId) : query.order('created_at').limit(1);
  const { data } = await query.maybeSingle();
  return data;
}

// Builds the download filename from the ORIGINAL uploaded name, not the project —
// e.g. "Site Invoice.pdf" -> "Site Invoice - Signed.pdf" for the stamped copy.
function downloadFilename(invoice, variant) {
  const base = (invoice.original_filename || invoice.project || 'invoice').replace(/\.pdf$/i, '');
  return variant === 'original' ? `${base}.pdf` : `${base} - Signed.pdf`;
}

function timestampForFilename() {
  return new Date().toISOString().replace(/T/, '-').replace(/:/g, '').slice(0, 15);
}

router.get('/', async (req, res) => {
  const status = req.query.status;
  let query = supabase.from('invoices').select('*').order('created_at', { ascending: false });
  if (status && status !== 'all') query = query.eq('status', status);

  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });

  res.json(await Promise.all(data.map(withUrls)));
});

// Bulk download must be registered before the /:id routes so "bulk-download" isn't parsed as an id.
router.get('/bulk-download', async (req, res) => {
  const ids = String(req.query.ids || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (ids.length === 0) return res.status(400).json({ error: 'ids query param is required' });

  const { data: invoices, error } = await supabase.from('invoices').select('*').in('id', ids);
  if (error) return res.status(500).json({ error: error.message });
  if (!invoices || invoices.length === 0) return res.status(404).json({ error: 'No matching invoices found' });

  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', `attachment; filename="approved-invoices-${timestampForFilename()}.zip"`);

  const archive = new ZipArchive({ zlib: { level: 9 } });
  archive.on('error', (err) => res.status(500).end(err.message));
  archive.pipe(res);

  const usedNames = new Set();
  for (const inv of invoices) {
    const path = inv.stamped_file_path || inv.original_file_path;
    let name = downloadFilename(inv, inv.stamped_file_path ? 'stamped' : 'original');
    let suffix = 2;
    while (usedNames.has(name)) {
      name = `${downloadFilename(inv, inv.stamped_file_path ? 'stamped' : 'original').replace(/\.pdf$/i, '')} (${suffix}).pdf`;
      suffix++;
    }
    usedNames.add(name);
    try {
      const buffer = await downloadFile(BUCKET, path);
      archive.append(buffer, { name });
    } catch {
      // skip files that fail to download rather than aborting the whole zip
    }
  }

  archive.finalize();
});

router.get('/:id/download', async (req, res) => {
  const { data: invoice, error } = await supabase.from('invoices').select('*').eq('id', req.params.id).maybeSingle();
  if (error) return res.status(500).json({ error: error.message });
  if (!invoice) return res.status(404).json({ error: 'Invoice not found' });

  const variant = req.query.variant === 'original' ? 'original' : 'stamped';
  const path = variant === 'original' ? invoice.original_file_path : invoice.stamped_file_path;
  if (!path) return res.status(404).json({ error: 'File not available' });

  try {
    const buffer = await downloadFile(BUCKET, path);
    res.attachment(downloadFilename(invoice, variant));
    res.type('application/pdf');
    res.send(buffer);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Load a document without approving it yet — lands in the "pending" queue.
router.post('/pending', upload.single('file'), async (req, res) => {
  const file = req.file;
  if (!file) return res.status(400).json({ error: 'Missing invoice file' });

  const invoiceId = randomUUID();
  const originalPath = `${invoiceId}/original.pdf`;

  try {
    await uploadFile(BUCKET, originalPath, file.buffer, 'application/pdf');
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }

  const { data: invoiceRow, error } = await supabase
    .from('invoices')
    .insert({
      id: invoiceId,
      project: '',
      approved_by: '',
      approved_date: '',
      item_description: null,
      original_file_path: originalPath,
      stamped_file_path: null,
      original_filename: file.originalname,
      status: 'pending',
    })
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json(await withUrls(invoiceRow));
});

// Approve a previously-loaded pending document: stamps its existing original file in place.
router.post('/:id/approve', async (req, res) => {
  const { project, approvedDate, itemDescription, stampX, stampY, stampPage, stampAllPages, includeText, signerId, sigWidth, filename } =
    req.body;
  if (!project || !approvedDate) {
    return res.status(400).json({ error: 'project and approvedDate are required' });
  }

  const { data: invoice, error: fetchError } = await supabase.from('invoices').select('*').eq('id', req.params.id).maybeSingle();
  if (fetchError) return res.status(500).json({ error: fetchError.message });
  if (!invoice) return res.status(404).json({ error: 'Invoice not found' });

  const signer = await getSigner(signerId);
  if (!signer || !signer.signature_path) {
    return res.status(400).json({ error: 'Add a signer with a saved signature in Settings before approving invoices' });
  }

  let pdfBytes, signaturePngBytes;
  try {
    [pdfBytes, signaturePngBytes] = await Promise.all([
      downloadFile(BUCKET, invoice.original_file_path),
      downloadFile(SIGNATURES_BUCKET, signer.signature_path),
    ]);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }

  let stampedBytes;
  try {
    stampedBytes = await stampInvoicePdf({
      pdfBytes,
      approvedBy: signer.full_name,
      date: approvedDate,
      project,
      signaturePngBytes,
      sigWidth: sigWidth ? Number(sigWidth) : signer.signature_width,
      x: stampX !== undefined ? Number(stampX) : undefined,
      y: stampY !== undefined ? Number(stampY) : undefined,
      pageIndex: stampPage !== undefined ? Number(stampPage) : 0,
      includeText: includeText !== false && includeText !== 'false',
      allPages: stampAllPages === true || stampAllPages === 'true',
    });
  } catch (err) {
    return res.status(422).json({ error: `Could not stamp file. Is it a valid PDF? (${err.message})` });
  }

  const stampedPath = `${invoice.id}/stamped.pdf`;
  try {
    await uploadFile(BUCKET, stampedPath, Buffer.from(stampedBytes), 'application/pdf');
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }

  const { data: updatedRow, error: updateError } = await supabase
    .from('invoices')
    .update({
      project,
      approved_by: signer.full_name,
      signer_id: signer.id,
      approved_date: approvedDate,
      item_description: itemDescription ?? null,
      stamped_file_path: stampedPath,
      status: 'approved',
      signed_at: new Date().toISOString(),
      ...(filename && filename.trim() ? { original_filename: filename.trim() } : {}),
    })
    .eq('id', invoice.id)
    .select()
    .single();

  if (updateError) return res.status(500).json({ error: updateError.message });

  await supabase.from('projects').upsert({ id: randomUUID(), name: project }, { onConflict: 'name', ignoreDuplicates: true });

  res.json(await withUrls(updatedRow));
});

router.delete('/:id', async (req, res) => {
  const { data: invoice, error: fetchError } = await supabase.from('invoices').select('id').eq('id', req.params.id).maybeSingle();
  if (fetchError) return res.status(500).json({ error: fetchError.message });
  if (!invoice) return res.status(404).json({ error: 'Invoice not found' });

  const { error } = await supabase.from('invoices').delete().eq('id', req.params.id);
  if (error) return res.status(500).json({ error: error.message });

  await deleteFolder(BUCKET, invoice.id);
  res.status(204).end();
});

// Upload a fresh invoice and approve it immediately in one step.
router.post('/', upload.single('file'), async (req, res) => {
  const { project, approvedDate, itemDescription, stampX, stampY, stampPage, stampAllPages, includeText, signerId, sigWidth, filename } =
    req.body;
  const file = req.file;

  if (!file) return res.status(400).json({ error: 'Missing invoice file' });
  if (!project || !approvedDate) {
    return res.status(400).json({ error: 'project and approvedDate are required' });
  }

  const signer = await getSigner(signerId);
  if (!signer) {
    return res.status(400).json({ error: 'Add a signer in Settings first' });
  }
  if (!signer.signature_path) {
    return res.status(400).json({ error: 'Save a signature in Settings before approving invoices' });
  }

  const invoiceId = randomUUID();
  const originalPath = `${invoiceId}/original.pdf`;
  const stampedPath = `${invoiceId}/stamped.pdf`;

  try {
    await uploadFile(BUCKET, originalPath, file.buffer, 'application/pdf');
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }

  let signaturePngBytes;
  try {
    signaturePngBytes = await downloadFile(SIGNATURES_BUCKET, signer.signature_path);
  } catch (err) {
    return res.status(500).json({ error: `Could not load saved signature: ${err.message}` });
  }

  let stampedBytes;
  try {
    stampedBytes = await stampInvoicePdf({
      pdfBytes: file.buffer,
      approvedBy: signer.full_name,
      date: approvedDate,
      project,
      signaturePngBytes,
      sigWidth: sigWidth ? Number(sigWidth) : signer.signature_width,
      x: stampX !== undefined ? Number(stampX) : undefined,
      y: stampY !== undefined ? Number(stampY) : undefined,
      pageIndex: stampPage !== undefined ? Number(stampPage) : 0,
      includeText: includeText !== 'false',
      allPages: stampAllPages === true || stampAllPages === 'true',
    });
  } catch (err) {
    return res.status(422).json({ error: `Could not stamp file. Is it a valid PDF? (${err.message})` });
  }

  try {
    await uploadFile(BUCKET, stampedPath, Buffer.from(stampedBytes), 'application/pdf');
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }

  const { data: invoiceRow, error } = await supabase
    .from('invoices')
    .insert({
      id: invoiceId,
      project,
      approved_by: signer.full_name,
      signer_id: signer.id,
      approved_date: approvedDate,
      item_description: itemDescription ?? null,
      original_file_path: originalPath,
      stamped_file_path: stampedPath,
      original_filename: filename && filename.trim() ? filename.trim() : file.originalname,
      status: 'approved',
      signed_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });

  await supabase.from('projects').upsert({ id: randomUUID(), name: project }, { onConflict: 'name', ignoreDuplicates: true });

  res.status(201).json(await withUrls(invoiceRow));
});

export default router;
