import { useRef, useState } from 'react';

// A comma-separated recipient field with autocomplete against the saved
// address book — matches on whatever's typed after the last comma, so you
// can keep adding more recipients after picking one.
export default function RecipientInput({ value, onChange, contacts, placeholder }) {
  const [open, setOpen] = useState(false);
  const inputRef = useRef(null);

  const parts = value.split(',');
  const current = parts[parts.length - 1].trim().toLowerCase();
  const alreadyUsed = new Set(parts.slice(0, -1).map((p) => p.trim().toLowerCase()));

  const matches = current
    ? contacts
        .filter((c) => !alreadyUsed.has(c.email.toLowerCase()) && (c.name.toLowerCase().includes(current) || c.email.toLowerCase().includes(current)))
        .slice(0, 6)
    : [];

  function selectContact(contact) {
    const newParts = parts.slice(0, -1);
    newParts.push(` ${contact.email}`);
    onChange(newParts.join(',').replace(/^,\s*/, '') + ', ');
    setOpen(false);
    inputRef.current?.focus();
  }

  return (
    <div style={{ position: 'relative' }}>
      <input
        ref={inputRef}
        type="text"
        value={value}
        placeholder={placeholder}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
      />
      {open && matches.length > 0 && (
        <div className="custom-select-menu">
          {matches.map((c) => (
            <div key={c.id} className="custom-select-option" onMouseDown={() => selectContact(c)}>
              <strong>{c.name}</strong> <span style={{ color: 'var(--text-muted)' }}>{c.email}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
