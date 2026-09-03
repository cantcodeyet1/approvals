import { useEffect, useRef, useState, useCallback } from 'react';
import { pdfjsLib } from '../lib/pdfjs';
import Spinner from './Spinner.jsx';

const CANVAS_TARGET_WIDTH = 640;
const FONT_SIZE_PT = 11;
const LINE_HEIGHT_PT = 14;
const MARGIN_PT = 24;

function loadImage(url) {
  // Only used to read natural dimensions, never pixel data — no CORS mode needed.
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
}

// Scores how "empty" a region of the rendered page is (lower = emptier) by
// sampling how many non-near-white pixels fall inside it.
function inkRatio(imageData, canvasW, canvasH, boxX, boxY, boxW, boxH) {
  const { data } = imageData;
  const stride = 2;
  let inked = 0;
  let sampled = 0;
  const x0 = Math.max(0, Math.floor(boxX));
  const y0 = Math.max(0, Math.floor(boxY));
  const x1 = Math.min(canvasW, Math.ceil(boxX + boxW));
  const y1 = Math.min(canvasH, Math.ceil(boxY + boxH));

  for (let y = y0; y < y1; y += stride) {
    for (let x = x0; x < x1; x += stride) {
      const i = (y * canvasW + x) * 4;
      const luminance = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      if (luminance < 245) inked++;
      sampled++;
    }
  }
  return sampled === 0 ? 1 : inked / sampled;
}

export default function StampPositioner({
  file,
  approvedBy,
  date,
  project,
  signatureUrl,
  sigWidthPt = 90,
  onResizeSignature,
  includeText = true,
  value,
  onChange,
}) {
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const dragState = useRef(null);
  const resizeState = useRef(null);
  const pdfRef = useRef(null);
  const [pageIndex, setPageIndex] = useState(0); // 0-based
  const [pageInfo, setPageInfo] = useState(null); // { scale, pageWidthPt, pageHeightPt, canvasW, canvasH }
  const [numPages, setNumPages] = useState(null);
  const [boxSizePt, setBoxSizePt] = useState({ width: 180, height: LINE_HEIGHT_PT * 3 + 40 });
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  const lines = includeText ? [`Approved By: ${approvedBy}`, `Date: ${date}`, `Project: ${project || 'Unassigned'}`] : [];

  // Reset to page 1 whenever a new file comes in
  useEffect(() => {
    setPageIndex(0);
    pdfRef.current = null;
  }, [file]);

  // Render the current page to canvas whenever the file or selected page changes
  useEffect(() => {
    if (!file) return;
    let cancelled = false;
    setLoading(true);
    setError(null);

    (async () => {
      try {
        let pdf = pdfRef.current;
        if (!pdf) {
          const arrayBuffer = await file.arrayBuffer();
          pdf = await pdfjsLib.getDocument({
            data: arrayBuffer,
            cMapUrl: '/pdfjs/cmaps/',
            cMapPacked: true,
            standardFontDataUrl: '/pdfjs/standard_fonts/',
          }).promise;
          pdfRef.current = pdf;
        }
        if (!cancelled) setNumPages(pdf.numPages);

        const page = await pdf.getPage(pageIndex + 1);
        const [x0, y0, x1, y1] = page.view;
        const pageWidthPt = x1 - x0;
        const pageHeightPt = y1 - y0;
        const scale = CANVAS_TARGET_WIDTH / pageWidthPt;
        const viewport = page.getViewport({ scale });

        const canvas = canvasRef.current;
        if (!canvas || cancelled) return;
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const ctx = canvas.getContext('2d');
        await page.render({ canvasContext: ctx, viewport }).promise;

        if (cancelled) return;
        setPageInfo({ scale, pageWidthPt, pageHeightPt, canvasW: viewport.width, canvasH: viewport.height });
      } catch (err) {
        if (!cancelled) setError('Could not preview this PDF for positioning. It will still upload normally.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [file, pageIndex]);

  // Measure text + signature to size the stamp box, then place it in the emptiest corner
  const computeBestSpot = useCallback(async () => {
    if (!pageInfo) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');

    const pxFontSize = FONT_SIZE_PT * pageInfo.scale;
    ctx.font = `${pxFontSize}px Helvetica, Arial, sans-serif`;
    const textWidthPt = lines.length > 0 ? Math.max(...lines.map((l) => ctx.measureText(l).width)) / pageInfo.scale + 8 : 0;

    let sigHeightPt = 0;
    if (signatureUrl) {
      try {
        const img = await loadImage(signatureUrl);
        sigHeightPt = (img.naturalHeight / img.naturalWidth) * sigWidthPt;
      } catch {
        sigHeightPt = sigWidthPt * 0.35;
      }
    }

    const widthPt = Math.max(textWidthPt, sigWidthPt);
    const heightPt = (lines.length > 0 ? LINE_HEIGHT_PT * 3 : 0) + sigHeightPt + 6;
    setBoxSizePt({ width: widthPt, height: heightPt });

    const boxWpx = widthPt * pageInfo.scale;
    const boxHpx = heightPt * pageInfo.scale;
    const marginPx = MARGIN_PT * pageInfo.scale;

    // Scan a grid of candidate spots across the whole page (not just the four
    // corners) so the stamp lands wherever is actually empty, e.g. below a
    // short table rather than always in a fixed corner.
    const maxX = pageInfo.canvasW - boxWpx - marginPx;
    const maxY = pageInfo.canvasH - boxHpx - marginPx;
    const stepPx = Math.max(20, Math.min(boxWpx, boxHpx) / 2);
    const candidates = [];
    if (maxX >= marginPx && maxY >= marginPx) {
      for (let py = marginPx; py <= maxY + 0.001; py += stepPx) {
        for (let px = marginPx; px <= maxX + 0.001; px += stepPx) {
          candidates.push({ px: Math.min(px, maxX), py: Math.min(py, maxY) });
        }
      }
    }
    if (candidates.length === 0) candidates.push({ px: marginPx, py: marginPx });

    const imageData = ctx.getImageData(0, 0, pageInfo.canvasW, pageInfo.canvasH);
    const scored = candidates.map((c) => ({
      ...c,
      score: inkRatio(imageData, pageInfo.canvasW, pageInfo.canvasH, c.px, c.py, boxWpx, boxHpx),
    }));
    const minScore = Math.min(...scored.map((c) => c.score));
    // Among the emptiest spots, prefer the one closest to the bottom-right —
    // the conventional place to sign — instead of an arbitrary empty gap.
    const emptiest = scored.filter((c) => c.score <= minScore + 0.01);
    const best = emptiest.sort((a, b) => b.py + b.px - (a.py + a.px))[0];

    applyPixelPosition(best.px, best.py, pageInfo);
  }, [pageInfo, signatureUrl, sigWidthPt, approvedBy, date, project, includeText]);

  useEffect(() => {
    if (pageInfo && (!value || value.page !== pageIndex)) {
      computeBestSpot();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageInfo]);

  function applyPixelPosition(px, py, info = pageInfo) {
    if (!info) return;
    const xPt = px / info.scale;
    const yPt = info.pageHeightPt - py / info.scale;
    onChange({ xPt, yPt, page: pageIndex });
  }

  function goToPage(nextIndex) {
    if (nextIndex < 0 || nextIndex >= numPages) return;
    setPageIndex(nextIndex);
  }

  // Convert the stored PDF-point position back to canvas pixels for rendering the overlay
  function currentPixelPosition() {
    if (!pageInfo || !value || value.page !== pageIndex) return null;
    return {
      px: value.xPt * pageInfo.scale,
      py: (pageInfo.pageHeightPt - value.yPt) * pageInfo.scale,
    };
  }

  function handlePointerDown(e) {
    const pos = currentPixelPosition();
    if (!pos) return;
    dragState.current = {
      startClientX: e.clientX,
      startClientY: e.clientY,
      startPx: pos.px,
      startPy: pos.py,
    };
    e.target.setPointerCapture(e.pointerId);
  }

  function handlePointerMove(e) {
    if (!dragState.current || !pageInfo) return;
    const boxWpx = boxSizePt.width * pageInfo.scale;
    const boxHpx = boxSizePt.height * pageInfo.scale;
    const dx = e.clientX - dragState.current.startClientX;
    const dy = e.clientY - dragState.current.startClientY;
    let px = dragState.current.startPx + dx;
    let py = dragState.current.startPy + dy;
    px = Math.min(Math.max(px, 0), Math.max(pageInfo.canvasW - boxWpx, 0));
    py = Math.min(Math.max(py, 0), Math.max(pageInfo.canvasH - boxHpx, 0));
    applyPixelPosition(px, py);
  }

  function handlePointerUp(e) {
    dragState.current = null;
    try {
      e.target.releasePointerCapture(e.pointerId);
    } catch {
      /* no-op */
    }
  }

  function handleResizeDown(e) {
    e.stopPropagation();
    resizeState.current = { startClientX: e.clientX, startWidth: sigWidthPt };
    e.target.setPointerCapture(e.pointerId);
  }

  function handleResizeMove(e) {
    if (!resizeState.current || !pageInfo || !onResizeSignature) return;
    e.stopPropagation();
    const dx = (e.clientX - resizeState.current.startClientX) / pageInfo.scale;
    const nextWidth = Math.min(Math.max(Math.round(resizeState.current.startWidth + dx), 40), 220);
    onResizeSignature(nextWidth);
  }

  function handleResizeUp(e) {
    resizeState.current = null;
    try {
      e.target.releasePointerCapture(e.pointerId);
    } catch {
      /* no-op */
    }
  }

  const pixelPos = currentPixelPosition();

  return (
    <div className="field">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
        <label style={{ margin: 0 }}>Position the approval stamp</label>
        {numPages > 1 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <button type="button" className="btn-icon" onClick={() => goToPage(pageIndex - 1)} disabled={pageIndex === 0} aria-label="Previous page">
              ‹
            </button>
            <span className="helper-text" style={{ margin: 0 }}>
              Page {pageIndex + 1} of {numPages}
            </span>
            <button
              type="button"
              className="btn-icon"
              onClick={() => goToPage(pageIndex + 1)}
              disabled={pageIndex === numPages - 1}
              aria-label="Next page"
            >
              ›
            </button>
          </div>
        )}
      </div>
      <p className="helper-text">Drag the stamp anywhere on the page, or resize it from the corner.</p>

      {error && <div className="error-banner">{error}</div>}

      <div ref={containerRef} style={{ position: 'relative', display: 'inline-block', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
        <canvas ref={canvasRef} style={{ display: 'block', maxWidth: '100%' }} />
        {loading && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, color: 'var(--text-muted)', fontSize: 13 }}>
            <Spinner size={16} />
            Rendering preview…
          </div>
        )}
        {pixelPos && pageInfo && (
          <div
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            style={{
              position: 'absolute',
              left: pixelPos.px,
              top: pixelPos.py,
              width: boxSizePt.width * pageInfo.scale,
              height: boxSizePt.height * pageInfo.scale,
              background: 'rgba(255, 255, 255, 0.75)',
              border: '1.5px dashed #b91c8c',
              borderRadius: 4,
              cursor: 'grab',
              padding: 2,
              touchAction: 'none',
              userSelect: 'none',
            }}
          >
            {lines.map((line, i) => (
              <div
                key={i}
                style={{
                  fontSize: FONT_SIZE_PT * pageInfo.scale * 0.92,
                  lineHeight: `${LINE_HEIGHT_PT * pageInfo.scale}px`,
                  color: '#b81c8c',
                  fontFamily: 'Helvetica, Arial, sans-serif',
                  whiteSpace: 'nowrap',
                }}
              >
                {line}
              </div>
            ))}
            {signatureUrl && (
              <img
                src={signatureUrl}
                alt=""
                draggable={false}
                style={{ width: sigWidthPt * pageInfo.scale, marginTop: 2, pointerEvents: 'none' }}
              />
            )}
            {onResizeSignature && (
              <div
                onPointerDown={handleResizeDown}
                onPointerMove={handleResizeMove}
                onPointerUp={handleResizeUp}
                title="Drag to resize the signature"
                style={{
                  position: 'absolute',
                  right: -6,
                  bottom: -6,
                  width: 14,
                  height: 14,
                  borderRadius: '50%',
                  background: '#b91c8c',
                  border: '2px solid white',
                  cursor: 'nwse-resize',
                  touchAction: 'none',
                }}
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
}
