-- 0007: si el VIN ya es de otro cliente, se crea el vehículo sin VIN y se avisa en las notas de la cita
create or replace function public.web_intake_submit(p jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_shop uuid := (p->>'shop_id')::uuid;
  v_phone text := nullif(p->>'phone', '');
  v_email text := lower(nullif(p->>'email', ''));
  v_vin text := upper(nullif(p->>'vin', ''));
  v_make text := nullif(btrim(p->>'make'), '');
  v_model text := nullif(btrim(p->>'model'), '');
  v_year smallint := nullif(p->>'year', '')::smallint;
  v_date date := (p->>'preferred_date')::date;
  v_window public.time_window := (p->>'preferred_window')::public.time_window;
  v_tz text; v_today date; v_start timestamptz;
  v_customer uuid; v_vehicle uuid; v_appt uuid; v_req uuid;
  v_dup record;
  v_note text;
begin
  select id, customer_id into v_dup from public.web_requests
   where shop_id = v_shop and meta_event_id = p->>'meta_event_id';
  if found then
    return jsonb_build_object('web_request_id', v_dup.id, 'customer_id', v_dup.customer_id, 'duplicate', true);
  end if;

  select timezone into v_tz from public.shops where id = v_shop and deleted_at is null;
  if v_tz is null then raise exception 'unknown_shop'; end if;
  v_today := (now() at time zone v_tz)::date;
  if v_date < v_today or v_date > v_today + 60 then raise exception 'invalid_date'; end if;
  v_start := (v_date + case when v_window = 'morning' then time '08:00' else time '13:00' end) at time zone v_tz;

  -- Cliente: por teléfono, si no por email; si no existe, se crea
  if v_phone is not null then
    select id into v_customer from public.customers
     where shop_id = v_shop and deleted_at is null and (phone = v_phone or phone_alt = v_phone)
     order by created_at limit 1;
  end if;
  if v_customer is null and v_email is not null then
    select id into v_customer from public.customers
     where shop_id = v_shop and deleted_at is null and lower(email) = v_email
     order by created_at limit 1;
  end if;
  if v_customer is null then
    insert into public.customers (shop_id, type, first_name, last_name, phone, email, preferred_language, source)
    values (v_shop, 'individual', nullif(btrim(p->>'first_name'), ''), nullif(btrim(p->>'last_name'), ''),
            v_phone, v_email, p->>'locale', 'website')
    returning id into v_customer;
  else
    update public.customers set phone = coalesce(phone, v_phone), email = coalesce(email, v_email)
     where id = v_customer;
  end if;

  -- Vehículo: por VIN, si no por año/marca/modelo del mismo cliente; si no existe, se crea
  if v_vin is not null then
    select id into v_vehicle from public.vehicles
     where shop_id = v_shop and customer_id = v_customer and deleted_at is null and vin = v_vin limit 1;
  end if;
  if v_vehicle is null and v_make is not null then
    select id into v_vehicle from public.vehicles
     where shop_id = v_shop and customer_id = v_customer and deleted_at is null
       and lower(make) = lower(v_make) and lower(coalesce(model, '')) = lower(coalesce(v_model, ''))
       and year is not distinct from v_year
     limit 1;
  end if;
  -- VIN ya registrado con otro cliente: no se enlaza; se crea sin VIN y se avisa en la cita
  if v_vehicle is null and v_vin is not null and exists (
       select 1 from public.vehicles
        where shop_id = v_shop and vin = v_vin and deleted_at is null and customer_id <> v_customer) then
    v_note := 'VIN entered on the website: ' || v_vin || ' (already on file for another customer)';
    v_vin := null;
  end if;
  if v_vehicle is null and (v_vin is not null or v_make is not null) then
    insert into public.vehicles (shop_id, customer_id, vin, year, make, model)
    values (v_shop, v_customer, v_vin, v_year, v_make, v_model)
    returning id into v_vehicle;
  end if;

  insert into public.appointments (shop_id, type, status, source, starts_at, ends_at, customer_id, vehicle_id, notes)
  values (v_shop, 'estimate', 'requested', 'web', v_start, v_start + interval '4 hours',
          v_customer, v_vehicle, concat_ws(E'\n\n', left(p->>'damage_description', 2000), v_note))
  returning id into v_appt;

  insert into public.web_requests (
    shop_id, customer_id, vehicle_id, appointment_id, locale, service, damage_description,
    is_insurance_claim, insurer_name, claim_number, preferred_date, preferred_window,
    privacy_accepted, marketing_opt_in, consent_text, consent_version, consented_at, meta_event_id,
    utm_source, utm_medium, utm_campaign, utm_term, utm_content, fbclid, fbc, fbp,
    landing_page, referrer, ip, user_agent)
  values (
    v_shop, v_customer, v_vehicle, v_appt, p->>'locale', nullif(p->>'service', ''), p->>'damage_description',
    (p->>'is_insurance_claim')::boolean, nullif(p->>'insurer_name', ''), nullif(p->>'claim_number', ''),
    v_date, v_window, (p->>'privacy_accepted')::boolean, coalesce((p->>'marketing_opt_in')::boolean, false),
    p->>'consent_text', p->>'consent_version', now(), p->>'meta_event_id',
    nullif(p->>'utm_source', ''), nullif(p->>'utm_medium', ''), nullif(p->>'utm_campaign', ''),
    nullif(p->>'utm_term', ''), nullif(p->>'utm_content', ''), nullif(p->>'fbclid', ''),
    nullif(p->>'fbc', ''), nullif(p->>'fbp', ''), nullif(p->>'landing_page', ''), nullif(p->>'referrer', ''),
    nullif(p->>'ip', '')::inet, nullif(p->>'user_agent', ''))
  returning id into v_req;

  insert into public.activities (shop_id, kind, body, customer_id, vehicle_id, appointment_id)
  values (v_shop, 'system', 'Estimate request received from the website', v_customer, v_vehicle, v_appt);

  return jsonb_build_object('web_request_id', v_req, 'customer_id', v_customer, 'duplicate', false);
exception when unique_violation then
  -- Dos envíos iguales a la vez: el segundo devuelve el primero
  select id, customer_id into v_dup from public.web_requests
   where shop_id = v_shop and meta_event_id = p->>'meta_event_id';
  if not found then raise; end if;
  return jsonb_build_object('web_request_id', v_dup.id, 'customer_id', v_dup.customer_id, 'duplicate', true);
end; $$;

revoke all on function public.web_intake_submit(jsonb) from public, anon, authenticated;
grant execute on function public.web_intake_submit(jsonb) to service_role;
