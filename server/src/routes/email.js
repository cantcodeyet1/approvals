import { Router } from 'express';
import { supabase } from '../lib/supabaseAdmin.js';
import { downloadFile } from '../lib/storage.js';
import { isEmailConfigured, sendInvoiceEmail } from '../lib/sendgrid.js';

const router = Router();
const BUCKET = 'invoices';

function splitEmails(str) {
  return (str || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function escapeHtml(str) {
  return (str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\n/g, '<br>');
}

function attachmentName(invoice) {
  const base = (invoice.original_filename || invoice.project || 'invoice').replace(/\.pdf$/i, '');
  return invoice.stamped_file_path ? `${base} - Signed.pdf` : `${base}.pdf`;
}

// The client checks this before deciding whether to offer a real send or
// fall back to the download + mailto: flow — lets the same UI demo cleanly
// whether or not SendGrid is set up yet.
router.get('/status', (req, res) => {
  res.json({ available: isEmailConfigured() });
});

router.post('/send', async (req, res) => {
  if (!isEmailConfigured()) {
    return res.status(503).json({ error: 'EMAIL_NOT_CONFIGURED', message: 'Email sending is not configured yet.' });
  }

  const { ids, to, cc, subject, body } = req.body;
  const toList = splitEmails(to);
  if (!Array.isArray(ids) || ids.length === 0) return res.status(400).json({ error: 'No invoices selected' });
  if (toList.length === 0) return res.status(400).json({ error: 'At least one recipient email is required' });

  const { data: invoices, error: fetchError } = await supabase.from('invoices').select('*').in('id', ids);
  if (fetchError) return res.status(500).json({ error: fetchError.message });
  if (!invoices || invoices.length === 0) return res.status(404).json({ error: 'No matching invoices found' });

  try {
    const attachments = await Promise.all(
      invoices.map(async (inv) => {
        const path = inv.stamped_file_path || inv.original_file_path;
        const bytes = await downloadFile(BUCKET, path);
        return { base64: bytes.toString('base64'), filename: attachmentName(inv) };
      })
    );

    const bodyHtml = `<div style="font-family: Tahoma, Verdana, sans-serif; font-size: 14px; color: #1a1a1a;">${escapeHtml(body)}</div>`;

    await sendInvoiceEmail({
      to: toList,
      cc: splitEmails(cc),
      subject: subject || 'Approved invoices',
      bodyHtml,
      attachments,
    });

    res.json({ sent: true });
  } catch (err) {
    if (err.code === 'EMAIL_NOT_CONFIGURED') {
      return res.status(503).json({ error: 'EMAIL_NOT_CONFIGURED', message: err.message });
    }
    res.status(500).json({ error: err.message });
  }
});

export default router;
