-- Run this once in the Supabase SQL Editor (same pattern as schema.sql).
-- Adds: a saved-recipients address book, and a singleton default email
-- template (subject + body) editable from Settings.

create table if not exists email_contacts (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null,
  created_at timestamptz not null default now()
);
alter table email_contacts enable row level security;

create table if not exists email_settings (
  id text primary key default 'default',
  default_subject text,
  default_body text,
  updated_at timestamptz not null default now()
);
alter table email_settings enable row level security;

-- No policies on either table (matching every other table in this app) —
-- only the service_role key (server-side only) can read/write.
