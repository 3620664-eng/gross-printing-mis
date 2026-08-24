-- Gross Printing MIS v0.6.3 - Complete Login, Password Recovery, and Portal Access Requests
-- Run after V044, V060, and V061. Safe to run again.

create extension if not exists pgcrypto;

create table if not exists public.customer_portal_access_requests (
  id uuid primary key default gen_random_uuid(),
  company_name text not null,
  contact_name text not null,
  email text not null,
  phone text,
  existing_customer text,
  note text,
  status text not null default 'Pending' check (status in ('Pending', 'Reviewed', 'Invited', 'Declined', 'Archived')),
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists customer_portal_access_requests_status_idx
  on public.customer_portal_access_requests(status, created_at desc);
create index if not exists customer_portal_access_requests_email_idx
  on public.customer_portal_access_requests(lower(email), created_at desc);

alter table public.customer_portal_access_requests enable row level security;

-- Public submissions go through a protected server route using the Supabase secret key.
-- Authenticated staff reads/updates through protected server routes as well.
revoke all on public.customer_portal_access_requests from anon, authenticated;

drop trigger if exists customer_portal_access_requests_touch_updated_at on public.customer_portal_access_requests;
create trigger customer_portal_access_requests_touch_updated_at
before update on public.customer_portal_access_requests
for each row execute function public.touch_updated_at();
