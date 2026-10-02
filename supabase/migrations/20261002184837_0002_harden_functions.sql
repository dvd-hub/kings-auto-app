-- next_number solo se usará desde triggers internos, nunca por RPC
revoke execute on function public.next_number(text) from public, anon, authenticated;

-- función del event trigger de RLS automático: no debe ser llamable por la API
revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
