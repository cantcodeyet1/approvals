const BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000';

async function request(path, options = {}) {
  const res = await fetch(`${BASE_URL}${path}`, options);
  const contentType = res.headers.get('content-type') || '';
  const body = contentType.includes('application/json') ? await res.json() : null;

  if (!res.ok) {
    throw new Error(body?.error || `Request failed (${res.status})`);
  }
  return body;
}

// File URLs come back from the API as absolute, short-lived Supabase Storage signed URLs.
// Pass them straight through; only prefix genuinely relative paths (e.g. from an older/local backend).
export function fileUrl(path) {
  if (!path) return null;
  return /^https?:\/\//.test(path) ? path : `${BASE_URL}${path}`;
}

export function downloadUrl(invoiceId, variant = 'stamped') {
  return `${BASE_URL}/api/invoices/${invoiceId}/download?variant=${variant}`;
}

export function bulkDownloadUrl(invoiceIds) {
  return `${BASE_URL}/api/invoices/bulk-download?ids=${invoiceIds.join(',')}`;
}

// A single file never needs zipping — go straight to its own download.
export function downloadHref(invoiceIds) {
  return invoiceIds.length === 1 ? downloadUrl(invoiceIds[0], 'stamped') : bulkDownloadUrl(invoiceIds);
}

function withSignerUrl(signer) {
  return { ...signer, signature_url: fileUrl(signer.signature_url) };
}

export const api = {
  listSigners: async () => {
    const signers = await request('/api/signers');
    return signers.map(withSignerUrl);
  },
  addSigner: ({ fullName, signatureBlob, signatureWidth }) => {
    const form = new FormData();
    form.append('fullName', fullName);
    if (signatureBlob) form.append('signature', signatureBlob, 'signature.png');
    if (signatureWidth !== undefined) form.append('signatureWidth', signatureWidth);
    return request('/api/signers', { method: 'POST', body: form }).then(withSignerUrl);
  },
  updateSigner: (id, { fullName, signatureBlob, signatureWidth }) => {
    const form = new FormData();
    form.append('fullName', fullName);
    if (signatureBlob) form.append('signature', signatureBlob, 'signature.png');
    if (signatureWidth !== undefined) form.append('signatureWidth', signatureWidth);
    return request(`/api/signers/${id}`, { method: 'PUT', body: form }).then(withSignerUrl);
  },
  deleteSigner: (id) => request(`/api/signers/${id}`, { method: 'DELETE' }),
  listProjects: () => request('/api/projects'),
  addProject: (name) =>
    request('/api/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    }),
  deleteProject: (id) => request(`/api/projects/${id}`, { method: 'DELETE' }),
  listInvoices: async (status) => {
    const query = status && status !== 'all' ? `?status=${encodeURIComponent(status)}` : '';
    const invoices = await request(`/api/invoices${query}`);
    return invoices.map((inv) => ({
      ...inv,
      original_file_url: fileUrl(inv.original_file_url),
      stamped_file_url: fileUrl(inv.stamped_file_url),
    }));
  },
  uploadPending: async (file) => {
    const form = new FormData();
    form.append('file', file);
    const invoice = await request('/api/invoices/pending', { method: 'POST', body: form });
    return {
      ...invoice,
      original_file_url: fileUrl(invoice.original_file_url),
      stamped_file_url: fileUrl(invoice.stamped_file_url),
    };
  },
  approveInvoice: async (
    id,
    { project, approvedDate, itemDescription, stampX, stampY, stampPage, stampAllPages, includeText, signerId, sigWidth, filename }
  ) => {
    const invoice = await request(`/api/invoices/${id}/approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        project,
        approvedDate,
        itemDescription,
        stampX,
        stampY,
        stampPage,
        stampAllPages,
        includeText,
        signerId,
        sigWidth,
        filename,
      }),
    });
    return {
      ...invoice,
      original_file_url: fileUrl(invoice.original_file_url),
      stamped_file_url: fileUrl(invoice.stamped_file_url),
    };
  },
  deleteInvoice: (id) => request(`/api/invoices/${id}`, { method: 'DELETE' }),
  // Re-hydrates a File object from an already-uploaded original, for feeding into the stamp positioner.
  fetchAsFile: async (url, filename) => {
    const res = await fetch(url);
    const blob = await res.blob();
    return new File([blob], filename, { type: 'application/pdf' });
  },
  createInvoice: async ({
    file,
    project,
    approvedDate,
    itemDescription,
    stampX,
    stampY,
    stampPage,
    stampAllPages,
    includeText,
    signerId,
    sigWidth,
    filename,
  }) => {
    const form = new FormData();
    form.append('file', file);
    form.append('project', project);
    form.append('approvedDate', approvedDate);
    if (itemDescription) form.append('itemDescription', itemDescription);
    if (stampX !== undefined && stampY !== undefined) {
      form.append('stampX', stampX);
      form.append('stampY', stampY);
    }
    if (stampPage !== undefined) form.append('stampPage', stampPage);
    if (stampAllPages) form.append('stampAllPages', 'true');
    if (signerId) form.append('signerId', signerId);
    if (sigWidth) form.append('sigWidth', sigWidth);
    if (filename) form.append('filename', filename);
    form.append('includeText', includeText === false ? 'false' : 'true');
    const invoice = await request('/api/invoices', { method: 'POST', body: form });
    return {
      ...invoice,
      original_file_url: fileUrl(invoice.original_file_url),
      stamped_file_url: fileUrl(invoice.stamped_file_url),
    };
  },
  // Reads the invoice PDF itself to research comparable prices — no manual
  // product description needed.
  checkPrice: ({ file, location, invoiceId }) => {
    const form = new FormData();
    form.append('file', file);
    if (location) form.append('location', location);
    if (invoiceId) form.append('invoiceId', invoiceId);
    return request('/api/price-check', { method: 'POST', body: form });
  },
};
