# Relatório completo — todos os 36 achados, por status e criticidade

*(Atualizado após o lote 2 de correções aplicado nesta sessão: SBXW-28, 08 e 30 saíram de "parcial" para "resolvido"; SBXW-18 saiu de "não resolvido" para "resolvido". Lote 1 (sessão anterior a este): SBXW-32, 07, 17, 29 e 19 resolvidos; SBXW-31 parcialmente resolvido.)*

Mesma régua de criticidade: **Crítica** (prioridade 1), **Alta** (prioridade 2), **Média** (prioridade 3), **Baixa** (prioridade 4), mais o rótulo **Processo** para os dois achados sobre verificabilidade repo↔ambiente (SBXW-26/27).

**Ressalva de sempre:** o laudo aponta o projeto Supabase `qadgbfhjtgufioxtyamq`; eu só tenho acesso para consultar `ldzutiojmcawhwdhojlo` ("wallet-sbx-financiamentos"). Checagens de código valem para o repositório; checagens de banco (GRANT/RLS) valem só para o projeto que consigo consultar.

---

## ✅ Resolvidos (24)

| Nº | Criticidade | Achado | Evidência |
|---|---|---|---|
| SBXW-15 | Crítica | Curinga `"*"` anulava CORS e proteção de redirect | `_shared/security.ts` v4.0.0 — allowlist estrita por sufixo |
| SBXW-09 | Crítica | Perímetro de autenticação declarativo nunca era aplicado | `registry.ts`/`server.ts` — `authMode` real, checado antes do handler |
| SBXW-13 | Crítica | `notification-system-message` anônima | Consequência de SBXW-09 |
| SBXW-14 | Crítica | `notification-dispatcher` (service-role) sem autenticação | `requiresHmac` + `enforcement: wrapper` |
| SBXW-01 | Crítica | Hook de geo autorizava por anon key pública | Rota antiga removida; slug atual exige HMAC via Vault |
| SBXW-04 | Crítica | Admin check via `ILIKE` sobre e-mail do usuário | `.eq()` normalizado, servidor e cliente |
| SBXW-32 | Crítica | Regex do cookie de sessão sem âncora (fixação de sessão) | **Corrigido nesta sessão** — `_shared/auth.ts`: extração agora compara nome exato do cookie (`split(";")` + `startsWith("session_token=")`), não mais regex sem âncora |
| SBXW-28 | Crítica | Token de handoff (`s2s.ts`) aceito como sessão válida com `userId` vazio | **Corrigido nesta sessão** — `_shared/jwt.ts`: `verifySessionToken` agora rejeita quando `userId` vem vazio/ausente, além da checagem de `typ` já existente |
| SBXW-22 | Alta | Open redirect no login (`redirect_uri`) pós-autenticação | "Open Redirect Shield" no contrato da rota |
| SBXW-06 | Alta | Auditoria forjável no evento "blocked" | RPC lê identidade via `auth.email()`, sem exceção |
| SBXW-12 | Alta | Open redirect no orchestrator (`target_url`) | `getSafeRedirectUrl(...)` no servidor |
| SBXW-02 | Alta | XSS refletido via `environment` no `financial-gateway-gate` | Ponte HTML+`<script>` inline removida — cookie `HttpOnly` (AJAX) ou redirect 302 com token no fragmento (não-AJAX) |
| SBXW-07 | Alta | Open redirect em `financialGatewayGate` (`return_uri`) | **Corrigido nesta sessão** — `return_uri` sanitizado no contrato da rota (`validateSearch`), mesmo critério de SBXW-22/12 |
| SBXW-17 | Alta | IP de auditoria/rate-limit resolvido por header do cliente | **Corrigido nesta sessão** — `_shared/infrastructure.ts`: `cf-connecting-ip` agora vem primeiro; `x-client-ip` caiu para fallback (propagação interna) |
| SBXW-29 | Alta | Origin/Referer usado para resolver a origem confiável do front | **Corrigido nesta sessão** — `financial-gateway-gate/index.ts`: `frontendOrigin` agora vem de `FRONTEND_URL` primeiro; header do cliente removido da resolução |
| SBXW-11 | Média | GRANT de INSERT anônimo em 16/29 tabelas | Zero grants de INSERT para `anon` no schema `public` |
| SBXW-23 | Média | Código morto `autoLoginProponentFromUrl` | Arquivo `proponent.ts` não existe mais |
| SBXW-24 | Média | Config de segurança gravável direto do navegador (só RLS) | Só `postgres`/`service_role` têm qualquer grant nas 3 tabelas — `anon`/`authenticated` sem privilégio algum |
| SBXW-08 | Média | Sem allowlist explícita de algoritmo no `jwtVerify` | **Corrigido nesta sessão** — `_shared/jwt.ts`: `{ algorithms: ["HS256"] }` explícito nas duas verificações; estendido também a `_shared/s2s.ts` (mesma secret). *Resta uma melhoria não crítica, fora do escopo desta correção: sessão usa `userId` sequencial do provedor upstream, sem ID opaco/revogável — não é vulnerabilidade, é robustez.* |
| SBXW-36 | Baixa | Evento "blocked" enviado a função 404 | Migrado para RPC real |
| SBXW-10 | Baixa | Token de outro projeto versionado em texto puro | Migration não existe mais; nenhum JWT em `supabase/migrations/` |
| SBXW-19 | Baixa | Exceção crua devolvida ao cliente no fallback do wrapper | **Corrigido nesta sessão** — `_shared/server.ts`: catch-all devolve mensagem genérica + `correlationId`, não mais `err.message` |
| SBXW-30 | Baixa | Segredo em texto claro no log; `deepRedact` não examinava escalares | **Corrigido nesta sessão** — `_shared/logger.ts`: `deepRedact` agora redige string solta por padrão (`'[REDACTED:scalar-string]'`). *Pendente fora do código: confirmar com quem administra os secrets do Supabase se `NOTIFICATION_GATEWAY_SECRET` já foi rotacionado.* |
| SBXW-18 | Baixa | Nenhuma edge function emitia CSP/X-Frame-Options/Referrer-Policy | **Corrigido nesta sessão** — `_shared/server.ts`: os 3 headers agora saem centralizados em `corsHeaders`, cobrindo as 14 functions |

---

## 🟡 Parcialmente resolvidos (2) — com plano

### SBXW-35 — Média
**O que foi feito:** backend (`financial-gateway-gate`) entrega cookie `HttpOnly` sempre, e só devolve o token no corpo quando front e API não compartilham domínio-raiz.
**O que falta:** no front, `USE_COOKIE` continua `false` hoje (front em `lovable.app`, API em `supabase.co`, raízes diferentes) — token cai em `sessionStorage`.
**Plano:** servir a API sob o mesmo domínio-raiz do front, ou reforçar CSP (SBXW-18) enquanto isso não ocorrer.

### SBXW-31 — Baixa
**O que foi feito:** **corrigido nesta sessão** — versão do `postgres.js` fixada em `v3.4.8`, tanto no import direto (`_shared/db.ts`) quanto no alias do `deno.json` da raiz.
**O que falta:** gerar e versionar o `deno.lock`. Não foi possível fazer isso aqui: Deno CLI não está instalado no ambiente do bridge, e o egress está bloqueado para `deno.land`, `github.com`, `jsr.io` e `registry.npmjs.org` tanto no bridge quanto no container — gerar um lock file com hash inventado seria pior que não ter nenhum (o Deno usa esse hash pra verificar integridade).
**Plano:** rodar `deno cache --lock=deno.lock --lock-write supabase/functions/_shared/db.ts` em algum ambiente com Deno instalado e rede liberada (sua máquina fora deste sandbox, ou o pipeline de CI/deploy), e comitar o arquivo gerado.

---

## ❌ Não resolvidos (7)

### SBXW-33 — Alta
**Allowlist ainda aceita qualquer subdomínio de hospedagem compartilhada.** `_shared/security.ts:43-45` — `lovable.app`, `lovableproject.com`, `lovable.dev` continuam como sufixos genéricos.
**Plano:** trocar por hostnames exatos de preview conhecidos; tirar `localhost`/`127.0.0.1` de produção.

### SBXW-25 — Alta
**Rota `/sandbox` sem restrição de ambiente.** Não encontrei checagem de `MODE`/ambiente de build no arquivo da rota — nada indica que ela foi excluída do bundle de produção.
**Plano:** confirmar se a rota é servida em produção hoje; se sim, restringir por ambiente ou remover do build.

### SBXW-34 — Média
**Login de produção ainda usa `grant_type=password`.** `sbx-auth/index.ts:121` — inalterado.
**Plano:** migrar para Authorization Code + PKCE via `sbx-auth-exchange`, que já existe e hoje só serve o sandbox.

### SBXW-20 — Baixa
**Atributo `Secure` do cookie condicionado a campo do corpo.** `sbx-auth/index.ts:308-309` e `sbx-auth-exchange/index.ts:100` — `isProd = environment === "production"` (campo do cliente) decide o `Secure`.
**Plano:** marcar `Secure` sempre, incondicionalmente.

### SBXW-21 — Baixa
**Consulta de geolocalização em texto claro.** `_shared/infrastructure.ts:149` — ainda `http://ip-api.com/...` (HTTP puro), IP interpolado direto na URL.
**Plano:** decisão de privacidade/LGPD primeiro; se mantida, TLS + codificação do valor.

### SBXW-26 e SBXW-27 — Processo
**Divergência repo↔ambiente / caminho de auth não documentado.** Nenhum mecanismo de CI/CD ou verificação de drift encontrado no repositório.
**Plano:** ainda vale como pré-requisito de processo. Antes de fechar qualquer item deste relatório como "corrigido em produção", confirmar que o deploy publicou o código atual.

---

## ❓ Não verificável só pelo código (3)

- **SBXW-05** (cadastro público aberto) — configuração do provedor de Auth (painel Supabase/GoTrue), não aparece no repositório.
- **SBXW-16** (rate limit no `sbx-auth`) — há tratamento de resposta `429`, mas pode ser só a tradução de um 429 que já vem do provedor de identidade upstream. Precisaria de teste ao vivo.
- **SBXW-03** (HMAC do webhook não cobre o corpo) — função foi reestruturada (assinatura agora vem de segmentos do path via `fandi-service.ts`) e não confirmei, só lendo o código, se o hash do corpo entra no material assinado.

---

## Contagem final

**24 resolvidos** (8 críticos, 7 altos, 4 médios, 5 baixos) · **2 parciais** (1 médio, 1 baixo) · **7 não resolvidos** (2 altos, 1 médio, 2 baixos, 2 de processo) · **3 não verificáveis**.

Não há mais nenhum item **crítico** pendente (parcial ou não resolvido) neste relatório.

## Prioridade prática pro que ainda falta

1. **SBXW-33 e SBXW-25** (altos, não resolvidos) — últimas duas pontas da família de open-redirect/origem confiável; as outras seis (15, 22, 12, 02, 07, 17, 29) já foram fechadas.
2. **SBXW-35** (médio, parcial) — depende de infraestrutura (mesmo domínio-raiz front/API), não é só código; SBXW-18 (já resolvido) é a mitigação que sobra enquanto isso não acontece.
3. **SBXW-31** (parcial) — só falta gerar o `deno.lock` fora deste ambiente.
4. **SBXW-34, 20, 21** — baratos, cabem numa mesma PR de hardening.
5. **SBXW-26/27** (processo) — decidir como garantir que repo e ambiente publicado sejam a mesma coisa, antes de assinar qualquer item deste relatório como "fechado em produção".
