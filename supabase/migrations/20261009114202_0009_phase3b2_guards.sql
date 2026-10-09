-- 0009_phase3b2_guards: reglas de la fase 3b2 en la base de datos

-- 1. Suplemento: base autorizada de la misma orden
create function public.estimates_parent_guard() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.parent_estimate_id is not null then
    if new.kind <> 'supplement' then
      raise exception 'only supplements have a parent estimate' using errcode = 'check_violation';
    end if;
    if not exists (
      select 1 from public.estimates p
      where p.id = new.parent_estimate_id and p.shop_id = new.shop_id
        and p.repair_order_id = new.repair_order_id
        and p.kind in ('repair', 'supplement') and p.status = 'authorized'
        and p.deleted_at is null
    ) then
      raise exception 'supplement parent must be an authorized repair estimate of the same order'
        using errcode = 'check_violation';
    end if;
  end if;
  return new;
end $$;
create trigger estimates_parent_guard
  before insert or update of parent_estimate_id on public.estimates
  for each row execute function public.estimates_parent_guard();

-- 2. Autorización por designado: solo suplementos y con designado firmado
create function public.authorizations_designee_guard() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.by_designee and not exists (
    select 1 from public.estimates e
    join public.repair_orders r on r.id = e.repair_order_id and r.shop_id = e.shop_id
    where e.id = new.estimate_id and e.shop_id = new.shop_id
      and e.kind = 'supplement' and r.designee_signed_at is not null
  ) then
    raise exception 'designee authorization needs a signed designee and a supplement'
      using errcode = 'check_violation';
  end if;
  return new;
end $$;
create trigger authorizations_designee_guard
  before insert on public.authorizations
  for each row execute function public.authorizations_designee_guard();

-- 3 y 4. Designado y resultado del desmontaje: se fijan una sola vez
create function public.repair_orders_phase3b2_guard() returns trigger
language plpgsql set search_path = '' as $$
begin
  if old.designee_signed_at is not null and (
       new.designee_name is distinct from old.designee_name
    or new.designee_phone is distinct from old.designee_phone
    or new.designee_email is distinct from old.designee_email
    or new.designee_signed_at is distinct from old.designee_signed_at
    or new.designee_signature_document_id is distinct from old.designee_signature_document_id) then
    raise exception 'signed designee cannot be changed' using errcode = 'check_violation';
  end if;
  if new.teardown_outcome is distinct from old.teardown_outcome then
    if old.teardown_outcome is not null then
      raise exception 'teardown outcome is final' using errcode = 'check_violation';
    end if;
    if not exists (
      select 1 from public.estimates e
      where e.repair_order_id = new.id and e.shop_id = new.shop_id
        and e.kind = 'teardown' and e.status = 'authorized' and e.deleted_at is null
    ) then
      raise exception 'teardown outcome needs an authorized teardown estimate'
        using errcode = 'check_violation';
    end if;
  end if;
  return new;
end $$;
create trigger repair_orders_phase3b2_guard
  before update on public.repair_orders
  for each row execute function public.repair_orders_phase3b2_guard();

-- 5. Cita enlazada: mismo cliente que la orden
create function public.appointments_ro_guard() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.repair_order_id is not null and not exists (
    select 1 from public.repair_orders r
    where r.id = new.repair_order_id and r.shop_id = new.shop_id
      and r.customer_id is not distinct from new.customer_id
  ) then
    raise exception 'appointment customer must match the repair order'
      using errcode = 'check_violation';
  end if;
  return new;
end $$;
create trigger appointments_ro_guard
  before insert or update of repair_order_id, customer_id on public.appointments
  for each row execute function public.appointments_ro_guard();

revoke execute on function public.estimates_parent_guard(),
  public.authorizations_designee_guard(),
  public.repair_orders_phase3b2_guard(),
  public.appointments_ro_guard() from public, anon, authenticated;
