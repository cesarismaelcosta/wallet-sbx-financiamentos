# Pendências de tipagem — Supabase edge functions (25/10/2026)

Conferência: `deno check` strict (config do projeto), nas 15 edge functions.
Limitação: os tipos reais do postgres.js e do supabase-js não baixam no ambiente do Claude;
erros que dependem deles só aparecem no Lovable / VS Code (ex.: logos FlowCredi, corrigido em `fix_logos`).

## Zips para homol (ordem)
1. lovable_sync_2026-10-25_layout.zip
2. lovable_sync_2026-10-25_simular_novamente.zip
3. lovable_sync_2026-10-25_tipos_flowcredi.zip
4. lovable_sync_2026-10-25_tipos_gateway_unico.zip  (tipos_gateway e tipos_gateway2: descartar)
5. lovable_sync_2026-10-25_tipos_shared.zip
6. lovable_sync_2026-10-25_fix_logos.zip  (flowcredi-service.ts:310 — erro apontado pelo Lovable)

## 14 erros de tipo (já existiam; nenhum em financial-gateway, orchestrator ou _shared)

| Arquivo:linha | Código | Problema |
|---|---|---|
| financial-gateway-gate/index.ts:218 | TS2561 | `document_rg` não existe em `BFFUserProfile` |
| financial-gateway-gate/index.ts:247 | TS2561 | `document_rg` não existe em `BFFUserProfile` |
| financial-gateway-gate/index.ts:280 | TS2345 | `BFFUserProfile` não aceito por `signS2SEntity` (falta index signature) |
| sbx-auth/index.ts:215 | TS2561 | `document_rg` não existe em `BFFUserProfile` |
| sbx-auth/index.ts:252 | TS2345 | `BFFUserProfile` não aceito por `signS2SEntity` |
| sbx-auth-exchange/index.ts:81 | TS2345 | `string \| undefined` onde a função exige `string` |
| sbx-auth-exchange/index.ts:159 | TS2561 | `document_rg` não existe em `BFFUserProfile` |
| sbx-auth-exchange/index.ts (generateExchangeToken) | TS2345 | faltam `userName` e `login` no objeto passado |
| log-access/index.ts:197 | TS18046 | `row` é `unknown` |
| log-access/index.ts:208 | TS18046 | `row` é `unknown` |
| log-access/index.ts:211 | TS18046 | `row` é `unknown` |
| manage-backoffice-users/index.ts:186 | TS7006 | parâmetro `u` sem tipo |
| orchestrator-configs/index.ts:244 | TS2345 | `string \| null` onde a função aceita `string \| undefined` |
| sbx-offer-query/index.ts:208 | TS18048 | `auth` pode ser `undefined` |

Sugestão: começar pelo `document_rg` (adicionar ao tipo `BFFUserProfile`) — resolve 4 e destrava os 2 do `signS2SEntity`.

## `any` restantes: 63

### Conexão com o banco (sql/t do postgres) — 12
Só dá para tipar conferindo com os tipos reais do postgres.js (VS Code/Lovable).
- financial-gateway/persist-data.ts: 123, 185, 280 (t e retorno any[]), 316, 371, 615, 636
- orchestrator/persist-data.ts: 31, 52, 130 (Promise<any>[]), 235
- _shared/hydrate-data.ts: 172

### Demais functions — 51
**sbx-offer-query/index.ts (8):** 265, 289, 292, 307, 313, 318, 358, 408

**orchestrator-configs/index.ts (8):** 58 supabase, 59–62 eventId/sellerId/categoryId/productId, 113 supabase, 258 parseJson, 284 catch

**financial-gateway-gate/index.ts (7):** 84 payload, 236 doc, 247 doc, 249 phone, 390 catch, 442 originalPayload, 454 extraData

**financial-gateway-webhook/fandi-service.ts (7):** 58 sql, 63 infra, 64 rawPayload, 65 simulationDetails, 68 t, 218 simulationUpdate, 231 body

**sbx-auth/index.ts (5):** 205 doc, 215 doc, 217 phone, 262 orchestratorPayload, 337 catch

**sbx-auth-exchange/index.ts (4):** 149 doc, 159 doc, 161 phone, 211 catch

**sbx-offer/index.ts (3):** 110 groups/props, 150 fotos, 180 catch

**notification-dispatcher/index.ts (3):** 179 task, 232 catch, 255 catch

**sbx-event/index.ts (2):** 129 stage, 157 catch

**notification-gateway/index.ts (2):** 69 att, 135 catch

**notification-system-message/index.ts (1):** 60 catch

**manage-backoffice-users/index.ts (1):** 205 updateData

Obs.: sbx-auth, sbx-auth-exchange e financial-gateway-gate repetem o mesmo mapeamento do perfil (documents/phones);
sbx-offer e sbx-offer-query repetem o parse da oferta que já está tipado em _shared/hydrate-data.ts (UpstreamGroup/UpstreamPhoto).

## Pontos de comportamento (decidir antes de mexer)
1. Fandi webhook: sem `WEBHOOK_MASTER_SECRET` configurado, assina com chave vazia em vez de dar erro.
2. Orchestrator: autocura de sessão expirada nunca roda (hidratação sempre devolve `visitExists = true`).

Obs.: o arquivo é `_shared/gateKeeper.ts` (nome usado em homol e nos imports). Nos zips, usar esse nome.
