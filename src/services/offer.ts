/**
 * @fileoverview Serviço: Offer Details
 * * =========================================================================
 * [ARQUITETURA & CLEAN ARCHITECTURE]
 * =========================================================================
 * Busca os dados consolidados da oferta através da Edge Function sbx-offer.
 * Atua na camada de Gateway de Serviços (Data Provider) do Hub Financeiro.
 * * [RESPONSABILIDADES]:
 * 1. Interface (Type Safety): Define o contrato BFFOfferDetails para tipagem forte.
 * 2. Gateway Bypass: Utiliza a Anon Key para transpor o Kong Gateway.
 * 3. Transparência: Propaga mensagens brutas do upstream (Superbid) para logs.
 * 4. Segurança: Erros 401 disparam o Protocolo de Amnésia global.
 */

// =========================================================================
// [CONTRATO DE DADOS]: Interface de Reidratação do BFF
// =========================================================================
export interface BFFOfferPhoto {
  highlight: boolean;
  link: string;
  thumbnail?: string;
  file_name?: string;
  type: string;
  content_type: string;
}

export interface BFFOfferDetails {
  offer: {
    offer_id: string;
    lot_number: string | number;
    offer_description: string;
    offer_detailed_description: string;
    offer_value: number;
    category_id: number;
    category: string;
    offer_status: string;
    sale_status: string;
    end_date: string;
    photos: BFFOfferPhoto[];
  };
  manager: {
    manager_id: number;
    manager_name: string;
  };
  event: {
    event_id: string;
    event_description: string;
    event_start_date: string;
    event_end_date: string;
    modality_id: number | null;
    status_id: number | null;
    event_short_description: string;
    event_full_description: string;
    event_image_url: string;
  };
  seller: {
    seller_id: string;
    legal_name: string;
    trade_name: string;
    economic_group: string;
  };
}

// =========================================================================
// [SERVIÇO CORE]: Abstração de Chamada HTTP e Telemetria
// =========================================================================

/**
 * Busca os detalhes de uma oferta específica no servidor.
 * @param sessionToken O JWT Próprio de sessão gerado pelo backend.
 * @param offerId O ID do lote/oferta na Superbid.
 * @param environment [NOVO] Opcional. Força o ambiente (production/stage) contornando o localStorage durante o SSR.
 */
export const fetchOfferDetails = async (sessionToken: string, offerId: string, environment?: "staging" | "production"): Promise<BFFOfferDetails> => {
  // [STATE]: Resgate de variáveis de ambiente e preferências de armazenamento local
  // ====================================================================================
  // [SSR SAFEGUARD & CROSS-DOMAIN SYNC]: A Injeção do Parâmetro 'environment'
  // ====================================================================================
  // 1. O Servidor é Cego: No Node.js (SSR), o `window` e o `localStorage` não existem.
  // 2. O Risco de Colapso (401 Falso): Sem o 'environment', o servidor usa o fallback "stage". 
  //    Se o token for de Produção, a incompatibilidade gera um SESSION_EXPIRED falso.
  // 3. O Fluxo Unificado: Ao receber o 'environment' do loader, a API garante que o Header 
  //    'x-sbx-env' esteja perfeitamente sincronizado com a origem da requisição.
  const isBrowser = typeof window !== 'undefined';
  const storedAmbiente = environment || (isBrowser ? (localStorage.getItem("sbx_environment") || "stage") : "stage");
  
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://ldzutiojmcawhwdhojlo.supabase.co';
  const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

  const url = `${supabaseUrl}/functions/v1/sbx-offer?offer_id=${offerId}`;

  // -----------------------------------------------------------------------
  // [TELEMETRIA]: Log Operacional de Diagnóstico Inicial
  // -----------------------------------------------------------------------
  const options: RequestInit = {
    method: "GET",
    headers: {
      "Authorization": `Bearer ${supabaseAnonKey}`,
      "apikey": supabaseAnonKey,
      "x-session-token": sessionToken,
      "x-sbx-env": storedAmbiente, // Garante alinhamento total entre o Router e a API
      "Content-Type": "application/json",
      "Accept": "application/json"
    }
  };

  try {
    // [NETWORK]: Chamada segura para a Edge Function via API REST
    const response = await fetch(url, options);

    if (response.status === 401) {
      // -----------------------------------------------------------------------
      // [SECURITY]: Gatilho do Protocolo de Amnésia
      // -----------------------------------------------------------------------
      // [CORE UPDATE - SSR SAFEGUARD]: Só dispara o evento se estivermos no Client-Side.
      if (isBrowser) {
        window.dispatchEvent(new CustomEvent('session_expired'));
      }
      throw new Error("SESSION_EXPIRED");
    }

    // -----------------------------------------------------------------------
    // [INTERCEPTAÇÃO DE ERRO]: Tratamento e Extração de Payload do Upstream
    // -----------------------------------------------------------------------
    if (!response.ok) {
      let backendReason = "OFFER_API_ERROR";
      
      try {
        // Tenta ler o corpo bruto enviado pela Edge Function
        const textError = await response.text();
        
        try {
          // Tenta fazer o parse estruturado caso seja um JSON de erro do Supabase
          const jsonError = JSON.parse(textError);
          // Prioriza as mensagens fatais detalhadas vindas do backend
          backendReason = jsonError?.event_message || jsonError?.error || jsonError?.message || textError;
        } catch {
          // Fallback para texto bruto
          backendReason = textError || `HTTP ${response.status} ${response.statusText}`;
        }
      } catch (parseError) {
        backendReason = `HTTP ${response.status} (Falha crítica ao ler corpo da resposta)`;
      }

      // [CRITICAL FIX]: Interrompe a execução e lança o erro detalhado da infraestrutura
      throw new Error(backendReason);
    }

    // [DATA]: Retorna os dados hidratados garantindo a tipagem do contrato BFF
    return await response.json();
    
  } catch (error: any) {
    // Se for o nosso erro tratado (ex: SESSION_EXPIRED ou o throw da infra), propaga direto
    if (error.message && error.message !== "Failed to fetch") {
      throw error;
    }
    
    // [FALLBACK]: Erro genérico (ex: CORS, queda de conexão)
    throw new Error(`OFFER_API_ERROR: ${error.message || "Erro desconhecido de comunicação física"}`);
  }
};