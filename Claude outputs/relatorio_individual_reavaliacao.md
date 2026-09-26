# Reavaliação individual — 17 achados, direto no código atual

Reli o código de cada um dos 17 achados que você foi sinalizando (não o laudo — o repositório, hoje). Formato: um cartão por achado, com o que já está feito, o que falta, e uma linha de decisão para você aprovar ou não a execução do que falta.

**Ressalva que vale para todos os itens de banco (SBXW-11):** o laudo do pentest aponta o projeto Supabase `qadgbfhjtgufioxtyamq`; o único projeto que tenho acesso para consultar é `ldzutiojmcawhwdhojlo` ("wallet-sbx-financiamentos"). Onde a verificação depende do banco (GRANT/RLS), o resultado vale para esse projeto — pode não ser o mesmo ambiente do laudo.

---

### SBXW-15 — Curinga `"*"` anulava CORS e proteção de redirect

**Status: ✅ Resolvido.**
`_shared/security.ts` está na v4.0.0: o wildcard foi removido, `ALLOWED_DOMAIN_SUFFIXES` é uma lista fechada (localhost, ecossistema Lovable, `superbid.net`) e o próprio comentário do arquivo documenta a remoção.
**Falta fazer:** nada aqui. (A ressalva sobre os sufixos `lovable.app`/`lovableproject.com`/`lovable.dev` ainda estarem na lista é o achado separado SBXW-33 — não revisei esse ainda, ver lista no final.)
**Decisão:** nenhuma pendente.

---

### SBXW-09 — Perímetro de autenticação declarativo nunca era aplicado

**Status: ✅ Resolvido.**
`_shared/registry.ts` agora declara `authMode` real por função (`session`, `hmac`, `secret`, `staff-google-auth`, cada um com `enforcement` explícito), e `_shared/server.ts` (`withSecurity`) checa `requiresSecret`/`requiresHmac` antes do handler executar.
**Falta fazer:** nada.
**Decisão:** nenhuma pendente.

---

### SBXW-13 — `notification-system-message` aceitava requisição anônima

**Status: ✅ Resolvido.**
Consequência direta da correção de SBXW-09: `registry.ts` declara `authMode: { type: 'session', enforcement: 'wrapper' }` para essa função.
**Falta fazer:** nada.
**Decisão:** nenhuma pendente.

---

### SBXW-14 — `notification-dispatcher` rodava com service-role sem autenticação

**Status: ✅ Resolvido.**
`registry.ts` declara `requiresHmac: 'NOTIFICATION_DISPATCHER_SECRET'`, `enforcement: 'wrapper'`.
**Falta fazer:** nada.
**Decisão:** nenhuma pendente.

---

### SBXW-01 — Hook de geo autorizava por header arbitrário ou anon key pública

**Status: ✅ Resolvido.**
A rota antiga (`src/routes/hooks/enrich-loginhistory-geo.ts`) não existe mais. O slug `log-access` foi reaproveitado como worker de geo e agora exige `requiresHmac: 'LOGIN_GEO_RESOLVER_SECRET'` (via Vault), `enforcement: 'wrapper'` — mesmo padrão do dispatcher.
**Falta fazer:** nada no código. Só vale confirmar operacionalmente que o cron está apontando para o projeto certo (isso é o SBXW-10, que ainda não revisei).
**Decisão:** nenhuma pendente no código.

---

### SBXW-04 — Verificação de admin usava `ILIKE` sobre e-mail do próprio usuário

**Status: ✅ Resolvido.**
`manage-backoffice-users/index.ts:97`: `.eq("email", user.email.toLowerCase())` — igualdade exata. A segunda ocorrência (cliente) também não existe mais: `AuthContext.tsx` não consulta `backoffice_users` direto do front; foi movida para RPC server-side com `LOWER(email) = LOWER(v_caller_email)`.
**Falta fazer:** nada.
**Decisão:** nenhuma pendente.

---

### SBXW-28 — Token de handoff aceito como sessão em 3 funções

**Status: 🟡 Parcialmente resolvido — lacuna real e específica.**
`jwt.ts` agora assina sessão com `typ: "session"` e `verifySessionToken` rejeita quando `payload.typ` existe e é diferente de `"session"`. Só que o próprio código comenta que tokens **sem** `typ` continuam aceitos "por compatibilidade com legado" — e o token de handoff (`s2s.ts`, `signSigninParameters`) **não seta `typ`**, e usa a mesma env var de segredo (`JWT_SECRET`). Ou seja: o handoff token não é rejeitado pela checagem de `typ` (porque simplesmente não tem esse campo), só não teria `userId` preenchido — e isso hoje não é bloqueado, só some em uma string vazia (`String(payload.userId || "")`).
**Falta fazer:** rejeitar explicitamente em `verifySessionToken` quando `userId` vier vazio/ausente do payload — é a correção de menor custo e não exige janela de migração (diferente de forçar `typ` obrigatório em todo token, que quebraria tokens antigos em circulação).
**Decisão a tomar:** aprovar a adição de um `if (!payload.userId) return { valid: false, ... }` em `verifySessionToken` (jwt.ts). Baixo risco, sem quebra de compatibilidade.

---

### SBXW-32 — Regex do cookie de sessão sem âncora (fixação de sessão)

**Status: ❌ Não resolvido.**
`_shared/auth.ts:48`: `const match = cookieHeader.match(/session_token=([^;]+)/);` — exatamente a regex do laudo, ainda sem âncora. `evil_session_token=X; session_token=Y` continua podendo entregar o valor errado dependendo da ordem dos cookies.
**Falta fazer:** trocar por `/(?:^|;\s*)session_token=([^;]+)/`, ou (mais robusto) separar o header por `;` e comparar o nome do cookie por igualdade exata.
**Decisão a tomar:** aprovar a troca da regex em `_shared/auth.ts` — é uma linha, sem efeito colateral esperado (cookies legítimos sempre batem com a versão ancorada também).

---

### SBXW-22 — Open redirect no login (`redirect_uri`), logo após autenticação

**Status: ✅ Resolvido.**
`accounts.signin.tsx`: `validateSearch` já aplica um "Open Redirect Shield" (`sanitizeRedirectUri`) no contrato da rota — bloqueia `//` e URLs absolutas, não só no componente.
**Falta fazer:** nada.
**Decisão:** nenhuma pendente.

---

### SBXW-06 — Auditoria forjável: evento "blocked" aceito para e-mail arbitrário

**Status: ✅ Resolvido.**
A rota antiga `/api/loginhistory` não existe mais. Tudo migrado para a RPC `log_access_event`, que lê a identidade via `auth.email()` no servidor — nenhum tipo de evento (incluindo "blocked") aceita e-mail vindo do corpo da requisição.
**Falta fazer:** nada.
**Decisão:** nenhuma pendente.

---

### SBXW-12 — Open redirect no orchestrator (`target_url`)

**Status: ✅ Resolvido.**
`orchestrator/index.ts:474`: `payload.target_url = getSafeRedirectUrl(payload.target_url)` — sanitiza no servidor, já usando a allowlist estrita de SBXW-15.
**Falta fazer:** nada.
**Decisão:** nenhuma pendente.

---

### SBXW-07 — Open redirect em `financialGatewayGate` (`return_uri`)

**Status: ❌ Não resolvido.**
`financialGatewayGate.tsx:51`: `const targetReturnUrl = return_uri && return_uri !== "/" ? return_uri : "/";` — zero sanitização. Usado direto em `window.location.replace(targetReturnUrl)` (linha 97) e também no redirecionamento de sessão expirada (linha 81). Um `return_uri=https://atacante.com` passa sem barreira nenhuma — é literalmente o mesmo padrão que já foi corrigido em `accounts.signin.tsx` (SBXW-22) e no orchestrator (SBXW-12), só que aqui ainda não.
**Falta fazer:** aplicar a mesma função de sanitização (`sanitizeRedirectUri`/`getSafeRedirectUrl`) já usada nos outros dois pontos, aqui também.
**Decisão a tomar:** aprovar a mesma correção que já foi aplicada em SBXW-22/12, agora em `financialGatewayGate.tsx`. É reaproveitar código já existente e testado no projeto — risco baixo.

---

### SBXW-11 — GRANT de INSERT ao papel anônimo em 16/29 tabelas

**Status: ✅ Resolvido no projeto que consigo consultar.**
Query em `information_schema.role_table_grants` no projeto `ldzutiojmcawhwdhojlo`: zero linhas com `grantee='anon'` e `privilege_type='INSERT'` no schema `public`.
**Falta fazer:** nada de código. Só a ressalva do topo: confirmar se o ambiente que o laudo testou (`qadgbfhjtgufioxtyamq`) está no mesmo estado — não tenho acesso para checar isso.
**Decisão:** nenhuma pendente no projeto visível; se `qadgbfhjtgufioxtyamq` for um ambiente diferente (ex.: homolog/produção), vale a mesma checagem lá.

---

### SBXW-23 — Código morto `autoLoginProponentFromUrl` (CPF via URL)

**Status: ✅ Resolvido.**
`src/integrations/auth/proponent.ts` não existe mais no repositório; zero referências a `autoLoginProponentFromUrl` em `src/` ou `supabase/`.
**Falta fazer:** nada.
**Decisão:** nenhuma pendente.

---

### SBXW-30 — Segredo de produção gravado em texto claro no log

**Status: 🟡 Parcialmente resolvido.**
A linha específica que expunha o segredo (`notification-gateway/index.ts:27`, `debugLog("DEBUG: Secret recebido:", receivedSecret)`) não existe mais — o ponto concreto de exposição foi removido. Mas `_shared/logger.ts:129` (`deepRedact`) continua com a mesma lacuna estrutural: `if (obj === null || typeof obj !== 'object') return obj;` — uma string solta passada ao `debugLog` ainda sai sem máscara, em qualquer outro ponto do código que venha a fazer isso.
**Falta fazer:** (1) corrigir `deepRedact` para tratar string solta como não confiável por padrão — fecha a classe do problema, não só o ponto já removido; (2) confirmar operacionalmente se `NOTIFICATION_GATEWAY_SECRET` foi rotacionado (isso não aparece no código, é ação de infraestrutura separada).
**Decisão a tomar:** aprovar o ajuste do `deepRedact` (baixo risco, é só logging) e confirmar com quem administra os secrets do Supabase se a rotação já ocorreu.

---

### SBXW-18 — Respostas das edge functions sem CSP/X-Frame-Options/Referrer-Policy

**Status: ❌ Não resolvido.**
Não encontrei `Content-Security-Policy`, `X-Frame-Options` nem `Referrer-Policy` em nenhuma edge function.
**Falta fazer:** adicionar os três headers nas respostas, centralizado no wrapper compartilhado (`_shared/server.ts`) para cobrir as 14 functions de uma vez.
**Decisão a tomar:** aprovar a inclusão desses headers no wrapper. É defesa em profundidade — reduz o proveito de um XSS ou redirect mesmo que outra camada falhe; risco de regressão é baixo (headers de resposta, não mudam comportamento funcional), mas vale testar que nada no front depende de embutir essas páginas em iframe.

---

### SBXW-36 — Evento "blocked" enviado a função inexistente (404, nunca gravado)

**Status: ✅ Resolvido.**
`src/lib/login-history.ts` aponta para `/rest/v1/rpc/log_access_event` (RPC real), não mais para a função `login-history` que não existe. Consequência direta da migração de SBXW-06.
**Falta fazer:** nada.
**Decisão:** nenhuma pendente.

---

## Resumo para a reunião de aprovação

**Resolvidos (11 de 17), sem ação pendente:** SBXW-01, 04, 06, 09, 11 (no projeto visível), 12, 13, 14, 15, 22, 23, 36 — ok, isso é 12, deixa eu contar certo: 01, 04, 06, 09, 11, 12, 13, 14, 15, 22, 23, 36 = **12 resolvidos**.

**Parcialmente resolvidos (2), com correção pequena e pontual pendente:**
- SBXW-28 — adicionar rejeição explícita quando `userId` vier vazio em `verifySessionToken`.
- SBXW-30 — corrigir a lacuna estrutural do `deepRedact` para escalares + confirmar rotação do segredo.

**Ainda não resolvidos (3):**
- SBXW-32 — ancorar a regex do cookie de sessão.
- SBXW-07 — sanitizar `return_uri` em `financialGatewayGate.tsx` (reaproveitando a função já usada em SBXW-22/12).
- SBXW-18 — adicionar CSP/X-Frame-Options/Referrer-Policy no wrapper.

Todas as 5 pendências acima (2 parciais + 3 abertas) são mudanças pequenas e localizadas — nenhuma exige redesenho de arquitetura. Se você aprovar, são candidatas naturais para uma única PR de "fechamento pentest — lote 1".

## O que ainda não revisei

Não entrou nesta leva: SBXW-02, 03, 05, 08, 10, 16, 17, 19, 20, 21, 24, 25, 26, 27, 29, 31, 33, 34, 35 (19 achados). Se quiser, faço o mesmo processo — reler o código atual e não o laudo — para esses também.
