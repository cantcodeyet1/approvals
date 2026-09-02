// MOCK price-sourcing generator.
//
// This does NOT call Google, any search API, or a real LLM. It fabricates a
// plausible-looking set of "search results" and an "AI insight" blurb so the
// UI can be built and demoed before real API keys (search + AI provider)
// are wired in. Every response is stamped isMock: true and the frontend
// must keep the "Demo data" badge visible wherever this is rendered —
// never present this as verified market research.

const RETAILERS = [
  'Builders Warehouse',
  'Makro',
  'Cashbuild',
  'Takealot',
  'Leroy Merlin',
  'Game',
  'Checkers Hyper',
  'Local Supplier Co.',
];

const SNIPPET_TEMPLATES = [
  (product, price) => `${product}: in stock, R${price}. Free delivery to Johannesburg metro on orders over R500.`,
  (product, price) => `${product} available now for R${price} excl. VAT. Bulk pricing available on request.`,
  (product, price) => `Compare prices for ${product}: from R${price} at our Johannesburg branch.`,
  (product, price) => `${product}: R${price}. Rated 4.${Math.floor(Math.random() * 5) + 3}/5 by local buyers.`,
];

function hashSeed(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = (h * 31 + str.charCodeAt(i)) >>> 0;
  }
  return h;
}

function seededRandom(seed) {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) >>> 0;
    return (s >>> 8) / 0xffffff;
  };
}

export function generateMockPriceCheck(product, location = 'Johannesburg') {
  const cleanProduct = product.trim();
  const seed = hashSeed(cleanProduct.toLowerCase() + location.toLowerCase());
  const rand = seededRandom(seed || 1);

  const basePrice = 50 + Math.floor(rand() * 1450);

  const results = Array.from({ length: 4 }, (_, i) => {
    const variance = 1 + (rand() - 0.5) * 0.4; // +/-20%
    const price = Math.max(10, Math.round(basePrice * variance));
    const retailer = RETAILERS[Math.floor(rand() * RETAILERS.length)];
    const snippet = SNIPPET_TEMPLATES[i % SNIPPET_TEMPLATES.length](cleanProduct, price);

    return {
      title: `${cleanProduct} | ${retailer} ${location}`,
      url: `https://example-search-result.invalid/${encodeURIComponent(retailer)}/${encodeURIComponent(cleanProduct)}`,
      source: retailer,
      price,
      snippet,
    };
  }).sort((a, b) => a.price - b.price);

  const low = results[0].price;
  const high = results[results.length - 1].price;
  const avg = Math.round(results.reduce((sum, r) => sum + r.price, 0) / results.length);

  const aiInsight =
    `Based on ${results.length} sampled listings in ${location}, "${cleanProduct}" typically ranges from ` +
    `R${low} to R${high}, averaging around R${avg}. This is a simulated summary for prototyping, ` +
    `not based on a real market scan, and should not be used to justify a real approval decision.`;

  return {
    product: cleanProduct,
    location,
    results,
    priceRange: { low, high, average: avg },
    aiInsight,
    isMock: true,
    generatedAt: new Date().toISOString(),
  };
}
