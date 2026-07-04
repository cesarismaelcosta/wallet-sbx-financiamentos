/**
 * @fileoverview Serviço: Offer Details (BFF Layer)
 * Gerencia a integridade, expiração e dados em tempo real da oferta.
 * * [RESPONSABILIDADES]:
 * 1. Interface Unificada: Consolida o payload da Superbid com as regras de negócio sbX.
 * 2. Segurança Zero-Trust: Valida o token da oferta (sbx_offer) antes de expor os dados.
 * 3. Protocolo de Amnésia: Qualquer falha de token (401/403) derruba a sessão local.
 */

export interface BFFOfferDetails {
  id: number;
  price: number;
  priceFormatted: string;
  sellerName: string;
  offerDescription: string;
  statusId: number;
  saleStatus: number;
  metadata: {
    expiresAt: string;
    isValidated: boolean;
  };
}

/**
 * Busca detalhes da oferta com validação de token sbx_offer.
 * @param offerToken O token criptografado (sbx_offer) que contém os claims de acesso.
 */
export const fetchOfferDetails = async (offerToken: string): Promise<BFFOfferDetails> => {
  const isBrowser = typeof window !== 'undefined';
  const storedAmbiente = isBrowser ? (localStorage.getItem("sandbox_env") || "stage") : "stage";
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

  // [NETWORK]: Chamada via Edge Function protegida
  const response = await fetch(`${supabaseUrl}/functions/v1/sbx-offer`, {
    method: "GET",
    headers: {
      "Authorization": `Bearer ${supabaseAnonKey}`,
      "apikey": supabaseAnonKey,
      
      // [SECURITY]: O Token Híbrido sbx_offer vai aqui.
      // A Edge Function 'sbx-offer' deve validar a assinatura, o user_id e a expiração.
      "x-sbx-offer-token": offerToken,
      
      "x-sbx-env": storedAmbiente,
      "Content-Type": "application/json"
    },
  });

  if (response.status === 401 || response.status === 403) {
    // Protocolo de Amnésia para ofertas inválidas/sequestradas
    window.dispatchEvent(new CustomEvent('session_expired'));
    throw new Error("OFFER_ACCESS_DENIED");
  }

  if (response.status === 410) {
    // Código 410 (Gone): Oferta expirada (TTL atingido)
    throw new Error("OFFER_EXPIRED");
  }

  if (!response.ok) {
    throw new Error("OFFER_API_ERROR");
  }

  return response.json();
};