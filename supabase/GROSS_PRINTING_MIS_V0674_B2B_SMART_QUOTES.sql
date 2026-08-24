-- Gross Printing MIS v0.6.7.4
-- B2B smart quotes and customer matching metadata.
-- ADDITIVE / NON-DESTRUCTIVE: preserves all existing customers, jobs, quotes, invoices, files, history, and public quote requests.
-- Run AFTER GROSS_PRINTING_MIS_V0671_PUBLIC_QUOTE_INTAKE.sql.

begin;

alter table if exists public.public_quote_requests
  add column if not exists color_spec text,
  add column if not exists paper_weight text,
  add column if not exists coating text,
  add column if not exists bleed boolean,
  add column if not exists delivery_method text,
  add column if not exists customer_match jsonb not null default '[]'::jsonb,
  add column if not exists linked_customer_id text,
  add column if not exists approved_selling_price numeric(12,2),
  add column if not exists staff_reviewed_at timestamptz,
  add column if not exists staff_reviewed_by text;

create index if not exists public_quote_requests_linked_customer_idx
  on public.public_quote_requests(linked_customer_id, submitted_at desc)
  where linked_customer_id is not null;

create index if not exists public_quote_requests_company_idx
  on public.public_quote_requests(lower(company), submitted_at desc)
  where company is not null;

-- Service-role only remains the security model from v0.6.7.1.
revoke all on public.public_quote_requests from anon, authenticated;
grant select, insert, update on public.public_quote_requests to service_role;

commit;

-- Read-only verification:
-- select count(*) from public.public_quote_requests;
-- select request_number, status, linked_customer_id, approved_selling_price from public.public_quote_requests order by submitted_at desc limit 20;
