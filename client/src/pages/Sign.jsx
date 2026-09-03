import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api, downloadUrl, downloadHref } from '../lib/api';
import StampPositioner from '../components/StampPositioner.jsx';
import PriceCheckPanel from '../components/PriceCheckPanel.jsx';
import LoadingSteps, { totalLoadingDuration } from '../components/LoadingSteps.jsx';
import { DownloadIcon, BackArrowIcon } from '../components/icons.jsx';
import Spinner, { PageLoading } from '../components/Spinner.jsx';
import Select from '../components/Select.jsx';

const today = () => new Date().toISOString().slice(0, 10);
const stripExt = (name) => (name || '').replace(/\.pdf$/i, '');

const PRICE_CHECK_STEPS = [
  'Reading the invoice document…',
  'Searching the web for comparable listings in Johannesburg…',
  'Cross-referencing supplier prices…',
  'Summarizing findings…',
];

let localIdCounter = 0;
const nextLocalId = () => `local-${++localIdCounter}`;

export default function Sign() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [signers, setSigners] = useState([]);
  const [signerId, setSignerId] = useState(null);
  const [projects, setProjects] = useState([]);
  const [docs, setDocs] = useState([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [signing, setSigning] = useState(false);
  const [signedCount, setSignedCount] = useState(0);
  const [loadingPending, setLoadingPending] = useState(() => Boolean(searchParams.get('ids')));
  const [checkingPrice, setCheckingPrice] = useState(false);
  const [error, setError] = useState(null);

  // When multiple documents are loaded, these fields are shared across all of
  // them by default (editing one edits all) until switched off per field.
  const [linkProject, setLinkProject] = useState(true);
  const [linkDate, setLinkDate] = useState(true);
  const [linkStamp, setLinkStamp] = useState(true);

  useEffect(() => {
    Promise.all([api.listSigners(), api.listProjects()]).then(async ([signerList, projectList]) => {
      setSigners(signerList);
      setSignerId(signerList[0]?.id ?? null);
      setProjects(projectList);

      const ids = (searchParams.get('ids') || '').split(',').filter(Boolean);
      if (ids.length === 0) return;

      setLoadingPending(true);
      try {
        const allInvoices = await api.listInvoices();
        const pendingInvoices = allInvoices.filter((inv) => ids.includes(inv.id));
        const hydrated = await Promise.all(
          pendingInvoices.map(async (inv) => ({
            localId: nextLocalId(),
            invoiceId: inv.id,
            file: await api.fetchAsFile(inv.original_file_url, inv.original_filename || `${inv.id}.pdf`),
            filename: stripExt(inv.original_filename) || 'Untitled document',
            project: projectList[0]?.name || '',
            approvedDate: today(),
            itemDescription: '',
            priceData: null,
            includeText: true,
            stampPosition: null,
            sigWidth: null,
            stampAllPages: false,
            status: 'pending',
            resultInvoice: null,
            errorMsg: null,
          }))
        );
        setDocs(hydrated);
        setActiveIndex(0);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoadingPending(false);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleFilesSelected(fileList) {
    const defaultProject = docs[activeIndex]?.project || projects[0]?.name || '';
    const newDocs = Array.from(fileList).map((file) => ({
      localId: nextLocalId(),
      invoiceId: null,
      file,
      filename: stripExt(file.name),
      project: defaultProject,
      approvedDate: today(),
      itemDescription: '',
      priceData: null,
      includeText: true,
      stampPosition: null,
      sigWidth: null,
      stampAllPages: false,
      status: 'pending', // pending | signing | done | error
      resultInvoice: null,
      errorMsg: null,
    }));
    setDocs((prev) => [...prev, ...newDocs]);
    if (docs.length === 0) setActiveIndex(0);
  }

  function updateActiveDoc(patch) {
    setDocs((prev) => prev.map((d, i) => (i === activeIndex ? { ...d, ...patch } : d)));
  }

  // Applies a field change to every document when that field is "linked"
  // (the default for a batch), or just the active document when it isn't.
  function updateField(field, value, linked) {
    if (docs.length > 1 && linked) {
      setDocs((prev) => prev.map((d) => ({ ...d, [field]: value })));
    } else {
      updateActiveDoc({ [field]: value });
    }
  }

  // Toggling a field back to "linked" re-syncs every document to the active
  // document's current value, so the link's meaning stays obvious.
  function setLinkField(key, checked) {
    if (key === 'project') setLinkProject(checked);
    if (key === 'date') setLinkDate(checked);
    if (key === 'stamp') setLinkStamp(checked);
    if (!checked) return;
    if (key === 'project') setDocs((prev) => prev.map((d) => ({ ...d, project: activeDoc.project })));
    if (key === 'date') setDocs((prev) => prev.map((d) => ({ ...d, approvedDate: activeDoc.approvedDate })));
    if (key === 'stamp')
      setDocs((prev) =>
        prev.map((d) => ({
          ...d,
          stampPosition: activeDoc.stampPosition,
          sigWidth: activeDoc.sigWidth,
          stampAllPages: activeDoc.stampAllPages,
        }))
      );
  }

  function removeDoc(index) {
    setDocs((prev) => prev.filter((_, i) => i !== index));
    setActiveIndex((prev) => Math.max(0, Math.min(prev, docs.length - 2)));
  }

  async function handleCheckPrice() {
    setError(null);
    if (!activeDoc.itemDescription.trim()) {
      setError('Describe the item/product first so we can look up comparable prices');
      return;
    }
    setCheckingPrice(true);
    updateActiveDoc({ priceData: null });
    try {
      const [data] = await Promise.all([
        api.checkPrice({ product: activeDoc.itemDescription, location: 'Johannesburg' }),
        new Promise((resolve) => setTimeout(resolve, totalLoadingDuration(PRICE_CHECK_STEPS))),
      ]);
      updateActiveDoc({ priceData: data });
    } catch (err) {
      setError(err.message);
    } finally {
      setCheckingPrice(false);
    }
  }

  async function handleSignAll() {
    setError(null);
    const signer = signers.find((s) => s.id === signerId);
    if (!signer || !signer.signature_path) {
      setError('Add a signer with a saved signature in Settings first');
      return;
    }
    if (docs.some((d) => !d.project)) {
      setError('Every document needs a project selected');
      return;
    }

    setSigning(true);
    setSignedCount(docs.filter((d) => d.status === 'done').length);
    for (let i = 0; i < docs.length; i++) {
      if (docs[i].status === 'done') continue;
      setDocs((prev) => prev.map((d, idx) => (idx === i ? { ...d, status: 'signing' } : d)));
      try {
        const payload = {
          project: docs[i].project,
          approvedDate: docs[i].approvedDate,
          itemDescription: docs[i].itemDescription,
          stampX: docs[i].stampPosition?.xPt,
          stampY: docs[i].stampPosition?.yPt,
          stampPage: docs[i].stampPosition?.page,
          stampAllPages: docs[i].stampAllPages,
          includeText: docs[i].includeText,
          signerId,
          sigWidth: docs[i].sigWidth || undefined,
          filename: docs[i].filename,
        };
        const invoice = docs[i].invoiceId
          ? await api.approveInvoice(docs[i].invoiceId, payload)
          : await api.createInvoice({ ...payload, file: docs[i].file });
        setDocs((prev) => prev.map((d, idx) => (idx === i ? { ...d, status: 'done', resultInvoice: invoice } : d)));
      } catch (err) {
        setDocs((prev) => prev.map((d, idx) => (idx === i ? { ...d, status: 'error', errorMsg: err.message } : d)));
      }
      setSignedCount((n) => n + 1);
    }
    setSigning(false);
  }

  const activeDoc = docs[activeIndex];
  const activeSigner = signers.find((s) => s.id === signerId);
  const doneInvoiceIds = docs.filter((d) => d.status === 'done').map((d) => d.resultInvoice.id);
  const allDone = docs.length > 0 && docs.every((d) => d.status === 'done');
  const multiple = docs.length > 1;

  if (loadingPending) return <PageLoading />;

  return (
    <div>
      <button className="btn-icon" onClick={() => navigate('/')} aria-label="Back to invoices" title="Back to invoices" style={{ marginBottom: 16 }}>
        <BackArrowIcon size={18} />
      </button>

      <div className="page-header">
        <div>
          <h1>{multiple ? 'Sign documents' : 'Sign document'}</h1>
          <p className="subtitle">Position the stamp, choose a project, then sign.</p>
        </div>
      </div>

      {error && <div className="error-banner">{error}</div>}

      {docs.length === 0 ? (
        <div className="card empty-state">
          Nothing to sign yet.
          <button type="button" className="btn-ghost" onClick={() => navigate('/')} style={{ marginLeft: 8 }}>
            Back to invoices
          </button>
        </div>
      ) : (
        <>
          {multiple && (
            <div className="card" style={{ marginBottom: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => setActiveIndex((i) => Math.max(0, i - 1))}
                    disabled={activeIndex === 0}
                  >
                    ← Prev
                  </button>
                  <span>
                    Document {activeIndex + 1} of {docs.length}: {activeDoc.filename}
                  </span>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => setActiveIndex((i) => Math.min(docs.length - 1, i + 1))}
                    disabled={activeIndex === docs.length - 1}
                  >
                    Next →
                  </button>
                </div>
                <span
                  className={`pill ${
                    activeDoc.status === 'done' ? 'pill-success' : activeDoc.status === 'error' ? 'pill-danger' : 'pill-neutral'
                  }`}
                >
                  <span className="pill-dot" />
                  {activeDoc.status}
                </span>
              </div>
              {signing && (
                <div style={{ marginTop: 14 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                    <span className="helper-text" style={{ margin: 0 }}>
                      Signing {Math.min(signedCount + 1, docs.length)} of {docs.length}…
                    </span>
                    <span className="helper-text" style={{ margin: 0 }}>
                      {signedCount} of {docs.length} done
                    </span>
                  </div>
                  <div className="progress-bar">
                    <div className="progress-bar-fill" style={{ width: `${(signedCount / docs.length) * 100}%` }} />
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="sign-layout">
            <div className="card">
              {multiple && (
                <label className="link-toggle" style={{ marginBottom: 10 }}>
                  <input
                    type="checkbox"
                    checked={linkStamp}
                    onChange={(e) => setLinkField('stamp', e.target.checked)}
                    style={{ width: 'auto' }}
                  />
                  Apply stamp position &amp; size to all documents
                </label>
              )}
              <StampPositioner
                file={activeDoc.file}
                approvedBy={activeSigner?.full_name}
                date={activeDoc.approvedDate}
                project={activeDoc.project}
                signatureUrl={activeSigner?.signature_url}
                sigWidthPt={activeDoc.sigWidth || activeSigner?.signature_width}
                onResizeSignature={(w) => updateField('sigWidth', w, linkStamp)}
                includeText={activeDoc.includeText}
                value={activeDoc.stampPosition}
                onChange={(pos) => updateField('stampPosition', pos, linkStamp)}
              />

              {activeDoc.status === 'error' && <div className="error-banner">{activeDoc.errorMsg}</div>}
            </div>

            <div className="sign-sidebar">
              <div className="card">
                {signers.length > 1 && (
                  <div className="field">
                    <label>Signer</label>
                    <Select
                      value={signerId}
                      onChange={setSignerId}
                      options={signers.map((s) => ({ value: s.id, label: s.full_name }))}
                    />
                  </div>
                )}

                <div className="field">
                  <label>File name</label>
                  <input type="text" value={activeDoc.filename} onChange={(e) => updateActiveDoc({ filename: e.target.value })} />
                </div>

                <div className="field">
                  <div className="field-label-row">
                    <label style={{ margin: 0 }}>Project</label>
                    {multiple && (
                      <label className="link-toggle">
                        <input
                          type="checkbox"
                          checked={linkProject}
                          onChange={(e) => setLinkField('project', e.target.checked)}
                          style={{ width: 'auto' }}
                        />
                        Apply to all
                      </label>
                    )}
                  </div>
                  <Select
                    value={activeDoc.project || null}
                    onChange={(v) => updateField('project', v, linkProject)}
                    placeholder="Select a project"
                    options={projects.map((p) => ({ value: p.name, label: p.name }))}
                  />
                </div>

                <div className="field">
                  <div className="field-label-row">
                    <label style={{ margin: 0 }}>Date</label>
                    {multiple && (
                      <label className="link-toggle">
                        <input
                          type="checkbox"
                          checked={linkDate}
                          onChange={(e) => setLinkField('date', e.target.checked)}
                          style={{ width: 'auto' }}
                        />
                        Apply to all
                      </label>
                    )}
                  </div>
                  <input
                    type="date"
                    value={activeDoc.approvedDate}
                    onChange={(e) => updateField('approvedDate', e.target.value, linkDate)}
                  />
                </div>

                <div className="field" style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <input
                    type="checkbox"
                    checked={activeDoc.includeText}
                    onChange={(e) => updateActiveDoc({ includeText: e.target.checked })}
                    style={{ width: 'auto' }}
                  />
                  <label style={{ margin: 0 }}>Include "Approved By / Date / Project" text</label>
                </div>

                <div className="field" style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <input
                    type="checkbox"
                    checked={activeDoc.stampAllPages}
                    onChange={(e) => updateField('stampAllPages', e.target.checked, linkStamp)}
                    style={{ width: 'auto' }}
                  />
                  <label style={{ margin: 0 }}>Stamp every page (same spot on each page)</label>
                </div>

                {activeDoc.status === 'done' && (
                  <a className="btn btn-secondary" href={downloadUrl(activeDoc.resultInvoice.id, 'stamped')} style={{ width: '100%', marginBottom: 12 }}>
                    <DownloadIcon size={15} />
                    Download this one
                  </a>
                )}

                {multiple && (
                  <button type="button" className="btn btn-ghost" onClick={() => removeDoc(activeIndex)} style={{ width: '100%' }}>
                    Remove from batch
                  </button>
                )}
              </div>

              <div className="card">
                <div className="field">
                  <label>Item / product description</label>
                  <textarea
                    rows={2}
                    value={activeDoc.itemDescription}
                    onChange={(e) => updateActiveDoc({ itemDescription: e.target.value })}
                    placeholder="e.g. Breathalizer monthly rental unit"
                  />
                </div>
                <button type="button" className="btn btn-secondary" onClick={handleCheckPrice} disabled={checkingPrice} style={{ width: '100%' }}>
                  {checkingPrice ? 'Checking…' : 'Check market price (Johannesburg)'}
                </button>
                <LoadingSteps steps={PRICE_CHECK_STEPS} active={checkingPrice} />
                <PriceCheckPanel data={activeDoc.priceData} />
              </div>

              <label className="btn btn-secondary" style={{ cursor: 'pointer' }}>
                Add more files
                <input type="file" accept="application/pdf" multiple onChange={(e) => handleFilesSelected(e.target.files)} style={{ display: 'none' }} />
              </label>

              <button type="button" className="btn btn-primary" onClick={handleSignAll} disabled={signing}>
                {signing ? (
                  <>
                    <Spinner size={14} />
                    Signing {Math.min(signedCount + 1, docs.length)} of {docs.length}…
                  </>
                ) : multiple ? (
                  `Sign all ${docs.length} documents`
                ) : (
                  'Sign 1 document'
                )}
              </button>

              {allDone && (
                <a className="btn btn-secondary" href={downloadHref(doneInvoiceIds)}>
                  <DownloadIcon size={15} />
                  {doneInvoiceIds.length === 1 ? 'Download' : 'Download all as ZIP'}
                </a>
              )}
              {!allDone && doneInvoiceIds.length > 0 && (
                <a className="btn btn-secondary" href={downloadHref(doneInvoiceIds)}>
                  <DownloadIcon size={15} />
                  Download {doneInvoiceIds.length} signed so far
                </a>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
