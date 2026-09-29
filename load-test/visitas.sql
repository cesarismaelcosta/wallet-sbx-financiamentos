-- =============================================================================
-- Gera 60 visitas de TESTE para o teste de carga (SÓ DEV/HOMOL, nunca produção)
-- =============================================================================
-- Pré-requisito: fazer login UMA vez no app deste ambiente (isso cria uma
-- visita "molde" com o seu perfil em visit_entities).
--
-- O script copia essa visita 60 vezes (visits + visit_entities + o
-- visit_update mais recente), com ids novos e utm_campaign = 'k6_load_test'
-- (é por essa marca que o limpar-visitas.sql apaga tudo depois).
--
-- Troque o entity_id se o seu userId não for 1847919 (é o "userId" do token).
-- O resultado (visit_id, visit_update_id) -> Export CSV -> load-test\visitas.csv
-- =============================================================================
with molde as (
  select v.id as visit_id
  from visits v
  join visit_entities e on e.visit_id = v.id
  where e.entity_id = '1847919'
    and coalesce(v.utm_campaign, '') <> 'k6_load_test'
  order by v.created_at desc
  limit 1
),
novas as (
  select gen_random_uuid() as visit_id, gen_random_uuid() as update_id
  from generate_series(1, 60)
),
ins_v as (
  insert into visits
  select (jsonb_populate_record(null::visits,
            to_jsonb(v) || jsonb_build_object('id', n.visit_id, 'utm_campaign', 'k6_load_test'))).*
  from visits v join molde m on v.id = m.visit_id cross join novas n
  returning id
),
ins_e as (
  insert into visit_entities
  select (jsonb_populate_record(null::visit_entities,
            to_jsonb(e) || jsonb_build_object('id', gen_random_uuid(), 'visit_id', n.visit_id))).*
  from visit_entities e join molde m on e.visit_id = m.visit_id cross join novas n
  returning visit_id
),
ult_update as (
  select u.* from visit_updates u join molde m on u.visit_id = m.visit_id
  order by u.created_at desc limit 1
),
ins_u as (
  insert into visit_updates
  select (jsonb_populate_record(null::visit_updates,
            to_jsonb(u) || jsonb_build_object('id', n.update_id, 'visit_id', n.visit_id, 'utm_campaign', 'k6_load_test'))).*
  from ult_update u cross join novas n
  returning visit_id, id
)
select visit_id, id as visit_update_id from ins_u;
