-- Gross Printing MIS v0.6.1 - Portal Requests Inbox and Notification Center
-- Run GROSS_PRINTING_MIS_V044_SETUP.sql first.
-- Then run GROSS_PRINTING_MIS_V060_CUSTOMER_PORTAL.sql.
-- Then run this entire file.
-- Safe to run again.

create sequence if not exists public.customer_portal_request_number_seq start 1001;

alter table public.customer_portal_requests
  add column if not exists request_number text,
  add column if not exists notification_read_at timestamptz,
  add column if not exists notification_read_by uuid references auth.users(id) on delete set null,
  add column if not exists converted_at timestamptz,
  add column if not exists converted_by text,
  add column if not exists converted_record_number text,
  add column if not exists conversion_kind text;

create unique index if not exists customer_portal_requests_request_number_idx
  on public.customer_portal_requests(request_number)
  where request_number is not null;

create index if not exists customer_portal_requests_notification_idx
  on public.customer_portal_requests(notification_read_at, created_at desc);

alter table public.customer_portal_requests
  drop constraint if exists customer_portal_requests_status_check;

alter table public.customer_portal_requests
  add constraint customer_portal_requests_status_check check (
    status in (
      'New',
      'AI Reviewed',
      'Missing Information',
      'Waiting for Customer',
      'Ready for Quote',
      'Ready for Job',
      'Converted',
      'Closed',
      'Archived',
      'In Review',
      'Completed'
    )
  );

alter table public.customer_portal_requests
  drop constraint if exists customer_portal_requests_conversion_kind_check;

alter table public.customer_portal_requests
  add constraint customer_portal_requests_conversion_kind_check check (
    conversion_kind is null
    or conversion_kind in ('quote', 'job', 'existing_job')
  );

create or replace function public.assign_customer_portal_request_number()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.request_number is null or btrim(new.request_number) = '' then
    new.request_number :=
      'PR-' || lpad(nextval('public.customer_portal_request_number_seq')::text, 4, '0');
  end if;
  return new;
end;
$$;

drop trigger if exists customer_portal_request_number on public.customer_portal_requests;
create trigger customer_portal_request_number
before insert on public.customer_portal_requests
for each row execute function public.assign_customer_portal_request_number();

with numbered as (
  select
    id,
    'PR-' || lpad(
      (1000 + row_number() over (order by created_at, id))::text,
      4,
      '0'
    ) as generated_number
  from public.customer_portal_requests
  where request_number is null or btrim(request_number) = ''
)
update public.customer_portal_requests as requests
set request_number = numbered.generated_number
from numbered
where requests.id = numbered.id;

select setval(
  'public.customer_portal_request_number_seq',
  greatest(
    1000,
    coalesce((
      select max(nullif(regexp_replace(request_number, '\D', '', 'g'), '')::bigint)
      from public.customer_portal_requests
    ), 1000)
  ),
  true
);

-- Staff updates are performed through the protected service-role server route.
-- These grants also allow authenticated office staff to use direct RLS-based
-- clients later without widening customer permissions.
grant update (
  status,
  metadata,
  notification_read_at,
  notification_read_by,
  job_id,
  quote_id,
  converted_at,
  converted_by,
  converted_record_number,
  conversion_kind,
  updated_at
) on public.customer_portal_requests to authenticated;
