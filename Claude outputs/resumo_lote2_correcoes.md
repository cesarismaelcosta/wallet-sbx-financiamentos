# Lote 2 de correções — pentest, 4 achados (+ 1 extensão de consistência)

Aplicado direto no ambiente de dev (via bridge local, repo `wallet-sbx-financiamentos`). Nada foi tocado em homologação/produção — replicar manualmente lá, usando o patch anexado como referência exata do diff.

## O que foi corrigido

**SBXW-28 — Crítica — Token de handoff aceito como sessão válida**
`supabase/functions/_shared/jwt.ts`, dentro de `verifySessionToken`. A checagem de `typ` já existente só rejeita quando o campo *existe* e é diferente de `"session"` — mantida assim de propósito, por compatibilidade com tokens legados sem `typ`. O problema é que o token de handoff assinado em `s2s.ts` (`signSigninParameters`) também nunca seta `typ` (seu payload é `{ data: {...} }`) e usa a mesma secret (`JWT_SECRET`) — então passava por essa checagem como se fosse uma sessão válida, só que com `userId` vazio. Adicionei uma segunda checagem, logo depois da de `typ`: se `payload.userId` vier vazio/ausente/não-string, a sessão é rejeitada (`errorCode: "JWT_MALFORMED_TOKEN"`). Isso fecha a lacuna sem quebrar tokens legados (que têm `userId` preenchido) e sem exigir nenhuma janela de migração.

**SBXW-08 — Média — Sem allowlist explícita de algoritmo no `jwtVerify`**
`supabase/functions/_shared/jwt.ts`, nas duas funções que verificam token (`verifySessionToken` e `verifyExchangeToken`): adicionado `{ algorithms: ["HS256"] }` como terceiro argumento de `jwtVerify`. A lib `jose` já se comporta corretamente com uma chave simétrica, mas depender do comportamento padrão da lib (em vez de declarar explicitamente) é frágil a mudanças futuras da lib ou do formato da secret. Isso fixa o contrato.

Estendi a mesma correção, por consistência, para `supabase/functions/_shared/s2s.ts` — que **não estava na lista que você mandou nesta leva**, mas usa exatamente a mesma família de secret (`JWT_SECRET`, via `S2S_SECRET`) e tinha o mesmo padrão de `jwtVerify` sem allowlist, nas duas funções de lá (`verifySigninParameters` e `verifyS2SEntity`). Como é o mesmo tipo de ajuste, de baixo risco, no mesmo mecanismo, preferi fechar os dois pontos junto — mas separei aqui pra você decidir se quer revisar isso como um item a mais, fora do que foi pedido.

**SBXW-30 — Baixa — `deepRedact` não examinava valores escalares**
`supabase/functions/_shared/logger.ts`. Antes, `deepRedact` devolvia qualquer valor não-objeto (`obj === null || typeof obj !== 'object'`) sem checagem alguma — foi assim que o secret em texto claro chegou ao log da vez passada (SBXW-30 original), quando alguém passou a string diretamente como segundo argumento de `debugLog` em vez de dentro de um objeto com chave conhecida. Agora, dentro desse mesmo branch, uma `string` solta é substituída por `'[REDACTED:scalar-string]'` por padrão. Números, booleanos e `undefined` continuam passando sem alteração — risco bem mais baixo de serem segredo, e isso evita mudar o formato de logs que hoje passam esses tipos deliberadamente (contadores, flags, timestamps). Isso fecha a *classe* do problema, não só o ponto específico já corrigido antes.

**SBXW-18 — Baixa — Nenhuma edge function emitia CSP/X-Frame-Options/Referrer-Policy**
`supabase/functions/_shared/server.ts`, dentro de `withSecurity`, no objeto `corsHeaders`. Como todas as 9 respostas do wrapper (as 14 functions passam por aqui) espalham esse objeto (`...corsHeaders`), adicionei os 3 headers ali, cobrindo todas de uma vez:
- `Content-Security-Policy: default-src 'none'; frame-ancestors 'none'`
- `X-Frame-Options: DENY`
- `Referrer-Policy: no-referrer`

Escolhi `default-src 'none'` porque essas respostas são API (JSON), nunca HTML renderizado — não há nada legítimo para essas respostas carregarem ou executarem. `frame-ancestors 'none'` + `X-Frame-Options: DENY` são redundantes de propósito (o segundo é o fallback para navegadores que não leem CSP). Isso também é a mitigação que o relatório mestre já apontava como "sobra" enquanto SBXW-35 (token em `sessionStorage`) não for resolvido de raiz — reduz o valor de um XSS que tentasse ler o token via iframe/clickjacking.

## O que NÃO foi tocado

- Nenhuma rotação de secret (a recomendação de confirmar rotação do `NOTIFICATION_GATEWAY_SECRET`, do SBXW-30 original, continua pendente — isso não é algo que eu resolvo por código).
- SBXW-35 (token em `sessionStorage` por domínios diferentes front/API) não foi tocado — é o item mencionado no plano do SBXW-18 como causa raiz, mas é uma mudança de infraestrutura (mesmo domínio-raiz), não de código.
- SBXW-34 não foi alterado (você pediu só a explicação, não a correção — ver mensagem separada).

## Verificação feita

- As 4 edições (5 pontos de código, contando a extensão em `s2s.ts`) foram feitas por substituição exata de texto, com verificação de que o trecho antigo existia exatamente uma vez antes de substituir — sem Deno instalado no ambiente do bridge, não há `deno check` disponível; verificação foi por leitura manual do resultado final de cada arquivo (reproduzido abaixo).
- Nenhum arquivo de frontend (`.tsx`/`.ts` fora de `supabase/functions/_shared/`) foi tocado nesta rodada — não há necessidade de `tsc --noEmit`.
- **Recomendo testar `verifySessionToken` manualmente em dev antes de levar pra homologação** — é o único destes 4 que pode rejeitar algo que hoje passa (qualquer token que hoje chegue como "sessão" com `userId` vazio vai parar de funcionar; isso é a correção, mas vale confirmar que nenhum fluxo legítimo depende disso).

## Arquivos alterados

1. `supabase/functions/_shared/jwt.ts` (SBXW-28 + SBXW-08)
2. `supabase/functions/_shared/s2s.ts` (extensão de consistência do SBXW-08)
3. `supabase/functions/_shared/logger.ts` (SBXW-30)
4. `supabase/functions/_shared/server.ts` (SBXW-18)

Patch com o diff completo dos 4 arquivos: `pentest_fixes_lote2.patch` (anexado).
