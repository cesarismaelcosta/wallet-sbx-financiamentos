-- ============================================================================
-- FlowCredi · FAQs da tela final (Imóveis CATEGORY 13 e Home Equity PRODUCT 6)
--
-- A tela final ("Solicitação enviada") deixou de listar próximos passos e
-- documentos; essas informações passam a ficar no FAQ do painel.
--
-- Imóveis (CATEGORY 13):
--   - "O que acontece depois que eu envio a proposta?" vira "...a solicitação?"
--   - inclui "Quais documentos vou precisar?" (posição 7; as seguintes descem)
-- Home Equity (PRODUCT 6):
--   - inclui "O que acontece depois que eu envio a solicitação?" (posição 7;
--     as seguintes descem)
--
-- Idempotente: não duplica se rodar de novo.
-- ============================================================================

-- Imóveis -------------------------------------------------------------------
update orchestrator_configs oc
set page_faqs = (
      select jsonb_agg(f order by (f->>'position')::int)
      from (
        select case
                 when e->>'question' = 'O que acontece depois que eu envio a proposta?' then
                   e || jsonb_build_object(
                     'question', 'O que acontece depois que eu envio a solicitação?',
                     'answer',   'Depois do envio, o caminho até a liberação do crédito é este:',
                     'bullets',  jsonb_build_array(
                       'Um especialista da FlowCredi entra em contato pelo celular ou e-mail do seu cadastro',
                       'Sua solicitação é analisada pelos bancos',
                       'Com o crédito aprovado, o banco faz a análise jurídica e a avaliação do imóvel',
                       'Você assina o contrato, que é registrado no Cartório de Registro de Imóveis',
                       'O banco libera o valor financiado ao vendedor'))
                 when (e->>'position')::int >= 7 then
                   e || jsonb_build_object('position', (e->>'position')::int + 1)
                 else e
               end as f
        from jsonb_array_elements(oc.page_faqs) e
        union all
        select jsonb_build_object(
          'position', 7,
          'question', 'Quais documentos vou precisar?',
          'answer',   'Um especialista vai orientar você durante o processo. Em geral, são pedidos:',
          'bullets',  jsonb_build_array(
            'Comprador: comprovantes de renda (IR, holerite ou extratos bancários), documentos pessoais (RG, CPF ou CNH), comprovante de estado civil e o formulário do banco com a declaração de saúde, assinados',
            'Vendedor: formulário do banco assinado, documentos pessoais ou societários e comprovante de estado civil (pessoa física)',
            'Imóvel: matrícula atualizada, carnê do IPTU e outros documentos de regularização, se necessário'))
      ) x
    ),
    updated_at = now()
where oc.config_type = 'CATEGORY' and oc.lookup_id = 13 and oc.partner_id = 3
  and not exists (
    select 1 from jsonb_array_elements(oc.page_faqs) e
    where e->>'question' = 'Quais documentos vou precisar?'
  );

-- Home Equity ---------------------------------------------------------------
update orchestrator_configs oc
set page_faqs = (
      select jsonb_agg(f order by (f->>'position')::int)
      from (
        select case
                 when (e->>'position')::int >= 7 then
                   e || jsonb_build_object('position', (e->>'position')::int + 1)
                 else e
               end as f
        from jsonb_array_elements(oc.page_faqs) e
        union all
        select jsonb_build_object(
          'position', 7,
          'question', 'O que acontece depois que eu envio a solicitação?',
          'answer',   'Depois do envio, o caminho até a liberação do crédito é este:',
          'bullets',  jsonb_build_array(
            'Um especialista da FlowCredi entra em contato pelo celular ou e-mail do seu cadastro',
            'Sua solicitação é analisada pelos bancos',
            'Com o crédito aprovado, o banco faz a análise jurídica e a avaliação do imóvel',
            'Você assina o contrato, que é registrado no Cartório de Registro de Imóveis',
            'O banco libera o valor do crédito na sua conta'))
      ) x
    ),
    updated_at = now()
where oc.config_type = 'PRODUCT' and oc.lookup_id = 6 and oc.partner_id = 3
  and not exists (
    select 1 from jsonb_array_elements(oc.page_faqs) e
    where e->>'question' = 'O que acontece depois que eu envio a solicitação?'
  );
