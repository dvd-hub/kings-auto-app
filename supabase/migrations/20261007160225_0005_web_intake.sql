-- 1. Citas: nuevo estado y origen
alter type public.appointment_status add value if not exists 'requested' before 'scheduled';

create type public.record_source as enum ('app', 'web');
alter table public.appointments
  add column source public.record_source not null default 'app';

-- 2. Solicitudes de la web (datos originales, no se editan)
create type public.web_request_status as enum ('new', 'contacted', 'converted', 'spam', 'closed');
create type public.time_window as enum ('morning', 'afternoon');

create table public.web_requests (
  id                 uuid primary key default gen_random_uuid(),
  shop_id            uuid not null default public.current_shop_id() references public.shops(id),
  status             public.web_request_status not null default 'new',
  customer_id        uuid not null,
  vehicle_id         uuid,
  appointment_id     uuid,
  locale             text not null check (locale in ('en', 'es')),
  service            text,
  damage_description text not null check (length(btrim(damage_description)) > 0),
  is_insurance_claim boolean,
  insurer_name       text,
  claim_number       text,
  preferred_date     date not null,
  preferred_window   public.time_window not null,
  privacy_accepted   boolean not null check (privacy_accepted),
  marketing_opt_in   boolean not null default false,
  consent_text       text not null,
  consent_version    text not null,
  consented_at       timestamptz not null,
  meta_event_id      text not null,
  utm_source text, utm_medium text, utm_campaign text, utm_term text, utm_content text,
  fbclid text, fbc text, fbp text,
  landing_page text, referrer text,
  ip                 inet,
  user_agent         text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users(id),
  deleted_at timestamptz,
  unique (id, shop_id),
  unique (shop_id, meta_event_id),
  foreign key (customer_id, shop_id)    references public.customers(id, shop_id),
  foreign key (vehicle_id, shop_id)     references public.vehicles(id, shop_id),
  foreign key (appointment_id, shop_id) references public.appointments(id, shop_id)
);

create index web_requests_shop_created_idx on public.web_requests (shop_id, created_at desc) where deleted_at is null;
create index web_requests_customer_idx on public.web_requests (customer_id);

create trigger web_requests_updated_at before update on public.web_requests
  for each row execute function public.set_updated_at();

-- 3. Fotos enlazadas a la solicitud (bucket documents existente, carpeta <shop_id>/web/)
alter table public.documents add column web_request_id uuid;
alter table public.documents
  add constraint documents_web_request_id_shop_id_fkey
  foreign key (web_request_id, shop_id) references public.web_requests(id, shop_id);
create index documents_web_request_idx on public.documents (web_request_id);

-- 4. Permisos: la app ve y cambia solo el estado; crear, solo la Edge Function
alter table public.web_requests enable row level security;

create policy web_requests_select on public.web_requests for select to authenticated
  using (shop_id = (select public.current_shop_id()));
create policy web_requests_update on public.web_requests for update to authenticated
  using (shop_id = (select public.current_shop_id()))
  with check (shop_id = (select public.current_shop_id()));

revoke all on public.web_requests from anon, authenticated;
grant select on public.web_requests to authenticated;
grant update (status, deleted_at) on public.web_requests to authenticated;
