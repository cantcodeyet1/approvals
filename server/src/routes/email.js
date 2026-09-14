import { Router } from 'express';
import { supabase } from '../lib/supabaseAdmin.js';
import { downloadFile, signedUrl } from '../lib/storage.js';
import { isEmailConfigured, sendInvoiceEmail } from '../lib/sendgrid.js';
import { createJob, getJob, claimNextJob, completeJob, isAgentOnline, recordAgentSeen } from '../lib/emailQueue.js';

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

async function fetchInvoices(ids) {
  const { data, error } = await supabase.from('invoices').select('*').in('id', ids);
  if (error) throw new Error(error.message);
  return data || [];
}

// Locks down the agent-only endpoints — these cause a real PC to send real
// email, so they need more than the "no auth anywhere else" the rest of this
// internal tool gets away with.
function requireAgentSecret(req, res, next) {
  const expected = process.env.EMAIL_AGENT_SECRET;
  if (!expected) return res.status(503).json({ error: 'AGENT_NOT_CONFIGURED', message: 'EMAIL_AGENT_SECRET is not set on the server.' });
  if (req.get('X-Agent-Secret') !== expected) return res.status(401).json({ error: 'Unauthorized' });
  next();
}

// A saved default subject/body that pre-fills the compose dialog — still
// fully editable per send, just saves retyping the same boilerplate.
router.get('/template', async (req, res) => {
  const { data, error } = await supabase.from('email_settings').select('*').eq('id', 'default').maybeSingle();
  if (error) return res.status(500).json({ error: error.message });
  res.json({ subject: data?.default_subject || '', body: data?.default_body || '' });
});

router.put('/template', async (req, res) => {
  const { subject, body } = req.body;
  const { error } = await supabase
    .from('email_settings')
    .upsert({ id: 'default', default_subject: subject || null, default_body: body || null, updated_at: new Date().toISOString() });
  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true });
});

// The client checks this before deciding how to send: a real, immediate
// send via SendGrid; a queued send via the Outlook agent (if it's currently
// polling); or the download + mailto: fallback if neither is configured.
router.get('/status', (req, res) => {
  if (isAgentOnline()) return res.json({ available: true, mode: 'outlook' });
  if (isEmailConfigured()) return res.json({ available: true, mode: 'sendgrid' });
  res.json({ available: false, mode: 'demo' });
});

router.post('/send', async (req, res) => {
  if (!isEmailConfigured()) {
    return res.status(503).json({ error: 'EMAIL_NOT_CONFIGURED', message: 'Email sending is not configured yet.' });
  }

  const { ids, to, cc, subject, body } = req.body;
  const toList = splitEmails(to);
  if (!Array.isArray(ids) || ids.length === 0) return res.status(400).json({ error: 'No invoices selected' });
  if (toList.length === 0) return res.status(400).json({ error: 'At least one recipient email is required' });

  let invoices;
  try {
    invoices = await fetchInvoices(ids);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
  if (invoices.length === 0) return res.status(404).json({ error: 'No matching invoices found' });

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

// --- Outlook-relay queue: web app enqueues, the Windows agent polls & sends ---

// Called by the web app to queue a send for the agent to pick up.
router.post('/queue', async (req, res) => {
  const { ids, to, cc, subject, body } = req.body;
  const toList = splitEmails(to);
  if (!Array.isArray(ids) || ids.length === 0) return res.status(400).json({ error: 'No invoices selected' });
  if (toList.length === 0) return res.status(400).json({ error: 'At least one recipient email is required' });

  try {
    await fetchInvoices(ids); // validates the ids exist before queuing
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }

  const job = createJob({ invoiceIds: ids, to: toList.join(', '), cc: splitEmails(cc).join(', '), subject, body });
  res.status(201).json({ jobId: job.id, status: job.status });
});

// Called by the web app (polling) to find out whether the agent has sent it yet.
router.get('/jobs/:id', (req, res) => {
  const job = getJob(req.params.id);
  if (!job) return res.status(404).json({ error: 'Job not found' });
  res.json({ status: job.status, error: job.error });
});

// Called by the Windows agent to pick up (at most) one pending job and get
// everything it needs to send it — including signed URLs for the actual
// attachments, so the agent never needs direct storage access.
router.get('/agent/poll', requireAgentSecret, async (req, res) => {
  const job = claimNextJob();
  if (!job) return res.json({ job: null });

  try {
    const invoices = await fetchInvoices(job.invoiceIds);
    const attachments = await Promise.all(
      invoices.map(async (inv) => {
        const path = inv.stamped_file_path || inv.original_file_path;
        const url = await signedUrl(BUCKET, path, 300);
        return { filename: attachmentName(inv), url };
      })
    );

    res.json({
      job: {
        id: job.id,
        to: job.to,
        cc: job.cc,
        subject: job.subject,
        body: job.body,
        attachments,
      },
    });
  } catch (err) {
    completeJob(job.id, { success: false, error: err.message });
    res.status(500).json({ error: err.message });
  }
});

// A no-op the agent can call between jobs just to keep "online" status fresh
// without waiting for an actual job (so the UI's mode detection stays live).
router.post('/agent/heartbeat', requireAgentSecret, (req, res) => {
  recordAgentSeen();
  res.json({ ok: true });
});

router.post('/agent/jobs/:id/complete', requireAgentSecret, (req, res) => {
  const { success, error } = req.body;
  const job = completeJob(req.params.id, { success: Boolean(success), error });
  if (!job) return res.status(404).json({ error: 'Job not found' });
  res.json({ ok: true });
});

export default router;
