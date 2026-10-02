-- 0003_customers_vehicles_calendar

create extension if not exists pg_trgm with schema extensions;

create type public.customer_type as enum ('individual','business');
create type public.customer_source as enum ('walk_in','phone','website','google','facebook','instagram','referral','insurance','repeat','other');
create type public.appointment_type as enum ('estimate','drop_off','delivery','pickup','other');
create type public.appointment_status as enum ('scheduled','completed','no_show','cancelled');
create type public.activity_kind as enum ('note','call','email','text','status_change','system');

-- Clientes
create table public.customers (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null default public.current_shop_id() references public.shops(id),
  type public.customer_type not null default 'individual',
  first_name text,
  last_name text,
  company_name text,
  phone text check (phone ~ '^\+[1-9][0-9]{6,14}$'),
  phone_alt text check (phone_alt ~ '^\+[1-9][0-9]{6,14}$'),
  email text check (email ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  address_line1 text, address_line2 text, city text, state text default 'CA', zip text,
  preferred_language text not null default 'en' check (preferred_language in ('en','es')),
  source public.customer_source not null,
  notes text,
  search_text text generated always as (lower(
    coalesce(first_name,'') || ' ' || coalesce(last_name,'') || ' ' || coalesce(company_name,'') || ' ' ||
    coalesce(phone,'') || ' ' || coalesce(phone_alt,'') || ' ' || coalesce(email,''))) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users(id),
  deleted_at timestamptz,
  unique (id, shop_id),
  constraint customers_name_chk check (
    (type = 'individual' and coalesce(first_name, last_name) is not null) or
    (type = 'business' and company_name is not null)),
  constraint customers_contact_chk check (phone is not null or email is not null)
);
create index customers_shop_idx on public.customers (shop_id) where deleted_at is null;
create index customers_search_trgm on public.customers using gin (search_text extensions.gin_trgm_ops);
create index customers_phone_idx on public.customers (shop_id, phone);
create index customers_email_idx on public.customers (shop_id, lower(email));

-- Vehículos
create table public.vehicles (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null default public.current_shop_id() references public.shops(id),
  customer_id uuid not null,
  vin text check (vin ~ '^[A-Z0-9]{5,17}$'),
  year smallint check (year between 1900 and 2100),
  make text, model text, trim text, color text,
  plate text, plate_state text default 'CA',
  odometer_mi integer check (odometer_mi >= 0),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users(id),
  deleted_at timestamptz,
  unique (id, shop_id),
  foreign key (customer_id, shop_id) references public.customers (id, shop_id),
  constraint vehicles_identity_chk check (vin is not null or (make is not null and model is not null))
);
create unique index vehicles_vin_uniq on public.vehicles (shop_id, vin) where vin is not null and deleted_at is null;
create index vehicles_customer_idx on public.vehicles (customer_id);
create index vehicles_plate_idx on public.vehicles (shop_id, upper(plate));

-- Citas
create table public.appointments (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null default public.current_shop_id() references public.shops(id),
  type public.appointment_type not null,
  status public.appointment_status not null default 'scheduled',
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  customer_id uuid,
  vehicle_id uuid,
  title text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users(id),
  deleted_at timestamptz,
  unique (id, shop_id),
  foreign key (customer_id, shop_id) references public.customers (id, shop_id),
  foreign key (vehicle_id, shop_id) references public.vehicles (id, shop_id),
  constraint appointments_time_chk check (ends_at > starts_at)
);
create index appointments_time_idx on public.appointments (shop_id, starts_at) where deleted_at is null;
create index appointments_customer_idx on public.appointments (customer_id);
create index appointments_vehicle_idx on public.appointments (vehicle_id);

-- Historial de actividad
create table public.activities (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null default public.current_shop_id() references public.shops(id),
  kind public.activity_kind not null,
  body text,
  occurred_at timestamptz not null default now(),
  customer_id uuid,
  vehicle_id uuid,
  appointment_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users(id),
  deleted_at timestamptz,
  foreign key (customer_id, shop_id) references public.customers (id, shop_id),
  foreign key (vehicle_id, shop_id) references public.vehicles (id, shop_id),
  foreign key (appointment_id, shop_id) references public.appointments (id, shop_id),
  constraint activities_target_chk check (num_nonnulls(customer_id, vehicle_id, appointment_id) >= 1)
);
create index activities_customer_idx on public.activities (customer_id, occurred_at desc);
create index activities_vehicle_idx on public.activities (vehicle_id, occurred_at desc);
create index activities_appointment_idx on public.activities (appointment_id);

-- updated_at, RLS, políticas y permisos (sin DELETE: borrado lógico)
do $$
declare t text;
begin
  foreach t in array array['customers','vehicles','appointments','activities'] loop
    execute format('create trigger %1$s_updated_at before update on public.%1$s for each row execute function public.set_updated_at()', t);
    execute format('alter table public.%1$s enable row level security', t);
    execute format('create policy %1$s_select on public.%1$s for select to authenticated using (shop_id = (select public.current_shop_id()))', t);
    execute format('create policy %1$s_insert on public.%1$s for insert to authenticated with check (shop_id = (select public.current_shop_id()))', t);
    execute format('create policy %1$s_update on public.%1$s for update to authenticated using (shop_id = (select public.current_shop_id())) with check (shop_id = (select public.current_shop_id()))', t);
    execute format('grant select, insert, update on public.%1$s to authenticated', t);
  end loop;
end $$;

-- Búsqueda global: nombre, teléfono, email, matrícula o VIN (respeta RLS)
create or replace function public.search_customers(q text)
returns setof public.customers
language sql stable security invoker set search_path = '' as $$
  select c.* from public.customers c
  where c.deleted_at is null
    and length(trim(q)) >= 2
    and (
      c.search_text like '%' || lower(trim(q)) || '%'
      or (length(regexp_replace(q, '\D', '', 'g')) >= 4
          and regexp_replace(coalesce(c.phone,'') || ' ' || coalesce(c.phone_alt,''), '\D', '', 'g')
              like '%' || regexp_replace(q, '\D', '', 'g') || '%')
      or exists (
        select 1 from public.vehicles v
        where v.customer_id = c.id and v.deleted_at is null
          and (v.vin like '%' || upper(trim(q)) || '%'
               or upper(replace(coalesce(v.plate,''), ' ', '')) like '%' || upper(replace(trim(q), ' ', '')) || '%')))
  order by c.updated_at desc
  limit 20
$$;
revoke all on function public.search_customers(text) from public, anon;
grant execute on function public.search_customers(text) to authenticated;
