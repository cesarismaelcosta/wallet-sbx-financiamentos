# Ponto de controle — FlowCredi (2026-11-20)

## Aplicado
- Dev: código e banco com tudo até `lovable_sync_2026-11-20_flowcredi_padroes_v2`.
- Homol: zips `lovable_sync_2026-11-20_flowcredi_processos` + `lovable_sync_2026-11-20_flowcredi_padroes_v2`.

## Estado
- Envio pela API de Processos (POST /processos) nos 3 produtos; processoId em `external_operation_id`.
- Ambiente por `integration_details.partner_environment` (FlowCredi staging em dev/homol; FANDI production).
- Aceites: link `terms` (terms_url) + `terms_type`; versão exibida enviada à API de Termos.
- Parceiro 3 roteado pelo produto: 1 Imóveis, 6 Home Equity, 7 Car Equity.
- Limites só no `rules`: Imóveis (subcategory_limits, min/max_property_value, 90%/10 mil/36–420);
  Home Equity (60/40/30%, Galpão/Rural bloqueados, 12–240, mín. R$ 10 mil, imóvel ≥ R$ 50 mil);
  Car Equity (max_vehicle_age_years 11, UFs SP/PR/MG/SC/RS, min_vehicle_value 30000, até 70 meses).
- Car Equity tela 1: placa, UF, ano de fabricação. Tela 2: banco do financiamento (alfabético + "Outros").
- Banco fixo: `rules.fixed_bank` (caso por vendedor = linha SELLER no orchestrator).
- Webhook: `financial-gateway-webhook/flowcredi` (confirma na Process Bank API; sem secret nova).

## Testado em dev
- Imóveis e Home Equity: processo 201, aceites 201.

## Pendente
1. Apagar em dev: `financial-gateway-webhook/flowcredi-webhook-service.ts` e `shared/flowcredi/flowTerms.tsx`.
2. `npx tsc --noEmit` + deploy em dev; repetir envios (Car Equity ainda não enviado).
3. Webhook: assinatura de staging no Portal + aviso de teste.
4. Mensagem à FlowCredi: 130%/120 meses no site; Galpão/Rural; mínimo da esteira; 2 leads de teste.
