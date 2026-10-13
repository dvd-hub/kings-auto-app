-- 0020_web_request_lead: cada solicitud web crea su lead automáticamente
create or replace function public.web_request_create_lead()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_lead uuid;
begin
  insert into public.leads
    (shop_id, status, source, customer_id, vehicle_id, appointment_id, web_request_id, summary, created_by)
  values
    (new.shop_id, 'new', 'web', new.customer_id, new.vehicle_id, new.appointment_id, new.id,
     left(new.damage_description, 500), new.created_by)
  returning id into v_lead;

  update public.web_requests set lead_id = v_lead where id = new.id;
  return null;
end;
$$;

revoke all on function public.web_request_create_lead() from public, anon, authenticated;

create trigger web_requests_create_lead
  after insert on public.web_requests
  for each row execute function public.web_request_create_lead();

-- solicitudes ya existentes sin lead
with created as (
  insert into public.leads
    (shop_id, status, source, customer_id, vehicle_id, appointment_id, web_request_id, summary, created_at)
  select w.shop_id,
         case w.status when 'spam' then 'spam'::public.lead_status
                       when 'contacted' then 'contacted'::public.lead_status
                       else 'new'::public.lead_status end,
         'web', w.customer_id, w.vehicle_id, w.appointment_id, w.id,
         left(w.damage_description, 500), w.created_at
  from public.web_requests w
  where w.lead_id is null and w.deleted_at is null
  returning id, web_request_id
)
update public.web_requests w set lead_id = c.id
from created c where w.id = c.web_request_id;
