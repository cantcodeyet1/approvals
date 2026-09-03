const TAVILY_URL = 'https://api.tavily.com/search';

// Real web search via Tavily (free tier: 1,000 searches/month, no card required).
export async function tavilySearch(query, { maxResults = 6 } = {}) {
  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey) throw new Error('TAVILY_API_KEY is not configured on the server');

  const res = await fetch(TAVILY_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      api_key: apiKey,
      query,
      search_depth: 'basic',
      max_results: maxResults,
      include_answer: false,
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Tavily request failed (${res.status}): ${text.slice(0, 500)}`);
  }

  const data = await res.json();
  return data.results || [];
}
