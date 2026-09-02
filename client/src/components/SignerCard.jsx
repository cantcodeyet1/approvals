import { useRef, useState } from 'react';
import SignaturePad from './SignaturePad.jsx';
import { api } from '../lib/api';

export default function SignerCard({ signer, onSaved, onDeleted, onCancelNew }) {
  const isNew = !signer;
  const padRef = useRef(null);
  const [fullName, setFullName] = useState(signer?.full_name || '');
  const [signatureWidth, setSignatureWidth] = useState(signer?.signature_width || 90);
  const [signatureSource, setSignatureSource] = useState('draw');
  const [uploadedFile, setUploadedFile] = useState(null);
  const [uploadedPreviewUrl, setUploadedPreviewUrl] = useState(null);
  const [replacing, setReplacing] = useState(isNew);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState(null);
  const [justSaved, setJustSaved] = useState(false);

  function handleUploadedFile(file) {
    setUploadedFile(file);
    setUploadedPreviewUrl(file ? URL.createObjectURL(file) : null);
  }

  async function handleSave() {
    setError(null);
    if (!fullName.trim()) {
      setError("Enter the signer's name");
      return;
    }

    setSaving(true);
    try {
      let signatureBlob = null;
      if (replacing) {
        if (signatureSource === 'upload' && uploadedFile) {
          signatureBlob = uploadedFile;
        } else if (signatureSource === 'draw' && padRef.current && !padRef.current.isEmpty()) {
          const dataUrl = padRef.current.getTrimmedCanvas().toDataURL('image/png');
          signatureBlob = await (await fetch(dataUrl)).blob();
        } else if (isNew) {
          setError('Draw or upload a signature before saving');
          setSaving(false);
          return;
        }
      }

      const result = isNew
        ? await api.addSigner({ fullName, signatureBlob, signatureWidth })
        : await api.updateSigner(signer.id, { fullName, signatureBlob, signatureWidth });

      onSaved(result);
      setUploadedFile(null);
      setUploadedPreviewUrl(null);
      setReplacing(false);
      padRef.current?.clear();
      setJustSaved(true);
      setTimeout(() => setJustSaved(false), 2200);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    setDeleting(true);
    try {
      await api.deleteSigner(signer.id);
      onDeleted(signer.id);
    } catch (err) {
      setError(err.message);
      setDeleting(false);
    }
  }

  const previewUrl = signatureSource === 'upload' && uploadedPreviewUrl ? uploadedPreviewUrl : signer?.signature_url;

  return (
    <div className="card signer-card">
      {error && <div className="error-banner">{error}</div>}

      <div className="field">
        <label>Full name (shown as "Approved By")</label>
        <input type="text" value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="e.g. TG Mthembu" />
      </div>

      {!replacing && signer?.signature_url && (
        <div className="field">
          <label>Signature</label>
          <div className="signature-preview-well">
            <img src={signer.signature_url} alt="Signature" style={{ width: signatureWidth * 1.3, maxWidth: '100%' }} />
          </div>
          <button type="button" className="btn btn-ghost" style={{ width: 'fit-content', marginTop: 8 }} onClick={() => setReplacing(true)}>
            Replace signature
          </button>
        </div>
      )}

      {replacing && (
        <>
          <div className="field">
            <label>Signature</label>
            <div className="segmented-control">
              <button type="button" className={signatureSource === 'draw' ? 'active' : ''} onClick={() => setSignatureSource('draw')}>
                Draw
              </button>
              <button type="button" className={signatureSource === 'upload' ? 'active' : ''} onClick={() => setSignatureSource('upload')}>
                Upload image
              </button>
            </div>
          </div>

          {signatureSource === 'draw' ? (
            <div className="field">
              <SignaturePad ref={padRef} />
              <div style={{ marginTop: 8 }}>
                <button className="btn btn-secondary" type="button" onClick={() => padRef.current?.clear()}>
                  Clear
                </button>
              </div>
            </div>
          ) : (
            <div className="field">
              <input type="file" accept="image/*" onChange={(e) => handleUploadedFile(e.target.files[0] ?? null)} />
              <p className="helper-text" style={{ marginBottom: 0 }}>
                Background is made transparent automatically.
              </p>
            </div>
          )}

          {previewUrl && signatureSource === 'upload' && (
            <div className="field">
              <label>Preview</label>
              <div className="signature-preview-well">
                <img src={previewUrl} alt="Signature preview" style={{ width: signatureWidth * 1.3, maxWidth: '100%' }} />
              </div>
            </div>
          )}

          {!isNew && signer?.signature_url && (
            <button type="button" className="btn btn-ghost" style={{ width: 'fit-content', marginBottom: 18 }} onClick={() => setReplacing(false)}>
              Cancel
            </button>
          )}
        </>
      )}

      <div className="field">
        <label>Signature size: {signatureWidth}pt wide</label>
        <input type="range" min={40} max={220} step={5} value={signatureWidth} onChange={(e) => setSignatureWidth(Number(e.target.value))} />
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
          {saving ? 'Saving…' : isNew ? 'Add signer' : 'Save changes'}
        </button>
        {isNew ? (
          <button className="btn btn-ghost" onClick={onCancelNew} disabled={saving}>
            Cancel
          </button>
        ) : (
          <button className="btn btn-ghost" onClick={handleDelete} disabled={deleting}>
            {deleting ? 'Removing…' : 'Remove'}
          </button>
        )}
        {justSaved && <span className="save-confirmation">✓ Saved</span>}
      </div>
    </div>
  );
}
