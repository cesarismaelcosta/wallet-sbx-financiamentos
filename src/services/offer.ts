/**
 * @fileoverview Serviço: Offer Details (Client Service)
 * * =========================================================================
 * [ARQUITETURA & CLEAN ARCHITECTURE]
 * =========================================================================
 * Busca os dados consolidados da oferta através da Edge Function sbx-offer.
 * Atua na camada de Gateway de Serviços (Data Provider) do Hub Financeiro.
 * 
 * * [RESPONSABILIDADES]:
 * 1. Interface (Type Safety): Define o contrato BFFOfferDetails para tipagem forte.
 * 2. Gateway Bypass: Utiliza a Anon Key para transpor o Kong Gateway.
 * 3. SSOT Compliance: Omitiu o envio de `x-sbx-env` pois a Edge Function resolve 
 *    o ambiente 100% via banco de dados (Zero Trust Frontend).
 * 4. Error Handling: Intercepta o novo contrato de erro padronizado ({ code, message, fallback_url })
 *    e propaga para a Action/Loader do React Router.
 * 
 * @version 2.5.0 (Adequação ao novo contrato SSOT e Padronização de Erros)
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
// [CONTRATO DE ERRO PADRONIZADO (BFF)]
// =========================================================================
export interface BFFErrorResponse {
  success: boolean;
  code: string;
  message: string;
  fallback_url: string;
}

// =========================================================================
// [SERVIÇO CORE]: Abstração de Chamada HTTP e Telemetria
// =========================================================================

/**
 * Busca os detalhes de uma oferta específica no servidor.
 * @param sessionToken O JWT Próprio de sessão gerado pelo backend.
 * @param offerId O ID do lote/oferta na Superbid.
 * @param originUrl [NOVO] A URL atual da página, para ser enviada no header 'x-original-url'
 * @throws {BFFErrorResponse} Objeto de erro padronizado para consumo do React Router.
 */
export const fetchOfferDetails = async (
  sessionToken: string, 
  offerId: string, 
  originUrl?: string
): Promise<BFFOfferDetails> => {

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
  const url = `${supabaseUrl}/functions/v1/sbx-offer?offer_id=${offerId}`;

  // -----------------------------------------------------------------------
  // [TELEMETRIA]: Configuração da Requisição
  // -----------------------------------------------------------------------
  // Monta a rota de login exata que você quer
  const loginFallbackUrl = `/accounts/signin?redirect_uri=${encodeURIComponent(originUrl)}`;
  
  // Nota: x-sbx-env foi removido. A responsabilidade de descobrir o ambiente
  // é exclusiva da Edge Function, consultando a tabela `session_tokens`.
  const options: RequestInit = {
    method: "GET",
    headers: {
      "Authorization": `Bearer ${supabaseAnonKey}`,
      "x-session-token": sessionToken,
      "Content-Type": "application/json",
      "Accept": "application/json",
      // Mapeia a URL de origem
      ...(originUrl && { "x-original-url": originUrl }),
      // Mapeia a URL de fallback para o contrato esperado pelo backend
      ...(loginFallbackUrl && { "x-auth-fallback-url": loginFallbackUrl })
    }
  };

  try {
    // [NETWORK]: Chamada segura para a Edge Function via API REST
    const response = await fetch(url, options);

    // -----------------------------------------------------------------------
    // [INTERCEPTAÇÃO DE ERRO]: Leitura do Contrato Padronizado
    // -----------------------------------------------------------------------
    if (!response.ok) {
      let bffError: BFFErrorResponse;
      
      try {
        // Tenta parsear o contrato exato que construímos na Edge Function
        const jsonError = await response.json();
        bffError = {
            success: false,
            code: jsonError.code || "UNKNOWN_ERROR",
            message: jsonError.message || `HTTP ${response.status} ${response.statusText}`,
            fallback_url: jsonError.fallback_url || "/"
        };
      } catch (parseError) {
        // Fallback de infraestrutura (Ex: Supabase fora do ar ou 502 do Nginx)
        bffError = {
            success: false,
            code: "INFRASTRUCTURE_ERROR",
            message: "Falha crítica de comunicação com o servidor.",
            fallback_url: "/"
        };
      }

      // [SECURITY]: Gatilho nativo legado (Amnésia) para retrocompatibilidade
      if (bffError.code === "SESSION_EXPIRED" || bffError.code === "UNAUTHORIZED") {
          const isBrowser = typeof window !== 'undefined';
          if (isBrowser) {
            window.dispatchEvent(new CustomEvent('session_expired'));
          }
      }

      // [CRITICAL FIX]: Interrompe a execução lançando o objeto formatado 
      // O Loader do React Router deve dar "catch" e ler (error as any).code
      throw bffError;
    }

    // [DATA]: Retorna os dados hidratados garantindo a tipagem do contrato BFF
    return await response.json();
    
  } catch (error: any) {
    // Se o erro já for o nosso BFFErrorResponse (lançado no if !response.ok acima), propaga direto.
    if (error && "code" in error) {
      throw error;
    }
    
    // [FALLBACK CATASTRÓFICO]: Erro de rede (Ex: Cliente sem internet ou CORS block)
    throw {
        success: false,
        code: "NETWORK_ERROR",
        message: "Falha de conexão física. Verifique sua internet.",
        fallback_url: "/"
    } as BFFErrorResponse;
  }
};