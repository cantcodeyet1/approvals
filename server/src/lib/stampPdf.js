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
export async function stampInvoicePdf({ pdfBytes, approvedBy, date, project, signaturePngBytes, sigWidth, x, y, pageIndex = 0, includeText = true }) {
  const pdfDoc = await PDFDocument.load(pdfBytes);
  const pages = pdfDoc.getPages();
  const page = pages[Math.min(Math.max(pageIndex, 0), pages.length - 1)];
  const { width, height } = page.getSize();

  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const magenta = rgb(0.72, 0.11, 0.55);

  const lineHeight = 14;
  const fontSize = 11;

  const stampX = Math.min(Math.max(x ?? 40, 0), Math.max(width - 10, 0));
  let cursorY = Math.min(Math.max(y ?? height - 40, 0), height);

  if (includeText) {
    const lines = [`Approved By: ${approvedBy}`, `Date: ${date}`, `Project: ${project}`];
    for (const line of lines) {
      page.drawText(line, { x: stampX, y: cursorY, size: fontSize, font, color: magenta });
      cursorY -= lineHeight;
    }
  }

  if (signaturePngBytes) {
    const signatureImage = await pdfDoc.embedPng(signaturePngBytes);
    const sigW = sigWidth || 90;
    const sigHeight = (signatureImage.height / signatureImage.width) * sigW;
    page.drawImage(signatureImage, {
      x: stampX,
      y: cursorY - sigHeight,
      width: sigW,
      height: sigHeight,
    });
  }

  return pdfDoc.save();
}
