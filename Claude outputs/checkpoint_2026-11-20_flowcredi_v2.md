# Ponto de controle — FlowCredi (2026-11-20, fim do dia)

Regras do repositório: `AGENTS.md` (raiz). Ler antes de tudo.

## Aplicado
- Dev: código com tudo até `lovable_sync_2026-11-20_flowcredi_carequity_webhook_v3` (aplicado direto nos arquivos).
- Homol: `..._flowcredi_processos` + `..._flowcredi_padroes_v2`. **Pendente aplicar o v3.**

## Estado
- Envio pela API de Processos nos 3 produtos; `processoId` em `external_operation_id`.
- Aceites registrados na API de Termos ANTES do processo (só segue com 201); recusa = Falha (8).
- `gateway_response` gravado em `simulations.raw_payload` também na criação (Car Equity).
- Car Equity: tela 1 = placa, UF, ano (lista), valor, no seu nome, quitado; tela 2 = saldo, banco, crédito, parcelas, motivo.
- Troca de passo rola ao topo e foca o primeiro campo (`WizardEngine`).
- Webhook `financial-gateway-webhook/flowcredi`: valida assinatura HMAC (secret `FLOWCREDI_WEBHOOK_SECRET`, criada em dev e homol) + confirma na Process Bank API.

## Testado em dev
- Imóveis, Home Equity e Car Equity (quitado e não quitado): processo 201, aceites 201.

## Pendente
1. Apagar em dev: `supabase/functions/financial-gateway-webhook/flowcredi-webhook-service.ts` e
   `src/features/financial-hub/components/shared/flowcredi/flowTerms.tsx`.
2. Publicar `financial-gateway-webhook` em dev (validação da assinatura).
3. Aplicar o zip v3 em homol.
4. Mensagem à FlowCredi (pronta na conversa): Car Equity 130%/120 vs 100%/70; UFs (RJ?); Galpão/Rural;
   mínimo da esteira; liberar o token no Partner Webhook Dispatcher (403); 8 processos de teste para descartar.
5. Webhook: quando liberarem, criar assinaturas (partnerId `27014e41-34e6-43a6-86c8-7625d84a5f8b`,
   host `https://core.staging.flowcredi.com.br/partner-webhooks/v1`) com o secret do Supabase; pedir movimentação de teste.
6. Gerar novo token de Staging no Portal (o atual ficou exposto na conversa) e atualizar `FLOWCREDI_API_KEY` (dev e homol). Token atual vence ~15/02/2027.
7. Ainda não testados: Car Equity "Está no seu nome?" = Não; banco "Outros"; backoffice > editor de termos.
