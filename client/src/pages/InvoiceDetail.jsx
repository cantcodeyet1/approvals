import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api, downloadUrl } from '../lib/api';
import { DownloadIcon, BackArrowIcon, PencilIcon } from '../components/icons.jsx';
import { PageLoading } from '../components/Spinner.jsx';
import { formatDateTime } from '../lib/format';
import StampPositioner from '../components/StampPositioner.jsx';
import PriceCheckPanel from '../components/PriceCheckPanel.jsx';
import LoadingSteps, { totalLoadingDuration } from '../components/LoadingSteps.jsx';
import Select from '../components/Select.jsx';

const stripExt = (name) => (name || '').replace(/\.pdf$/i, '');

const PRICE_CHECK_STEPS = [
  'Reading the invoice document…',
  'Searching the web for comparable listings in Johannesburg…',
  'Cross-referencing supplier prices…',
  'Summarizing findings…',
];

export default function InvoiceDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [invoice, setInvoice] = useState(null);
  const [error, setError] = useState(null);

  const [editing, setEditing] = useState(false);
  const [signers, setSigners] = useState([]);
  const [signerId, setSignerId] = useState(null);
  const [projects, setProjects] = useState([]);
  const [originalFile, setOriginalFile] = useState(null);
  const [filename, setFilename] = useState('');
  const [project, setProject] = useState('');
  const [approvedDate, setApprovedDate] = useState('');
  const [itemDescription, setItemDescription] = useState('');
  const [priceData, setPriceData] = useState(null);
  const [checkingPrice, setCheckingPrice] = useState(false);
  const [includeText, setIncludeText] = useState(true);
  const [stampPosition, setStampPosition] = useState(null);
  const [sigWidth, setSigWidth] = useState(null);
  const [loadingEdit, setLoadingEdit] = useState(false);
  const [saving, setSaving] = useState(false);

  function loadInvoice() {
    return api
      .listInvoices()
      .then((invoices) => {
        const found = invoices.find((inv) => inv.id === id);
        if (!found) throw new Error('Invoice not found');
        setInvoice(found);
      })
      .catch((err) => setError(err.message));
  }

  useEffect(() => {
    loadInvoice();
  }, [id]);

  async function startEditing() {
    setError(null);
    setLoadingEdit(true);
    try {
      const [signerList, projectList, file] = await Promise.all([
        api.listSigners(),
        api.listProjects(),
        api.fetchAsFile(invoice.original_file_url, invoice.original_filename || `${invoice.id}.pdf`),
      ]);
      setSigners(signerList);
      setSignerId(invoice.signer_id && signerList.some((s) => s.id === invoice.signer_id) ? invoice.signer_id : signerList[0]?.id ?? null);
      setProjects(projectList);
      setOriginalFile(file);
      setFilename(stripExt(invoice.original_filename) || 'Untitled document');
      setProject(invoice.project);
      setApprovedDate(invoice.approved_date);
      setItemDescription(invoice.item_description || '');
      setPriceData(null);
      setIncludeText(true);
      setStampPosition(null);
      setSigWidth(null);
      setEditing(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoadingEdit(false);
    }
  }

  async function handleCheckPrice() {
    setError(null);
    if (!itemDescription.trim()) {
      setError('Describe the item/product first so we can look up comparable prices');
      return;
    }
    setCheckingPrice(true);
    setPriceData(null);
    try {
      const [data] = await Promise.all([
        api.checkPrice({ product: itemDescription, location: 'Johannesburg' }),
        new Promise((resolve) => setTimeout(resolve, totalLoadingDuration(PRICE_CHECK_STEPS))),
      ]);
      setPriceData(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setCheckingPrice(false);
    }
  }

  async function handleSaveEdit() {
    setError(null);
    setSaving(true);
    try {
      await api.approveInvoice(invoice.id, {
        project,
        approvedDate,
        itemDescription,
        stampX: stampPosition?.xPt,
        stampY: stampPosition?.yPt,
        stampPage: stampPosition?.page,
        includeText,
        signerId,
        sigWidth: sigWidth || undefined,
        filename,
      });
      setEditing(false);
      await loadInvoice();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  if (error) return <div className="error-banner">{error}</div>;
  if (!invoice) return <PageLoading />;

  const activeSigner = signers.find((s) => s.id === signerId);

  return (
    <div>
      <button className="btn-icon" onClick={() => navigate('/')} aria-label="Back to invoices" title="Back to invoices" style={{ marginBottom: 16 }}>
        <BackArrowIcon size={18} />
      </button>

      <div className="page-header">
        <div>
          <h1>{invoice.project}</h1>
          <p className="subtitle">
            Approved by {invoice.approved_by} on {invoice.approved_date}
            {invoice.signed_at ? ` · Signed ${formatDateTime(invoice.signed_at)}` : ''}
          </p>
        </div>
        {!editing && (
          <button className="btn btn-secondary" onClick={startEditing} disabled={loadingEdit}>
            <PencilIcon />
            {loadingEdit ? 'Loading…' : 'Edit'}
          </button>
        )}
      </div>

      {editing ? (
        <div className="sign-layout">
          <div className="card">
            <StampPositioner
              file={originalFile}
              approvedBy={activeSigner?.full_name}
              date={approvedDate}
              project={project}
              signatureUrl={activeSigner?.signature_url}
              sigWidthPt={sigWidth || activeSigner?.signature_width}
              onResizeSignature={setSigWidth}
              includeText={includeText}
              value={stampPosition}
              onChange={setStampPosition}
            />
          </div>

          <div className="sign-sidebar">
            <div className="card">
              {signers.length > 1 && (
                <div className="field">
                  <label>Signer</label>
                  <Select value={signerId} onChange={setSignerId} options={signers.map((s) => ({ value: s.id, label: s.full_name }))} />
                </div>
              )}

              <div className="field">
                <label>File name</label>
                <input type="text" value={filename} onChange={(e) => setFilename(e.target.value)} />
              </div>

              <div className="field">
                <label>Project</label>
                <Select value={project || null} onChange={setProject} placeholder="Select a project" options={projects.map((p) => ({ value: p.name, label: p.name }))} />
              </div>

              <div className="field">
                <label>Date</label>
                <input type="date" value={approvedDate} onChange={(e) => setApprovedDate(e.target.value)} />
              </div>

              <div className="field" style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <input type="checkbox" checked={includeText} onChange={(e) => setIncludeText(e.target.checked)} style={{ width: 'auto' }} />
                <label style={{ margin: 0 }}>Include "Approved By / Date / Project" text</label>
              </div>
            </div>

            <div className="card">
              <div className="field">
                <label>Item / product description</label>
                <textarea rows={2} value={itemDescription} onChange={(e) => setItemDescription(e.target.value)} />
              </div>
              <button type="button" className="btn btn-secondary" onClick={handleCheckPrice} disabled={checkingPrice} style={{ width: '100%' }}>
                {checkingPrice ? 'Checking…' : 'Check market price (Johannesburg)'}
              </button>
              <LoadingSteps steps={PRICE_CHECK_STEPS} active={checkingPrice} />
              <PriceCheckPanel data={priceData} />
            </div>

            <button className="btn btn-primary" onClick={handleSaveEdit} disabled={saving}>
              {saving ? 'Saving…' : 'Save changes'}
            </button>
            <button className="btn btn-ghost" onClick={() => setEditing(false)} disabled={saving}>
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="card">
          <div className="field">
            <label>Stamped invoice</label>
            {invoice.stamped_file_url ? (
              <iframe className="file-preview-frame" src={invoice.stamped_file_url} title="Stamped invoice" />
            ) : (
              <p className="subtitle">Stamped file not available.</p>
            )}
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            {invoice.stamped_file_url && (
              <a href={downloadUrl(invoice.id, 'stamped')} className="btn btn-primary">
                <DownloadIcon size={15} />
                Download stamped PDF
              </a>
            )}
            {invoice.original_file_url && (
              <a href={downloadUrl(invoice.id, 'original')} className="btn btn-ghost">
                <DownloadIcon size={15} />
                Download original
              </a>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
