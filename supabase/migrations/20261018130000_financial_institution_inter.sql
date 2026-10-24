-- =============================================================================
-- Banco Inter (código 77) em financial_institutions, para o logo nas ofertas da
-- FlowCredi (o arquivo inter_400_400.png já está no bucket `logos`). Idempotente.
-- =============================================================================
insert into public.financial_institutions (id, name, logo_url, is_active)
values (77, 'Inter', 'https://ldzutiojmcawhwdhojlo.supabase.co/storage/v1/object/public/logos/inter_400_400.png', true)
on conflict (id) do nothing;
