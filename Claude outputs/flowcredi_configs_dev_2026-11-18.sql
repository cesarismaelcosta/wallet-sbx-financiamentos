-- FlowCredi · configuração das jornadas (DEV · staging da FlowCredi)
-- Rode no SQL Editor do Supabase de dev. Em homol: troque a URL de staging se o homol usar produção.

-- 1) Imóveis (config 8): limites do simulador da FlowCredi + limites por subcategoria
update orchestrator_configs
set rules = (rules - 'min_monthly_income') || '{
  "max_financing_percentage": 90,
  "min_financed_amount": 10000,
  "min_term_months": 36,
  "max_term_months": 420,
  "subcategory_limits": {
    "10110": {"max_financing_percentage": 90, "max_term_months": 420},
    "10111": {"max_financing_percentage": 90, "max_term_months": 420},
    "10120": {"max_financing_percentage": 70, "max_term_months": 120},
    "11713": {"max_financing_percentage": 70, "max_term_months": 240},
    "*":     {"max_financing_percentage": 70, "max_term_months": 240}
  }
}'::jsonb
where id = 8;

-- 2) Home Equity (config 7): prazo até 240, padrão 120
update orchestrator_configs
set rules = rules || '{"max_term_months": 240, "default_term_months": 120}'::jsonb
where id = 7;

-- 3) Aceites FlowCredi (configs 6, 7, 8): id sem versão e link abrindo o texto oficial (GET /terms)
update orchestrator_configs o
set consent_configs = (
  select jsonb_agg(
    case when c ? 'flowcredi_type' then
      (c - 'flowcredi_version')
      || jsonb_build_object('id', regexp_replace(c->>'id', '_v[0-9]+$', ''))
      || jsonb_build_object('links', (
           select coalesce(jsonb_agg(jsonb_build_object(
             'text', l->>'text',
             'type', 'terms',
             'terms_url', 'https://api.staging.flowcredi.com.br/terms-service/v1/terms')), '[]'::jsonb)
           from jsonb_array_elements(coalesce(c->'links', '[]'::jsonb)) l))
    else c end
    order by (c->>'position')::int)
  from jsonb_array_elements(o.consent_configs) c)
where o.id in (6, 7, 8);

-- 4) FAQs com números antigos
update orchestrator_configs
set page_faqs = replace(page_faqs::text, 'o financiamento chega a até 80% do valor do imóvel', 'o financiamento chega a até 90% do valor do imóvel')::jsonb
where id = 8;
update orchestrator_configs
set page_faqs = replace(page_faqs::text, 'e paga em 12 a 60 parcelas', 'e paga em 12 a 70 parcelas')::jsonb
where id = 6;

-- Conferência
select id, rules, jsonb_path_query_array(consent_configs, '$[*].id') ids,
       jsonb_path_query_array(consent_configs, '$[*].links[*].type') link_types
from orchestrator_configs where id in (6, 7, 8) order by id;
