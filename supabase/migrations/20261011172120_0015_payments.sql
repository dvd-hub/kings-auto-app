-- 0015 · Pagos (fase 4c1)
-- Pagos y devoluciones por orden de reparación (también anticipos antes de la factura).
-- Solo se escriben con las RPC record_payment y void_payment. Nunca se borran ni editan: se anulan con motivo.
-- El saldo se calcula en la vista ro_balances (security_invoker): factura emitida activa menos lo pagado neto.

create type public.payment_kind as enum ('payment', 'refund');
create type public.payment_method as enum ('cash', 'card', 'check', 'zelle', 'bank_transfer', 'other');
create type public.payment_payer as enum ('customer', 'insurance', 'other');
create type public.payment_status as enum ('recorded', 'voided');

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null default public.current_shop_id() references public.shops(id),
  repair_order_id uuid not null,
  payment_number integer not null,
  kind public.payment_kind not null,
  status public.payment_status not null default 'recorded',
  amount_cents bigint not null check (amount_cents > 0 and amount_cents <= 100000000),
  paid_at timestamptz not null,
  method public.payment_method not null,
  payer public.payment_payer not null,
  payer_name text check (payer_name is null or length(payer_name) between 1 and 120),
  claim_number text check (claim_number is null or length(claim_number) between 1 and 60),
  -- Nº de cheque, últimos 4 de la tarjeta, id de Zelle... Nunca un número de tarjeta o de cuenta completo.
  reference text check (reference is null or (length(reference) between 1 and 40 and reference !~ '[0-9]{9,}')),
  notes text check (notes is null or length(notes) <= 1000),
  voided_at timestamptz,
  voided_by uuid references auth.users(id),
  void_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users(id),
  deleted_at timestamptz,
  unique (id, shop_id),
  unique (shop_id, payment_number),
  foreign key (repair_order_id, shop_id) references public.repair_orders(id, shop_id),
  check (payer <> 'insurance' or payer_name is not null),
  check ((status = 'voided') = (voided_at is not null)),
  check (status <> 'voided' or length(btrim(coalesce(void_reason, ''))) >= 3)
);

create index payments_repair_order_idx on public.payments (repair_order_id) where deleted_at is null;
create trigger payments_updated_at before update on public.payments for each row execute function public.set_updated_at();

alter table public.payments enable row level security;
create policy payments_select on public.payments for select to authenticated
  using (shop_id = (select public.current_shop_id()));
grant select on public.payments to authenticated;

-- Pagado neto de una orden (pagos menos devoluciones, sin anulados).
create or replace function public.ro_net_paid(p_repair_order uuid)
returns bigint language sql stable security definer set search_path to '' as $$
  select coalesce(sum(case when kind = 'payment' then amount_cents else -amount_cents end), 0)::bigint
  from public.payments
  where repair_order_id = p_repair_order and status = 'recorded' and deleted_at is null;
$$;
revoke all on function public.ro_net_paid(uuid) from public, anon, authenticated;

create or replace function public.record_payment(
  p_repair_order uuid, p_kind public.payment_kind, p_amount_cents bigint, p_paid_at timestamptz,
  p_method public.payment_method, p_payer public.payment_payer, p_payer_name text, p_claim_number text,
  p_reference text, p_notes text)
returns uuid language plpgsql security definer set search_path to '' as $$
declare
  v_ro public.repair_orders;
  v_id uuid;
  v_number integer;
  v_net bigint;
begin
  if auth.uid() is null then raise exception 'not authenticated' using errcode = '42501'; end if;
  select * into v_ro from public.repair_orders
  where id = p_repair_order and shop_id = public.current_shop_id() and deleted_at is null for update;
  if not found then raise exception 'repair order not found' using errcode = 'P0002'; end if;

  if p_amount_cents is null or p_amount_cents <= 0 then raise exception 'payment amount must be positive' using errcode = 'P0001'; end if;
  if p_paid_at is null or p_paid_at > now() + interval '1 day' then raise exception 'payment date cannot be in the future' using errcode = 'P0001'; end if;
  if p_payer = 'insurance' and length(btrim(coalesce(p_payer_name, ''))) = 0 then
    raise exception 'insurance payment requires payer name' using errcode = 'P0001';
  end if;
  if p_kind = 'payment' and v_ro.status = 'cancelled' then
    raise exception 'cancelled order cannot receive payments' using errcode = 'P0001';
  end if;

  v_net := public.ro_net_paid(v_ro.id);
  if p_kind = 'refund' and p_amount_cents > v_net then
    raise exception 'refund exceeds amount paid' using errcode = 'P0001';
  end if;

  v_number := public.next_number('payment');
  insert into public.payments (shop_id, repair_order_id, payment_number, kind, amount_cents, paid_at, method, payer,
    payer_name, claim_number, reference, notes)
  values (v_ro.shop_id, v_ro.id, v_number, p_kind, p_amount_cents, p_paid_at, p_method, p_payer,
    nullif(btrim(coalesce(p_payer_name, '')), ''), nullif(btrim(coalesce(p_claim_number, '')), ''),
    nullif(btrim(coalesce(p_reference, '')), ''), nullif(btrim(coalesce(p_notes, '')), ''))
  returning id into v_id;

  insert into public.activities (shop_id, repair_order_id, customer_id, kind, body, created_by)
  values (v_ro.shop_id, v_ro.id, v_ro.customer_id, 'system',
    jsonb_build_object('module','orders','key',
      case when p_kind = 'payment' then 'paymentRecordedActivity' else 'refundRecordedActivity' end,
      'values', jsonb_build_object('number', v_number, 'amount', p_amount_cents, 'method', p_method))::text, auth.uid());
  return v_id;
end $$;

create or replace function public.void_payment(p_payment uuid, p_reason text)
returns void language plpgsql security definer set search_path to '' as $$
declare
  v public.payments;
  v_ro public.repair_orders;
begin
  if auth.uid() is null then raise exception 'not authenticated' using errcode = '42501'; end if;
  select * into v from public.payments
  where id = p_payment and shop_id = public.current_shop_id() and deleted_at is null;
  if not found then raise exception 'payment not found' using errcode = 'P0002'; end if;
  select * into v_ro from public.repair_orders where id = v.repair_order_id for update;
  select * into v from public.payments where id = p_payment for update;
  if v.status <> 'recorded' then raise exception 'payment already voided' using errcode = 'P0001'; end if;
  if length(btrim(coalesce(p_reason, ''))) < 3 then raise exception 'void reason is required' using errcode = 'P0001'; end if;
  if v.kind = 'payment' and public.ro_net_paid(v.repair_order_id) - v.amount_cents < 0 then
    raise exception 'void would leave refunds above payments' using errcode = 'P0001';
  end if;

  update public.payments set status = 'voided', voided_at = now(), voided_by = auth.uid(), void_reason = btrim(p_reason)
  where id = v.id;

  insert into public.activities (shop_id, repair_order_id, customer_id, kind, body, created_by)
  values (v.shop_id, v.repair_order_id, v_ro.customer_id, 'system',
    jsonb_build_object('module','orders','key','paymentVoidedActivity',
      'values', jsonb_build_object('number', v.payment_number, 'amount', v.amount_cents))::text, auth.uid());
end $$;

revoke all on function public.record_payment(uuid, public.payment_kind, bigint, timestamptz, public.payment_method, public.payment_payer, text, text, text, text) from public, anon;
revoke all on function public.void_payment(uuid, text) from public, anon;
grant execute on function public.record_payment(uuid, public.payment_kind, bigint, timestamptz, public.payment_method, public.payment_payer, text, text, text, text) to authenticated;
grant execute on function public.void_payment(uuid, text) to authenticated;

-- Saldo por orden. invoice_total_cents es null si no hay factura emitida activa (entonces lo pagado es anticipo).
create view public.ro_balances with (security_invoker = true) as
select
  ro.id as repair_order_id,
  ro.shop_id,
  i.id as invoice_id,
  i.total_cents as invoice_total_cents,
  coalesce(p.paid, 0)::bigint as paid_cents,
  coalesce(p.refunded, 0)::bigint as refunded_cents,
  (coalesce(p.paid, 0) - coalesce(p.refunded, 0))::bigint as net_paid_cents,
  case when i.id is null then null else (i.total_cents - coalesce(p.paid, 0) + coalesce(p.refunded, 0))::bigint end as balance_cents,
  case
    when i.id is null then case when coalesce(p.paid, 0) - coalesce(p.refunded, 0) > 0 then 'deposit' else 'no_invoice' end
    when coalesce(p.paid, 0) - coalesce(p.refunded, 0) <= 0 then 'unpaid'
    when coalesce(p.paid, 0) - coalesce(p.refunded, 0) < i.total_cents then 'partial'
    when coalesce(p.paid, 0) - coalesce(p.refunded, 0) = i.total_cents then 'paid'
    else 'overpaid'
  end as payment_status
from public.repair_orders ro
left join public.invoices i on i.repair_order_id = ro.id and i.status = 'issued' and i.deleted_at is null
left join lateral (
  select
    sum(amount_cents) filter (where kind = 'payment') as paid,
    sum(amount_cents) filter (where kind = 'refund') as refunded
  from public.payments
  where repair_order_id = ro.id and status = 'recorded' and deleted_at is null
) p on true
where ro.deleted_at is null;

grant select on public.ro_balances to authenticated;
