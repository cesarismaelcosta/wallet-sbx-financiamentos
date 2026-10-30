# Pendências de tipagem — Supabase edge functions (atualizado 25/10/2026)

## Zips para homol (ordem)
1. lovable_sync_2026-10-25_layout.zip
2. lovable_sync_2026-10-25_simular_novamente.zip
3. lovable_sync_2026-10-25_tipos_flowcredi.zip
4. lovable_sync_2026-10-25_tipos_gateway_unico.zip  (tipos_gateway e tipos_gateway2: descartar)
5. lovable_sync_2026-10-25_tipos_shared.zip
6. lovable_sync_2026-10-25_fix_logos.zip
7. lovable_sync_2026-10-25_functions_final.zip  (tipos_functions, token_transicao, exchange_nome_login e _v2: descartar)

## Erros de tipo: 0
Último resolvido em lovable_sync_2026-10-25_functions_final.zip: o sbx-auth-exchange (modo issue)
passa nome e login no token, como o gate. O modo issue não é chamado por nada deste repositório.

## `any` restantes: 14 — conexão com o banco (sql/t do postgres), mantidos de propósito
Conferido com os tipos reais do postgres.js v3.4.8: o tipo da transação (sql.begin) não aceita t`...`,
e os objetos gravados direto em colunas jsonb (${payload}::jsonb) não passam nos tipos da lib.
Tipar exigiria ~30 casts ou mudar a forma de gravar JSON (mudança de comportamento).
- financial-gateway/persist-data.ts: 7
- orchestrator/persist-data.ts: 4
- financial-gateway-webhook/fandi-service.ts: 2
- _shared/hydrate-data.ts: 1

## Decisão em aberto
- Orchestrator: autocura de sessão expirada nunca roda (hidratação sempre devolve `visitExists = true`).

## Decididos (sem mudança)
- Gate: token de transição na URL (#xt=) leva nome e login — mantido (60s, preso ao app e ao navegador,
  depois do #, URL limpa na chegada; é a única fonte de nome/login da sessão nesse fluxo).
- Fandi: WEBHOOK_MASTER_SECRET — o webhook já recusa sem o segredo; só conferir se está configurado
  no Supabase de dev e de homol.

Obs.: o arquivo é `_shared/gateKeeper.ts` (nome usado em homol e nos imports).
