-- 0018_activities_lead: notas e historial por lead
alter table public.activities add column lead_id uuid;
alter table public.activities
  add constraint activities_lead_id_shop_id_fkey
  foreign key (lead_id, shop_id) references public.leads(id, shop_id);
create index activities_lead_idx on public.activities (lead_id)
  where lead_id is not null and deleted_at is null;
