-- =============================================================================
-- [FLOWCREDI] Home Equity (Crédito com garantia de imóvel · PRODUCT 6 · /emprestimos/home-equity)
--
-- * integrada via API (financial-gateway → flowcredi-home-equity-service.ts)
-- * rules.flowcredi_product = "home_equity" ativa a jornada no gateway
-- * limites publicados pela FlowCredi (flowcredi.com.br): até 60% do valor do imóvel,
--   até 240 meses. term_step_months/default_term_months são só da tela (slider).
-- * aceites da FlowCredi (pedidos só no envio da proposta), iguais aos de imóveis
-- * painel lateral, rodapé e FAQs (conteúdo do site da FlowCredi)
-- * entity_type PF+PJ: o gateway responde a PJ que a jornada é só para PF
--
-- home_status e page_url NÃO são alterados aqui: liberar o botão pelo backoffice
-- quando a jornada for ao ar e conferir o page_url em cada ambiente.
-- Idempotente.
-- =============================================================================

update public.orchestrator_configs
set entity_type = 'PF+PJ',
    is_integrated = true,
    integration_method = 'API',
    integration_details = '{}'::jsonb,
    rules = $json${
      "flowcredi_product": "home_equity",
      "max_loan_percentage": 60,
      "max_term_months": 240,
      "default_term_months": 180,
      "term_step_months": 12
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
        "links": [{ "text": "SCR (Banco Central)", "type": "tooltip", "tooltip_text": "Autoriza a FlowCredi e as instituições financeiras parceiras a consultar o Sistema de Informações de Crédito (SCR) do Banco Central e órgãos de proteção ao crédito (Serasa, SPC, Boa Vista, Quod), exclusivamente para avaliar sua proposta de crédito." }],
        "effective_date": "2026-09-30"
      }
    ]$json$::jsonb,
    page_faqs = $json$[
      { "position": 1, "bullets": [], "question": "Quanto posso pegar e em quanto tempo pago?", "answer": "Até 60% do valor do imóvel, em até 240 meses (20 anos). Se o imóvel ainda tiver financiamento, o saldo devedor é descontado desse limite. O valor e o prazo finais dependem da análise de crédito e da avaliação do imóvel pelo banco." },
      { "position": 2, "bullets": [], "question": "A simulação já é uma aprovação de crédito?", "answer": "Não. A simulação mostra condições de referência de cada banco para o valor e o prazo escolhidos. A aprovação depende da análise de crédito e da avaliação do imóvel pela instituição financeira, feitas depois que você envia a proposta." },
      { "position": 3, "bullets": [], "question": "Por que os juros são mais baixos?", "answer": "Porque o imóvel fica como garantia real da operação. Com menos risco para o banco, as taxas ficam entre as menores do mercado de crédito, e o prazo para pagar é mais longo." },
      { "position": 4, "bullets": [], "question": "Posso continuar usando ou alugando o imóvel?", "answer": "Sim. O imóvel continua com você: pode morar, usar ou alugar normalmente durante todo o contrato." },
      { "position": 5, "bullets": [], "question": "Preciso dizer ao banco como vou usar o dinheiro?", "answer": "Não. O uso é livre: reformar, investir no seu negócio, quitar dívidas ou realizar outros projetos, sem precisar justificar a finalidade." },
      { "position": 6, "bullets": [], "question": "Em quanto tempo o dinheiro cai na minha conta?", "answer": "Depende de cada banco, do envio dos documentos e da complexidade da operação. Em média, os bancos liberam o valor em até 60 dias, depois do registro do contrato em cartório." },
      { "position": 7, "bullets": ["Comprovantes de renda (IR, holerite ou extratos bancários)", "Documentos pessoais (RG, CPF ou CNH)", "Comprovante de estado civil", "Ficha cadastral do banco", "Matrícula atualizada e carnê do IPTU do imóvel"], "question": "Quais documentos vou precisar?", "answer": "Um especialista vai orientar você durante o processo. Em geral, são pedidos:" },
      { "position": 8, "bullets": [], "question": "O que são MIP, DFI e tarifa na parcela?", "answer": "MIP é o seguro de Morte e Invalidez Permanente, calculado sobre o saldo devedor e a sua idade. DFI é o seguro de Danos Físicos ao Imóvel, calculado sobre o valor do imóvel. A tarifa é a taxa mensal de administração do contrato." },
      { "position": 9, "bullets": [], "question": "Por que preciso aceitar os termos da FlowCredi?", "answer": "Para enviar a proposta, a Wallet sbX compartilha seus dados de cadastro com a FlowCredi, que encaminha a análise às instituições financeiras parceiras. Por isso os termos e a autorização de consulta ao SCR são pedidos antes do envio." }
    ]$json$::jsonb,
    page_configs = $json${
      "offer_panel": {
        "partner": { "name": "FlowCredi", "label": "Parceria com:" },
        "headline": { "parts": [
          { "text": "Use seu imóvel como ", "type": "normal" },
          { "text": "garantia", "type": "highlight" },
          { "text": " e invista na Superbid pagando em até 240 meses", "type": "normal" }
        ]},
        "description": { "parts": [
          { "text": "Você acessa ", "type": "normal" },
          { "text": "crédito com taxas menores", "type": "bold" },
          { "text": " e continua usando seu imóvel.", "type": "normal" }
        ]},
        "benefits": [
          { "icon": "Landmark", "title": "Até 60% do valor do imóvel", "description": "Valores altos, com prazo de até 240 meses" },
          { "icon": "Banknote", "title": "Crédito para investir", "description": "Na Superbid ou onde preferir, você escolhe" },
          { "icon": "ShieldCheck", "title": "Análise em diversas instituições", "description": "Especialistas buscam a melhor condição para você" }
        ]
      },
      "footer": {
        "template_text": "© 2026 Wallet sbX. Todos os direitos reservados. Somos uma plataforma online que facilita o acesso a produtos e serviços financeiros ofertados por empresas parceiras. O crédito com garantia de imóvel é intermediado pela {FLOWCREDI PROMOTORA DE SERVICOS LTDA} (CNPJ 31.520.218/0001-09), correspondente bancário que encaminha a proposta às instituições financeiras parceiras, responsáveis pela análise e concessão do crédito.",
        "links": [{ "text": "FLOWCREDI PROMOTORA DE SERVICOS LTDA", "url": "https://flowcredi.com.br" }]
      }
    }$json$::jsonb,
    updated_at = timezone('utc', now())
where config_type = 'PRODUCT' and lookup_id = 6 and partner_id = 3;
