/**
 * ARQUIVO: registry.ts
 * OBJETIVO: Centralizar o contrato de infraestrutura (CORS, Métodos e Segurança) de todo o ecossistema.
 * REGRA DE OURO: Se uma função não estiver aqui, o Wrapper bloqueará sua execução (Fail-Safe).
 */

export type FunctionConfig = {
  methods: string[];
  requiredHeaders: string[];
  origin?: string;
  requiresSession?: boolean; // Exige x-session-token / JWT de usuário válido
  requiresSecret?: string;   // Nome da variável de ambiente com o segredo server-to-server
};

export const FUNCTION_CONFIGS: Record<string, FunctionConfig> = {
  // ==========================================
  // 1. HUB FINANCEIRO & ORQUESTRAÇÃO
  // ==========================================
  'financial-gateway': { 
    methods: ['GET', 'POST'], 
    requiredHeaders: ['x-original-url', 'x-session-token', 'x-auth-fallback-url'],
    requiresSession: true
  },
  'financial-gateway-gate': { 
    methods: ['POST'], 
    requiredHeaders: [],
    // Aberto (geralmente recebe o token via payload/form submit para redirecionamento)
  },
  'financial-gateway-webhook': { 
    methods: ['POST'], 
    requiredHeaders: [],
    // Aberto para parceiros (protegido internamente por assinatura HMAC/payload)
  },
  'orchestrator': { 
    methods: ['GET', 'POST'], 
    requiredHeaders: ['x-original-url', 'x-session-token', 'x-auth-fallback-url'],
    requiresSession: true
  },
  'orchestrator-configs': { 
    methods: ['GET'], 
    requiredHeaders: ['x-original-url', 'x-session-token', 'x-auth-fallback-url'],
    requiresSession: true
  },

  // ==========================================
  // 2. SISTEMA DE NOTIFICAÇÕES
  // ==========================================
  'notification-dispatcher': { 
    methods: ['POST', 'GET'], 
    requiredHeaders: [],
    origin: 'self' // Protegido por restrição de origem interna (CRON)
  },
  'notification-gateway': { 
    methods: ['POST'], 
    requiredHeaders: ['x-gateway-secret'],
    requiresSecret: 'NOTIFICATION_GATEWAY_SECRET' // 👈 Declarativo agora!
  },
  'notification-system-message': { 
    methods: ['POST'], 
    requiredHeaders: ['x-session-token'],
    requiresSession: true // 👈 Protegido pelo perímetro do withSecurity
  },

  // ==========================================
  // 3. AUTENTICAÇÃO E SESSÃO (BFFs)
  // ==========================================
  'sbx-auth': { 
    methods: ['POST'], 
    requiredHeaders: []
    // Aberto (Auth inicial da Superbid)
  },
  'sbx-auth-exchange': { 
    methods: ['POST'], 
    requiredHeaders: []
    // Aberto (Protocolo de troca de token público para sessão interna)
  },
  'sbx-user': { 
    methods: ['GET'], 
    requiredHeaders: ['x-original-url', 'x-session-token', 'x-auth-fallback-url'],
    requiresSession: true
  },

  // ==========================================
  // 4. OFERTAS & NEGÓCIO
  // ==========================================
  'sbx-offer': { 
    methods: ['GET'], 
    requiredHeaders: ['x-original-url', 'x-session-token', 'x-auth-fallback-url'],
    requiresSession: true
  },

  // ==========================================
  // 5. ADMINISTRAÇÃO E LOGS
  // ==========================================
  'manage-backoffice-users': { 
    methods: ['POST'], 
    requiredHeaders: [],
    requiresSession: true, // Apenas administradores logados gerenciam usuários
    origin: 'self'
  },
  'login-history': { 
    methods: ['POST'], 
    requiredHeaders: [],
    requiresSession: true // Telemetria de login exige usuário autenticado
  },
};