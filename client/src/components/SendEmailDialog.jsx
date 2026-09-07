import { useEffect, useState } from 'react';
import { api, downloadHref } from '../lib/api';
import Spinner from './Spinner.jsx';

const stripExt = (name) => (name || 'Untitled document').replace(/\.pdf$/i, '');

// Browsers can't attach a file to a mailto: draft — no browser or OS mail
// client exposes that to a webpage. This is the honest fallback used when
// SendGrid isn't configured yet: download the file(s), then open the
// default mail app with the same subject/body already filled in.
function openMailtoFallback({ to, cc, subject, body }) {
  const params = new URLSearchParams();
  if (cc) params.set('cc', cc);
  if (subject) params.set('subject', subject);
  if (body) params.set('body', body);
  const query = params.toString();
  window.location.href = `mailto:${encodeURIComponent(to || '')}${query ? `?${query}` : ''}`;
}

export default function SendEmailDialog({ open, invoiceIds, invoices, onClose }) {
  const [available, setAvailable] = useState(null); // null = checking, true/false once known
  const [to, setTo] = useState('');
  const [cc, setCc] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(null);
  const [sent, setSent] = useState(false);

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
    setAvailable(null);

    api
      .getEmailStatus()
      .then((res) => setAvailable(res.available))
      .catch(() => setAvailable(false));
  }, [open, invoiceIds, invoices]);

  if (!open) return null;

  async function handleSend() {
    setError(null);
    if (!to.trim()) {
      setError('Add at least one recipient email address');
      return;
    }

    if (available) {
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

  return (
    <div className="confirm-overlay" onClick={onClose}>
      <div className="confirm-dialog email-dialog" onClick={(e) => e.stopPropagation()}>
        <h3>Send via email</h3>

        {available === null && (
          <p className="helper-text" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Spinner size={14} /> Checking email setup…
          </p>
        )}
        {available === true && (
          <span className="pill pill-success" style={{ marginBottom: 16 }}>
            <span className="pill-dot" />
            Sends automatically, attached
          </span>
        )}
        {available === false && (
          <span className="pill pill-warning" style={{ marginBottom: 16 }} title="SendGrid isn't configured yet — this downloads the file(s) and opens your mail app instead">
            <span className="pill-dot" />
            Demo mode — attach manually
          </span>
        )}

        {sent ? (
          <p style={{ margin: '12px 0 20px' }}>
            {available
              ? 'Email sent.'
              : "Downloading the file(s) and opening your mail app — attach the downloaded file(s) before sending."}
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
            <button className="btn btn-primary" onClick={handleSend} disabled={sending || available === null}>
              {sending ? 'Sending…' : available ? 'Send' : 'Continue'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
