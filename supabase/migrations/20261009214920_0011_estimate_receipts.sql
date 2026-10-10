-- 0011_estimate_receipts · Fase 3b3: email de confirmación tras firmar (una sola vez por enlace)

alter table public.estimate_links add column receipt_sent_at timestamptz;
alter table public.estimate_links add constraint estimate_links_receipt_chk
  check (receipt_sent_at is null or authorization_id is not null);

create or replace function public.estimate_links_guard() returns trigger
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
    if num_nonnulls(new.sent_at, new.email_message_id, new.opened_at, new.used_at, new.revoked_at, new.authorization_id, new.receipt_sent_at) > 0 then
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
     or (old.revoked_at is not null and new.revoked_at is distinct from old.revoked_at)
     or (old.receipt_sent_at is not null and new.receipt_sent_at is distinct from old.receipt_sent_at) then
    raise exception 'link events can only be set once' using errcode = 'check_violation';
  end if;
  return new;
end $$;
revoke all on function public.estimate_links_guard() from public, anon, authenticated;

-- Solo la Edge Function (clave de servicio) marca el envío
create function public.mark_estimate_receipt_sent(p_token_hash text) returns boolean
language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  update public.estimate_links set receipt_sent_at = now()
  where token_hash = p_token_hash and authorization_id is not null and receipt_sent_at is null and deleted_at is null
  returning id into v_id;
  return v_id is not null;
end $$;
revoke all on function public.mark_estimate_receipt_sent(text) from public, anon, authenticated;
grant execute on function public.mark_estimate_receipt_sent(text) to service_role;
