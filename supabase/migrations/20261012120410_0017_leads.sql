-- 0017_leads — CRM leads (fase 5)

create type public.lead_status as enum
  ('new','contacted','estimate_appt','estimate_sent','won','lost','spam');
create type public.lead_source as enum
  ('web','phone','walk_in','referral','other');
create type public.lead_lost_reason as enum
  ('price','insurance_other_shop','no_response','total_loss','other');

create table public.leads (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null default public.current_shop_id() references public.shops(id),
  status public.lead_status not null default 'new',
  source public.lead_source not null default 'other',
  customer_id uuid,
  vehicle_id uuid,
  appointment_id uuid,
  repair_order_id uuid,
  web_request_id uuid,
  summary text,
  lost_reason public.lead_lost_reason,
  lost_note text,
  next_call_on date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users(id),
  deleted_at timestamptz,
  unique (id, shop_id),
  foreign key (customer_id, shop_id) references public.customers(id, shop_id),
  foreign key (vehicle_id, shop_id) references public.vehicles(id, shop_id),
  foreign key (appointment_id, shop_id) references public.appointments(id, shop_id),
  foreign key (repair_order_id, shop_id) references public.repair_orders(id, shop_id),
  foreign key (web_request_id, shop_id) references public.web_requests(id, shop_id),
  constraint leads_lost_reason_chk check (status = 'lost' or lost_reason is null)
);

create unique index leads_web_request_uniq
  on public.leads (web_request_id) where web_request_id is not null and deleted_at is null;
create index leads_status_idx on public.leads (shop_id, status) where deleted_at is null;
create index leads_next_call_idx on public.leads (shop_id, next_call_on)
  where deleted_at is null and next_call_on is not null;

alter table public.leads enable row level security;
create policy leads_rls on public.leads for all
  using (shop_id = public.current_shop_id())
  with check (shop_id = public.current_shop_id());

grant select, insert, update on public.leads to authenticated;

create trigger set_leads_updated_at before update on public.leads
  for each row execute function public.set_updated_at();

-- enlace inverso desde web_requests (una solicitud web puede originar un lead)
alter table public.web_requests add column lead_id uuid;
alter table public.web_requests
  add constraint web_requests_lead_id_shop_id_fkey
  foreign key (lead_id, shop_id) references public.leads(id, shop_id);

-- marcar lead como spam: archiva el cliente SOLO si no tiene otra cita ni orden
create or replace function public.mark_lead_spam(p_lead_id uuid)
returns void
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_shop uuid := public.current_shop_id();
  v_customer uuid;
begin
  update public.leads
    set status = 'spam'
    where id = p_lead_id and shop_id = v_shop and deleted_at is null
    returning customer_id into v_customer;

  if not found then
    raise exception 'lead not found';
  end if;

  if v_customer is not null
     and not exists (
       select 1 from public.appointments a
       where a.customer_id = v_customer and a.shop_id = v_shop and a.deleted_at is null
     )
     and not exists (
       select 1 from public.repair_orders ro
       where ro.customer_id = v_customer and ro.shop_id = v_shop and ro.deleted_at is null
     )
  then
    update public.customers
      set deleted_at = now()
      where id = v_customer and shop_id = v_shop and deleted_at is null;
  end if;
end;
$$;

revoke all on function public.mark_lead_spam(uuid) from public, anon;
grant execute on function public.mark_lead_spam(uuid) to authenticated;
