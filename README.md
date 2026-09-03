# Approvals

An internal tool for stamping approved invoices (Approved By / Date / Project + your saved signature) and doing a quick market-price sanity check on the line item before you approve.

## Stack

- `client/` — React (Vite)
- `server/` — Node.js (Express)
- Supabase — auth, Postgres, and file storage (signatures + invoice PDFs)

## How it works

1. Each account signs up, enters their full name, and draws a signature once (`/signature`). The signature is stored in Supabase Storage and reused on every invoice they approve.
2. When signing an invoice, you fill in Project + Date (Approved By is taken from your saved signer), and can run a **market price check** with one click — no manual description needed.
3. The price check reads the invoice PDF itself (`server/src/lib/textExtract.js`), asks Groq to identify the item being purchased, searches the real web via Tavily, then asks Groq again to synthesize a structured price comparison (`server/src/lib/priceResearch.js`). Requires `GROQ_API_KEY` and `TAVILY_API_KEY` (both have free tiers) in `server/.env`. It's labeled "AI estimate" in the UI — a helpful sanity check, not verified pricing.
4. On submit, the server overlays "Approved By / Date / Project" + your signature onto the PDF (via `pdf-lib`) and stores both the original and stamped versions in Supabase Storage, with metadata in Postgres.

## Setup

### 1. Supabase project

Create a project at supabase.com, then:

- Run [`supabase/schema.sql`](supabase/schema.sql) in the SQL editor to create the `profiles`, `invoices`, and `price_checks` tables (with row-level security policies).
- Create two **private** storage buckets: `signatures` and `invoices`.
- From Project Settings → API, grab:
  - Project URL
  - `anon` public key
  - `service_role` key (server-only — never expose this to the browser)

### 2. Server

```bash
cd server
npm install
cp .env.example .env
```

Fill in `server/.env`:

```
PORT=4000
SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
CLIENT_ORIGIN=http://localhost:5173
```

```bash
npm run dev
```

### 3. Client

```bash
cd client
npm install
cp .env.example .env
```

Fill in `client/.env`:

```
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
VITE_API_BASE_URL=http://localhost:4000
```

```bash
npm run dev
```

Open http://localhost:5173.

## What I still need from you

- The Supabase project URL, anon key, and service_role key (drop them into the two `.env` files above, or share them and I'll wire it up).
- Confirmation of the two storage bucket names if you want something other than `signatures` / `invoices`.
- When you're ready to replace the mock price panel with real data: a search API key (e.g. SerpAPI/Bing) and an LLM API key for the "insight" summary.
