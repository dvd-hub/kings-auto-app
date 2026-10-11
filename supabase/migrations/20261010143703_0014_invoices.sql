-- 0014 · Facturas con formato BAR (fase 4b)
-- Una factura por orden (no anulada). Se crea en borrador copiando las líneas de los presupuestos AUTORIZADOS.
-- En borrador solo se puede bajar cantidad o precio, quitar líneas o cambiar si tributa: nunca facturar más de lo autorizado.
-- Al emitir: número correlativo, tasa de impuesto del taller, totales y bloqueo. Después solo se congela el PDF (una vez) o se anula.

create type public.invoice_status as enum ('draft', 'issued', 'voided');

create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null default public.current_shop_id() references public.shops(id),
  repair_order_id uuid not null,
  invoice_number integer,
  status public.invoice_status not null default 'draft',
  tax_rate numeric(6,4),
  parts_cents bigint,
  labor_cents bigint,
  materials_cents bigint,
  sublet_cents bigint,
  hazardous_waste_cents bigint,
  taxable_cents bigint,
  tax_cents bigint,
  total_cents bigint,
  authorized_cents bigint,
  odometer_out integer check (odometer_out is null or odometer_out >= 0),
  notes text check (notes is null or length(notes) <= 2000),
  issued_at timestamptz,
  issued_by uuid references auth.users(id),
  voided_at timestamptz,
  void_reason text,
  pdf_document_id uuid,
  pdf_sha256 text check (pdf_sha256 is null or pdf_sha256 ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users(id),
  deleted_at timestamptz,
  unique (id, shop_id),
  unique (shop_id, invoice_number),
  foreign key (repair_order_id, shop_id) references public.repair_orders (id, shop_id),
  foreign key (pdf_document_id, shop_id) references public.documents (id, shop_id),
  constraint invoices_issued_chk check (
    (status = 'draft' and invoice_number is null and issued_at is null and total_cents is null)
    or (status in ('issued','voided') and invoice_number is not null and issued_at is not null and total_cents is not null
        and tax_rate is not null and odometer_out is not null)
  ),
  constraint invoices_void_chk check ((status = 'voided') = (voided_at is not null)
    and (status <> 'voided' or length(btrim(coalesce(void_reason,''))) > 0)),
  constraint invoices_pdf_chk check ((pdf_document_id is null) = (pdf_sha256 is null) and (pdf_document_id is null or status <> 'draft'))
);
create unique index invoices_one_active_per_ro on public.invoices (repair_order_id)
  where status <> 'voided' and deleted_at is null;
create index invoices_shop_idx on public.invoices (shop_id, status) where deleted_at is null;

create table public.invoice_lines (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id),
  invoice_id uuid not null,
  source_line_id uuid not null,
  estimate_id uuid not null,
  position integer not null check (position >= 0),
  line_type public.estimate_line_type not null,
  description text not null,
  quantity numeric(10,2) not null check (quantity > 0),
  unit_price_cents integer not null check (unit_price_cents >= 0),
  amount_cents bigint generated always as ((round(quantity * unit_price_cents::numeric))::bigint) stored,
  authorized_quantity numeric(10,2) not null,
  authorized_unit_price_cents integer not null,
  taxable boolean not null,
  part_condition public.part_condition,
  is_crash_part boolean,
  crash_part_origin public.crash_part_origin,
  part_number text,
  brand text,
  non_returnable boolean,
  labor_type public.labor_type,
  paint_materials_method public.paint_materials_method,
  sublet_vendor_name text,
  sublet_vendor_address text,
  teardown_role public.teardown_role,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (id, shop_id),
  unique (invoice_id, source_line_id),
  foreign key (invoice_id, shop_id) references public.invoices (id, shop_id),
  foreign key (estimate_id, shop_id) references public.estimates (id, shop_id),
  constraint invoice_lines_cap_chk check (quantity <= authorized_quantity and unit_price_cents <= authorized_unit_price_cents)
);
create index invoice_lines_invoice_idx on public.invoice_lines (invoice_id, position);

create trigger invoices_updated_at before update on public.invoices for each row execute function public.set_updated_at();
create trigger invoice_lines_updated_at before update on public.invoice_lines for each row execute function public.set_updated_at();

alter table public.invoices enable row level security;
alter table public.invoice_lines enable row level security;
create policy invoices_select on public.invoices for select to authenticated
  using (shop_id = (select public.current_shop_id()));
create policy invoice_lines_select on public.invoice_lines for select to authenticated
  using (shop_id = (select public.current_shop_id()));
create policy invoice_lines_update on public.invoice_lines for update to authenticated
  using (shop_id = (select public.current_shop_id()))
  with check (shop_id = (select public.current_shop_id()));
grant select on public.invoices to authenticated;
grant select on public.invoice_lines to authenticated;
grant update (quantity, unit_price_cents, taxable, deleted_at) on public.invoice_lines to authenticated;

-- Líneas: solo cambian en borrador y solo los campos permitidos
create or replace function public.invoice_lines_guard()
returns trigger language plpgsql set search_path = '' as $$
begin
  if not exists (select 1 from public.invoices i where i.id = old.invoice_id and i.status = 'draft' and i.deleted_at is null) then
    raise exception 'invoice is not a draft' using errcode = 'P0001';
  end if;
  if (to_jsonb(new) - array['quantity','unit_price_cents','amount_cents','taxable','deleted_at','updated_at'])
     is distinct from (to_jsonb(old) - array['quantity','unit_price_cents','amount_cents','taxable','deleted_at','updated_at']) then
    raise exception 'invoice line field cannot change' using errcode = 'P0001';
  end if;
  if old.deleted_at is not null and new.deleted_at is null then
    raise exception 'removed invoice line cannot be restored' using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger invoice_lines_guard before update on public.invoice_lines
  for each row execute function public.invoice_lines_guard();

-- Factura: emitida = bloqueada (salvo PDF una vez y anulación)
create or replace function public.invoices_guard()
returns trigger language plpgsql set search_path = '' as $$
declare
  v_free text[] := array['pdf_document_id','pdf_sha256','status','voided_at','void_reason','updated_at'];
begin
  if new.repair_order_id is distinct from old.repair_order_id or new.shop_id is distinct from old.shop_id then
    raise exception 'invoice identity fields are immutable' using errcode = 'P0001';
  end if;
  if old.status = 'voided' and (to_jsonb(new) - array['updated_at']) is distinct from (to_jsonb(old) - array['updated_at']) then
    raise exception 'voided invoice is locked' using errcode = 'P0001';
  end if;
  if old.status = 'issued' then
    if (to_jsonb(new) - v_free) is distinct from (to_jsonb(old) - v_free) then
      raise exception 'issued invoice is locked' using errcode = 'P0001';
    end if;
    if new.status not in ('issued','voided') then
      raise exception 'issued invoice cannot go back to draft' using errcode = 'P0001';
    end if;
    if old.pdf_document_id is not null and (new.pdf_document_id is distinct from old.pdf_document_id or new.pdf_sha256 is distinct from old.pdf_sha256) then
      raise exception 'frozen invoice PDF cannot be replaced' using errcode = 'P0001';
    end if;
  end if;
  if old.status = 'draft' and old.deleted_at is not null then
    raise exception 'discarded draft is locked' using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger invoices_guard before update on public.invoices
  for each row execute function public.invoices_guard();

-- Comprobación común de acceso para las funciones
create or replace function public.invoice_for_update(p_invoice uuid)
returns public.invoices language plpgsql security definer set search_path = '' as $$
declare v public.invoices;
begin
  if auth.uid() is null then raise exception 'not authenticated' using errcode = '42501'; end if;
  select * into v from public.invoices
  where id = p_invoice and shop_id = public.current_shop_id() and deleted_at is null for update;
  if not found then raise exception 'invoice not found' using errcode = 'P0002'; end if;
  return v;
end $$;

-- Crear borrador desde los presupuestos autorizados
create or replace function public.create_invoice_draft(p_repair_order uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_ro public.repair_orders;
  v_id uuid;
begin
  if auth.uid() is null then raise exception 'not authenticated' using errcode = '42501'; end if;
  select * into v_ro from public.repair_orders
  where id = p_repair_order and shop_id = public.current_shop_id() and deleted_at is null for update;
  if not found then raise exception 'repair order not found' using errcode = 'P0002'; end if;
  if v_ro.status = 'cancelled' then
    raise exception 'cancelled order cannot be invoiced' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.invoices i where i.repair_order_id = v_ro.id and i.status <> 'voided' and i.deleted_at is null) then
    raise exception 'order already has an invoice' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.estimates e where e.repair_order_id = v_ro.id and e.status = 'authorized' and e.deleted_at is null) then
    raise exception 'order has no authorized estimate' using errcode = 'P0001';
  end if;

  insert into public.invoices (shop_id, repair_order_id, odometer_out, created_by)
  values (v_ro.shop_id, v_ro.id, v_ro.odometer_out, auth.uid())
  returning id into v_id;

  insert into public.invoice_lines (shop_id, invoice_id, source_line_id, estimate_id, position, line_type, description,
    quantity, unit_price_cents, authorized_quantity, authorized_unit_price_cents, taxable, part_condition, is_crash_part,
    crash_part_origin, part_number, brand, non_returnable, labor_type, paint_materials_method, sublet_vendor_name,
    sublet_vendor_address, teardown_role)
  select v_ro.shop_id, v_id, l.id, e.id,
    (row_number() over (order by case e.kind when 'teardown' then 0 when 'repair' then 1 else 2 end, e.seq, l.position, l.id) - 1)::int,
    l.line_type, l.description, l.quantity, l.unit_price_cents, l.quantity, l.unit_price_cents, l.taxable,
    l.part_condition, l.is_crash_part, l.crash_part_origin, l.part_number, l.brand, l.non_returnable, l.labor_type,
    l.paint_materials_method, l.sublet_vendor_name, l.sublet_vendor_address, l.teardown_role
  from public.estimates e
  join public.estimate_lines l on l.estimate_id = e.id and l.deleted_at is null
  where e.repair_order_id = v_ro.id and e.status = 'authorized' and e.deleted_at is null;

  return v_id;
end $$;

-- Descartar borrador
create or replace function public.discard_invoice_draft(p_invoice uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v public.invoices;
begin
  v := public.invoice_for_update(p_invoice);
  if v.status <> 'draft' then raise exception 'invoice is not a draft' using errcode = 'P0001'; end if;
  update public.invoices set deleted_at = now() where id = v.id;
end $$;

-- Emitir
create or replace function public.issue_invoice(p_invoice uuid, p_odometer_out integer, p_notes text)
returns integer language plpgsql security definer set search_path = '' as $$
declare
  v public.invoices;
  v_ro public.repair_orders;
  v_shop public.shops;
  t record;
  v_authorized bigint;
  v_tax bigint;
  v_number integer;
begin
  v := public.invoice_for_update(p_invoice);
  if v.status <> 'draft' then raise exception 'invoice is not a draft' using errcode = 'P0001'; end if;
  select * into v_ro from public.repair_orders where id = v.repair_order_id for update;
  select * into v_shop from public.shops where id = v.shop_id;

  if p_odometer_out is null or p_odometer_out < v_ro.odometer_in then
    raise exception 'odometer out must be at least odometer in' using errcode = 'P0001';
  end if;
  if length(btrim(coalesce(v_shop.bar_registration_number, ''))) = 0 then
    raise exception 'shop BAR registration number is missing' using errcode = 'P0001';
  end if;

  select
    count(*) as n,
    coalesce(sum(amount_cents) filter (where line_type = 'part'), 0) as parts,
    coalesce(sum(amount_cents) filter (where line_type = 'labor'), 0) as labor,
    coalesce(sum(amount_cents) filter (where line_type in ('paint_materials','materials')), 0) as materials,
    coalesce(sum(amount_cents) filter (where line_type = 'sublet'), 0) as sublet,
    coalesce(sum(amount_cents) filter (where line_type = 'hazardous_waste'), 0) as hazardous,
    coalesce(sum(amount_cents) filter (where taxable), 0) as taxable,
    coalesce(sum(amount_cents), 0) as subtotal
  into t
  from public.invoice_lines where invoice_id = v.id and deleted_at is null;

  if t.n = 0 then raise exception 'invoice has no lines' using errcode = 'P0001'; end if;
  if t.hazardous > 0 and length(btrim(coalesce(v_shop.epa_id_number, ''))) = 0 then
    raise exception 'shop EPA number is required for hazardous waste' using errcode = 'P0001';
  end if;

  select coalesce(sum(a.amount_cents), 0) into v_authorized
  from public.authorizations a
  join public.estimates e on e.id = a.estimate_id
  where e.repair_order_id = v.repair_order_id and e.status = 'authorized' and e.deleted_at is null
    and a.decision = 'approved' and a.deleted_at is null;
  if t.subtotal > v_authorized then
    raise exception 'invoice exceeds authorized amount' using errcode = 'P0001';
  end if;

  v_tax := round(t.taxable * v_shop.sales_tax_rate)::bigint;
  v_number := public.next_number('invoice');

  update public.invoices set
    status = 'issued', invoice_number = v_number, issued_at = now(), issued_by = auth.uid(),
    tax_rate = v_shop.sales_tax_rate, parts_cents = t.parts, labor_cents = t.labor, materials_cents = t.materials,
    sublet_cents = t.sublet, hazardous_waste_cents = t.hazardous, taxable_cents = t.taxable, tax_cents = v_tax,
    total_cents = t.subtotal + v_tax, authorized_cents = v_authorized, odometer_out = p_odometer_out,
    notes = nullif(btrim(coalesce(p_notes, '')), '')
  where id = v.id;

  if v_ro.odometer_out is null then
    update public.repair_orders set odometer_out = p_odometer_out where id = v_ro.id;
  end if;

  insert into public.activities (shop_id, repair_order_id, customer_id, kind, body, created_by)
  values (v.shop_id, v.repair_order_id, v_ro.customer_id, 'system',
    jsonb_build_object('module','orders','key','invoiceIssuedActivity','values',
      jsonb_build_object('number', v_number, 'total', t.subtotal + v_tax))::text, auth.uid());
  return v_number;
end $$;

-- Anular (la factura emitida se conserva; permite crear otra)
create or replace function public.void_invoice(p_invoice uuid, p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare v public.invoices; v_customer uuid;
begin
  v := public.invoice_for_update(p_invoice);
  if v.status <> 'issued' then raise exception 'only an issued invoice can be voided' using errcode = 'P0001'; end if;
  if length(btrim(coalesce(p_reason, ''))) < 3 then raise exception 'void reason is required' using errcode = 'P0001'; end if;
  update public.invoices set status = 'voided', voided_at = now(), void_reason = btrim(p_reason) where id = v.id;
  select customer_id into v_customer from public.repair_orders where id = v.repair_order_id;
  insert into public.activities (shop_id, repair_order_id, customer_id, kind, body, created_by)
  values (v.shop_id, v.repair_order_id, v_customer, 'system',
    jsonb_build_object('module','orders','key','invoiceVoidedActivity','values',
      jsonb_build_object('number', v.invoice_number))::text, auth.uid());
end $$;

-- Congelar el PDF de una factura emitida (una sola vez)
create or replace function public.freeze_invoice_pdf(p_invoice uuid, p_document uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v public.invoices; d public.documents;
begin
  v := public.invoice_for_update(p_invoice);
  if v.status <> 'issued' then raise exception 'invoice is not issued' using errcode = 'P0001'; end if;
  if v.pdf_document_id is not null then raise exception 'frozen invoice PDF cannot be replaced' using errcode = 'P0001'; end if;
  select * into d from public.documents
  where id = p_document and shop_id = v.shop_id and deleted_at is null
    and kind = 'invoice_pdf' and repair_order_id = v.repair_order_id and mime_type = 'application/pdf';
  if not found or d.sha256 is null then raise exception 'invoice PDF document not valid' using errcode = 'P0001'; end if;
  update public.invoices set pdf_document_id = d.id, pdf_sha256 = d.sha256 where id = v.id;
end $$;

revoke all on function public.invoice_lines_guard() from public, anon, authenticated;
revoke all on function public.invoices_guard() from public, anon, authenticated;
revoke all on function public.invoice_for_update(uuid) from public, anon, authenticated;
revoke all on function public.create_invoice_draft(uuid) from public, anon;
revoke all on function public.discard_invoice_draft(uuid) from public, anon;
revoke all on function public.issue_invoice(uuid, integer, text) from public, anon;
revoke all on function public.void_invoice(uuid, text) from public, anon;
revoke all on function public.freeze_invoice_pdf(uuid, uuid) from public, anon;
grant execute on function public.create_invoice_draft(uuid) to authenticated;
grant execute on function public.discard_invoice_draft(uuid) to authenticated;
grant execute on function public.issue_invoice(uuid, integer, text) to authenticated;
grant execute on function public.void_invoice(uuid, text) to authenticated;
grant execute on function public.freeze_invoice_pdf(uuid, uuid) to authenticated;
