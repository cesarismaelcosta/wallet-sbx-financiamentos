# Lote 1 de correções — pentest, 5 achados

Aplicado direto no ambiente de dev (via bridge local, repo `wallet-sbx-financiamentos`). Nada foi tocado em homologação/produção — replicar manualmente lá, usando o patch anexado como referência exata do diff.

## O que foi corrigido

**SBXW-32 — Fixação de sessão por regex de cookie sem âncora**
`supabase/functions/_shared/auth.ts`. Trocada a extração do cookie `session_token` (que casava com qualquer cookie terminado nesse nome, ex. `evil_session_token`) por comparação de nome exato após separar o header `Cookie` por `;`.

**SBXW-07 — Open redirect em `financialGatewayGate` (`return_uri`)**
`src/routes/financialGatewayGate.tsx`. Adicionada a mesma sanitização já usada em `accounts.signin.tsx` (SBXW-22): só aceita caminho relativo (`/algo`), recusa URL absoluta ou `//`. Validado no contrato da rota (`validateSearch`), não só no componente — a rota é acessível direto por URL.

**SBXW-17 — IP de auditoria resolvido por header do cliente**
`supabase/functions/_shared/infrastructure.ts`. Invertida a ordem de precedência: `cf-connecting-ip` (definido pela borda Cloudflare, não falsificável) agora vem primeiro; `x-client-ip` caiu para o fallback, onde só é usado quando os headers de borda estão ausentes — que é exatamente o caso das chamadas internas server-to-server que o próprio `financial-gateway-gate` faz (e é por isso que esse header existe).

**SBXW-29 — Origin/Referer usado para resolver a origem confiável do front**
`supabase/functions/financial-gateway-gate/index.ts`. A função `respondWithError` não usa mais `Origin`/`Referer` do requisitante pra montar a URL de retorno. Agora é `FRONTEND_URL` (variável de servidor) primeiro, com `safeReturnUri` (já sanitizado via allowlist) como segunda opção — nunca mais um header bruto do cliente.

**SBXW-19 — Exceção crua devolvida ao cliente**
`supabase/functions/_shared/server.ts`. O catch-all do wrapper compartilhado (alcançado só por bug real, não por erro de negócio esperado) não devolve mais `err.message` ao cliente. Agora devolve mensagem genérica + um `correlationId` (UUID); o detalhe completo do erro continua indo pro log do servidor, correlacionável pelo mesmo ID.

## O que NÃO foi tocado nesta rodada (fora do escopo pedido)

- Os demais achados da mesma família de open-redirect que ainda estão pendentes (SBXW-33, SBXW-25) — você não incluiu esses dois nesta leva.
- O `err.message` cru pode ainda aparecer em pontos que não passam por este wrapper central (o laudo menciona 15 pontos no total) — só corrigi o ponto central citado.
- Nenhuma rotação de segredo, nenhuma alteração de banco (RLS/GRANT), nenhum arquivo de configuração — só os 5 arquivos de código listados abaixo.

## Verificação feita

- `tsc --noEmit` no projeto: nenhum erro novo introduzido pela alteração em `financialGatewayGate.tsx` (os erros que o comando já apontava são todos pré-existentes, em arquivos não tocados aqui).
- As 4 edições nas edge functions (Deno) foram feitas por substituição exata de texto (com verificação de que o trecho antigo existia uma única vez antes de substituir) — não há Deno instalado no ambiente pra rodar `deno check`, então a verificação de sintaxe foi por leitura manual do resultado final de cada arquivo.
- **Recomendo rodar o deploy dessas 5 functions em dev e testar manualmente antes de levar pra homologação** — principalmente SBXW-29 e SBXW-17, que mudam o comportamento de resolução de origem/IP em fluxos reais (login, erro de gateway).

## Arquivos alterados

1. `supabase/functions/_shared/auth.ts`
2. `src/routes/financialGatewayGate.tsx`
3. `supabase/functions/_shared/infrastructure.ts`
4. `supabase/functions/financial-gateway-gate/index.ts`
5. `supabase/functions/_shared/server.ts`

Patch com o diff completo dos 5 arquivos: `pentest_fixes_lote1.patch` (anexado).
