alter table public.activities drop constraint activities_target_chk;
alter table public.activities add constraint activities_target_chk
  check (num_nonnulls(customer_id, vehicle_id, appointment_id, repair_order_id, lead_id) >= 1);
