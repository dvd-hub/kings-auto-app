-- 0004_repair_orders_estimates
-- Fase 3: órdenes de reparación, presupuestos (desmontaje / reparación / suplemento),
-- líneas, autorizaciones, documentos + Storage, tarifas.
-- Normativa: claude/bar-requisitos-fase3.md (verificada 2026-10-03).

-- ============================================================
-- 1. Taller
-- ============================================================
alter table public.shops add column epa_id_number text;

-- ============================================================
-- 2. Tipos
-- ============================================================
create type public.ro_type as enum ('standard', 'classic');
create type public.ro_status as enum ('open', 'in_progress', 'completed', 'delivered', 'cancelled', 'total_loss');
create type public.arrival_circumstance as enum ('customer_present', 'after_hours_drop_off', 'towed_in');
create type public.teardown_outcome as enum ('repair', 'reassemble', 'declined_reassembly');
create type public.phase_status as enum ('pending', 'in_progress', 'done');
create type public.estimate_kind as enum ('teardown', 'repair', 'supplement');
create type public.estimate_status as enum ('draft', 'sent', 'authorized', 'declined', 'voided');
create type public.estimate_basis as enum ('shop', 'third_party');
create type public.estimate_line_type as enum ('part', 'labor', 'paint_materials', 'materials', 'sublet', 'hazardous_waste');
create type public.part_condition as enum ('new', 'used', 'rebuilt', 'reconditioned');
create type public.crash_part_origin as enum ('oem', 'non_oem_aftermarket');
create type public.labor_type as enum ('body', 'paint', 'mechanical', 'frame', 'other');
create type public.rate_kind as enum ('body', 'paint', 'mechanical', 'frame', 'other', 'paint_materials');
create type public.paint_materials_method as enum ('hourly_rate', 'actual_cost');
create type public.teardown_role as enum ('teardown', 'reassembly', 'destroyed_item');
create type public.authorization_method as enum ('written', 'oral', 'electronic');
create type public.authorization_decision as enum ('approved', 'declined');
create type public.document_kind as enum ('photo', 'estimate_pdf', 'third_party_estimate', 'signature', 'authorization_proof', 'other');

-- ============================================================
-- 3. Órdenes de reparación (work order: presupuesto autorizado + reparaciones pedidas + odómetro)
-- ============================================================
create table public.repair_orders (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null default public.current_shop_id() references public.shops (id),
  ro_number integer not null,
  type public.ro_type not null default 'standard',
  status public.ro_status not null default 'open',
  customer_id uuid not null,
  vehicle_id uuid not null,
  requested_repairs text not null check (length(btrim(requested_repairs)) > 0),
  odometer_in integer not null check (odometer_in >= 0),
  odometer_out integer check (odometer_out >= 0),
  arrival_circumstance public.arrival_circumstance not null default 'customer_present',
  received_at timestamptz not null default now(),
  promised_at timestamptz,
  completed_at timestamptz,
  delivered_at timestamptz,
  teardown_outcome public.teardown_outcome,
  teardown_outcome_at timestamptz,
  total_loss_at timestamptz,
  ready_for_pickup_notified_at timestamptz,
  -- Persona designada para autorizar adicionales (CCR 3354(c)); no puede ser el taller, sus empleados ni la aseguradora
  designee_name text,
  designee_phone text check (designee_phone ~ '^\+[1-9][0-9]{6,14}$'),
  designee_email text check (designee_email ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  designee_signed_at timestamptz,
  designee_signature_document_id uuid,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users (id),
  deleted_at timestamptz,
  unique (shop_id, ro_number),
  unique (id, shop_id),
  foreign key (customer_id, shop_id) references public.customers (id, shop_id),
  foreign key (vehicle_id, shop_id) references public.vehicles (id, shop_id),
  constraint repair_orders_teardown_outcome_chk check ((teardown_outcome is null) = (teardown_outcome_at is null)),
  constraint repair_orders_total_loss_chk check (status <> 'total_loss' or total_loss_at is not null),
  constraint repair_orders_designee_chk check (
    (designee_name is null and designee_phone is null and designee_email is null
      and designee_signed_at is null and designee_signature_document_id is null)
    or (length(btrim(designee_name)) > 0 and num_nonnulls(designee_phone, designee_email) >= 1
      and designee_signed_at is not null and designee_signature_document_id is not null)
  )
);

-- Fases de clásicos
create table public.ro_phases (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null default public.current_shop_id() references public.shops (id),
  repair_order_id uuid not null,
  position integer not null check (position >= 0),
  name text not null check (length(btrim(name)) > 0),
  status public.phase_status not null default 'pending',
  budget_cents bigint check (budget_cents >= 0),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users (id),
  deleted_at timestamptz,
  unique (id, shop_id),
  foreign key (repair_order_id, shop_id) references public.repair_orders (id, shop_id)
);

-- ============================================================
-- 4. Documentos (fotos, PDFs congelados, firmas, pruebas de autorización)
--    Archivo en Storage: bucket "documents", ruta "<shop_id>/..."
-- ============================================================
create table public.documents (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null default public.current_shop_id() references public.shops (id),
  kind public.document_kind not null,
  repair_order_id uuid,
  estimate_id uuid,
  customer_id uuid,
  vehicle_id uuid,
  storage_path text not null unique,
  mime_type text not null,
  size_bytes bigint check (size_bytes >= 0),
  sha256 text check (sha256 ~ '^[0-9a-f]{64}$'),
  caption text,
  taken_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users (id),
  deleted_at timestamptz,
  unique (id, shop_id),
  foreign key (repair_order_id, shop_id) references public.repair_orders (id, shop_id),
  foreign key (customer_id, shop_id) references public.customers (id, shop_id),
  foreign key (vehicle_id, shop_id) references public.vehicles (id, shop_id),
  constraint documents_target_chk check (num_nonnulls(repair_order_id, estimate_id, customer_id, vehicle_id) >= 1),
  constraint documents_path_chk check (storage_path like shop_id::text || '/%'),
  constraint documents_hash_chk check (kind not in ('estimate_pdf', 'signature', 'third_party_estimate') or sha256 is not null)
);

alter table public.repair_orders
  add foreign key (designee_signature_document_id, shop_id) references public.documents (id, shop_id);

-- ============================================================
-- 5. Presupuestos: desmontaje / reparación / suplemento, con campos de pagador externo
-- ============================================================
create table public.estimates (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null default public.current_shop_id() references public.shops (id),
  repair_order_id uuid not null,
  kind public.estimate_kind not null,
  seq integer not null,
  status public.estimate_status not null default 'draft',
  parent_estimate_id uuid,
  -- Pagador externo (CCR 3353(b)(1) y (d))
  basis public.estimate_basis not null default 'shop',
  payor_name text,
  payor_claim_number text,
  payor_estimate_total_cents bigint check (payor_estimate_total_cents >= 0),
  payor_estimate_document_id uuid,
  payor_approved_amount_cents bigint check (payor_approved_amount_cents >= 0),
  payor_notified_at timestamptz,
  -- Desmontaje (CCR 3353(c)(1))
  teardown_area text,
  teardown_may_prevent_restoration boolean,
  reassembly_max_days integer check (reassembly_max_days > 0),
  pickup_deadline_days integer check (pickup_deadline_days > 0),
  notes text,
  sent_at timestamptz,
  locked_at timestamptz,
  pdf_document_id uuid,
  pdf_sha256 text check (pdf_sha256 ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users (id),
  deleted_at timestamptz,
  unique (repair_order_id, kind, seq),
  unique (id, shop_id),
  foreign key (repair_order_id, shop_id) references public.repair_orders (id, shop_id),
  foreign key (parent_estimate_id, shop_id) references public.estimates (id, shop_id),
  foreign key (payor_estimate_document_id, shop_id) references public.documents (id, shop_id),
  foreign key (pdf_document_id, shop_id) references public.documents (id, shop_id),
  constraint estimates_parent_chk check (kind <> 'supplement' or parent_estimate_id is not null),
  constraint estimates_teardown_chk check (
    case when kind = 'teardown' then
      status in ('draft', 'voided')
      or (length(btrim(teardown_area)) > 0 and teardown_may_prevent_restoration is not null and reassembly_max_days is not null)
    else
      teardown_area is null and teardown_may_prevent_restoration is null and reassembly_max_days is null
    end
  ),
  constraint estimates_third_party_chk check (
    basis = 'shop' or status in ('draft', 'voided')
    or (payor_name is not null and payor_claim_number is not null
      and payor_estimate_total_cents is not null and payor_estimate_document_id is not null)
  ),
  constraint estimates_payor_chk check (
    payor_name is not null
    or (payor_claim_number is null and payor_approved_amount_cents is null and payor_notified_at is null)
  ),
  constraint estimates_lock_chk check ((status in ('authorized', 'declined')) = (locked_at is not null)),
  constraint estimates_pdf_chk check ((pdf_document_id is null) = (pdf_sha256 is null))
);

alter table public.documents
  add foreign key (estimate_id, shop_id) references public.estimates (id, shop_id);

-- ============================================================
-- 6. Líneas del presupuesto
-- ============================================================
create table public.estimate_lines (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null default public.current_shop_id() references public.shops (id),
  estimate_id uuid not null,
  position integer not null check (position >= 0),
  line_type public.estimate_line_type not null,
  description text not null check (length(btrim(description)) > 0),
  quantity numeric(10, 2) not null default 1 check (quantity > 0),
  unit_price_cents integer not null check (unit_price_cents >= 0),
  amount_cents bigint generated always as (round(quantity * unit_price_cents)::bigint) stored,
  taxable boolean not null default false,
  -- Piezas: estado + origen en piezas de carrocería (BPC 9884.9(c), CCR 3353(b))
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
  created_by uuid default auth.uid() references auth.users (id),
  deleted_at timestamptz,
  foreign key (estimate_id, shop_id) references public.estimates (id, shop_id),
  constraint estimate_lines_part_required_chk check (
    line_type <> 'part' or (part_condition is not null and is_crash_part is not null and non_returnable is not null)
  ),
  constraint estimate_lines_part_only_chk check (
    line_type = 'part' or (part_condition is null and is_crash_part is null and crash_part_origin is null
      and part_number is null and brand is null and non_returnable is null)
  ),
  constraint estimate_lines_crash_origin_chk check ((crash_part_origin is not null) = coalesce(is_crash_part, false)),
  constraint estimate_lines_labor_chk check ((line_type = 'labor') = (labor_type is not null)),
  constraint estimate_lines_paint_chk check ((line_type = 'paint_materials') = (paint_materials_method is not null)),
  constraint estimate_lines_sublet_chk check ((line_type = 'sublet') = (sublet_vendor_name is not null)),
  constraint estimate_lines_sublet_addr_chk check (line_type = 'sublet' or sublet_vendor_address is null),
  constraint estimate_lines_teardown_role_chk check (
    teardown_role is null
    or (teardown_role in ('teardown', 'reassembly') and line_type = 'labor')
    or (teardown_role = 'destroyed_item' and line_type in ('part', 'materials'))
  )
);

-- ============================================================
-- 7. Autorizaciones (CCR 3353.1): solo se insertan, nunca se modifican
-- ============================================================
create table public.authorizations (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null default public.current_shop_id() references public.shops (id),
  estimate_id uuid not null,
  method public.authorization_method not null,
  decision public.authorization_decision not null,
  authorized_at timestamptz not null default now(),
  authorizer_name text not null check (length(btrim(authorizer_name)) > 0),
  by_designee boolean not null default false,
  phone_called text check (phone_called ~ '^\+[1-9][0-9]{6,14}$'),
  contact_email text check (contact_email ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  contact_phone text check (contact_phone ~ '^\+[1-9][0-9]{6,14}$'),
  signature_document_id uuid,
  signer_ip inet,
  signer_user_agent text,
  return_parts_requested boolean not null default false,
  amount_cents bigint not null,      -- lo calcula el trigger
  content_sha256 text not null,      -- huella del presupuesto y sus líneas, la calcula el trigger
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users (id),
  deleted_at timestamptz,
  foreign key (estimate_id, shop_id) references public.estimates (id, shop_id),
  foreign key (signature_document_id, shop_id) references public.documents (id, shop_id),
  constraint authorizations_written_chk check ((method = 'written') = (signature_document_id is not null)),
  constraint authorizations_written_only_chk check (method = 'written' or (signer_ip is null and signer_user_agent is null)),
  constraint authorizations_oral_chk check (method = 'oral' or phone_called is null),
  constraint authorizations_electronic_chk check (
    case when method = 'electronic' then num_nonnulls(contact_email, contact_phone) >= 1
         else contact_email is null and contact_phone is null end
  ),
  constraint authorizations_return_parts_chk check (decision = 'approved' or return_parts_requested = false)
);

-- ============================================================
-- 8. Tarifas
-- ============================================================
create table public.labor_rates (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null default public.current_shop_id() references public.shops (id),
  kind public.rate_kind not null,
  rate_cents integer not null check (rate_cents >= 0),
  effective_from date not null default current_date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users (id),
  deleted_at timestamptz
);
create unique index labor_rates_kind_from_uq on public.labor_rates (shop_id, kind, effective_from) where deleted_at is null;

-- ============================================================
-- 9. Citas y actividad enlazadas a la orden
-- ============================================================
alter table public.appointments add column repair_order_id uuid;
alter table public.appointments
  add foreign key (repair_order_id, shop_id) references public.repair_orders (id, shop_id);

alter table public.activities add column repair_order_id uuid;
alter table public.activities
  add foreign key (repair_order_id, shop_id) references public.repair_orders (id, shop_id);
alter table public.activities drop constraint activities_target_chk;
alter table public.activities add constraint activities_target_chk
  check (num_nonnulls(customer_id, vehicle_id, appointment_id, repair_order_id) >= 1);

-- ============================================================
-- 10. Índices
-- ============================================================
create index repair_orders_status_idx on public.repair_orders (shop_id, status) where deleted_at is null;
create index repair_orders_customer_idx on public.repair_orders (customer_id);
create index repair_orders_vehicle_idx on public.repair_orders (vehicle_id);
create index ro_phases_ro_idx on public.ro_phases (repair_order_id, position);
create index documents_ro_idx on public.documents (repair_order_id);
create index documents_estimate_idx on public.documents (estimate_id);
create index estimates_ro_idx on public.estimates (repair_order_id);
create index estimate_lines_estimate_idx on public.estimate_lines (estimate_id, position);
create index authorizations_estimate_idx on public.authorizations (estimate_id);
create index appointments_ro_idx on public.appointments (repair_order_id);
create index activities_ro_idx on public.activities (repair_order_id);

-- ============================================================
-- 11. Funciones y triggers
-- ============================================================

-- Número de RO: lo asigna la base de datos y no cambia nunca
create function public.repair_orders_number()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    new.ro_number := public.next_number('repair_order');
  elsif new.ro_number is distinct from old.ro_number then
    raise exception 'ro_number is immutable' using errcode = 'check_violation';
  end if;
  return new;
end; $$;
revoke execute on function public.repair_orders_number() from public, anon, authenticated;

create trigger repair_orders_number before insert or update on public.repair_orders
  for each row execute function public.repair_orders_number();

-- Documentos: el archivo, su tipo y su huella no cambian
create function public.documents_guard()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.storage_path is distinct from old.storage_path
     or new.sha256 is distinct from old.sha256
     or new.kind is distinct from old.kind
     or new.mime_type is distinct from old.mime_type then
    raise exception 'document file fields are immutable' using errcode = 'check_violation';
  end if;
  return new;
end; $$;

create trigger documents_guard before update on public.documents
  for each row execute function public.documents_guard();

-- Presupuestos: número correlativo por orden y tipo
create function public.estimates_seq()
returns trigger language plpgsql set search_path = '' as $$
begin
  select coalesce(max(seq), 0) + 1 into new.seq
  from public.estimates
  where repair_order_id = new.repair_order_id and kind = new.kind;
  return new;
end; $$;

create trigger estimates_seq before insert on public.estimates
  for each row execute function public.estimates_seq();

-- Presupuestos: bloqueo tras autorizar o rechazar
create function public.estimates_guard()
returns trigger language plpgsql set search_path = '' as $$
declare
  v_free text[] := array['payor_notified_at', 'pdf_document_id', 'pdf_sha256', 'updated_at'];
begin
  if new.repair_order_id is distinct from old.repair_order_id
     or new.kind is distinct from old.kind
     or new.seq is distinct from old.seq then
    raise exception 'estimate identity fields are immutable' using errcode = 'check_violation';
  end if;

  -- Solo una autorización puede pasar un presupuesto a authorized / declined
  if new.status in ('authorized', 'declined') and old.status not in ('authorized', 'declined') then
    if not exists (
      select 1 from public.authorizations a
      where a.estimate_id = new.id and a.deleted_at is null
        and a.decision = case new.status when 'authorized' then 'approved'::public.authorization_decision
                                          else 'declined'::public.authorization_decision end
    ) then
      raise exception 'estimate status requires an authorization record' using errcode = 'check_violation';
    end if;
  end if;

  if old.locked_at is not null then
    if (to_jsonb(new) - v_free) is distinct from (to_jsonb(old) - v_free) then
      raise exception 'estimate % is locked', old.id using errcode = 'check_violation';
    end if;
    if old.pdf_document_id is not null and (new.pdf_document_id is distinct from old.pdf_document_id
                                            or new.pdf_sha256 is distinct from old.pdf_sha256) then
      raise exception 'frozen PDF cannot be replaced' using errcode = 'check_violation';
    end if;
    if old.payor_notified_at is not null and new.payor_notified_at is distinct from old.payor_notified_at then
      raise exception 'payor notification cannot be changed' using errcode = 'check_violation';
    end if;
  end if;
  return new;
end; $$;

create trigger estimates_guard before update on public.estimates
  for each row execute function public.estimates_guard();

-- Líneas: no se tocan si el presupuesto está bloqueado
create function public.estimate_lines_guard()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'UPDATE' and new.estimate_id is distinct from old.estimate_id then
    raise exception 'line cannot move to another estimate' using errcode = 'check_violation';
  end if;
  if exists (select 1 from public.estimates e where e.id = new.estimate_id and e.locked_at is not null) then
    raise exception 'estimate % is locked', new.estimate_id using errcode = 'check_violation';
  end if;
  return new;
end; $$;

create trigger estimate_lines_guard before insert or update on public.estimate_lines
  for each row execute function public.estimate_lines_guard();

-- Autorización: valida, calcula importe y huella, y bloquea el presupuesto
create function public.authorizations_before_insert()
returns trigger language plpgsql set search_path = '' as $$
declare
  v_est public.estimates;
  v_lines jsonb;
begin
  select * into v_est from public.estimates
  where id = new.estimate_id and shop_id = new.shop_id
  for update;

  if not found or v_est.deleted_at is not null then
    raise exception 'estimate not found' using errcode = 'foreign_key_violation';
  end if;
  if v_est.status not in ('draft', 'sent') then
    raise exception 'estimate % is %', v_est.id, v_est.status using errcode = 'check_violation';
  end if;
  if v_est.kind = 'teardown' and new.decision = 'approved' and not (
    exists (select 1 from public.estimate_lines l where l.estimate_id = v_est.id and l.deleted_at is null and l.teardown_role = 'teardown')
    and exists (select 1 from public.estimate_lines l where l.estimate_id = v_est.id and l.deleted_at is null and l.teardown_role = 'reassembly')
  ) then
    raise exception 'teardown estimate needs teardown and reassembly lines' using errcode = 'check_violation';
  end if;

  select coalesce(jsonb_agg(to_jsonb(l) - array['updated_at'] order by l.position, l.id), '[]'::jsonb)
  into v_lines
  from public.estimate_lines l
  where l.estimate_id = v_est.id and l.deleted_at is null;

  select coalesce(sum(l.amount_cents), 0) into new.amount_cents
  from public.estimate_lines l
  where l.estimate_id = v_est.id and l.deleted_at is null;

  new.content_sha256 := encode(extensions.digest(convert_to(jsonb_build_object(
    'estimate', to_jsonb(v_est) - array['status', 'locked_at', 'sent_at', 'updated_at', 'pdf_document_id', 'pdf_sha256', 'payor_notified_at'],
    'lines', v_lines
  )::text, 'UTF8'), 'sha256'), 'hex');

  return new;
end; $$;

create trigger authorizations_before_insert before insert on public.authorizations
  for each row execute function public.authorizations_before_insert();

create function public.authorizations_after_insert()
returns trigger language plpgsql set search_path = '' as $$
begin
  update public.estimates
  set status = case new.decision when 'approved' then 'authorized'::public.estimate_status
                                 else 'declined'::public.estimate_status end,
      locked_at = now(),
      sent_at = coalesce(sent_at, new.authorized_at)
  where id = new.estimate_id;
  return null;
end; $$;

create trigger authorizations_after_insert after insert on public.authorizations
  for each row execute function public.authorizations_after_insert();

-- updated_at
create trigger repair_orders_updated_at before update on public.repair_orders for each row execute function public.set_updated_at();
create trigger ro_phases_updated_at before update on public.ro_phases for each row execute function public.set_updated_at();
create trigger documents_updated_at before update on public.documents for each row execute function public.set_updated_at();
create trigger estimates_updated_at before update on public.estimates for each row execute function public.set_updated_at();
create trigger estimate_lines_updated_at before update on public.estimate_lines for each row execute function public.set_updated_at();
create trigger labor_rates_updated_at before update on public.labor_rates for each row execute function public.set_updated_at();

-- ============================================================
-- 12. Totales (sin sales tax: solo va en la factura)
-- ============================================================
create view public.estimate_totals with (security_invoker = true) as
select
  e.id as estimate_id,
  e.shop_id,
  e.repair_order_id,
  coalesce(sum(l.amount_cents) filter (where l.line_type = 'part'), 0)::bigint as parts_cents,
  coalesce(sum(l.amount_cents) filter (where l.line_type = 'labor'), 0)::bigint as labor_cents,
  coalesce(sum(l.amount_cents) filter (where l.line_type in ('paint_materials', 'materials')), 0)::bigint as materials_cents,
  coalesce(sum(l.amount_cents) filter (where l.line_type = 'sublet'), 0)::bigint as sublet_cents,
  coalesce(sum(l.amount_cents) filter (where l.line_type = 'hazardous_waste'), 0)::bigint as hazardous_waste_cents,
  coalesce(sum(l.amount_cents), 0)::bigint as total_cents
from public.estimates e
left join public.estimate_lines l on l.estimate_id = e.id and l.deleted_at is null
where e.deleted_at is null
group by e.id, e.shop_id, e.repair_order_id;

-- ============================================================
-- 13. RLS
-- ============================================================
alter table public.repair_orders enable row level security;
alter table public.ro_phases enable row level security;
alter table public.documents enable row level security;
alter table public.estimates enable row level security;
alter table public.estimate_lines enable row level security;
alter table public.authorizations enable row level security;
alter table public.labor_rates enable row level security;

create policy repair_orders_select on public.repair_orders for select to authenticated using (shop_id = (select public.current_shop_id()));
create policy repair_orders_insert on public.repair_orders for insert to authenticated with check (shop_id = (select public.current_shop_id()));
create policy repair_orders_update on public.repair_orders for update to authenticated using (shop_id = (select public.current_shop_id())) with check (shop_id = (select public.current_shop_id()));

create policy ro_phases_select on public.ro_phases for select to authenticated using (shop_id = (select public.current_shop_id()));
create policy ro_phases_insert on public.ro_phases for insert to authenticated with check (shop_id = (select public.current_shop_id()));
create policy ro_phases_update on public.ro_phases for update to authenticated using (shop_id = (select public.current_shop_id())) with check (shop_id = (select public.current_shop_id()));

create policy documents_select on public.documents for select to authenticated using (shop_id = (select public.current_shop_id()));
create policy documents_insert on public.documents for insert to authenticated with check (shop_id = (select public.current_shop_id()));
create policy documents_update on public.documents for update to authenticated using (shop_id = (select public.current_shop_id())) with check (shop_id = (select public.current_shop_id()));

create policy estimates_select on public.estimates for select to authenticated using (shop_id = (select public.current_shop_id()));
create policy estimates_insert on public.estimates for insert to authenticated with check (shop_id = (select public.current_shop_id()));
create policy estimates_update on public.estimates for update to authenticated using (shop_id = (select public.current_shop_id())) with check (shop_id = (select public.current_shop_id()));

create policy estimate_lines_select on public.estimate_lines for select to authenticated using (shop_id = (select public.current_shop_id()));
create policy estimate_lines_insert on public.estimate_lines for insert to authenticated with check (shop_id = (select public.current_shop_id()));
create policy estimate_lines_update on public.estimate_lines for update to authenticated using (shop_id = (select public.current_shop_id())) with check (shop_id = (select public.current_shop_id()));

create policy authorizations_select on public.authorizations for select to authenticated using (shop_id = (select public.current_shop_id()));
create policy authorizations_insert on public.authorizations for insert to authenticated with check (shop_id = (select public.current_shop_id()));

create policy labor_rates_select on public.labor_rates for select to authenticated using (shop_id = (select public.current_shop_id()));
create policy labor_rates_insert on public.labor_rates for insert to authenticated with check (shop_id = (select public.current_shop_id()));
create policy labor_rates_update on public.labor_rates for update to authenticated using (shop_id = (select public.current_shop_id())) with check (shop_id = (select public.current_shop_id()));

-- ============================================================
-- 14. Permisos (nunca anon; sin DELETE; autorizaciones sin UPDATE)
-- ============================================================
revoke all on public.repair_orders, public.ro_phases, public.documents, public.estimates,
  public.estimate_lines, public.authorizations, public.labor_rates, public.estimate_totals
  from anon, authenticated;

grant select, insert, update on public.repair_orders, public.ro_phases, public.documents,
  public.estimates, public.estimate_lines, public.labor_rates to authenticated;
grant select, insert on public.authorizations to authenticated;
grant select on public.estimate_totals to authenticated;

-- Endurecimiento de tablas anteriores: anon sin nada; authenticated sin TRUNCATE/REFERENCES/TRIGGER
revoke all on all tables in schema public from anon;
revoke truncate, references, trigger on all tables in schema public from authenticated;
alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke truncate, references, trigger on tables from authenticated;

-- ============================================================
-- 15. Storage: bucket privado, ruta "<shop_id>/...", sin UPDATE ni DELETE
-- ============================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('documents', 'documents', false, 26214400,
        array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf']);

create policy documents_bucket_select on storage.objects for select to authenticated
  using (bucket_id = 'documents' and (storage.foldername(name))[1] = (select public.current_shop_id())::text);
create policy documents_bucket_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'documents' and (storage.foldername(name))[1] = (select public.current_shop_id())::text);
