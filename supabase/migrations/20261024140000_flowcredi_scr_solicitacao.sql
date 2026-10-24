-- =============================================================================
-- FlowCredi · autorização do SCR: "proposta" → "solicitação"
-- (Imóveis CATEGORY 13 e Home Equity PRODUCT 6; o Car Equity já nasceu assim)
-- Só o aceite flowcredi_autorizacao_scr_v1 (texto e tooltip). Idempotente.
-- =============================================================================

update public.orchestrator_configs oc
set consent_configs = (
      select jsonb_agg(
               case when c->>'id' = 'flowcredi_autorizacao_scr_v1'
                    then replace(replace(c::text,
                           'para análise da proposta', 'para análise da solicitação'),
                           'avaliar sua proposta de crédito', 'avaliar sua solicitação de crédito')::jsonb
                    else c end
               order by (c->>'position')::int)
      from jsonb_array_elements(oc.consent_configs) c
    ),
    updated_at = timezone('utc', now())
where oc.partner_id = 3
  and ((oc.config_type = 'CATEGORY' and oc.lookup_id = 13) or (oc.config_type = 'PRODUCT' and oc.lookup_id = 6));
