-- =============================================================================
-- [FLOWCREDI] Car Equity (Crédito com garantia de veículo · PRODUCT 7 · /emprestimos/auto-equity)
--
-- * integrada via API (financial-gateway → flowcredi-auto-equity-service.ts)
-- * rules.flowcredi_product = "auto_equity" ativa a jornada no gateway
-- * a FlowCredi não tem simulador de auto: a jornada só envia o lead (POST /auto/lead)
-- * parcelas: lista fechada do lead (12 a 60 meses); crédito até o valor do veículo
--   menos o saldo devedor (regra nossa, a confirmar com a FlowCredi)
-- * aceites da FlowCredi (iguais aos de imóveis e home equity)
-- * painel lateral, rodapé e FAQs; o parceiro deixa de ser a Creditas
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
      "flowcredi_product": "auto_equity"
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
        "template_text": "Autorizo a consulta das minhas informações no {SCR (Banco Central)} e em órgãos de proteção ao crédito para análise da solicitação.",
        "links": [{ "text": "SCR (Banco Central)", "type": "tooltip", "tooltip_text": "Autoriza a FlowCredi e as instituições financeiras parceiras a consultar o Sistema de Informações de Crédito (SCR) do Banco Central e órgãos de proteção ao crédito (Serasa, SPC, Boa Vista, Quod), exclusivamente para avaliar sua solicitação de crédito." }],
        "effective_date": "2026-09-30"
      }
    ]$json$::jsonb,
    page_faqs = $json$[
      { "position": 1, "bullets": [], "question": "Quanto posso pegar e em quanto tempo pago?", "answer": "Você escolhe o valor, limitado ao valor do veículo menos o saldo devedor, se houver, e paga em 12 a 60 parcelas. O valor final depende da análise de crédito." },
      { "position": 2, "bullets": [], "question": "A solicitação já é uma aprovação de crédito?", "answer": "Não. A solicitação leva seus dados e os do veículo para análise. Taxa, valor e prazo são definidos pela instituição financeira depois da análise de crédito e da avaliação do veículo." },
      { "position": 3, "bullets": [], "question": "Posso continuar usando o veículo?", "answer": "Sim. O veículo fica alienado à instituição financeira como garantia até a quitação, mas continua com você." },
      { "position": 4, "bullets": [], "question": "Preciso dizer ao banco como vou usar o dinheiro?", "answer": "Você informa o motivo principal na solicitação, mas o uso do dinheiro é livre: na Superbid ou onde preferir." },
      { "position": 5, "bullets": ["Um especialista da FlowCredi entra em contato pelo celular ou e-mail do seu cadastro", "Sua solicitação é analisada pelas instituições parceiras", "Com o crédito aprovado, o veículo é avaliado", "Você assina o contrato e o veículo fica alienado como garantia", "O valor do crédito é liberado na sua conta"], "question": "O que acontece depois que eu envio a solicitação?", "answer": "Depois do envio, o caminho até a liberação do crédito é este:" },
      { "position": 6, "bullets": [], "question": "Por que preciso aceitar os termos da FlowCredi?", "answer": "Para enviar a solicitação, a Wallet sbX compartilha seus dados de cadastro com a FlowCredi, que encaminha a análise às instituições financeiras parceiras. Por isso os termos e a autorização de consulta ao SCR são pedidos antes do envio." }
    ]$json$::jsonb,
    page_configs = $json${
      "offer_panel": {
        "partner": { "name": "FlowCredi", "label": "Parceria com:" },
        "headline": { "parts": [
          { "text": "Use seu veículo como ", "type": "normal" },
          { "text": "garantia", "type": "highlight" },
          { "text": " e invista na Superbid pagando em até 60 meses", "type": "normal" }
        ]},
        "description": { "parts": [
          { "text": "Você acessa ", "type": "normal" },
          { "text": "crédito com taxas menores", "type": "bold" },
          { "text": " e continua usando seu veículo.", "type": "normal" }
        ]},
        "benefits": [
          { "icon": "Clock", "title": "Até 60 meses para pagar", "description": "Escolha a parcela que cabe no seu bolso" },
          { "icon": "Banknote", "title": "Crédito para investir", "description": "Na Superbid ou onde preferir, você escolhe" },
          { "icon": "ShieldCheck", "title": "Análise com especialistas", "description": "A FlowCredi busca a melhor condição para você" }
        ]
      },
      "footer": {
        "template_text": "© 2026 Wallet sbX. Todos os direitos reservados. Somos uma plataforma online que facilita o acesso a produtos e serviços financeiros ofertados por empresas parceiras. O crédito com garantia de veículo é intermediado pela {FLOWCREDI PROMOTORA DE SERVICOS LTDA} (CNPJ 31.520.218/0001-09), correspondente bancário que encaminha a solicitação às instituições financeiras parceiras, responsáveis pela análise e concessão do crédito.",
        "links": [{ "text": "FLOWCREDI PROMOTORA DE SERVICOS LTDA", "url": "https://flowcredi.com.br" }]
      }
    }$json$::jsonb,
    updated_at = timezone('utc', now())
where config_type = 'PRODUCT' and lookup_id = 7 and partner_id = 3;
