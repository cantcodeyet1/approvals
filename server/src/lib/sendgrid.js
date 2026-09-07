const SENDGRID_URL = 'https://api.sendgrid.com/v3/mail/send';

// True once a verified sender + API key are actually configured. Lets the
// rest of the app offer a real send when it can, and fall back cleanly
// (client-side, via mailto:) when it can't — see routes/email.js.
export function isEmailConfigured() {
  return Boolean(process.env.SENDGRID_API_KEY && process.env.SENDGRID_FROM_EMAIL);
}

// Sends one email with PDF attachments via SendGrid's Mail Send API.
export async function sendInvoiceEmail({ to, cc, subject, bodyHtml, attachments }) {
  const apiKey = process.env.SENDGRID_API_KEY;
  const fromEmail = process.env.SENDGRID_FROM_EMAIL;
  const fromName = process.env.SENDGRID_FROM_NAME || 'Approvals';
  if (!apiKey || !fromEmail) {
    const err = new Error('Email sending is not configured yet.');
    err.code = 'EMAIL_NOT_CONFIGURED';
    throw err;
  }

  const personalization = { to: to.map((email) => ({ email })) };
  if (cc && cc.length) personalization.cc = cc.map((email) => ({ email }));

  const payload = {
    personalizations: [personalization],
    from: { email: fromEmail, name: fromName },
    subject,
    content: [{ type: 'text/html', value: bodyHtml }],
    attachments: attachments.map((a) => ({
      content: a.base64,
      filename: a.filename,
      type: 'application/pdf',
      disposition: 'attachment',
    })),
  };

  const res = await fetch(SENDGRID_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`SendGrid request failed (${res.status}): ${text.slice(0, 500)}`);
  }
}
