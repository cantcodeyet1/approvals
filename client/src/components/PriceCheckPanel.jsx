export default function PriceCheckPanel({ data }) {
  if (!data) return null;

  return (
    <div className="price-panel">
      <div className="price-panel-header">
        <h3>Market price check: {data.location}</h3>
        <span className="pill pill-warning" title="AI-researched from a live web search — a helpful estimate, not verified pricing">
          <span className="pill-dot" />
          AI estimate
        </span>
      </div>

      {data.priceRange.high > 0 ? (
        <div className="price-range">
          <div className="price-range-item">
            <div className="price-range-value">R{data.priceRange.low}</div>
            <div className="price-range-label">Low</div>
          </div>
          <div className="price-range-item">
            <div className="price-range-value">R{data.priceRange.average}</div>
            <div className="price-range-label">Average</div>
          </div>
          <div className="price-range-item">
            <div className="price-range-value">R{data.priceRange.high}</div>
            <div className="price-range-label">High</div>
          </div>
        </div>
      ) : (
        <p className="helper-text">No prices could be pulled from the search results below — check them manually.</p>
      )}

      <div className="price-results">
        {data.results.map((r, i) => (
          <div className="price-result" key={i}>
            <div className="price-result-top">
              <a href={r.url} target="_blank" rel="noreferrer">
                {r.title}
              </a>
              <span>{r.price > 0 ? `R${r.price}` : 'Price not listed'}</span>
            </div>
            <div className="price-result-snippet">{r.snippet}</div>
          </div>
        ))}
      </div>

      <div className="ai-insight">
        <strong>AI insight:</strong> {data.aiInsight}
      </div>
    </div>
  );
}
