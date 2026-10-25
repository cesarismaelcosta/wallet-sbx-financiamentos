# Pendências de tipagem — Supabase edge functions (atualizado 25/10/2026)

## Zips para homol (ordem)
1. lovable_sync_2026-10-25_layout.zip
2. lovable_sync_2026-10-25_simular_novamente.zip
3. lovable_sync_2026-10-25_tipos_flowcredi.zip
4. lovable_sync_2026-10-25_tipos_gateway_unico.zip  (tipos_gateway e tipos_gateway2: descartar)
5. lovable_sync_2026-10-25_tipos_shared.zip
6. lovable_sync_2026-10-25_fix_logos.zip
7. lovable_sync_2026-10-25_tipos_functions.zip
8. lovable_sync_2026-10-25_exchange_nome_login.zip  (token_transicao: descartar)

## Erros de tipo: 0
Último resolvido em lovable_sync_2026-10-25_exchange_nome_login.zip: o sbx-auth-exchange (modo issue)
passa nome e login no token, como o gate. O modo issue não é chamado por nada deste repositório.

## `any` restantes: 14 — todos da conexão com o banco (sql/t do postgres)
Só dá para tipar conferindo com os tipos reais do postgres.js (VS Code/Lovable).
- financial-gateway/persist-data.ts: 123, 185, 280, 316, 371, 615, 636
- orchestrator/persist-data.ts: 31, 52, 130, 235
- financial-gateway-webhook/fandi-service.ts: 75, 85
- _shared/hydrate-data.ts: 208

## Pontos de comportamento (decidir antes de mexer)
1. Fandi webhook: sem `WEBHOOK_MASTER_SECRET` configurado, assina com chave vazia em vez de dar erro.
2. Gate (financial-gateway-gate): o token de transição vai na URL (#xt=) com nome e login dentro
   (o JWT é legível). O sbx-auth-exchange já não inclui. Decidir se o gate também deixa de incluir.
3. Orchestrator: autocura de sessão expirada nunca roda (hidratação sempre devolve `visitExists = true`).

Obs.: o arquivo é `_shared/gateKeeper.ts` (nome usado em homol e nos imports).
