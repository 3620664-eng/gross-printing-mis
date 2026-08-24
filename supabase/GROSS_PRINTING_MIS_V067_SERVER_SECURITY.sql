-- Gross Printing MIS v0.6.7 - Server Data Security & Role Enforcement
-- Run AFTER V044, V060, V061, and V063.
-- This migration is intentionally fail-closed: authenticated browsers lose direct access
-- to the main MIS database record and staff files. The Next.js server becomes the gateway.

create extension if not exists pgcrypto;

create table if not exists public.mis_workspaces (
  id text primary key,
  revision bigint not null default 0,
  migrated_from_legacy_at timestamptz,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);

create table if not exists public.mis_records (
  workspace_id text not null references public.mis_workspaces(id) on delete cascade,
  collection text not null,
  record_id text not null,
  record jsonb not null,
  sort_order integer not null default 0,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  primary key (workspace_id, collection, record_id)
);

create index if not exists mis_records_collection_idx
  on public.mis_records(workspace_id, collection, deleted_at, sort_order, updated_at desc);

create table if not exists public.mis_record_versions (
  id bigint generated always as identity primary key,
  workspace_id text not null,
  collection text not null,
  record_id text not null,
  action text not null check (action in ('insert', 'update', 'soft_delete', 'restore', 'delete')),
  previous_record jsonb,
  new_record jsonb,
  actor_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists mis_record_versions_lookup_idx
  on public.mis_record_versions(workspace_id, collection, record_id, created_at desc);

create table if not exists public.security_audit_log (
  id bigint generated always as identity primary key,
  actor_user_id uuid references auth.users(id) on delete set null,
  actor_email text,
  actor_role text,
  action text not null,
  category text not null,
  target_collection text,
  target_record_id text,
  ip_address inet,
  user_agent text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists security_audit_log_created_idx
  on public.security_audit_log(created_at desc);
create index if not exists security_audit_log_actor_idx
  on public.security_audit_log(actor_user_id, created_at desc);

create or replace function public.capture_mis_record_version()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  change_action text;
begin
  if tg_op = 'INSERT' then
    change_action := case when new.deleted_at is null then 'insert' else 'soft_delete' end;
    insert into public.mis_record_versions
      (workspace_id, collection, record_id, action, previous_record, new_record, actor_user_id)
    values
      (new.workspace_id, new.collection, new.record_id, change_action, null, new.record, new.updated_by);
    return new;
  elsif tg_op = 'UPDATE' then
    change_action := case
      when old.deleted_at is null and new.deleted_at is not null then 'soft_delete'
      when old.deleted_at is not null and new.deleted_at is null then 'restore'
      else 'update'
    end;
    if old.record is distinct from new.record or old.deleted_at is distinct from new.deleted_at then
      insert into public.mis_record_versions
        (workspace_id, collection, record_id, action, previous_record, new_record, actor_user_id)
      values
        (new.workspace_id, new.collection, new.record_id, change_action, old.record, new.record, new.updated_by);
    end if;
    return new;
  elsif tg_op = 'DELETE' then
    insert into public.mis_record_versions
      (workspace_id, collection, record_id, action, previous_record, new_record, actor_user_id)
    values
      (old.workspace_id, old.collection, old.record_id, 'delete', old.record, null, old.updated_by);
    return old;
  end if;
  return null;
end;
$$;

drop trigger if exists mis_records_version_history on public.mis_records;
create trigger mis_records_version_history
after insert or update or delete on public.mis_records
for each row execute function public.capture_mis_record_version();

-- Create the protected workspace.
insert into public.mis_workspaces (id, revision)
values ('gross-printing', 0)
on conflict (id) do nothing;

-- Atomically claim the next workspace revision before the server writes records.
-- This prevents two employees from saving the same old revision at the same time.
create or replace function public.claim_mis_revision(
  p_workspace_id text,
  p_expected_revision bigint,
  p_actor_user_id uuid
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  claimed_revision bigint;
begin
  update public.mis_workspaces
  set revision = revision + 1,
      updated_at = now(),
      updated_by = p_actor_user_id
  where id = p_workspace_id
    and revision = p_expected_revision
  returning revision into claimed_revision;

  return claimed_revision;
end;
$$;

-- Save one protected workspace mutation in a single PostgreSQL transaction. If any row
-- fails, both the record changes and revision claim roll back together.
create or replace function public.save_mis_records(
  p_workspace_id text,
  p_expected_revision bigint,
  p_actor_user_id uuid,
  p_rows jsonb,
  p_collections text[],
  p_soft_delete_missing boolean
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  claimed_revision bigint;
  changed_at timestamptz := now();
begin
  update public.mis_workspaces
  set revision = revision + 1,
      updated_at = changed_at,
      updated_by = p_actor_user_id
  where id = p_workspace_id
    and revision = p_expected_revision
  returning revision into claimed_revision;

  if claimed_revision is null then
    return null;
  end if;

  insert into public.mis_records
    (workspace_id, collection, record_id, record, sort_order, deleted_at, updated_at, updated_by)
  select
    p_workspace_id,
    item.collection,
    item.record_id,
    item.record_value,
    coalesce(item.sort_order, 0),
    null,
    changed_at,
    p_actor_user_id
  from jsonb_to_recordset(coalesce(p_rows, '[]'::jsonb)) as item(
    collection text,
    record_id text,
    record_value jsonb,
    sort_order integer
  )
  on conflict (workspace_id, collection, record_id) do update
  set record = excluded.record,
      sort_order = excluded.sort_order,
      deleted_at = null,
      updated_at = excluded.updated_at,
      updated_by = excluded.updated_by;

  if p_soft_delete_missing then
    update public.mis_records as existing
    set deleted_at = changed_at,
        updated_at = changed_at,
        updated_by = p_actor_user_id
    where existing.workspace_id = p_workspace_id
      and existing.deleted_at is null
      and existing.collection = any(coalesce(p_collections, array[]::text[]))
      and not exists (
        select 1
        from jsonb_to_recordset(coalesce(p_rows, '[]'::jsonb)) as candidate(
          collection text,
          record_id text,
          record_value jsonb,
          sort_order integer
        )
        where candidate.collection = existing.collection
          and candidate.record_id = existing.record_id
      );
  end if;

  return claimed_revision;
end;
$$;

-- Migrate the old single JSON document into one protected database row per business record.
-- This is safe to run again; it only imports when the secure record store is empty.
do $$
declare
  legacy jsonb;
  collection_name text;
  element jsonb;
  record_key text;
  position_number bigint;
begin
  if not exists (
    select 1 from public.mis_records where workspace_id = 'gross-printing'
  ) then
    select data into legacy
    from public.app_data
    where id = 'gross-printing-demo-state-v1';

    if legacy is not null and legacy <> '{}'::jsonb then
      foreach collection_name in array array[
        'customers','orders','jobs','quotes','invoices','uploadedFiles','emailLogs',
        'emailTemplates','emailThreads','emailIntakeTickets','aiLearningExamples',
        'statusEvents','operationalActivities','paperStocks','productCategories',
        'productPresets','catalogPrices','machines','quantityRateCurve'
      ] loop
        position_number := 0;
        if jsonb_typeof(legacy -> collection_name) = 'array' then
          for element in select value from jsonb_array_elements(legacy -> collection_name)
          loop
            position_number := position_number + 1;
            record_key := coalesce(
              nullif(element ->> 'id', ''),
              nullif(element ->> 'quantity', ''),
              'row-' || lpad(position_number::text, 8, '0') || '-' || substr(md5(element::text), 1, 12)
            );
            insert into public.mis_records
              (workspace_id, collection, record_id, record, sort_order, updated_at)
            values
              ('gross-printing', collection_name, record_key, element, position_number::integer, now())
            on conflict (workspace_id, collection, record_id) do nothing;
          end loop;
        end if;
      end loop;

      update public.mis_workspaces
      set revision = 1,
          migrated_from_legacy_at = now(),
          updated_at = now()
      where id = 'gross-printing';
    end if;
  end if;
end $$;

-- The old all-in-one record remains only as an emergency migration source.
-- No signed-in browser can select or modify it after this migration.
drop policy if exists "Active users can read MIS data" on public.app_data;
drop policy if exists "Active users can create MIS data" on public.app_data;
drop policy if exists "Active users can update MIS data" on public.app_data;
revoke all on public.app_data from anon, authenticated;

-- Protected server-only tables. The Supabase secret/service key used by the Next.js server
-- bypasses RLS. Browser publishable-key requests receive no rows and cannot write.
alter table public.mis_workspaces enable row level security;
alter table public.mis_records enable row level security;
alter table public.mis_record_versions enable row level security;
alter table public.security_audit_log enable row level security;

revoke all on public.mis_workspaces from anon, authenticated;
revoke all on public.mis_records from anon, authenticated;
revoke all on public.mis_record_versions from anon, authenticated;
revoke all on public.security_audit_log from anon, authenticated;
revoke all on sequence public.mis_record_versions_id_seq from anon, authenticated;
revoke all on sequence public.security_audit_log_id_seq from anon, authenticated;

-- The Vercel server uses the Supabase secret/service role after completing its own
-- authentication and role checks. Grant only that server role access to protected storage rows.
grant select, insert, update, delete on public.mis_workspaces to service_role;
grant select, insert, update, delete on public.mis_records to service_role;
grant select, insert, update, delete on public.mis_record_versions to service_role;
grant select, insert, update, delete on public.security_audit_log to service_role;
grant usage, select on sequence public.mis_record_versions_id_seq to service_role;
grant usage, select on sequence public.security_audit_log_id_seq to service_role;

-- Staff and Customer Portal file access goes through protected Next.js routes after v0.6.7.
drop policy if exists "Active staff can read MIS files" on storage.objects;
drop policy if exists "Admins can upload MIS files" on storage.objects;
drop policy if exists "Admins can update MIS files" on storage.objects;
drop policy if exists "Admins can delete MIS files" on storage.objects;
drop policy if exists "Portal users can read own uploaded files" on storage.objects;
drop policy if exists "Portal users can upload own files" on storage.objects;
drop policy if exists "Staff can read customer portal files" on storage.objects;

-- Customer Portal tables are also server-gateway only. Customers remain isolated by
-- the verified customer_portal_accounts mapping inside protected Next.js routes.
-- Drop the old browser policies as defense-in-depth, then revoke table privileges.
drop policy if exists "Portal users can read own account" on public.customer_portal_accounts;
drop policy if exists "Office can read portal accounts" on public.customer_portal_accounts;
drop policy if exists "Admins can manage portal accounts" on public.customer_portal_accounts;
drop policy if exists "Portal users can read own requests" on public.customer_portal_requests;
drop policy if exists "Portal users can create own requests" on public.customer_portal_requests;
drop policy if exists "Office can read portal requests" on public.customer_portal_requests;
drop policy if exists "Office can update portal requests" on public.customer_portal_requests;
revoke all on public.customer_portal_accounts from anon, authenticated;
revoke all on public.customer_portal_requests from anon, authenticated;
revoke all on public.customer_portal_access_requests from anon, authenticated;
revoke all on sequence public.customer_portal_request_number_seq from anon, authenticated;
revoke all on function public.current_customer_portal_id() from anon, authenticated;
revoke all on function public.is_active_customer_portal_user() from anon, authenticated;
revoke all on function public.assign_customer_portal_request_number() from anon, authenticated;

-- Prevent browsers from calling security-definer functions directly.
revoke all on function public.capture_mis_record_version() from public, anon, authenticated;
revoke all on function public.claim_mis_revision(text, bigint, uuid) from public, anon, authenticated;
revoke all on function public.save_mis_records(text, bigint, uuid, jsonb, text[], boolean) from public, anon, authenticated;
grant execute on function public.claim_mis_revision(text, bigint, uuid) to service_role;
grant execute on function public.save_mis_records(text, bigint, uuid, jsonb, text[], boolean) to service_role;

-- Keep only the minimum direct profile access needed for Supabase account identity.
-- Role changes remain controlled by existing admin-only RLS and protected server routes.
revoke update (role, is_active, is_owner, department, title) on public.profiles from authenticated;

-- Verify the security state after running:
-- select id, revision, migrated_from_legacy_at from public.mis_workspaces;
-- select collection, count(*) from public.mis_records where deleted_at is null group by collection order by collection;
