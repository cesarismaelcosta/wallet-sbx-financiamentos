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
 * [COMO ESCOLHER O MECANISMO DE AUTENTICAÇÃO DE UMA NOVA FUNÇÃO]
 * ============================================================================
 * Ao adicionar uma função nova em `FUNCTION_CONFIGS`, pergunte quem a chama:
 *
 *   - Um USUÁRIO logado no app (sbXPay/Financial Hub), via browser, com um
 *     token de sessão emitido por `_shared/jwt.ts`?
 *       → use `requiresSession: true`. O wrapper valida o `x-session-token`
 *         (ou cookie/Authorization) chamando `validateRequest()` de `auth.ts`.
 *
 *   - Outra Edge Function ou serviço interno que PODE guardar um segredo
 *     estático em texto puro no seu próprio ambiente (ex: uma function
 *     chamando outra function, ambas com acesso a Secrets do Supabase)?
 *       → use `requiresSecret: 'NOME_DA_ENV_VAR'`. O wrapper compara o
 *         header `x-gateway-secret` (ou `Authorization`) em tempo constante
 *         contra o valor dessa env var.
 *
 *   - Um chamador que NÃO guarda segredo em texto no local de origem porque
 *     esse local não é seguro para isso — o exemplo canônico é um job do
 *     `pg_cron`, cujo comando SQL fica visível para qualquer um com acesso
 *     ao SQL Editor (`select * from cron.job`)?
 *       → use `requiresHmac: 'NOME_DA_ENV_VAR'`. O chamador calcula uma
 *         assinatura HMAC-SHA256 sobre um timestamp (usando o segredo como
 *         chave, lido do Supabase Vault em tempo de execução via `pgcrypto`)
 *         e manda só o timestamp + a assinatura (headers `x-timestamp` e
 *         `x-signature`) — o segredo em si nunca trafega nem aparece em
 *         texto puro em lugar nenhum. Ver `_shared/hmac.ts` para a lógica
 *         completa de verificação e o racional detalhado.
 *
 *   - Aberta ao público (ex: um endpoint de login antes de existir sessão)?
 *       → não defina nenhum dos três campos acima. Mas documente aqui, com
 *         um comentário ao lado da chave, POR QUE essa função é
 *         intencionalmente pública (evita que pareça um esquecimento numa
 *         futura auditoria).
 *
 * Os três mecanismos são checados nessa ordem em `server.ts` (5.A → 5.B →
 * 5.C) e são independentes entre si — nada impede combinar mais de um no
 * futuro (ex: aceitar sessão OU segredo), bastando setar mais de um campo.
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
   * `Origin`. Use em conjunto com `requiresSecret`/`requiresSession`/
   * `requiresHmac` para proteção real de acesso.
   */
  origin?: string;
  /**
   * Nome da env var com o segredo estático server-to-server exigido no
   * perímetro (comparado em tempo constante contra o header
   * `x-gateway-secret` ou `Authorization`). Use quando o chamador é capaz
   * de guardar um segredo em texto puro no seu próprio ambiente seguro
   * (outra Edge Function, por exemplo).
   */
  requiresSecret?: string;
  /**
   * Exige `x-session-token` válido (ou cookie/Authorization equivalente)
   * antes de executar o handler — valida uma sessão de usuário autenticado
   * do sbXPay/Financial Hub via `validateRequest()` (`_shared/auth.ts`).
   */
  requiresSession?: boolean;
  /**
   * Nome da env var com o segredo usado para validar a assinatura HMAC
   * (headers `x-timestamp` + `x-signature`, verificados por
   * `verifyHmacSignature` em `_shared/hmac.ts`). Use quando o chamador não
   * pode carregar um segredo em texto puro no local de origem da chamada —
   * o exemplo canônico é um job do `pg_cron`, cujo comando SQL fica visível
   * a qualquer um com acesso ao SQL Editor (`select * from cron.job`). O
   * segredo em si nunca trafega: o chamador só envia timestamp + assinatura
   * calculada com o segredo como chave (lido do Supabase Vault em tempo de
   * execução via `pgcrypto`, nunca escrito em texto puro no comando do job).
   */
  requiresHmac?: string;
};

export const FUNCTION_CONFIGS: Record<string, FunctionConfig> = {
  // ==========================================
  // 1. HUB FINANCEIRO & ORQUESTRAÇÃO
  // ==========================================
  'financial-gateway': { 
    methods: ['GET', 'POST'], 
    requiredHeaders: ['x-original-url', 'x-session-token', 'x-auth-fallback-url']
  },
  'financial-gateway-gate': { 
    methods: ['POST'], 
    requiredHeaders: [] 
  },
  'financial-gateway-webhook': { 
    methods: ['POST'], 
    requiredHeaders: [] 
  },
  'orchestrator': { 
    methods: ['GET', 'POST'], 
    requiredHeaders: ['x-original-url', 'x-session-token', 'x-auth-fallback-url']
  },
  'orchestrator-configs': { 
    methods: ['GET'], 
    requiredHeaders: ['x-original-url', 'x-session-token', 'x-auth-fallback-url']
  },

  // ==========================================
  // 2. SISTEMA DE NOTIFICAÇÕES
  // ==========================================
  'notification-dispatcher': {
    methods: ['POST', 'GET'],
    requiredHeaders: ['x-timestamp', 'x-signature'],
    origin: 'self',
    requiresHmac: 'NOTIFICATION_DISPATCHER_SECRET',
  },
  'notification-gateway': { 
    methods: ['POST'], 
    requiredHeaders: ['x-gateway-secret']
  },
  'notification-system-message': { 
    methods: ['POST'], 
    requiredHeaders: ['x-session-token']
  },

  // ==========================================
  // 3. AUTENTICAÇÃO E SESSÃO (BFFs)
  // ==========================================
  'sbx-auth': { 
    methods: ['POST'], 
    requiredHeaders: [] 
  },
  'sbx-auth-exchange': { 
    methods: ['POST'], 
    requiredHeaders: [] 
  },

  // ==========================================
  // 4. OFERTAS & NEGÓCIO
  // ==========================================
  'sbx-event': { 
    methods: ['GET'], 
    requiredHeaders: ['x-original-url', 'x-session-token', 'x-auth-fallback-url'] 
  },
  'sbx-offer': { 
    methods: ['GET'], 
    requiredHeaders: ['x-original-url', 'x-session-token', 'x-auth-fallback-url']
  },
  'sbx-offer-query': { 
    methods: ['POST'], 
    requiredHeaders: ['x-original-url', 'x-session-token', 'x-auth-fallback-url']
  },
  
  // ==========================================
  // 5. ADMINISTRAÇÃO E LOGS
  // ==========================================
  'manage-backoffice-users': { 
    methods: ['POST'], 
    requiredHeaders: []
  },
  'log-access': { 
    methods: ['POST'], 
    requiredHeaders: [] 
  },
};