import PriceCheckPanel from './PriceCheckPanel.jsx';

// The price check can return a long list of results — showing it inline
// used to push the whole page out of shape. This puts it in a dismissible,
// blurred-backdrop popover instead, same overlay convention as the other
// dialogs in the app.
export default function PriceCheckPopover({ open, data, onClose }) {
  if (!open || !data) return null;

  return (
    <div className="confirm-overlay" onClick={onClose}>
      <div className="confirm-dialog price-popover" onClick={(e) => e.stopPropagation()}>
        <button className="btn-icon price-popover-close" onClick={onClose} aria-label="Close">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        </button>
        <div className="price-popover-body">
          <PriceCheckPanel data={data} />
        </div>
      </div>
    </div>
  );
}
