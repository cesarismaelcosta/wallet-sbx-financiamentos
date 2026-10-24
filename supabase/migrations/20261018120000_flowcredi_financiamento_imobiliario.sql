-- =============================================================================
-- [FLOWCREDI] Parceiro 3 passa a ser a FlowCredi + jornada de Financiamento
-- Imobiliário (CATEGORY 13 · /financiamentos/imoveis).
--
-- 1) partners.id = 3: "Creditas" -> "FlowCredi" e nova logo.
--    ⚠️ Subir antes o arquivo flowcredi_400_400.png no bucket público `logos`.
--
-- 2) orchestrator_configs CATEGORY 13 (Imóveis):
--    * integrada via API (financial-gateway → flowcredi-mortgage-service.ts;
--      mock enquanto o secret FLOWCREDI_MOCK != "false")
--    * rules.flowcredi_product = "mortgage" ativa a jornada no gateway
--    * limites da simulação (rules): até 80% do imóvel, R$ 50 mil mínimo,
--      prazo 60–420 meses (padrão 360), renda mínima R$ 1.000
--    * aceites da FlowCredi (pedidos só no envio da proposta, step 2):
--      Política de Privacidade v4 · Termo de Uso v2 · Autorização SCR
--    * painel lateral, rodapé (FlowCredi, CNPJ 31.520.218/0001-09) e FAQs
--    * entity_type PF+PJ: o gateway responde a PJ que a jornada é só para PF
--      (com "PF", um PJ ficaria sem configuração e cairia em erro genérico)
--
-- home_status NÃO é alterado aqui (continua "coming_soon"): liberar o botão
-- pelo backoffice quando a jornada for ao ar.
--
-- VENDEDOR SANTANDER (somente Santander na simulação): incluir o seller_id em
-- rules.flowcredi_bank_by_seller, ex.: {"123456": "Santander"} (modelo no final).
-- Não usar uma linha config_type = 'SELLER': ela valeria para TODAS as ofertas
-- do vendedor (veículos inclusive), não só para imóveis.
--
-- Car Equity (PRODUCT 7) e Home Equity (PRODUCT 6) seguem com o parceiro 3
-- (agora FlowCredi); textos e integração deles ficam para as próximas etapas.
-- Idempotente.
-- =============================================================================

update public.partners
set name = 'FlowCredi',
    logo_url = 'https://ldzutiojmcawhwdhojlo.supabase.co/storage/v1/object/public/logos/flowcredi_400_400.png',
    updated_at = timezone('utc', now())
where id = 3;

update public.orchestrator_configs
set entity_type = 'PF+PJ',
    is_integrated = true,
    integration_method = 'API',
    integration_details = '{}'::jsonb,
    rules = $json${
      "flowcredi_product": "mortgage",
      "flowcredi_bank_by_seller": {},
      "max_financing_percentage": 80,
      "min_financed_amount": 50000,
      "min_term_months": 60,
      "max_term_months": 420,
      "default_term_months": 360,
      "term_step_months": 12,
      "min_monthly_income": 1000
    }$json$::jsonb,
    consent_configs = $json$[
      {
        "id": "flowcredi_politica_privacidade_v4",
        "position": 1,
        "is_required": true,
        "default_state": false,
        "flowcredi_type": "politica_privacidade",
        "flowcredi_version": 4,
        "template_text": "Autorizo o compartilhamento dos meus dados com a FlowCredi, conforme a {Política de Privacidade} da FlowCredi.",
        "links": [{ "text": "Política de Privacidade", "type": "web", "url": "https://flowcredi.com.br" }],
        "effective_date": "2026-09-30"
      },
      {
        "id": "flowcredi_termos_gerais_v2",
        "position": 2,
        "is_required": true,
        "default_state": false,
        "flowcredi_type": "termos_gerais",
        "flowcredi_version": 2,
        "template_text": "Li e aceito o {Termo de Uso} da FlowCredi.",
        "links": [{ "text": "Termo de Uso", "type": "web", "url": "https://flowcredi.com.br" }],
        "effective_date": "2026-09-30"
      },
      {
        "id": "flowcredi_autorizacao_scr_v1",
        "position": 3,
        "is_required": true,
        "default_state": false,
        "flowcredi_type": "autorizacao_scr",
        "flowcredi_version": 1,
        "template_text": "Autorizo a consulta das minhas informações no {SCR (Banco Central)} e em órgãos de proteção ao crédito para análise da proposta.",
        "links": [{ "text": "SCR (Banco Central)", "type": "tooltip", "tooltip_text": "Autoriza a FlowCredi e as instituições financeiras parceiras a consultar o Sistema de Informações de Crédito (SCR) do Banco Central e órgãos de proteção ao crédito (Serasa, SPC, Boa Vista, Quod), exclusivamente para avaliar sua proposta de financiamento." }],
        "effective_date": "2026-09-30"
      }
    ]$json$::jsonb,
    page_faqs = $json$[
      { "position": 1, "bullets": [], "question": "A simulação já é uma aprovação de crédito?", "answer": "Não. A simulação mostra condições de referência de cada banco para o valor e o prazo escolhidos. A aprovação depende da análise de crédito da instituição financeira, feita depois que você envia a proposta." },
      { "position": 2, "bullets": [], "question": "Por que os bancos não financiam 100% do valor do imóvel?", "answer": "Por risco de crédito. Financiando apenas parte do valor, o banco reduz o risco de não recuperar o que emprestou caso precise retomar o imóvel. Em geral, o financiamento chega a até 80% do valor do imóvel." },
      { "position": 3, "bullets": [], "question": "Qual a diferença entre as tabelas SAC e PRICE?", "answer": "Na SAC, a amortização é fixa: a primeira parcela é a maior e as parcelas diminuem ao longo do contrato. Na PRICE, a parcela de juros e amortização é fixa: começa menor que na SAC, mas o total pago tende a ser maior." },
      { "position": 4, "bullets": [], "question": "O que são MIP, DFI e tarifa na parcela?", "answer": "MIP é o seguro de Morte e Invalidez Permanente, calculado sobre o saldo devedor e a sua idade. DFI é o seguro de Danos Físicos ao Imóvel, calculado sobre o valor do imóvel. Os dois são obrigatórios no financiamento imobiliário. A tarifa é a taxa mensal de administração do contrato." },
      { "position": 5, "bullets": [], "question": "Quais custos não estão na simulação?", "answer": "ITBI, registro em cartório e avaliação do imóvel são pagos à parte. O ITBI deve ser pago em até 10 dias após a emissão do contrato; depois desse prazo, a prefeitura cobra juros." },
      { "position": 6, "bullets": [], "question": "O que acontece depois que eu envio a proposta?", "answer": "Um consultor da FlowCredi entra em contato pelo telefone ou e-mail do seu cadastro, analisa sua proposta nos bancos e acompanha a avaliação do imóvel, a assinatura do contrato e o registro até a liberação do valor ao vendedor." },
      { "position": 7, "bullets": [], "question": "Por que preciso aceitar os termos da FlowCredi?", "answer": "Para enviar a proposta, a Wallet sbX compartilha seus dados de cadastro com a FlowCredi, que encaminha a análise às instituições financeiras parceiras. Por isso os termos e a autorização de consulta ao SCR são pedidos antes do envio." },
      { "position": 8, "bullets": [], "question": "O banco pode tomar meu imóvel se eu parar de pagar?", "answer": "Sim. O imóvel fica alienado ao banco até a quitação. Com 90 dias de parcelas em atraso, o banco pode iniciar a retomada. Em caso de dificuldade, o melhor caminho é negociar com o banco o quanto antes." }
    ]$json$::jsonb,
    page_configs = $json${
      "offer_panel": {
        "partner": { "name": "FlowCredi", "label": "Parceria com:" },
        "headline": { "parts": [
          { "text": "Compre seu imóvel ", "type": "normal" },
          { "text": "financiado em até 35 anos ", "type": "highlight" },
          { "text": "na Superbid", "type": "normal" }
        ]},
        "description": { "parts": [
          { "text": "Você acessa ", "type": "normal" },
          { "text": "ótimas condições", "type": "bold" },
          { "text": " e dá seu lance com crédito aprovado.", "type": "normal" }
        ]},
        "benefits": [
          { "icon": "Landmark", "title": "Principais bancos do país", "description": "Compare parcelas e taxas em uma só simulação" },
          { "icon": "Clock", "title": "Até 35 anos para pagar", "description": "Escolha o prazo ideal pra você" },
          { "icon": "ShieldCheck", "title": "Facilidade para negociar", "description": "Simule e solicite a análise de crédito com apoio de especialistas" }
        ]
      },
      "footer": {
        "template_text": "© 2026 Wallet sbX. Todos os direitos reservados. Somos uma plataforma online que facilita o acesso a produtos e serviços financeiros ofertados por empresas parceiras. O financiamento imobiliário é intermediado pela {FLOWCREDI PROMOTORA DE SERVICOS LTDA} (CNPJ 31.520.218/0001-09), correspondente bancário que encaminha a proposta às instituições financeiras parceiras, responsáveis pela análise e concessão do crédito.",
        "links": [{ "text": "FLOWCREDI PROMOTORA DE SERVICOS LTDA", "url": "https://flowcredi.com.br" }]
      }
    }$json$::jsonb,
    updated_at = timezone('utc', now())
where config_type = 'CATEGORY' and lookup_id = 13 and partner_id = 3;

-- -----------------------------------------------------------------------------
-- MODELO · Vendedor Santander (trocar <SELLER_ID_SANTANDER> pelo id real)
-- -----------------------------------------------------------------------------
-- update public.orchestrator_configs
-- set rules = jsonb_set(rules, '{flowcredi_bank_by_seller,<SELLER_ID_SANTANDER>}', '"Santander"'::jsonb, true),
--     updated_at = timezone('utc', now())
-- where config_type = 'CATEGORY' and lookup_id = 13 and partner_id = 3;
