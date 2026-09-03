import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';

// Overlays "Approved By / Date / Project" text plus a signature image onto
// the first page of the invoice, in the same style as the sample stamped
// invoices (magenta text block with the signature beneath it).
//
// x/y are PDF point coordinates (origin bottom-left, same as pdf-lib) for the
// top-left of the stamp block — i.e. where the caller (the drag-and-drop
// positioner in the client) decided to place it. Falls back to the old
// fixed top-left corner if not given. When includeText is false, only the
// signature image is stamped (no "Approved By / Date / Project" lines).
// When allPages is true, the same stamp is drawn at the same (x, y) on every
// page instead of just pageIndex — each page is clamped to its own size, so
// this is safe even if pages in the document vary in dimensions.
export async function stampInvoicePdf({
  pdfBytes,
  approvedBy,
  date,
  project,
  signaturePngBytes,
  sigWidth,
  x,
  y,
  pageIndex = 0,
  includeText = true,
  allPages = false,
}) {
  const pdfDoc = await PDFDocument.load(pdfBytes);
  const pages = pdfDoc.getPages();

  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const magenta = rgb(0.72, 0.11, 0.55);
  const signatureImage = signaturePngBytes ? await pdfDoc.embedPng(signaturePngBytes) : null;

  const lineHeight = 14;
  const fontSize = 11;
  const sigW = sigWidth || 90;
  const sigHeight = signatureImage ? (signatureImage.height / signatureImage.width) * sigW : 0;

  function stampOnePage(page) {
    const { width, height } = page.getSize();
    const stampX = Math.min(Math.max(x ?? 40, 0), Math.max(width - 10, 0));
    let cursorY = Math.min(Math.max(y ?? height - 40, 0), height);

    if (includeText) {
      const lines = [`Approved By: ${approvedBy}`, `Date: ${date}`, `Project: ${project}`];
      for (const line of lines) {
        page.drawText(line, { x: stampX, y: cursorY, size: fontSize, font, color: magenta });
        cursorY -= lineHeight;
      }
    }

    if (signatureImage) {
      page.drawImage(signatureImage, {
        x: stampX,
        y: cursorY - sigHeight,
        width: sigW,
        height: sigHeight,
      });
    }
  }

  if (allPages) {
    pages.forEach(stampOnePage);
  } else {
    stampOnePage(pages[Math.min(Math.max(pageIndex, 0), pages.length - 1)]);
  }

  return pdfDoc.save();
}
