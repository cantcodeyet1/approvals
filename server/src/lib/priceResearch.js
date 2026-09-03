import { extractPdfText, renderPdfPagesAsImages } from './textExtract.js';
import { callGroq, GROQ_VISION_MODEL } from './groq.js';
import { tavilySearch } from './tavily.js';

const MAX_INVOICE_TEXT_CHARS = 6000;
const MIN_REAL_TEXT_WORDS = 15;

const SCANNED_READ_SCHEMA = {
  type: 'object',
  properties: {
    searchQuery: {
      type: 'string',
      description: 'Short web search query (max 12 words) to find comparable prices, or "NONE" if no purchasable item is identifiable',
    },
    summary: {
      type: 'string',
      description: 'One-paragraph plain-text summary of what the document shows, including any item and price details',
    },
  },
  required: ['searchQuery', 'summary'],
  additionalProperties: false,
};

const PRICE_COMPARISON_SCHEMA = {
  type: 'object',
  properties: {
    product: { type: 'string', description: 'Short name of the item/service identified on the invoice' },
    results: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          url: { type: 'string' },
          source: { type: 'string', description: 'Retailer or site name' },
          price: { type: 'number', description: 'Price in South African Rand found in the search result, or 0 if none was mentioned' },
          snippet: { type: 'string' },
        },
        required: ['title', 'url', 'source', 'price', 'snippet'],
        additionalProperties: false,
      },
    },
    priceRange: {
      type: 'object',
      properties: {
        low: { type: 'number' },
        average: { type: 'number' },
        high: { type: 'number' },
      },
      required: ['low', 'average', 'high'],
      additionalProperties: false,
    },
    aiInsight: { type: 'string', description: '2-3 sentence honest comparison; note if results may not match the invoice item' },
  },
  required: ['product', 'results', 'priceRange', 'aiInsight'],
  additionalProperties: false,
};

// Reads a digital invoice's text and asks Groq to identify the item being
// purchased and build a search query from it.
async function identifyFromText(invoiceText) {
  const searchQueryRaw = await callGroq({
    messages: [
      {
        role: 'system',
        content:
          'You read invoices and quotes and identify the main item(s) or service(s) being purchased, ignoring ' +
          'company letterhead, VAT/registration numbers, banking details, and boilerplate terms. Respond with ONLY ' +
          'a short web search query (max 12 words) that would find comparable retail prices for that item. If you ' +
          "cannot confidently identify a specific purchasable item or service — for example if this is a form, " +
          'report, or cover note rather than something being bought — respond with exactly: NONE. No explanation, ' +
          'no quotes, just the query text or NONE.',
      },
      { role: 'user', content: invoiceText },
    ],
  });
  return { searchQuery: searchQueryRaw.trim(), invoiceText };
}

// A scanned/photographed invoice has no text layer to read, so instead this
// renders the page(s) to an image and has Groq's vision model read it
// directly — the same free tier, just a different model.
async function identifyFromImage(pdfBytes) {
  const pageImages = await renderPdfPagesAsImages(pdfBytes, { maxPages: 1, scale: 2 });
  if (pageImages.length === 0) {
    throw new Error('Could not render this scanned PDF as an image to read it.');
  }

  const raw = await callGroq({
    model: GROQ_VISION_MODEL,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text:
              'This is a scanned invoice or quote. Read it and identify the main item/service being purchased and ' +
              'its price if shown, ignoring company letterhead, VAT/registration numbers, and boilerplate terms. ' +
              'Respond with ONLY the JSON object matching the schema.',
          },
          ...pageImages.map((png) => ({
            type: 'image_url',
            image_url: { url: `data:image/png;base64,${Buffer.from(png).toString('base64')}` },
          })),
        ],
      },
    ],
    jsonSchema: { name: 'scanned_invoice_read', schema: SCANNED_READ_SCHEMA },
  });

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('Could not read this scanned document clearly enough to research prices.');
  }
  return { searchQuery: (parsed.searchQuery || '').trim(), invoiceText: parsed.summary || '' };
}

// Reads an invoice PDF, figures out what's being purchased, searches the real
// web for comparable prices, and returns a structured comparison — no manual
// product description required. Digital PDFs are read as text; scanned PDFs
// fall back to Groq's vision model reading the page image directly. Either
// way: identify item + search query, Tavily (real web search), Groq again
// (synthesize a structured, schema-validated result from the actual results).
export async function researchInvoicePrice(pdfBytes, location = 'Johannesburg') {
  const rawText = await extractPdfText(pdfBytes);
  const hasRealText = rawText.replace(/\s+/g, ' ').split(' ').filter(Boolean).length >= MIN_REAL_TEXT_WORDS;

  const { searchQuery: searchQueryRaw, invoiceText: identifiedText } = hasRealText
    ? await identifyFromText(rawText.slice(0, MAX_INVOICE_TEXT_CHARS))
    : await identifyFromImage(pdfBytes);

  if (!searchQueryRaw || searchQueryRaw.toUpperCase() === 'NONE') {
    throw new Error("Couldn't identify a specific purchasable item on this document to look up prices for.");
  }
  const invoiceText = identifiedText;
  const searchQuery = `${searchQueryRaw} price ${location}`;

  const searchResults = await tavilySearch(searchQuery, { maxResults: 6 });
  const searchResultsText = searchResults
    .map((r, i) => `${i + 1}. ${r.title}\n${r.url}\n${(r.content || '').slice(0, 500)}`)
    .join('\n\n');

  const synthesisRaw = await callGroq({
    messages: [
      {
        role: 'system',
        content:
          "You help a procurement team in South Africa sanity-check an invoice's price against the open market. " +
          "You're given the invoice text and real web search results. Extract a ZAR price from each search result " +
          'only where one is genuinely stated in that result — use 0 if a result has no discernible price, never ' +
          'invent one. Write a short, honest 2-3 sentence insight comparing the invoice price (if visible in the ' +
          "invoice text) against what you found, and say plainly if the search results don't clearly match the " +
          'invoice item. Respond with ONLY the JSON object — no invented data, nothing outside the schema.',
      },
      {
        role: 'user',
        content: `INVOICE TEXT:\n${invoiceText}\n\nSEARCH RESULTS FOR "${searchQuery}":\n${searchResultsText || '(no results found)'}`,
      },
    ],
    jsonSchema: { name: 'price_comparison', schema: PRICE_COMPARISON_SCHEMA },
  });

  let parsed;
  try {
    parsed = JSON.parse(synthesisRaw);
  } catch {
    throw new Error('Could not parse the price research result. Please try again.');
  }

  // Recompute the range from the actual extracted prices rather than trusting
  // the model's arithmetic — cheap to verify, and it's the number people will
  // actually rely on.
  const prices = (parsed.results || []).map((r) => r.price).filter((p) => typeof p === 'number' && p > 0);
  const priceRange = prices.length
    ? {
        low: Math.min(...prices),
        high: Math.max(...prices),
        average: Math.round(prices.reduce((a, b) => a + b, 0) / prices.length),
      }
    : { low: 0, high: 0, average: 0 };

  return {
    product: parsed.product,
    location,
    results: parsed.results || [],
    priceRange,
    aiInsight: parsed.aiInsight,
    isMock: false,
    generatedAt: new Date().toISOString(),
  };
}
