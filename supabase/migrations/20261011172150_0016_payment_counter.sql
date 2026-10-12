-- 0016 · Contador de recibos de pago (fase 4c1): shop_counters admite el tipo 'payment'.
alter table public.shop_counters drop constraint shop_counters_kind_check;
alter table public.shop_counters add constraint shop_counters_kind_check check (kind = any (array['repair_order'::text, 'invoice'::text, 'payment'::text]));
