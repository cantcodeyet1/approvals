const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_TEXT_MODEL = 'openai/gpt-oss-20b';
export const GROQ_VISION_MODEL = 'qwen/qwen3.8-27b';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Thin wrapper around Groq's OpenAI-compatible chat completions endpoint.
// Pass `jsonSchema: { name, schema }` to force a strict-JSON response, and
// `model` to override the default text model (e.g. for the vision model,
// which accepts image content blocks in `messages`).
// Retries once on a rate limit (429) — the free tier's per-minute token cap
// is easy to brush against with two calls per price-check, so one short wait
// covers the occasional real bump without surfacing it to the user.
export async function callGroq({ messages, jsonSchema, model = GROQ_TEXT_MODEL }, attempt = 0) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error('GROQ_API_KEY is not configured on the server');

  const body = {
    model,
    messages,
    temperature: 0.2,
    max_completion_tokens: 6000,
    // Both gpt-oss and qwen3 models spend part of the completion budget on
    // hidden reasoning tokens before the visible answer — this task doesn't
    // need deep reasoning, so keep it low and leave the budget for the
    // actual output.
    reasoning_effort: 'low',
  };
  if (jsonSchema) {
    body.response_format = {
      type: 'json_schema',
      json_schema: { name: jsonSchema.name, strict: true, schema: jsonSchema.schema },
    };
  }

  const res = await fetch(GROQ_API_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (res.status === 429 && attempt === 0) {
    await sleep(4000);
    return callGroq({ messages, jsonSchema, model }, attempt + 1);
  }

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    if (res.status === 429) {
      throw new Error("We're briefly over the free search quota — wait a few seconds and try again.");
    }
    throw new Error(`Groq request failed (${res.status}): ${text.slice(0, 500)}`);
  }

  const data = await res.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error('Groq returned an empty response');
  return content;
}
