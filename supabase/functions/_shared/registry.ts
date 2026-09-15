/**
 * @fileoverview Registro Central de Contratos de Borda (Perimeter Contract Registry)
 * @module _shared/registry
 *
 * ============================================================================
 * [ARQUITETURA & MOTIVAÇÃO]
 * ============================================================================
 * Este arquivo é a ÚNICA FONTE DE VERDADE sobre o contrato de borda de cada
 * Edge Function do ecossistema de Financiamentos e Seguros. Ele não contém
 * nenhuma lógica de execução — é somente dados declarativos (um mapa de
 * configuração). Quem LÊ esse mapa e efetivamente aplica as regras é o
 * wrapper `withSecurity` em `_shared/server.ts`.
 *
 * A separação existe de propósito: `registry.ts` responde "o que essa rota
 * exige?" (uma pergunta de configuração, fácil de auditar em um único
 * arquivo) e `server.ts` responde "como isso é verificado?" (a lógica de
 * enforcement, que não deveria mudar rota a rota). Um novo desenvolvedor
 * revisando segurança do sistema deveria conseguir ler só este arquivo e
 * responder "quais funções estão abertas ao público, quais exigem sessão de
 * usuário, quais exigem segredo de servidor, quais exigem HMAC" sem precisar
 * ler o código de cada Edge Function individualmente.
 *
 * ============================================================================
 * [REGRA DE OURO — FAIL-SAFE]
 * ============================================================================
 * Se uma função não estiver mapeada aqui (chave ausente em `FUNCTION_CONFIGS`),
 * o `withSecurity` BLOQUEIA a execução com 500 antes mesmo de rodar o handler
 * (ver [PASSO 1] em `server.ts`). Ou seja: esquecer de registrar uma função
 * nova quebra ela em vez de deixá-la desprotegida — o padrão de falha é
 * "fechado", nunca "aberto".
 *
 * ============================================================================
 * [v2.0.0 — `authMode` OBRIGATÓRIO: FECHANDO O SEGUNDO BURACO DO FAIL-SAFE]
 * ============================================================================
 * A regra de ouro acima protege contra "função esquecida no registry" — mas
 * até a v1.x não protegia contra o caso irmão: uma função REGISTRADA aqui,
 * porém sem nenhum de `requiresSecret`/`requiresSession`/`requiresHmac`
 * setado. Nesse estado, era impossível saber só de ler este arquivo se isso
 * significava "aberta ao público de propósito" ou "esqueceram de configurar"
 * — e foi exatamente assim que 7 das 15 funções ficaram anos exigindo sessão
 * de verdade (checada na mão, dentro do próprio handler) sem que o registry
 * documentasse isso em lugar nenhum.
 *
 * `authMode` fecha esse buraco: é um campo OBRIGATÓRIO (união discriminada),
 * então o TypeScript recusa compilar uma função nova sem essa escolha. Cada
 * mecanismo real do sistema tem seu próprio `type` nomeado — nada fica
 * escondido atrás de um "custom" genérico:
 *
 *   - `'session'`             → nossa sessão sbX (JWT de `jwt.ts`/`auth.ts`).
 *   - `'secret'`               → segredo estático server-to-server.
 *   - `'hmac'`                 → assinatura HMAC com janela de validade.
 *   - `'sbx-access-token'`     → token bruto OAuth da Superbid (upstream),
 *                                usado pelas portas de entrada que EMITEM
 *                                nossa sessão (não podem exigi-la de volta).
 *   - `'staff-google-auth'`    → JWT do Google Auth para identidade de
 *                                funcionário do backoffice (mecanismo
 *                                totalmente distinto dos quatro acima).
 *   - `'public'`               → zero credencial, por design. Exige `reason`.
 *   - `'custom'`               → válvula de escape para um mecanismo futuro
 *                                genuinamente único, sem padrão compartilhado
 *                                com nenhuma outra função. Exige `reason`.
 *                                Nenhuma das 15 funções atuais usa este tipo.
 *
 * O subcampo `enforcement` diz QUEM checa, não SE existe checagem:
 *   - `'wrapper'` → o `withSecurity` já bloqueia sozinho, antes do handler
 *                   rodar (hoje: `notification-dispatcher`, e após a
 *                   migração desta versão, `notification-gateway`).
 *   - `'manual'`  → o `server.ts` não faz nada por essa rota; a checagem
 *                   inteira vive dentro do próprio `index.ts` do handler.
 *                   Marca visivelmente as rotas candidatas a uma futura
 *                   centralização (ex: unificar o tratamento de
 *                   `SESSION_EXPIRED`/handoff token hoje duplicado — e já
 *                   divergente — em até 7 arquivos).
 *
 * IMPORTANTE (escopo desta versão): `authMode` é, por enquanto, uma camada
 * de DOCUMENTAÇÃO E TIPAGEM sobre o que já existe — não muda nenhum
 * comportamento em tempo de execução. O `server.ts` continua lendo
 * `requiresSecret`/`requiresSession`/`requiresHmac`/`origin` exatamente como
 * antes (mantidos abaixo, inalterados) para as funções que já os usavam. A
 * ÚNICA mudança funcional deste patch é `notification-gateway`, que ganha
 * `requiresSecret: 'NOTIFICATION_GATEWAY_SECRET'` de verdade (ver nota na
 * própria entrada) — todo o resto é só a foto precisa do que cada função já
 * fazia, agora impossível de deixar em branco por esquecimento.
 *
 * ============================================================================
 * [COMO ESCOLHER O MECANISMO DE AUTENTICAÇÃO DE UMA NOVA FUNÇÃO]
 * ============================================================================
 * Ao adicionar uma função nova em `FUNCTION_CONFIGS`, pergunte quem a chama:
 *
 *   - Um USUÁRIO logado no app (sbXPay/Financial Hub), via browser, com um
 *     token de sessão emitido por `_shared/jwt.ts`?
 *       → `authMode: { type: 'session', enforcement: ... }`. Se `enforcement`
 *         for `'wrapper'`, o wrapper valida o `x-session-token` (ou
 *         cookie/Authorization) chamando `validateRequest()` de `auth.ts`.
 *         A centralização já está implementada em `server.ts`: use
 *         `enforcement: 'wrapper'` como padrão para qualquer função nova de
 *         sessão. Reserve `'manual'` apenas para os casos que o wrapper não
 *         consegue cobrir sozinho — funções que ainda não têm sessão para
 *         exigir (ex.: `sbx-auth`, `sbx-auth-exchange`, `financial-gateway-gate`)
 *         ou que fazem checagem de papel/JWT específica inline (ex.:
 *         `manage-backoffice-users`, `log-access`).
 *
 *   - Outra Edge Function ou serviço interno que PODE guardar um segredo
 *     estático em texto puro no seu próprio ambiente (ex: uma function
 *     chamando outra function, ambas com acesso a Secrets do Supabase)?
 *       → `authMode: { type: 'secret', envVar: 'NOME_DA_ENV_VAR', enforcement: 'wrapper' }`.
 *         O wrapper compara o header `x-gateway-secret` (ou `Authorization`)
 *         em tempo constante contra o valor dessa env var.
 *
 *   - Um chamador que NÃO guarda segredo em texto no local de origem porque
 *     esse local não é seguro para isso — o exemplo canônico é um job do
 *     `pg_cron`, cujo comando SQL fica visível para qualquer um com acesso
 *     ao SQL Editor (`select * from cron.job`)?
 *       → `authMode: { type: 'hmac', envVar: 'NOME_DA_ENV_VAR', location: 'header', enforcement: 'wrapper' }`.
 *         O chamador calcula uma assinatura HMAC-SHA256 sobre um timestamp
 *         (usando o segredo como chave, lido do Supabase Vault em tempo de
 *         execução via `pgcrypto`) e manda só o timestamp + a assinatura
 *         (headers `x-timestamp` e `x-signature`) — o segredo em si nunca
 *         trafega nem aparece em texto puro em lugar nenhum. Se a assinatura
 *         vier embutida no PATH da URL em vez de headers (caso do
 *         `financial-gateway-webhook`), use `location: 'path'` e
 *         `enforcement: 'manual'` — `verifyHmacSignature` só sabe ler
 *         headers hoje. Ver `_shared/hmac.ts` para a lógica completa.
 *
 *   - Uma porta de entrada que recebe o token bruto OAuth da Superbid
 *     (`sbx_access_token`) e é, ela mesma, quem EMITE nossa sessão/token de
 *     handoff (não pode exigir de volta algo que ainda não existe)?
 *       → `authMode: { type: 'sbx-access-token', enforcement: 'manual', reason: '...' }`.
 *
 *   - Um endpoint de identidade de FUNCIONÁRIO do backoffice, autenticado
 *     via Google Auth (não é sessão sbX de cliente final)?
 *       → `authMode: { type: 'staff-google-auth', enforcement: 'manual', reason: '...' }`.
 *
 *   - Aberta ao público de verdade (zero credencial — ex: um health-check)?
 *       → `authMode: { type: 'public', reason: '...' }`. Documente SEMPRE o
 *         motivo, pra não parecer um esquecimento numa futura auditoria.
 *         Nenhuma das 15 funções atuais se encaixa aqui.
 *
 * Os mecanismos com `enforcement: 'wrapper'` são checados em `server.ts`
 * (5.A → 5.B → 5.C) e são independentes entre si — nada impede combinar mais
 * de um no futuro (ex: aceitar sessão OU segredo).
 *
 * ============================================================================
 * [OUTROS CAMPOS DO CONTRATO]
 * ============================================================================
 * - `methods`: verbos HTTP permitidos (whitelist); qualquer outro verbo
 *   recebe 405 antes de chegar no handler.
 * - `requiredHeaders`: headers que o CORS vai liberar explicitamente em
 *   `Access-Control-Allow-Headers` (além do conjunto padrão definido em
 *   `server.ts`). Isso é sobre a política de CORS, NÃO é validação de
 *   presença obrigatória do header em si — essa validação continua sendo
 *   responsabilidade do handler ou do mecanismo de auth (`requiresHmac`,
 *   por exemplo, já checa a presença de `x-timestamp`/`x-signature` na
 *   prática, mesmo que o CORS seja o motivo de estarem listados aqui).
 * - `origin`: quando igual a `'self'`, restringe o CORS para aceitar somente
 *   requisições cuja origem é o próprio projeto Supabase (útil para rotas
 *   chamadas apenas internamente). Importante: isso é só uma política de
 *   CORS — protege contra JS de outro domínio LENDO a resposta no browser,
 *   mas não bloqueia chamadas server-to-server (curl, pg_net, scripts), que
 *   nunca enviam `Origin`. Por isso `notification-dispatcher` usa
 *   `origin: 'self'` como camada extra, mas depende de `requiresHmac` para a
 *   proteção real.
 *
 * @author Cesar Ismael Pereira da Costa
 * @author Gemini Pro
 * @version 2.0.0 (authMode obrigatório)
 */

export type FunctionConfig = {
  /** Verbos HTTP permitidos para esta rota (whitelist); os demais recebem 405. */
  methods: string[];
  /**
   * Headers adicionais liberados na política de CORS
   * (`Access-Control-Allow-Headers`), além do conjunto padrão do wrapper.
   * Não é, por si só, uma validação de presença obrigatória do header.
   */
  requiredHeaders: string[];
  /**
   * Quando `'self'`, restringe o CORS a aceitar apenas requisições cuja
   * origem é o próprio projeto Supabase. É só política de CORS (proteção
   * de browser) — não autentica chamadas server-to-server, que não enviam
   * `Origin`. Use em conjunto com o mecanismo de `authMode` para proteção
   * real de acesso.
   */
  origin?: string;
  /**
   * Nome da env var com o segredo estático server-to-server exigido no
   * perímetro (comparado em tempo constante contra o header
   * `x-gateway-secret` ou `Authorization`). Mantido por compatibilidade com
   * o enforcement já existente em `server.ts`; espelhado em `authMode`.
   */
  requiresSecret?: string;
  /**
   * Exige `x-session-token` válido (ou cookie/Authorization equivalente)
   * antes de executar o handler — valida uma sessão de usuário autenticado
   * do sbXPay/Financial Hub via `validateRequest()` (`_shared/auth.ts`).
   * Mantido por compatibilidade com o enforcement já existente em
   * `server.ts`; espelhado em `authMode`.
   */
  requiresSession?: boolean;
  /**
   * Nome da env var com o segredo usado para validar a assinatura HMAC
   * (headers `x-timestamp` + `x-signature`, verificados por
   * `verifyHmacSignature` em `_shared/hmac.ts`). Mantido por
   * compatibilidade com o enforcement já existente em `server.ts`;
   * espelhado em `authMode`.
   */
  requiresHmac?: string;

  /**
   * [v2.0.0] OBRIGATÓRIO. Declara explicitamente qual mecanismo de
   * autenticação esta rota usa — nunca fica em branco por esquecimento (o
   * TypeScript recusa compilar sem essa escolha). Ver seção
   * "[v2.0.0 — authMode OBRIGATÓRIO]" no cabeçalho deste arquivo para o
   * racional completo, e "[COMO ESCOLHER...]" para o guia de decisão.
   *
   * Hoje é uma camada de documentação/tipagem sobre o enforcement real, que
   * continua vindo de `requiresSecret`/`requiresSession`/`requiresHmac`
   * (acima) para as rotas com `enforcement: 'wrapper'`. Para as rotas com
   * `enforcement: 'manual'`, a checagem inteira vive no próprio handler —
   * `authMode` aqui é o que documenta essa realidade, não o que a aplica.
   */
  authMode:
    | { type: "session"; enforcement: "wrapper" | "manual"; reason?: string }
    | { type: "secret"; envVar: string; enforcement: "wrapper" | "manual"; reason?: string }
    | {
        type: "hmac";
        envVar: string;
        location: "header" | "path";
        enforcement: "wrapper" | "manual";
        reason?: string;
      }
    | { type: "sbx-access-token"; enforcement: "manual"; reason: string }
    | { type: "staff-google-auth"; enforcement: "manual"; reason: string }
    | { type: "public"; reason: string }
    | { type: "custom"; reason: string };
};

export const FUNCTION_CONFIGS: Record<string, FunctionConfig> = {
  // ==========================================
  // 1. HUB FINANCEIRO & ORQUESTRAÇÃO
  // ==========================================
  'financial-gateway': {
    methods: ['GET', 'POST'],
    requiredHeaders: ['x-original-url', 'x-session-token', 'x-auth-fallback-url'],
    // [v2.0.0 — MIGRADA, grupo 2]: sessão agora validada centralmente pelo
    // wrapper (`_shared/session-guard.ts`), não mais na mão dentro do
    // handler. O corpo do POST (visit_id/visit_update_id/target_url) já
    // batia exatamente com o formato que `session-guard.ts` espera — migração
    // sem risco de regressão no handoff token.
    authMode: {
      type: 'session',
      enforcement: 'wrapper',
    },
  },
  'financial-gateway-gate': {
    methods: ['POST'],
    requiredHeaders: [],
    authMode: {
      type: 'sbx-access-token',
      enforcement: 'manual',
      reason: 'Porta de entrada que recebe o sbx_access_token bruto da Superbid e é quem EMITE nossa sessão (generateSessionToken) — não pode depender de uma sessão que ainda não existe.',
    },
  },
  'financial-gateway-webhook': {
    methods: ['POST'],
    requiredHeaders: [],
    authMode: {
      type: 'hmac',
      envVar: '(lido internamente via Supabase Vault, por parceiro)',
      location: 'path',
      enforcement: 'manual',
      reason: 'Assinatura HMAC extraída de parâmetros no PATH da URL (simId/updateId/timestamp/signature), não de headers — formato incompatível com verifyHmacSignature, que só lê x-timestamp/x-signature.',
    },
  },
  'orchestrator': {
    methods: ['GET', 'POST'],
    requiredHeaders: ['x-original-url', 'x-session-token', 'x-auth-fallback-url'],
    // [v2.0.0 — MIGRADA, grupo 2]: sessão agora validada centralmente pelo
    // wrapper (`_shared/session-guard.ts`), não mais na mão dentro do handler.
    // O caso específico desta rota (GET com visit_id/visit_update_id na
    // query string da própria chamada à API, não no x-original-url) é
    // coberto pela extensão v2.0.1 do session-guard.
    authMode: {
      type: 'session',
      enforcement: 'wrapper',
    },
  },
  'orchestrator-configs': {
    methods: ['GET'],
    requiredHeaders: ['x-original-url', 'x-session-token', 'x-auth-fallback-url'],
    // [v2.0.0 — MIGRADA, grupo 1]: sessão agora validada centralmente pelo
    // wrapper (`_shared/session-guard.ts`), não mais na mão dentro do handler.
    authMode: {
      type: 'session',
      enforcement: 'wrapper',
    },
  },

  // ==========================================
  // 2. SISTEMA DE NOTIFICAÇÕES
  // ==========================================
  'notification-dispatcher': {
    methods: ['POST', 'GET'],
    requiredHeaders: ['x-timestamp', 'x-signature'],
    origin: 'self',
    requiresHmac: 'NOTIFICATION_DISPATCHER_SECRET',
    authMode: {
      type: 'hmac',
      envVar: 'NOTIFICATION_DISPATCHER_SECRET',
      location: 'header',
      enforcement: 'wrapper',
    },
  },
  'notification-gateway': {
    methods: ['POST'],
    requiredHeaders: ['x-gateway-secret'],
    // [v2.0.0 — MUDANÇA FUNCIONAL]: antes, o segredo era checado só na mão
    // dentro do handler, com `!==` (não é tempo-constante). Agora o
    // `withSecurity` valida via `safeCompare()` (tempo-constante) ANTES do
    // handler rodar — a checagem manual que existia dentro do handler foi
    // removida (`notification-gateway/index.ts`).
    requiresSecret: 'NOTIFICATION_GATEWAY_SECRET',
    authMode: {
      type: 'secret',
      envVar: 'NOTIFICATION_GATEWAY_SECRET',
      enforcement: 'wrapper',
    },
  },
  'notification-system-message': {
    methods: ['POST'],
    // [v2.0.0]: 'x-original-url'/'x-auth-fallback-url' adicionados — sem
    // eles no CORS, o navegador bloqueia o front-end de enviar esses
    // headers, e o handoff token (novo, ver nota abaixo) sempre cairia no
    // fallback ("/", "/accounts/signin") em vez da página real de origem.
    requiredHeaders: ['x-original-url', 'x-session-token', 'x-auth-fallback-url'],
    // [v2.0.0 — MIGRADA, grupo 2]: sessão agora validada centralmente pelo
    // wrapper (`_shared/session-guard.ts`), não mais na mão dentro do
    // handler. [MUDANÇA DE COMPORTAMENTO]: antes devolvia 401 plano, sem
    // fallback_url/handoff token (única das 7 rotas de sessão sem essa
    // cobertura). Agora usa o mesmo formato canônico e ganha handoff token,
    // que nunca teve — só é útil de verdade se o chamador no front-end
    // (`logSystemError` em `src/services/systemNotification.ts`) também
    // passar a enviar 'x-original-url'/'x-auth-fallback-url'.
    authMode: {
      type: 'session',
      enforcement: 'wrapper',
    },
  },

  // ==========================================
  // 3. AUTENTICAÇÃO E SESSÃO (BFFs)
  // ==========================================
  'sbx-auth': {
    methods: ['POST'],
    requiredHeaders: [],
    authMode: {
      type: 'sbx-access-token',
      enforcement: 'manual',
      reason: 'Autentica via sbx_access_token bruto (Superbid), validado no upstream /account/v2/user/me — é quem EMITE nossa sessão, não pode depender dela.',
    },
  },
  'sbx-auth-exchange': {
    methods: ['POST'],
    requiredHeaders: [],
    authMode: {
      type: 'sbx-access-token',
      enforcement: 'manual',
      reason: 'Modo "issue" aceita x-access-token (sbx_access_token bruto); modo "redeem" aceita x-exchange-token (JWT efêmero próprio, 60s) — handshake de duas pontas sobre a mesma credencial raiz da Superbid.',
    },
  },

  // ==========================================
  // 4. OFERTAS & NEGÓCIO
  // ==========================================
  'sbx-event': {
    methods: ['GET'],
    requiredHeaders: ['x-original-url', 'x-session-token', 'x-auth-fallback-url'],
    // [v2.0.0 — MIGRADA, grupo 1]: antes devolvia 401 plano, sem handoff
    // token (única das 7 rotas de sessão sem essa cobertura). Agora usa o
    // mesmo SESSION_EXPIRED/handoff canônico das demais — ganha a
    // funcionalidade que nunca teve, só por virar `'wrapper'`.
    authMode: {
      type: 'session',
      enforcement: 'wrapper',
    },
  },
  'sbx-offer': {
    methods: ['GET'],
    requiredHeaders: ['x-original-url', 'x-session-token', 'x-auth-fallback-url'],
    // [v2.0.0 — MIGRADA, grupo 1]
    authMode: {
      type: 'session',
      enforcement: 'wrapper',
    },
  },
  'sbx-offer-query': {
    methods: ['GET'],
    requiredHeaders: ['x-original-url', 'x-session-token', 'x-auth-fallback-url'],
    // [v2.0.0 — MIGRADA, grupo 2]: sessão agora validada centralmente pelo
    // wrapper (`_shared/session-guard.ts`), não mais na mão dentro do handler.
    // [v2.1.0]: rota convertida de POST pra GET — é uma consulta pura de
    // catálogo (sem efeito colateral), consistente com o restante das rotas
    // de leitura. Parâmetros agora vêm da query string, não mais do corpo.
    authMode: {
      type: 'session',
      enforcement: 'wrapper',
    },
  },

  // ==========================================
  // 5. ADMINISTRAÇÃO E LOGS
  // ==========================================
  'manage-backoffice-users': {
    methods: ['POST'],
    requiredHeaders: [],
    authMode: {
      type: 'staff-google-auth',
      enforcement: 'manual',
      reason: 'Identidade de funcionário do backoffice via JWT do Google Auth (ensureAdmin) — mecanismo distinto de sessão sbX de cliente final, segredo estático ou HMAC.',
    },
  },
  'log-access': {
    methods: ['POST'],
    requiredHeaders: [],
    authMode: {
      type: 'staff-google-auth',
      enforcement: 'manual',
      reason: 'Mesmo mecanismo do manage-backoffice-users — JWT do Google Auth para identidade de funcionário do backoffice.',
    },
  },
};