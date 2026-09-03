import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, downloadUrl, downloadHref } from '../lib/api';
import StatusPill from '../components/StatusPill.jsx';
import { DownloadIcon, TrashIcon } from '../components/icons.jsx';
import { PageLoading } from '../components/Spinner.jsx';
import ConfirmDialog from '../components/ConfirmDialog.jsx';
import Select from '../components/Select.jsx';
import { formatDateTime, greeting } from '../lib/format';

const FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'pending', label: 'Waiting for approval' },
  { value: 'approved', label: 'Approved' },
];

export default function Dashboard() {
  const navigate = useNavigate();
  const [invoices, setInvoices] = useState([]);
  const [filter, setFilter] = useState('all');
  const [projectFilter, setProjectFilter] = useState('all');
  const [signedDateFilter, setSignedDateFilter] = useState('');
  const [selected, setSelected] = useState(() => new Set());
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  function refresh() {
    setLoading(true);
    return api
      .listInvoices()
      .then(setInvoices)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    refresh();
  }, []);

  async function handleLoadDocuments(fileList) {
    setError(null);
    setUploading(true);
    try {
      const newIds = [];
      for (const file of Array.from(fileList)) {
        const invoice = await api.uploadPending(file);
        newIds.push(invoice.id);
      }
      navigate(`/sign?ids=${newIds.join(',')}`);
    } catch (err) {
      setError(err.message);
      setUploading(false);
    }
  }

  const [confirmDelete, setConfirmDelete] = useState(null);

  function requestDiscard(e, invoice) {
    e.stopPropagation();
    setConfirmDelete({
      ids: [invoice.id],
      label: `"${(invoice.original_filename || 'Untitled document').replace(/\.pdf$/i, '')}"`,
    });
  }

  function requestBulkDelete(ids) {
    if (ids.length === 0) return;
    setConfirmDelete({ ids, label: `${ids.length} document${ids.length === 1 ? '' : 's'}` });
  }

  async function confirmDiscard() {
    const ids = confirmDelete.ids;
    setConfirmDelete(null);
    setInvoices((prev) => prev.filter((inv) => !ids.includes(inv.id)));
    setSelected((prev) => {
      const next = new Set(prev);
      ids.forEach((id) => next.delete(id));
      return next;
    });
    try {
      await Promise.all(ids.map((id) => api.deleteInvoice(id)));
    } catch (err) {
      setError(err.message);
      refresh();
    }
  }

  function toggleSelected(e, id) {
    e.stopPropagation();
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const projects = useMemo(
    () => [...new Set(invoices.filter((inv) => inv.project).map((inv) => inv.project))].sort(),
    [invoices]
  );

  const visibleInvoices = invoices
    .filter((inv) => filter === 'all' || inv.status === filter)
    .filter((inv) => projectFilter === 'all' || inv.project === projectFilter)
    .filter((inv) => !signedDateFilter || inv.signed_at?.slice(0, 10) === signedDateFilter);

  const allVisibleSelected = visibleInvoices.length > 0 && visibleInvoices.every((inv) => selected.has(inv.id));

  function toggleSelectAll() {
    setSelected((prev) => {
      if (allVisibleSelected) {
        const next = new Set(prev);
        visibleInvoices.forEach((inv) => next.delete(inv.id));
        return next;
      }
      const next = new Set(prev);
      visibleInvoices.forEach((inv) => next.add(inv.id));
      return next;
    });
  }

  const selectedApproved = [...selected].filter((id) => invoices.find((inv) => inv.id === id)?.status === 'approved');
  const selectedPending = [...selected].filter((id) => invoices.find((inv) => inv.id === id)?.status === 'pending');
  const pendingCount = invoices.filter((inv) => inv.status === 'pending').length;

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>{greeting()}, Kuhle</h1>
          <p className="subtitle">
            {pendingCount === 0 ? 'Nothing is waiting for you right now.' : `${pendingCount} document${pendingCount === 1 ? ' is' : 's are'} waiting for you.`}
          </p>
        </div>
      </div>

      {error && <div className="error-banner">{error}</div>}

      <div style={{ marginBottom: 24 }}>
        <label className="btn btn-primary" style={{ width: 'fit-content', cursor: uploading ? 'not-allowed' : 'pointer' }}>
          {uploading ? 'Uploading…' : 'Upload documents'}
          <input
            type="file"
            accept="application/pdf"
            multiple
            disabled={uploading}
            onChange={(e) => e.target.files.length && handleLoadDocuments(e.target.files)}
            style={{ display: 'none' }}
          />
        </label>
        <p className="helper-text" style={{ marginTop: 10, marginBottom: 0 }}>
          They'll wait for approval until you sign them.
        </p>
      </div>

      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
        <div className="tabs-underline">
          {FILTERS.map((f) => (
            <button key={f.value} className={filter === f.value ? 'active' : ''} onClick={() => setFilter(f.value)} type="button">
              {f.label}
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {projects.length > 0 && (
            <div style={{ width: 180 }}>
              <Select
                value={projectFilter}
                onChange={setProjectFilter}
                options={[{ value: 'all', label: 'All projects' }, ...projects.map((p) => ({ value: p, label: p }))]}
              />
            </div>
          )}
          <input
            type="date"
            value={signedDateFilter}
            onChange={(e) => setSignedDateFilter(e.target.value)}
            title="Filter by signed date"
            style={{ width: 'auto' }}
          />
          {signedDateFilter && (
            <button className="btn-ghost" type="button" onClick={() => setSignedDateFilter('')}>
              Clear date
            </button>
          )}
        </div>
      </div>

      {(selectedPending.length > 0 || selectedApproved.length > 0) && (
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 16 }}>
          {selectedPending.length > 0 && (
            <div className="selection-pill">
              <span>{selectedPending.length} selected</span>
              <button onClick={() => navigate(`/sign?ids=${selectedPending.join(',')}`)}>Sign →</button>
              <span className="pill-divider" />
              <button className="danger-link" onClick={() => requestBulkDelete(selectedPending)}>
                Delete →
              </button>
            </div>
          )}
          {selectedApproved.length > 0 && (
            <div className="selection-pill">
              <span>{selectedApproved.length} selected</span>
              <a href={downloadHref(selectedApproved)}>Download →</a>
              <span className="pill-divider" />
              <button className="danger-link" onClick={() => requestBulkDelete(selectedApproved)}>
                Delete →
              </button>
            </div>
          )}
        </div>
      )}

      {loading ? (
        <PageLoading />
      ) : visibleInvoices.length === 0 ? (
        <div className="card empty-state">Nothing here yet.</div>
      ) : (
        <>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--text-muted)', marginBottom: 10, cursor: 'pointer', width: 'fit-content' }}>
            <input type="checkbox" checked={allVisibleSelected} onChange={toggleSelectAll} style={{ width: 'auto' }} />
            Select all
          </label>
          <div className="invoice-list">
            {visibleInvoices.map((inv) => (
              <div
                className="invoice-row"
                key={inv.id}
                onClick={() => navigate(inv.status === 'pending' ? `/sign?ids=${inv.id}` : `/invoice/${inv.id}`)}
              >
                <div className="invoice-row-main">
                  <input
                    type="checkbox"
                    checked={selected.has(inv.id)}
                    onChange={(e) => toggleSelected(e, inv.id)}
                    onClick={(e) => e.stopPropagation()}
                    style={{ width: 'auto', flexShrink: 0 }}
                  />
                  {inv.status === 'pending' ? (
                    <div className="invoice-row-text">
                      <div className="invoice-row-title">{(inv.original_filename || 'Untitled document').replace(/\.pdf$/i, '')}</div>
                      <div className="invoice-row-meta">Loaded {formatDateTime(inv.created_at)}</div>
                    </div>
                  ) : (
                    <div className="invoice-row-text">
                      <div className="invoice-row-title">{(inv.original_filename || 'Untitled document').replace(/\.pdf$/i, '')}</div>
                      <div className="invoice-row-meta">
                        {inv.project}
                        {inv.item_description ? ` · ${inv.item_description}` : ''}
                        {inv.signed_at ? ` · Signed ${formatDateTime(inv.signed_at)}` : ''}
                      </div>
                    </div>
                  )}
                </div>
                <div className="invoice-row-actions">
                  {inv.status === 'pending' ? (
                    <>
                      <button className="btn-icon danger" onClick={(e) => requestDiscard(e, inv)} title="Discard" aria-label="Discard">
                        <TrashIcon />
                      </button>
                      <StatusPill status="pending" />
                    </>
                  ) : (
                    <>
                      <button className="btn-icon danger" onClick={(e) => requestDiscard(e, inv)} title="Discard" aria-label="Discard">
                        <TrashIcon />
                      </button>
                      <a
                        className="btn-icon"
                        href={downloadUrl(inv.id, 'stamped')}
                        title="Download"
                        aria-label="Download"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <DownloadIcon />
                      </a>
                      <StatusPill status="approved" />
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      <ConfirmDialog
        open={!!confirmDelete}
        title={confirmDelete && confirmDelete.ids.length > 1 ? 'Discard these documents?' : 'Discard this document?'}
        message={`${confirmDelete ? confirmDelete.label : ''} will be permanently removed. This can't be undone.`}
        confirmLabel="Discard"
        danger
        onConfirm={confirmDiscard}
        onCancel={() => setConfirmDelete(null)}
      />
    </div>
  );
}
