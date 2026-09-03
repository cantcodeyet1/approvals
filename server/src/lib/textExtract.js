import { PDFParse } from 'pdf-parse';

// Pulls the raw text layer out of a PDF (digital invoices/quotes have one;
// pure scans don't). No API calls, no cost — this is why this step is free.
export async function extractPdfText(pdfBytes) {
  const parser = new PDFParse({ data: pdfBytes });
  try {
    const result = await parser.getText();
    return (result.text || '').trim();
  } catch (err) {
    throw new Error(`Could not read text from this PDF: ${err.message}`);
  } finally {
    await parser.destroy();
  }
}

// Renders the first `maxPages` pages to PNG images, for scanned/image-only
// PDFs where there's no text layer to extract. Also free — no API call.
export async function renderPdfPagesAsImages(pdfBytes, { maxPages = 1, scale = 2 } = {}) {
  const parser = new PDFParse({ data: pdfBytes });
  try {
    const result = await parser.getScreenshot({ scale });
    return result.pages.slice(0, maxPages).map((p) => p.data);
  } catch (err) {
    throw new Error(`Could not render this PDF as an image: ${err.message}`);
  } finally {
    await parser.destroy();
  }
}
