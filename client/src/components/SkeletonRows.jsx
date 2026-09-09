// A shimmering placeholder for the document table — reads as "actively
// loading" much more than a static spinner does, and previews the shape
// of the real content that's about to appear.
export default function SkeletonRows({ rows = 6 }) {
  return (
    <div className="doc-table">
      <div className="doc-table-head">
        <div></div>
        <div>Document</div>
        <div>Project</div>
        <div>Date</div>
        <div style={{ textAlign: 'right' }}>Status</div>
      </div>
      {Array.from({ length: rows }).map((_, i) => (
        <div className="doc-row skeleton-row" key={i}>
          <div className="skeleton" style={{ width: 16, height: 16, borderRadius: 4 }} />
          <div className="doc-cell-main">
            <div className="skeleton" style={{ width: 34, height: 34, borderRadius: 'var(--radius-sm)', flexShrink: 0 }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="skeleton" style={{ width: `${55 + ((i * 13) % 30)}%`, height: 13, marginBottom: 7 }} />
              <div className="skeleton" style={{ width: '40%', height: 10 }} />
            </div>
          </div>
          <div className="skeleton" style={{ width: '70%', height: 12 }} />
          <div className="skeleton" style={{ width: 70, height: 12 }} />
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <div className="skeleton" style={{ width: 76, height: 22, borderRadius: 5 }} />
          </div>
        </div>
      ))}
    </div>
  );
}
