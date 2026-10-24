-- Só para ambientes onde a 1ª versão de 20261022120000_flowcredi_faqs.sql já rodou.
-- Troca a resposta corrida de "O que acontece depois que eu envio a solicitação?" pelos 5 passos em itens.
update orchestrator_configs oc
set page_faqs = (
      select jsonb_agg(
               case when e->>'question' = 'O que acontece depois que eu envio a solicitação?' then
                 e || jsonb_build_object(
                   'answer',  'Depois do envio, o caminho até a liberação do crédito é este:',
                   'bullets', jsonb_build_array(
                     'Um especialista da FlowCredi entra em contato pelo celular ou e-mail do seu cadastro',
                     'Sua solicitação é analisada pelos bancos',
                     'Com o crédito aprovado, o banco faz a análise jurídica e a avaliação do imóvel',
                     'Você assina o contrato, que é registrado no Cartório de Registro de Imóveis',
                     case when oc.config_type = 'CATEGORY' then 'O banco libera o valor financiado ao vendedor'
                          else 'O banco libera o valor do crédito na sua conta' end))
               else e end
               order by (e->>'position')::int)
      from jsonb_array_elements(oc.page_faqs) e
    ),
    updated_at = now()
where oc.partner_id = 3
  and ((oc.config_type = 'CATEGORY' and oc.lookup_id = 13) or (oc.config_type = 'PRODUCT' and oc.lookup_id = 6));
