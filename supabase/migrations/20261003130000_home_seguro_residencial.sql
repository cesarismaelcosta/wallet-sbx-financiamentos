-- =============================================================================
-- [HOME] Botão "Seguros residenciais" na home como "Em breve".
--
-- Cria a linha PRODUCT 10 (Seguro Residencial) em orchestrator_configs:
--   * parceiro = o mesmo do Seguro Auto (PRODUCT 9)
--   * is_active = false  -> não entra na cascata de configurações
--   * home_key = seguroResidencial, home_status = coming_soon, home_order = 8
-- Depende de 20261003120000_orchestrator_configs_home_fields.sql.
-- Idempotente: não cria se já existir linha PRODUCT 10.
-- =============================================================================

insert into public.orchestrator_configs
  (partner_id, config_type, lookup_id, is_active, home_key, home_status, home_order, is_integrated, entity_type)
select sa.partner_id, 'PRODUCT', 10, false, 'seguroResidencial', 'coming_soon', 8, false, 'PF+PJ'
from public.orchestrator_configs sa
where sa.config_type = 'PRODUCT' and sa.lookup_id = 9
  and not exists (
    select 1 from public.orchestrator_configs x
    where x.config_type = 'PRODUCT' and x.lookup_id = 10
  )
limit 1;
