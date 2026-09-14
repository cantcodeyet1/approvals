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

  const [contacts, setContacts] = useState([]);
  const [newContactName, setNewContactName] = useState('');
  const [newContactEmail, setNewContactEmail] = useState('');
  const [contactError, setContactError] = useState(null);

  const [templateSubject, setTemplateSubject] = useState('');
  const [templateBody, setTemplateBody] = useState('');
  const [templateSaved, setTemplateSaved] = useState(false);
  const [savingTemplate, setSavingTemplate] = useState(false);

  useEffect(() => {
    Promise.all([api.listSigners(), api.listProjects()])
      .then(([signerList, projectList]) => {
        setSigners(signerList);
        setProjects(projectList);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));

    // Kept separate from the fetch above: these two depend on tables added
    // in a later migration, so a fresh setup that hasn't run it yet still
    // gets a fully working Signers/Projects page instead of one error
    // banner blanking out everything.
    api
      .listContacts()
      .then(setContacts)
      .catch(() => setContacts([]));
    api
      .getEmailTemplate()
      .then((template) => {
        setTemplateSubject(template.subject || '');
        setTemplateBody(template.body || '');
      })
      .catch(() => {});
  }, []);

  // The page shows only a loading spinner until data arrives, so the
  // #signers/#projects targets don't exist yet when the browser tries its
  // own hash-scroll on navigation — do it ourselves once they're rendered.
  useEffect(() => {
    if (loading) return;
    const hash = window.location.hash.slice(1);
    if (!hash) return;
    document.getElementById(hash)?.scrollIntoView({ block: 'start' });
  }, [loading]);

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

  async function handleAddContact(e) {
    e.preventDefault();
    setContactError(null);
    if (!newContactName.trim() || !newContactEmail.trim()) return;
    try {
      const created = await api.addContact(newContactName.trim(), newContactEmail.trim());
      setContacts((prev) => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)));
      setNewContactName('');
      setNewContactEmail('');
    } catch (err) {
      setContactError(err.message);
    }
  }

  async function handleDeleteContact(id) {
    setContacts((prev) => prev.filter((c) => c.id !== id));
    try {
      await api.deleteContact(id);
    } catch (err) {
      setContactError(err.message);
    }
  }

  async function handleSaveTemplate() {
    setSavingTemplate(true);
    setTemplateSaved(false);
    try {
      await api.saveEmailTemplate(templateSubject, templateBody);
      setTemplateSaved(true);
      setTimeout(() => setTemplateSaved(false), 2000);
    } catch (err) {
      setError(err.message);
    } finally {
      setSavingTemplate(false);
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

      <h3 id="signers" className="settings-section-title" style={{ marginTop: 0 }}>
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

      <h3 id="projects" className="settings-section-title" style={{ marginTop: 40 }}>
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
          <div className="simple-list" style={{ marginTop: 18 }}>
            {projects.map((p) => (
              <div className="simple-row" key={p.id}>
                <span className="simple-row-title">{p.name}</span>
                <button className="btn btn-ghost" onClick={() => handleDeleteProject(p.id)}>
                  Remove
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <h3 id="recipients" className="settings-section-title" style={{ marginTop: 40 }}>
        Recipients
      </h3>
      <p className="helper-text" style={{ marginTop: -6 }}>
        Saved so they autocomplete in the "Send via email" To/CC fields.
      </p>

      <div className="card">
        {contactError && <div className="error-banner">{contactError}</div>}

        <form onSubmit={handleAddContact} style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div className="field" style={{ marginBottom: 0, flex: '0 1 220px' }}>
            <label>Name</label>
            <input type="text" value={newContactName} onChange={(e) => setNewContactName(e.target.value)} placeholder="e.g. Gerhard Greyling" />
          </div>
          <div className="field" style={{ marginBottom: 0, flex: '0 1 260px' }}>
            <label>Email</label>
            <input type="email" value={newContactEmail} onChange={(e) => setNewContactEmail(e.target.value)} placeholder="gerhard@example.com" />
          </div>
          <button className="btn btn-secondary" type="submit">
            Add
          </button>
        </form>

        {contacts.length === 0 ? (
          <p className="helper-text" style={{ marginTop: 18 }}>
            No saved recipients yet.
          </p>
        ) : (
          <div className="simple-list" style={{ marginTop: 18 }}>
            {contacts.map((c) => (
              <div className="simple-row" key={c.id}>
                <span className="simple-row-title">
                  {c.name} <span style={{ fontWeight: 400, color: 'var(--text-muted)' }}>· {c.email}</span>
                </span>
                <button className="btn btn-ghost" onClick={() => handleDeleteContact(c.id)}>
                  Remove
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <h3 className="settings-section-title" style={{ marginTop: 40 }}>
        Default email
      </h3>
      <p className="helper-text" style={{ marginTop: -6 }}>
        Pre-fills the subject and message in "Send via email" — still editable for each send. Leave blank to keep the
        automatic "Please find attached…" default.
      </p>

      <div className="card">
        <div className="field">
          <label>Subject</label>
          <input type="text" value={templateSubject} onChange={(e) => setTemplateSubject(e.target.value)} placeholder="e.g. Approved invoice" />
        </div>
        <div className="field">
          <label>Message</label>
          <textarea rows={5} value={templateBody} onChange={(e) => setTemplateBody(e.target.value)} style={{ fontFamily: 'Tahoma, Verdana, sans-serif' }} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button className="btn btn-primary" onClick={handleSaveTemplate} disabled={savingTemplate}>
            {savingTemplate ? 'Saving…' : 'Save changes'}
          </button>
          {templateSaved && <span className="save-confirmation">Saved</span>}
        </div>
      </div>
    </div>
  );
}
