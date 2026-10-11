-- 0013 · Tipo de documento para el PDF de la factura (fase 4b). Va aparte porque un valor nuevo de enum no se puede usar en la misma transacción.
alter type public.document_kind add value if not exists 'invoice_pdf';

-- Sales tax provisional de Pittsburg, CA: 7.25 % estatal + 2.00 % de distritos (CDTFA-105 rev. 41) = 9.25 %
update public.shops set sales_tax_rate = 0.0925 where id = '58788290-35ad-4dbb-8cd7-e5576ccdc548' and sales_tax_rate = 0;
