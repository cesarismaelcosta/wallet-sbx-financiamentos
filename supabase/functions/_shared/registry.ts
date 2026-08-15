/**
 * ARQUIVO: registry.ts
 * OBJETIVO: Centralizar o contrato de infraestrutura (CORS e Métodos) de todo o ecossistema.
 * REGRA DE OURO: Se uma função não estiver aqui, o Wrapper bloqueará sua execução (Fail-Safe).
 */

export type FunctionConfig = {
  methods: string[];
  requiredHeaders: string[];
  origin?: string;
  /** Nome da env var com o segredo server-to-server exigido no perímetro. */
  requiresSecret?: string;
  /** Exige x-session-token válido antes de executar o handler. */
  requiresSession?: boolean;
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
    requiredHeaders: [],
    origin: 'self' 
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

  /**
   * sbx-auth-exchange
   * [DOUBLE JWT PROTOCOL - HYBRID ENGINE]
   * Modo Issue:  Recebe x-access-token. Devolve Exchange JWT (60s) + Perfil BFF.
   * Modo Redeem: Recebe x-exchange-token. Devolve Session JWT (6h) + Ambiente.
   * Obs: Headers customizados de auth trafegam via Payload/Fetch, exigindo requiresHeaders vazio 
   * para permitir a maleabilidade de entrada nas regras do withSecurity.
   */
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
    requiredHeaders: [],
  },
  'login-history': { 
    methods: ['POST'], 
    requiredHeaders: [] 
  },
};