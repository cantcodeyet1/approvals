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
