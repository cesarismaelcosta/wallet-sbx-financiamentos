/**
 * @fileoverview Serviço: Offer Details
 * Busca os detalhes da oferta através da Edge Function sbx-offer.
 * Centraliza a chamada para garantir compliance e segurança.
 * * [RESPONSABILIDADES]:
 * 1. Interface de comunicação: O front-end envia o token de oferta,
 * mantendo a integridade da chamada protegida no servidor.
 * 2. Gateway Bypass: Utiliza a Anon Key do Supabase para transpor o Kong Gateway.
 * 3. Delegação de Rota: Erros 401/403 ativam o Protocolo de Amnésia global.
 */

/**
 * @fileoverview Interface: BFFOfferDetails
 * Alinhada estritamente ao contrato de retorno da Edge Function sbx-offer.
 */

export interface BFFOfferDetails {
  offer: {
    offer_id: string;
    offer_description: string;
    offer_value: number;
    category_id: number;
    category: string;
    lot_number: string;
    offer_status: string;
    sale_status: string;
    end_date: string;
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
  };
  seller: {
    seller_id: string;
    legal_name: string;
    trade_name: string;
    economic_group: string;
  };
}

/**
 * Busca detalhes da oferta no servidor.
 * @param offerToken O token criptografado (sbx_offer) para acesso.
 */
export const fetchOfferDetails = async (offerToken: string): Promise<BFFOfferDetails> => {
  // [STATE]: Resgate de variáveis de ambiente e preferências de armazenamento local
  const isBrowser = typeof window !== 'undefined';
  const storedAmbiente = isBrowser ? (localStorage.getItem("sandbox_env") || "stage") : "stage";
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

  // [NETWORK]: Chamada segura para a Edge Function via API REST
  const response = await fetch(`${supabaseUrl}/functions/v1/sbx-offer`, {
    method: "GET",
    headers: {
      // [SECURITY]: Chaves públicas obrigatórias para transpor o Kong Gateway.
      "Authorization": `Bearer ${supabaseAnonKey}`,
      "apikey": supabaseAnonKey,
      
      // [BUSINESS LOGIC]: Token de oferta via header customizado.
      "x-sbx-offer-token": offerToken,
      
      "x-sbx-env": storedAmbiente,
      "Content-Type": "application/json",
      "Accept": "application/json"
    },
  });

  if (response.status === 401 || response.status === 403) {
    // -----------------------------------------------------------------------
    // [SECURITY]: Gatilho do Protocolo de Amnésia
    // -----------------------------------------------------------------------
    window.dispatchEvent(new CustomEvent('session_expired'));
    throw new Error("OFFER_ACCESS_DENIED");
  }

  if (response.status === 410) {
    // [BUSINESS LOGIC]: Oferta expirada (TTL atingido)
    throw new Error("OFFER_EXPIRED");
  }

  if (!response.ok) {
    // [BUSINESS LOGIC]: Interceptação de falhas sistêmicas da API
    throw new Error("OFFER_API_ERROR");
  }
  
  // [DATA]: Retorna os dados hidratados caso a resposta seja 200 OK
  return response.json();
};