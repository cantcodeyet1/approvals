import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import SignerCard from '../components/SignerCard.jsx';
import { BackArrowIcon } from '../components/icons.jsx';
import { PageLoading } from '../components/Spinner.jsx';

export default function Settings() {
  const navigate = useNavigate();
  const [signers, setSigners] = useState([]);
  const [addingNew, setAddingNew] = useState(false);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  const [projects, setProjects] = useState([]);
  const [newProject, setNewProject] = useState('');
  const [projectError, setProjectError] = useState(null);

  useEffect(() => {
    Promise.all([api.listSigners(), api.listProjects()])
      .then(([signerList, projectList]) => {
        setSigners(signerList);
        setProjects(projectList);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  function handleSignerSaved(updated) {
    setSigners((prev) => {
      const exists = prev.some((s) => s.id === updated.id);
      return exists ? prev.map((s) => (s.id === updated.id ? updated : s)) : [...prev, updated];
    });
    setAddingNew(false);
  }

  function handleSignerDeleted(id) {
    setSigners((prev) => prev.filter((s) => s.id !== id));
  }

  async function handleAddProject(e) {
    e.preventDefault();
    setProjectError(null);
    if (!newProject.trim()) return;
    try {
      const created = await api.addProject(newProject.trim());
      setProjects((prev) => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)));
      setNewProject('');
    } catch (err) {
      setProjectError(err.message);
    }
  }

  async function handleDeleteProject(id) {
    setProjects((prev) => prev.filter((p) => p.id !== id));
    try {
      await api.deleteProject(id);
    } catch (err) {
      setProjectError(err.message);
    }
  }

  if (loading) return <PageLoading />;

  return (
    <div>
      <button className="btn-icon" onClick={() => navigate('/')} aria-label="Back to invoices" title="Back to invoices" style={{ marginBottom: 16 }}>
        <BackArrowIcon size={18} />
      </button>

      <div className="page-header">
        <div>
          <h1>Settings</h1>
          <p className="subtitle">Signers and the project list used across the app.</p>
        </div>
      </div>

      {error && <div className="error-banner">{error}</div>}

      <h3 className="settings-section-title" style={{ marginTop: 0 }}>
        Signers
      </h3>
      <p className="helper-text" style={{ marginTop: -6 }}>
        {signers.length > 1 ? "You'll choose which signer to use when signing a document." : 'This signer is used automatically when you sign a document.'}
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {signers.map((signer) => (
          <SignerCard key={signer.id} signer={signer} onSaved={handleSignerSaved} onDeleted={handleSignerDeleted} />
        ))}

        {addingNew && <SignerCard onSaved={handleSignerSaved} onCancelNew={() => setAddingNew(false)} />}
      </div>

      {!addingNew && (
        <button className="btn btn-secondary" style={{ marginTop: 16 }} onClick={() => setAddingNew(true)}>
          + Add signer
        </button>
      )}

      <h3 className="settings-section-title" style={{ marginTop: 40 }}>
        Projects
      </h3>
      <p className="helper-text" style={{ marginTop: -6 }}>
        These populate the project dropdown when signing a document.
      </p>

      <div className="card">
        {projectError && <div className="error-banner">{projectError}</div>}

        <form onSubmit={handleAddProject} style={{ display: 'flex', gap: 10, alignItems: 'flex-end' }}>
          <div className="field" style={{ marginBottom: 0, flex: '0 1 320px' }}>
            <label>Add a project</label>
            <input type="text" value={newProject} onChange={(e) => setNewProject(e.target.value)} placeholder="e.g. Hydra-Kronos" />
          </div>
          <button className="btn btn-secondary" type="submit">
            Add
          </button>
        </form>

        {projects.length === 0 ? (
          <p className="helper-text" style={{ marginTop: 18 }}>
            No projects yet.
          </p>
        ) : (
          <div className="invoice-list" style={{ marginTop: 18 }}>
            {projects.map((p) => (
              <div className="invoice-row" key={p.id}>
                <span className="invoice-row-title">{p.name}</span>
                <button className="btn btn-ghost" onClick={() => handleDeleteProject(p.id)}>
                  Remove
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
