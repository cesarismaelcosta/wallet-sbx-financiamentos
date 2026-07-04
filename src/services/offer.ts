/**
 * @fileoverview Serviço: Offer Details
 * Busca os detalhes da oferta através da Edge Function sbx-offer.
 * Centraliza a chamada para garantir compliance e segurança.
 * * [RESPONSABILIDADES]:
 * 1. Interface de comunicação: O front-end envia apenas o offer_token (JWT Próprio),
 * mantendo os tokens reais da API da Superbid protegidos no servidor.
 * 2. Gateway Bypass: Utiliza a Anon Key do Supabase para transpor o Kong Gateway.
 * 3. Delegação de Rota: Erros 401 lançam exceções, abortam o fluxo local e 
 * ativam o Protocolo de Amnésia global.
 * * @author Cesar Ismael Pereira da Costa
 * @version 1.0.0
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
  manager: { manager_id: number; manager_name: string; };
  event: { event_id: string; event_description: string; event_start_date: string; event_end_date: string; };
  seller: { seller_id: string; legal_name: string; trade_name: string; economic_group: string; };
}

export const fetchOfferDetails = async (offerToken: string): Promise<BFFOfferDetails> => {
  const isBrowser = typeof window !== 'undefined';
  const storedAmbiente = isBrowser ? (localStorage.getItem("sandbox_env") || "stage") : "stage";
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

  const response = await fetch(`${supabaseUrl}/functions/v1/sbx-offer`, {
    method: "GET",
    headers: {
      "Authorization": `Bearer ${supabaseAnonKey}`,
      "apikey": supabaseAnonKey,
      "x-sbx-offer-token": offerToken,
      "x-sbx-env": storedAmbiente,
      "Content-Type": "application/json",
      "Accept": "application/json"
    },
  });

  if (response.status === 401 || response.status === 403) {
    window.dispatchEvent(new CustomEvent('session_expired'));
    throw new Error("OFFER_ACCESS_DENIED");
  }

  if (response.status === 410) {
    throw new Error("OFFER_EXPIRED");
  }

  if (!response.ok) {
    throw new Error("OFFER_API_ERROR");
  }
  
  return response.json();
};