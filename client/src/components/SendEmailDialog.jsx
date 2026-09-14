import { useEffect, useRef, useState } from 'react';
import { api, downloadHref } from '../lib/api';
import Spinner from './Spinner.jsx';

const stripExt = (name) => (name || 'Untitled document').replace(/\.pdf$/i, '');

// Browsers can't attach a file to a mailto: draft — no browser or OS mail
// client exposes that to a webpage. This is the honest fallback used when
// neither the Outlook agent nor SendGrid is available: download the
// file(s), then open the default mail app with the same subject/body
// already filled in.
function openMailtoFallback({ to, cc, subject, body }) {
  const params = new URLSearchParams();
  if (cc) params.set('cc', cc);
  if (subject) params.set('subject', subject);
  if (body) params.set('body', body);
  const query = params.toString();
  window.location.href = `mailto:${encodeURIComponent(to || '')}${query ? `?${query}` : ''}`;
}

const MODE_INFO = {
  outlook: { pill: 'pill-success', label: 'Sends from your computer, attached' },
  sendgrid: { pill: 'pill-success', label: 'Sends automatically, attached' },
  demo: { pill: 'pill-warning', label: 'Demo mode — attach manually' },
};

export default function SendEmailDialog({ open, invoiceIds, invoices, onClose }) {
  const [mode, setMode] = useState(null); // null = checking, then 'outlook' | 'sendgrid' | 'demo'
  const [to, setTo] = useState('');
  const [cc, setCc] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(null);
  const [sent, setSent] = useState(false);
  const pollRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const selected = invoiceIds.map((id) => invoices.find((inv) => inv.id === id)).filter(Boolean);
    const names = selected.map((inv) => stripExt(inv.original_filename));
    const plural = names.length > 1;

    setTo('');
    setCc('');
    setSubject(plural ? `${names.length} approved invoices` : `Approved invoice: ${names[0] || ''}`);
    setBody(`Please find the following approved invoice${plural ? 's' : ''} attached:\n\n${names.map((n) => `- ${n}`).join('\n')}`);
    setError(null);
    setSent(false);
    setMode(null);

    api
      .getEmailStatus()
      .then((res) => setMode(res.mode))
      .catch(() => setMode('demo'));

    return () => clearInterval(pollRef.current);
  }, [open, invoiceIds, invoices]);

  if (!open) return null;

  function pollJob(jobId) {
    pollRef.current = setInterval(async () => {
      try {
        const res = await api.getEmailJobStatus(jobId);
        if (res.status === 'sent') {
          clearInterval(pollRef.current);
          setSending(false);
          setSent(true);
        } else if (res.status === 'failed') {
          clearInterval(pollRef.current);
          setSending(false);
          setError(res.error || 'Your computer reported the send failed.');
        }
        // 'pending' / 'claimed' — keep polling
      } catch (err) {
        clearInterval(pollRef.current);
        setSending(false);
        setError(err.message);
      }
    }, 2000);
  }

  async function handleSend() {
    setError(null);
    if (!to.trim()) {
      setError('Add at least one recipient email address');
      return;
    }

    if (mode === 'sendgrid') {
      setSending(true);
      try {
        await api.sendInvoiceEmail({ ids: invoiceIds, to, cc, subject, body });
        setSent(true);
      } catch (err) {
        setError(err.message);
      } finally {
        setSending(false);
      }
      return;
    }

    if (mode === 'outlook') {
      setSending(true);
      try {
        const { jobId } = await api.queueInvoiceEmail({ ids: invoiceIds, to, cc, subject, body });
        pollJob(jobId);
      } catch (err) {
        setError(err.message);
        setSending(false);
      }
      return;
    }

    // Demo/fallback path: trigger the download, then hand off to the mail app.
    const a = document.createElement('a');
    a.href = downloadHref(invoiceIds);
    a.download = '';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    const note = `\n\n(The file${invoiceIds.length > 1 ? 's' : ''} just downloaded to your computer — attach ${
      invoiceIds.length > 1 ? 'them' : 'it'
    } here before sending.)`;
    setTimeout(() => openMailtoFallback({ to, cc, subject, body: body + note }), 300);
    setSent(true);
  }

  const info = mode ? MODE_INFO[mode] : null;

  return (
    <div className="confirm-overlay" onClick={onClose}>
      <div className="confirm-dialog email-dialog" onClick={(e) => e.stopPropagation()}>
        <h3>Send via email</h3>

        {mode === null && (
          <p className="helper-text" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Spinner size={14} /> Checking email setup…
          </p>
        )}
        {info && (
          <span
            className={`pill ${info.pill}`}
            style={{ marginBottom: 16 }}
            title={
              mode === 'outlook'
                ? 'Queued for the Outlook agent running on your PC to send'
                : mode === 'sendgrid'
                  ? 'Sent immediately via SendGrid'
                  : 'Neither the Outlook agent nor SendGrid is available right now — this downloads the file(s) and opens your mail app instead'
            }
          >
            <span className="pill-dot" />
            {info.label}
          </span>
        )}

        {sent ? (
          <p style={{ margin: '12px 0 20px' }}>
            {mode === 'demo'
              ? "Downloading the file(s) and opening your mail app — attach the downloaded file(s) before sending."
              : 'Email sent.'}
          </p>
        ) : (
          <>
            {error && <div className="error-banner">{error}</div>}
            <div className="field">
              <label>To</label>
              <input type="text" value={to} onChange={(e) => setTo(e.target.value)} placeholder="name@example.com, name2@example.com" />
            </div>
            <div className="field">
              <label>CC (optional)</label>
              <input type="text" value={cc} onChange={(e) => setCc(e.target.value)} placeholder="cc@example.com" />
            </div>
            <div className="field">
              <label>Subject</label>
              <input type="text" value={subject} onChange={(e) => setSubject(e.target.value)} />
            </div>
            <div className="field">
              <label>Message</label>
              <textarea
                rows={5}
                value={body}
                onChange={(e) => setBody(e.target.value)}
                style={{ fontFamily: 'Tahoma, Verdana, sans-serif' }}
              />
            </div>
          </>
        )}

        <div className="confirm-actions">
          <button className="btn btn-ghost" onClick={onClose}>
            {sent ? 'Close' : 'Cancel'}
          </button>
          {!sent && (
            <button className="btn btn-primary" onClick={handleSend} disabled={sending || mode === null}>
              {sending ? (mode === 'outlook' ? 'Sending from your computer…' : 'Sending…') : mode === 'demo' ? 'Continue' : 'Send'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
