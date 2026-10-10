-- 0012 · Tablero de producción (fase 4a)
-- Etapas configurables por taller, etapa actual por orden e historial de cambios (solo lectura para la app).

create table public.production_stages (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null default public.current_shop_id() references public.shops(id),
  position integer not null check (position >= 0),
  name text not null check (length(btrim(name)) between 1 and 40),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users(id),
  deleted_at timestamptz,
  unique (id, shop_id)
);
create index production_stages_shop_idx on public.production_stages (shop_id, position) where deleted_at is null;
create trigger production_stages_updated_at before update on public.production_stages
  for each row execute function public.set_updated_at();

alter table public.production_stages enable row level security;
create policy production_stages_select on public.production_stages for select to authenticated
  using (shop_id = (select public.current_shop_id()));
create policy production_stages_insert on public.production_stages for insert to authenticated
  with check (shop_id = (select public.current_shop_id()));
create policy production_stages_update on public.production_stages for update to authenticated
  using (shop_id = (select public.current_shop_id()))
  with check (shop_id = (select public.current_shop_id()));
grant select, insert, update on public.production_stages to authenticated;

-- Etapas provisionales (el taller confirmará las reales)
insert into public.production_stages (shop_id, position, name, created_by)
select s.id, v.pos, v.name, null
from public.shops s
cross join (values (0,'Check-in'),(1,'Teardown'),(2,'Body'),(3,'Paint'),(4,'Reassembly'),(5,'Ready')) as v(pos, name)
where s.deleted_at is null;

-- Etapa actual en la orden
alter table public.repair_orders
  add column production_stage_id uuid,
  add column production_stage_at timestamptz,
  add constraint repair_orders_production_stage_fkey
    foreign key (production_stage_id, shop_id) references public.production_stages (id, shop_id);
create index repair_orders_stage_idx on public.repair_orders (shop_id, production_stage_id) where deleted_at is null;

-- Órdenes activas existentes: a la primera etapa
update public.repair_orders ro
set production_stage_id = (
      select ps.id from public.production_stages ps
      where ps.shop_id = ro.shop_id and ps.deleted_at is null
      order by ps.position, ps.created_at limit 1),
    production_stage_at = now()
where ro.status in ('open','in_progress') and ro.deleted_at is null;

-- Historial (lo escribe solo el trigger)
create table public.ro_stage_events (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id),
  repair_order_id uuid not null,
  from_stage_id uuid,
  to_stage_id uuid not null,
  changed_at timestamptz not null default now(),
  changed_by uuid default auth.uid() references auth.users(id),
  foreign key (repair_order_id, shop_id) references public.repair_orders (id, shop_id),
  foreign key (from_stage_id, shop_id) references public.production_stages (id, shop_id),
  foreign key (to_stage_id, shop_id) references public.production_stages (id, shop_id)
);
create index ro_stage_events_ro_idx on public.ro_stage_events (repair_order_id, changed_at);
alter table public.ro_stage_events enable row level security;
create policy ro_stage_events_select on public.ro_stage_events for select to authenticated
  using (shop_id = (select public.current_shop_id()));
grant select on public.ro_stage_events to authenticated;

-- Reglas al crear o cambiar etapa
create or replace function public.repair_orders_stage_guard()
returns trigger language plpgsql set search_path = '' as $$
declare
  v_ok boolean;
begin
  if tg_op = 'INSERT' then
    if new.production_stage_id is null and new.status in ('open','in_progress') then
      select ps.id into new.production_stage_id
      from public.production_stages ps
      where ps.shop_id = new.shop_id and ps.deleted_at is null
      order by ps.position, ps.created_at limit 1;
    end if;
    new.production_stage_at := case when new.production_stage_id is null then null else now() end;
  else
    if new.production_stage_id is distinct from old.production_stage_id then
      if new.production_stage_id is null then
        raise exception 'production stage cannot be cleared' using errcode = 'P0001';
      end if;
      if old.status not in ('open','in_progress') or new.status not in ('open','in_progress') then
        raise exception 'production stage can only change on open or in-progress orders' using errcode = 'P0001';
      end if;
      new.production_stage_at := now();
    else
      new.production_stage_at := old.production_stage_at;
    end if;
    -- Si una orden vuelve a estar activa sin etapa, se pone en la primera
    if new.production_stage_id is null and new.status in ('open','in_progress') then
      select ps.id into new.production_stage_id
      from public.production_stages ps
      where ps.shop_id = new.shop_id and ps.deleted_at is null
      order by ps.position, ps.created_at limit 1;
      new.production_stage_at := case when new.production_stage_id is null then null else now() end;
    end if;
  end if;

  if new.production_stage_id is not null and (tg_op = 'INSERT' or new.production_stage_id is distinct from old.production_stage_id) then
    select ps.deleted_at is null into v_ok from public.production_stages ps
    where ps.id = new.production_stage_id and ps.shop_id = new.shop_id;
    if not coalesce(v_ok, false) then
      raise exception 'production stage not available' using errcode = 'P0001';
    end if;
  end if;
  return new;
end $$;

create trigger repair_orders_stage_guard before insert or update on public.repair_orders
  for each row execute function public.repair_orders_stage_guard();

create or replace function public.repair_orders_stage_log()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.production_stage_id is not null
     and (tg_op = 'INSERT' or new.production_stage_id is distinct from old.production_stage_id) then
    insert into public.ro_stage_events (shop_id, repair_order_id, from_stage_id, to_stage_id, changed_at)
    values (new.shop_id, new.id,
            case when tg_op = 'UPDATE' then old.production_stage_id end,
            new.production_stage_id, coalesce(new.production_stage_at, now()));
  end if;
  return null;
end $$;
revoke all on function public.repair_orders_stage_log() from public, anon, authenticated;

create trigger repair_orders_stage_log after insert or update of production_stage_id, status on public.repair_orders
  for each row execute function public.repair_orders_stage_log();

-- No archivar una etapa con órdenes activas dentro
create or replace function public.production_stages_guard()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.shop_id is distinct from old.shop_id then
    raise exception 'shop cannot change' using errcode = 'P0001';
  end if;
  if new.deleted_at is not null and old.deleted_at is null and exists (
    select 1 from public.repair_orders ro
    where ro.production_stage_id = old.id and ro.deleted_at is null
      and ro.status in ('open','in_progress')
  ) then
    raise exception 'stage has active orders' using errcode = 'P0001';
  end if;
  if old.deleted_at is not null and new.deleted_at is null then
    raise exception 'archived stage cannot be restored' using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger production_stages_guard before update on public.production_stages
  for each row execute function public.production_stages_guard();

revoke all on function public.repair_orders_stage_guard() from public, anon, authenticated;
revoke all on function public.production_stages_guard() from public, anon, authenticated;
