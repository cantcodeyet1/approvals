import { PDFParse } from 'pdf-parse';
import sharp from 'sharp';

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

// Renders the first `maxPages` pages to compressed JPEGs, for scanned/image-
// only PDFs where there's no text layer to extract. Also free — no API call.
// A full-scale PNG render of a scanned page can run several MB, easily
// tripping a request-size limit once base64-encoded (~33% bigger again) —
// downscaling and re-encoding as JPEG cuts that by roughly 10-20x while
// staying plenty sharp for a vision model to read printed text.
export async function renderPdfPagesAsImages(pdfBytes, { maxPages = 1, scale = 1.5, maxWidth = 1400 } = {}) {
  const parser = new PDFParse({ data: pdfBytes });
  try {
    const result = await parser.getScreenshot({ scale });
    const pages = result.pages.slice(0, maxPages);
    return await Promise.all(
      pages.map((p) =>
        sharp(p.data).resize({ width: maxWidth, withoutEnlargement: true }).jpeg({ quality: 78 }).toBuffer()
      )
    );
  } catch (err) {
    throw new Error(`Could not render this PDF as an image: ${err.message}`);
  } finally {
    await parser.destroy();
  }
}
