export default function Spinner({ size = 18 }) {
  return <span className="spinner" style={{ width: size, height: size }} />;
}

export function PageLoading({ label = 'Loading…' }) {
  return (
    <div className="page-loading">
      <Spinner size={20} />
      {label}
    </div>
  );
}
