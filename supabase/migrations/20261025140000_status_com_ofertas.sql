-- =============================================================================
-- Status da etapa Simulação: "Com condições"/"Sem condições" → "Com ofertas"/"Sem ofertas"
-- Só nomes e descrições (ids iguais: 9 e 10). Idempotente.
-- =============================================================================

update public.status_types set name = 'Com ofertas', description = 'A simulação encontrou ofertas de crédito (banco, taxa, prazo e parcela).' where id = 9;
update public.status_types set name = 'Sem ofertas', description = 'A simulação não encontrou nenhuma oferta de crédito.' where id = 10;
update public.stage_types  set description = 'Simulação de ofertas de crédito (taxa, prazo, parcelas), sem análise de crédito.' where id = 2;
