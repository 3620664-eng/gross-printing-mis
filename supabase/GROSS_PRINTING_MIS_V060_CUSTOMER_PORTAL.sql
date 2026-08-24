-- Gross Printing MIS v0.6.0 - Secure Customer Portal
-- Run GROSS_PRINTING_MIS_V044_SETUP.sql first, then run this entire file.
-- Safe to run again.

create extension if not exists pgcrypto;

create table if not exists public.customer_portal_accounts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  customer_id text not null,
  email text not null,
  display_name text,
  is_active boolean not null default true,
  invited_by uuid references auth.users(id) on delete set null,
  invited_at timestamptz not null default now(),
  last_sign_in_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists customer_portal_accounts_customer_idx
  on public.customer_portal_accounts(customer_id);
create index if not exists customer_portal_accounts_email_idx
  on public.customer_portal_accounts(lower(email));

create table if not exists public.customer_portal_requests (
  id uuid primary key default gen_random_uuid(),
  customer_id text not null,
  user_id uuid references auth.users(id) on delete set null,
  request_type text not null check (
    request_type in (
      'quote_approval',
      'proof_approval',
      'proof_changes',
      'reorder',
      'new_order',
      'file_upload',
      'message'
    )
  ),
  status text not null default 'New' check (
    status in ('New', 'In Review', 'Completed', 'Closed')
  ),
  job_id text,
  quote_id text,
  invoice_id text,
  title text not null,
  note text,
  file_name text,
  storage_path text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists customer_portal_requests_customer_idx
  on public.customer_portal_requests(customer_id, created_at desc);
create index if not exists customer_portal_requests_status_idx
  on public.customer_portal_requests(status, created_at desc);
create index if not exists customer_portal_requests_user_idx
  on public.customer_portal_requests(user_id, created_at desc);

create or replace function public.current_customer_portal_id()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select customer_id
  from public.customer_portal_accounts
  where user_id = (select auth.uid())
    and is_active = true
  limit 1;
$$;

create or replace function public.is_active_customer_portal_user()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.customer_portal_accounts
    where user_id = (select auth.uid())
      and is_active = true
  );
$$;

revoke all on function public.current_customer_portal_id() from public;
revoke all on function public.is_active_customer_portal_user() from public;
grant execute on function public.current_customer_portal_id() to authenticated;
grant execute on function public.is_active_customer_portal_user() to authenticated;

-- Customer Portal Auth users must not become staff profiles.
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  owner_email constant text := 'jobs@grossprinting.com';
  owner_account boolean := lower(coalesce(new.email, '')) = lower(owner_email);
  portal_account boolean := lower(coalesce(new.raw_user_meta_data ->> 'customer_portal', 'false')) = 'true';
begin
  if portal_account and not owner_account then
    delete from public.profiles
    where user_id = new.id
      and is_owner = false;
    return new;
  end if;

  insert into public.profiles (user_id, email, display_name, role, is_active, is_owner, title, department)
  values (
    new.id,
    new.email,
    coalesce(
      new.raw_user_meta_data ->> 'display_name',
      new.raw_user_meta_data ->> 'full_name',
      new.raw_user_meta_data ->> 'name',
      split_part(coalesce(new.email, ''), '@', 1)
    ),
    case when owner_account then 'admin' else 'front_desk' end,
    owner_account,
    owner_account,
    case when owner_account then 'Owner Administrator' else null end,
    case when owner_account then 'Administration' else null end
  )
  on conflict (user_id) do update
  set email = excluded.email,
      display_name = coalesce(nullif(public.profiles.display_name, ''), excluded.display_name),
      role = case when owner_account then 'admin' else public.profiles.role end,
      is_active = case when owner_account then true else public.profiles.is_active end,
      is_owner = case when owner_account then true else public.profiles.is_owner end,
      title = case when owner_account then 'Owner Administrator' else public.profiles.title end,
      department = case when owner_account then 'Administration' else public.profiles.department end;
  return new;
end;
$$;

-- Remove inactive staff-profile rows created for existing customer portal users.
delete from public.profiles as profiles
using public.customer_portal_accounts as portal
where profiles.user_id = portal.user_id
  and profiles.is_owner = false;

alter table public.customer_portal_accounts enable row level security;
alter table public.customer_portal_requests enable row level security;

drop policy if exists "Portal users can read own account" on public.customer_portal_accounts;
create policy "Portal users can read own account"
on public.customer_portal_accounts for select to authenticated
using ((select auth.uid()) = user_id and is_active = true);

drop policy if exists "Office can read portal accounts" on public.customer_portal_accounts;
create policy "Office can read portal accounts"
on public.customer_portal_accounts for select to authenticated
using ((select public.current_app_role()) in ('admin', 'front_desk'));

drop policy if exists "Admins can manage portal accounts" on public.customer_portal_accounts;
create policy "Admins can manage portal accounts"
on public.customer_portal_accounts for all to authenticated
using ((select public.current_app_role()) = 'admin')
with check ((select public.current_app_role()) = 'admin');

drop policy if exists "Portal users can read own requests" on public.customer_portal_requests;
create policy "Portal users can read own requests"
on public.customer_portal_requests for select to authenticated
using (
  user_id = (select auth.uid())
  and customer_id = (select public.current_customer_portal_id())
);

drop policy if exists "Portal users can create own requests" on public.customer_portal_requests;
create policy "Portal users can create own requests"
on public.customer_portal_requests for insert to authenticated
with check (
  user_id = (select auth.uid())
  and customer_id = (select public.current_customer_portal_id())
);

drop policy if exists "Office can read portal requests" on public.customer_portal_requests;
create policy "Office can read portal requests"
on public.customer_portal_requests for select to authenticated
using ((select public.current_app_role()) in ('admin', 'front_desk'));

drop policy if exists "Office can update portal requests" on public.customer_portal_requests;
create policy "Office can update portal requests"
on public.customer_portal_requests for update to authenticated
using ((select public.current_app_role()) in ('admin', 'front_desk'))
with check ((select public.current_app_role()) in ('admin', 'front_desk'));

drop trigger if exists customer_portal_accounts_touch_updated_at on public.customer_portal_accounts;
create trigger customer_portal_accounts_touch_updated_at
before update on public.customer_portal_accounts
for each row execute function public.touch_updated_at();

drop trigger if exists customer_portal_requests_touch_updated_at on public.customer_portal_requests;
create trigger customer_portal_requests_touch_updated_at
before update on public.customer_portal_requests
for each row execute function public.touch_updated_at();

grant select on public.customer_portal_accounts to authenticated;
grant select, insert on public.customer_portal_requests to authenticated;
grant update (status, updated_at) on public.customer_portal_requests to authenticated;

insert into storage.buckets (id, name, public, file_size_limit)
values ('customer-portal-files', 'customer-portal-files', false, 104857600)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit;

drop policy if exists "Portal users can read own uploaded files" on storage.objects;
create policy "Portal users can read own uploaded files"
on storage.objects for select to authenticated
using (
  bucket_id = 'customer-portal-files'
  and (storage.foldername(name))[1] = (select public.current_customer_portal_id())
  and (storage.foldername(name))[2] = (select auth.uid())::text
);

drop policy if exists "Portal users can upload own files" on storage.objects;
create policy "Portal users can upload own files"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'customer-portal-files'
  and (storage.foldername(name))[1] = (select public.current_customer_portal_id())
  and (storage.foldername(name))[2] = (select auth.uid())::text
);

drop policy if exists "Staff can read customer portal files" on storage.objects;
create policy "Staff can read customer portal files"
on storage.objects for select to authenticated
using (
  bucket_id = 'customer-portal-files'
  and (select public.current_app_role()) in ('admin', 'front_desk', 'prepress')
);

-- The app uses protected server routes with the service role for portal reads,
-- uploads, downloads, invitations, and request administration. Never expose the
-- service-role key in the browser or prefix it with NEXT_PUBLIC_.
