-- =============================================================================
-- Leads da FlowCredi sem "retorno do parceiro" inventado
--
-- O registro do lead é um evento nosso, não uma resposta da FlowCredi: a financial-gateway
-- deixa de gravar texto próprio ("Proposta enviada à FlowCredi.") e o backoffice mostra o
-- nome e a descrição do status, lidos de status_types (11 · Enviado).
-- Aqui: simulations e simulation_updates dos leads perdem o vínculo com esse texto
-- (sem mudar updated_at) e a linha de result_partner_types é apagada.
-- Um único bloco DO; idempotente.
-- =============================================================================

do $migration$
begin
  alter table public.simulations        disable trigger trg_updated_at_simulations;
  alter table public.simulation_updates disable trigger trg_updated_at_simulation_updates;

  update public.simulations
  set result_partner_id = null
  where result_partner_id in (select id from public.result_partner_types where partner_id = 3 and status_id = 11);

  update public.simulation_updates
  set result_partner_id = null
  where result_partner_id in (select id from public.result_partner_types where partner_id = 3 and status_id = 11);

  alter table public.simulations        enable trigger trg_updated_at_simulations;
  alter table public.simulation_updates enable trigger trg_updated_at_simulation_updates;

  delete from public.result_partner_types where partner_id = 3 and status_id = 11;
end
$migration$;
