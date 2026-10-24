-- =============================================================================
-- FlowCredi: dados já gravados alinhados às decisões de 2026-10-21
--
-- 1. Lead · Enviado → Lead · Pendente envio: o envio à FlowCredi está desligado
--    (FLOWCREDI_SEND_LEAD = false), então nenhum lead gravado até aqui saiu de fato.
--    A financial-gateway passa a gravar Pendente envio enquanto o envio estiver desligado.
-- 2. Sem "retorno do parceiro" escrito por nós: as simulações da FlowCredi gravavam
--    textos próprios ("Caixa · Customizada", "Nenhuma condição encontrada..."). Os
--    registros perdem o vínculo e as linhas do parceiro 3 em result_partner_types somem.
--    O backoffice mostra o nome/descrição do status (status_types).
-- 3. Home equity (6) e Car Equity (7) sem entrada: crédito com garantia não tem entrada.
--
-- updated_at dos registros não muda (reclassificação, não atividade do cliente).
-- Um único bloco DO; idempotente.
-- =============================================================================

do $migration$
begin
  alter table public.simulations         disable trigger trg_updated_at_simulations;
  alter table public.simulation_updates  disable trigger trg_updated_at_simulation_updates;
  alter table public.simulation_consults disable trigger trg_updated_at_simulation_consults;

  -- 1. Lead · Enviado → Lead · Pendente envio (parceiro 3)
  update public.simulations set status_id = 0 where partner_id = 3 and status_id = 11;
  update public.simulation_updates u set status_id = 0
    from public.simulations s where s.id = u.simulation_id and s.partner_id = 3 and u.status_id = 11;
  update public.simulation_consults c set status_id = 0
    from public.simulations s where s.id = c.simulation_id and s.partner_id = 3 and c.status_id = 11;

  -- 2. Sem retorno do parceiro inventado (parceiro 3)
  update public.simulations set result_partner_id = null where partner_id = 3 and result_partner_id is not null;
  update public.simulation_updates u set result_partner_id = null
    from public.simulations s where s.id = u.simulation_id and s.partner_id = 3 and u.result_partner_id is not null;

  -- 3. Sem entrada em home equity e Car Equity
  update public.simulations set down_payment_amount = null, down_payment_percentage = null
    where partner_id = 3 and product_id in (6, 7) and (down_payment_amount is not null or down_payment_percentage is not null);
  update public.simulation_consults c set down_payment_amount = null, down_payment_percentage = null
    from public.simulations s
    where s.id = c.simulation_id and s.partner_id = 3 and s.product_id in (6, 7)
      and (c.down_payment_amount is not null or c.down_payment_percentage is not null);

  alter table public.simulations         enable trigger trg_updated_at_simulations;
  alter table public.simulation_updates  enable trigger trg_updated_at_simulation_updates;
  alter table public.simulation_consults enable trigger trg_updated_at_simulation_consults;

  delete from public.result_partner_types where partner_id = 3;
end
$migration$;
