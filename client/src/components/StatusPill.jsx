const CONFIG = {
  approved: { label: 'Approved', className: 'pill-success' },
  pending: { label: 'Waiting', className: 'pill-warning' },
};

export default function StatusPill({ status }) {
  const { label, className } = CONFIG[status] ?? { label: status, className: 'pill-neutral' };
  return (
    <span className={`pill ${className}`}>
      <span className="pill-dot" />
      {label}
    </span>
  );
}
