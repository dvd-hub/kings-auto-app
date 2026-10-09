-- 0010_estimate_links · Fase 3b3: enlaces de firma remota del presupuesto

-- 1) Firma remota = autorización ELECTRÓNICA (fecha, hora, nombre, email usado)
--    con firma dibujada, IP y navegador como prueba adicional.
alter table public.authorizations drop constraint authorizations_written_chk;
alter table public.authorizations add constraint authorizations_written_chk
  check (method <> 'written' or signature_document_id is not null);
alter table public.authorizations drop constraint authorizations_written_only_chk;
alter table public.authorizations add constraint authorizations_signer_chk
  check (method <> 'oral' or (signature_document_id is null and signer_ip is null and signer_user_agent is null));

-- 2) Tabla de enlaces (solo se guarda el hash SHA-256 del token, nunca el token)
create table public.estimate_links (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null default public.current_shop_id() references public.shops(id),
  estimate_id uuid not null,
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  recipient_email text not null check (recipient_email ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  expires_at timestamptz not null,
  sent_at timestamptz,
  email_message_id text,
  opened_at timestamptz,
  used_at timestamptz,
  revoked_at timestamptz,
  authorization_id uuid references public.authorizations(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users(id),
  deleted_at timestamptz,
  unique (id, shop_id),
  foreign key (estimate_id, shop_id) references public.estimates(id, shop_id),
  check (authorization_id is null or used_at is not null)
);
create index estimate_links_estimate_idx on public.estimate_links (estimate_id);

alter table public.estimate_links enable row level security;
create policy estimate_links_select on public.estimate_links for select to authenticated
  using (shop_id = (select public.current_shop_id()));
create policy estimate_links_insert on public.estimate_links for insert to authenticated
  with check (shop_id = (select public.current_shop_id()));
create policy estimate_links_update on public.estimate_links for update to authenticated
  using (shop_id = (select public.current_shop_id()))
  with check (shop_id = (select public.current_shop_id()));

revoke all on public.estimate_links from anon, authenticated;
grant select on public.estimate_links to authenticated;
grant insert (estimate_id, token_hash, recipient_email, expires_at) on public.estimate_links to authenticated;
grant update (sent_at, email_message_id, revoked_at) on public.estimate_links to authenticated;

create trigger estimate_links_updated_at before update on public.estimate_links
  for each row execute function public.set_updated_at();

create function public.estimate_links_guard() returns trigger
language plpgsql set search_path = '' as $$
declare v_est public.estimates;
begin
  if tg_op = 'INSERT' then
    select * into v_est from public.estimates where id = new.estimate_id and shop_id = new.shop_id;
    if not found or v_est.deleted_at is not null or v_est.status not in ('draft', 'sent') then
      raise exception 'estimate is not open for a signing link' using errcode = 'check_violation';
    end if;
    if new.expires_at <= now() or new.expires_at > now() + interval '30 days' then
      raise exception 'link expiry must be within 30 days' using errcode = 'check_violation';
    end if;
    if num_nonnulls(new.sent_at, new.email_message_id, new.opened_at, new.used_at, new.revoked_at, new.authorization_id) > 0 then
      raise exception 'new link must start empty' using errcode = 'check_violation';
    end if;
    return new;
  end if;

  if new.shop_id is distinct from old.shop_id or new.estimate_id is distinct from old.estimate_id
     or new.token_hash is distinct from old.token_hash or new.recipient_email is distinct from old.recipient_email
     or new.expires_at is distinct from old.expires_at or new.created_at is distinct from old.created_at
     or new.created_by is distinct from old.created_by then
    raise exception 'link identity fields are immutable' using errcode = 'check_violation';
  end if;
  if (old.sent_at is not null and new.sent_at is distinct from old.sent_at)
     or (old.email_message_id is not null and new.email_message_id is distinct from old.email_message_id)
     or (old.opened_at is not null and new.opened_at is distinct from old.opened_at)
     or (old.used_at is not null and new.used_at is distinct from old.used_at)
     or (old.authorization_id is not null and new.authorization_id is distinct from old.authorization_id)
     or (old.revoked_at is not null and new.revoked_at is distinct from old.revoked_at) then
    raise exception 'link events can only be set once' using errcode = 'check_violation';
  end if;
  return new;
end $$;
create trigger estimate_links_guard before insert or update on public.estimate_links
  for each row execute function public.estimate_links_guard();

-- 3) Si el presupuesto deja de estar "sent" (vuelve a borrador, se anula, se autoriza o
--    rechaza por otra vía, o se borra), los enlaces sin usar quedan revocados.
create function public.estimates_revoke_links() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.estimate_links set revoked_at = now()
  where estimate_id = new.id and used_at is null and revoked_at is null;
  return null;
end $$;
revoke all on function public.estimates_revoke_links() from public, anon, authenticated;
create trigger estimates_revoke_links after update of status, deleted_at on public.estimates
  for each row
  when ((new.status is distinct from old.status and new.status <> 'sent')
        or (new.deleted_at is not null and old.deleted_at is null))
  execute function public.estimates_revoke_links();

-- 4) Lectura para la página pública (servidor con clave service_role, solo lectura)
grant select on public.shops, public.customers, public.vehicles, public.repair_orders,
  public.estimates, public.estimate_lines, public.estimate_totals, public.documents,
  public.authorizations, public.labor_rates, public.estimate_links to service_role;

-- 5) Escrituras públicas SOLO por estas funciones (ejecutables solo por service_role)
create function public.mark_estimate_link_opened(p_token_hash text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  update public.estimate_links set opened_at = now()
  where token_hash = p_token_hash and opened_at is null and deleted_at is null;
end $$;

create function public.sign_estimate_via_link(
  p_token_hash text,
  p_decision public.authorization_decision,
  p_authorizer_name text,
  p_return_parts_requested boolean,
  p_signature_path text,
  p_signature_sha256 text,
  p_signature_size bigint,
  p_signer_ip inet,
  p_signer_user_agent text
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_link public.estimate_links;
  v_est public.estimates;
  v_ro public.repair_orders;
  v_doc uuid;
  v_auth uuid;
begin
  select * into v_link from public.estimate_links
  where token_hash = p_token_hash and deleted_at is null for update;
  if not found then raise exception 'link not found' using errcode = 'no_data_found'; end if;
  if v_link.revoked_at is not null then raise exception 'link revoked' using errcode = 'check_violation'; end if;
  if v_link.used_at is not null then raise exception 'link already used' using errcode = 'check_violation'; end if;
  if v_link.expires_at <= now() then raise exception 'link expired' using errcode = 'check_violation'; end if;

  select * into v_est from public.estimates where id = v_link.estimate_id and shop_id = v_link.shop_id;
  if v_est.deleted_at is not null or v_est.status <> 'sent' then
    raise exception 'estimate is not open for signature' using errcode = 'check_violation';
  end if;
  select * into v_ro from public.repair_orders where id = v_est.repair_order_id and shop_id = v_est.shop_id;

  if p_decision = 'approved' and p_signature_path is null then
    raise exception 'approval needs a signature' using errcode = 'check_violation';
  end if;

  if p_signature_path is not null then
    if p_signature_path not like v_link.shop_id::text || '/ro/' || v_ro.id::text || '/auth/%' then
      raise exception 'bad signature path' using errcode = 'check_violation';
    end if;
    insert into public.documents (shop_id, kind, repair_order_id, estimate_id, storage_path, mime_type, size_bytes, sha256, created_by)
    values (v_link.shop_id, 'signature', v_ro.id, v_est.id, p_signature_path, 'image/png', p_signature_size, p_signature_sha256, null)
    returning id into v_doc;
  end if;

  -- Marcar usado ANTES de autorizar (la autorización revoca los enlaces sin usar)
  update public.estimate_links set used_at = now() where id = v_link.id;

  insert into public.authorizations (shop_id, estimate_id, method, decision, authorizer_name, contact_email,
    signature_document_id, signer_ip, signer_user_agent, return_parts_requested, created_by)
  values (v_link.shop_id, v_est.id, 'electronic', p_decision, btrim(p_authorizer_name), v_link.recipient_email,
    v_doc, p_signer_ip, left(p_signer_user_agent, 500), coalesce(p_return_parts_requested, false) and p_decision = 'approved', null)
  returning id into v_auth;

  update public.estimate_links set authorization_id = v_auth where id = v_link.id;

  insert into public.activities (shop_id, kind, body, customer_id, vehicle_id, repair_order_id, created_by)
  values (v_link.shop_id, 'system',
    jsonb_build_object('module', 'orders', 'key', 'authorizationActivity', 'values',
      jsonb_build_object('kind', v_est.kind, 'seq', v_est.seq, 'decision', p_decision,
                         'name', btrim(p_authorizer_name), 'method', 'electronic'))::text,
    v_ro.customer_id, v_ro.vehicle_id, v_ro.id, null);

  return v_auth;
end $$;

create function public.freeze_estimate_pdf_via_link(
  p_token_hash text, p_storage_path text, p_sha256 text, p_size bigint
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_link public.estimate_links;
  v_est public.estimates;
  v_doc uuid;
begin
  select * into v_link from public.estimate_links
  where token_hash = p_token_hash and deleted_at is null and authorization_id is not null;
  if not found then raise exception 'link not signed' using errcode = 'check_violation'; end if;

  select * into v_est from public.estimates where id = v_link.estimate_id and shop_id = v_link.shop_id for update;
  if v_est.pdf_document_id is not null then
    raise exception 'PDF already frozen' using errcode = 'check_violation';
  end if;
  if p_storage_path not like v_link.shop_id::text || '/ro/' || v_est.repair_order_id::text || '/estimates/' || v_est.id::text || '/%' then
    raise exception 'bad PDF path' using errcode = 'check_violation';
  end if;

  insert into public.documents (shop_id, kind, repair_order_id, estimate_id, storage_path, mime_type, size_bytes, sha256, created_by)
  values (v_link.shop_id, 'estimate_pdf', v_est.repair_order_id, v_est.id, p_storage_path, 'application/pdf', p_size, p_sha256, null)
  returning id into v_doc;

  update public.estimates set pdf_document_id = v_doc, pdf_sha256 = p_sha256 where id = v_est.id;
  return v_doc;
end $$;

revoke all on function public.mark_estimate_link_opened(text) from public, anon, authenticated;
revoke all on function public.sign_estimate_via_link(text, public.authorization_decision, text, boolean, text, text, bigint, inet, text) from public, anon, authenticated;
revoke all on function public.freeze_estimate_pdf_via_link(text, text, text, bigint) from public, anon, authenticated;
grant execute on function public.mark_estimate_link_opened(text) to service_role;
grant execute on function public.sign_estimate_via_link(text, public.authorization_decision, text, boolean, text, text, bigint, inet, text) to service_role;
grant execute on function public.freeze_estimate_pdf_via_link(text, text, text, bigint) to service_role;
revoke all on function public.estimate_links_guard() from public, anon, authenticated;
