-- 0001_base: taller, perfiles, numeración segura

create or replace function public.set_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin new.updated_at = now(); return new; end; $$;

create table public.shops (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  legal_name text,
  address_line1 text, address_line2 text, city text, state text not null default 'CA', zip text,
  phone text, email text, website text,
  bar_registration_number text,
  timezone text not null default 'America/Los_Angeles',
  sales_tax_rate numeric(6,4) not null default 0,
  storage_fee_per_day_cents integer,
  logo_path text,
  legal_texts jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create trigger shops_updated_at before update on public.shops
  for each row execute function public.set_updated_at();

create type public.user_role as enum ('owner');
create table public.profiles (
  id uuid primary key references auth.users(id) on delete restrict,
  shop_id uuid not null references public.shops(id),
  full_name text,
  email text not null,
  role public.user_role not null default 'owner',
  locale text not null default 'en' check (locale in ('en','es')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index profiles_shop_id_idx on public.profiles(shop_id);
create trigger profiles_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();

create or replace function public.current_shop_id()
returns uuid language sql stable security definer set search_path = '' as $$
  select shop_id from public.profiles
  where id = (select auth.uid()) and deleted_at is null
$$;
revoke all on function public.current_shop_id() from public, anon;
grant execute on function public.current_shop_id() to authenticated;

create table public.shop_counters (
  shop_id uuid not null references public.shops(id),
  kind text not null check (kind in ('repair_order','invoice')),
  last_value integer not null default 0,
  primary key (shop_id, kind)
);
create or replace function public.next_number(p_kind text)
returns integer language plpgsql security definer set search_path = '' as $$
declare v_shop uuid := public.current_shop_id(); v integer;
begin
  if v_shop is null then raise exception 'user has no shop'; end if;
  insert into public.shop_counters (shop_id, kind, last_value) values (v_shop, p_kind, 1)
  on conflict (shop_id, kind)
    do update set last_value = public.shop_counters.last_value + 1
  returning last_value into v;
  return v;
end; $$;
revoke all on function public.next_number(text) from public, anon;
grant execute on function public.next_number(text) to authenticated;

alter table public.shops enable row level security;
alter table public.profiles enable row level security;
alter table public.shop_counters enable row level security;

create policy shops_select on public.shops for select to authenticated
  using (id = (select public.current_shop_id()));
create policy shops_update on public.shops for update to authenticated
  using (id = (select public.current_shop_id()))
  with check (id = (select public.current_shop_id()));

create policy profiles_select on public.profiles for select to authenticated
  using (shop_id = (select public.current_shop_id()));
create policy profiles_update on public.profiles for update to authenticated
  using (shop_id = (select public.current_shop_id()))
  with check (shop_id = (select public.current_shop_id()));

grant select, update on public.shops to authenticated;
grant select, update on public.profiles to authenticated;

insert into public.shops (name, legal_name, city, state)
values ('Kings Auto Collision', 'Kings Auto Collision Inc.', 'Pittsburg', 'CA');
