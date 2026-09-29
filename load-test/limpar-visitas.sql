-- Apaga as visitas de TESTE criadas pelo visitas.sql e tudo que o teste de
-- carga gravou nelas (marca: visits.utm_campaign = 'k6_load_test').
-- Rode no mesmo ambiente do teste, depois de terminar. Confira a contagem
-- do primeiro select antes de rodar o bloco de delete.
select count(*) as visitas_de_teste from visits where utm_campaign = 'k6_load_test';

begin;
create temp table k6_v on commit drop as
  select id from visits where utm_campaign = 'k6_load_test';
delete from visit_orchestrator_configs where visit_update_id in (select id from visit_updates where visit_id in (select id from k6_v));
delete from visit_consents  where visit_id in (select id from k6_v);
delete from visit_offers    where visit_id in (select id from k6_v);
delete from visit_updates   where visit_id in (select id from k6_v);
delete from visit_entities  where visit_id in (select id from k6_v);
delete from visits          where id       in (select id from k6_v);
commit;
