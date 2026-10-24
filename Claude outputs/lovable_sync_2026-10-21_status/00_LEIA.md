# Sincronização · etapas e status (2026-10-21)

## 1. Banco (SQL Editor), nesta ordem
1. supabase/migrations/20261025120000_stage_status_types.sql
2. supabase/migrations/20261025130000_backoffice_status_functions.sql
3. supabase/migrations/20261025140000_status_com_ofertas.sql (renomeia "Com/Sem condições" para "Com/Sem ofertas")

A primeira recria stage_types e status_types e reclassifica os dados já gravados
(um único bloco: se der erro, nada muda). Rode as duas ANTES do deploy.

## 2. Lovable
Cole os prompts da pasta prompts/ na ordem (01, 02...). Cada um já traz o caminho e o
código completo. Os mesmos arquivos estão em arquivos/, nos caminhos do repositório.

## 3. Deploy
financial-gateway

## 4. Conferir
- Backoffice > Simulações: cartões Total, Simulações com condições, Leads enviados,
  Pré-aprovadas e Volume (leads + pré-aprovadas); etiquetas com os status novos.
- Aba lateral de uma simulação FlowCredi (imóveis/home equity): Pedido, Garantia,
  Condições por banco e Lead.
- Uma simulação nova de cada jornada grava a etapa/status certos.
