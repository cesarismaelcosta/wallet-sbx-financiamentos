/**
 * ARQUIVO: registry.ts
 * OBJETIVO: Centralizar o contrato de infraestrutura (CORS e Métodos) de todo o ecossistema.
 * REGRA DE OURO: Se uma função não estiver aqui, o Wrapper bloqueará sua execução (Fail-Safe).
 */

export type FunctionConfig = {
  methods: string[];
  requiredHeaders: string[];
};

export const FUNCTION_CONFIGS: Record<string, FunctionConfig> = {
  // ==========================================
  // 1. HUB FINANCEIRO & ORQUESTRAÇÃO
  // ==========================================
  'financial-gateway': { 
    methods: ['GET', 'POST'], 
    requiredHeaders: ['x-original-url', 'x-session-token', 'x-auth-fallback-url'] 
  },
  'financial-gateway-webhook': { 
    methods: ['POST'],  // Webhooks costumam ser POST
    requiredHeaders: [] // Webhooks de parceiros geralmente não mandam headers customizados
  },
  'orchestrator': { 
    methods: ['GET', 'POST'], 
    requiredHeaders: ['x-original-url', 'x-session-token', 'x-auth-fallback-url'] 
  },

  // ==========================================
  // 2. SISTEMA DE NOTIFICAÇÕES
  // ==========================================
  'notification-dispatcher': { 
    methods: ['POST', 'GET'], 
    requiredHeaders: [],        // Chamado internamente via CRON (Service Role)
    origin: 'self'              // NENHUM site externo consegue chamar via browser, só o projeto do supabase. O Wrapper substitui pelo projeto
  },
  'notification-gateway': { 
    methods: ['POST'], 
    requiredHeaders: ['x-gateway-secret'] // Proteção contra disparos indevidos
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
    requiredHeaders: [] // Auth inicial não tem token ainda
  },
  'sbx-auth-exchange': { 
    methods: ['POST'], 
    requiredHeaders: [] 
  },
  'sbx-loader': { 
    methods: ['POST'], 
    requiredHeaders: [] 
  },
  'sbx-user': { 
    methods: ['GET'], // Alterado para bater com o padrão de leitura de perfil
    requiredHeaders: ['x-original-url', 'x-session-token', 'x-auth-fallback-url'] 
  },

  // ==========================================
  // 4. OFERTAS & NEGÓCIO
  // ==========================================
  'sbx-offer': { 
    methods: ['GET'], 
    requiredHeaders: ['x-original-url', 'x-session-token', 'x-auth-fallback-url'] 
  },

  // ==========================================
  // 5. ADMINISTRAÇÃO E LOGS
  // ==========================================
  'manage-backoffice-users': { 
    methods: ['POST'], 
    requiredHeaders: [], // Usa apenas o 'authorization' padrão
    // Se você tiver um domínio customizado (ex: admin.sbx.com.br), 
    // pode deixar a string fixa. Se for o próprio supabase, use 'self'.
    origin: 'self'
  },
  'login-history': { 
    methods: ['POST'], 
    requiredHeaders: [] 
  },
};