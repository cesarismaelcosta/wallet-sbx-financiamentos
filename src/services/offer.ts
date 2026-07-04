/**
 * @fileoverview Serviço: Offer Details
 * Busca os detalhes da oferta através da Edge Function sbx-offer.
 * Centraliza a chamada para garantir compliance e segurança.
 * * [RESPONSABILIDADES]:
 * 1. Identidade: O front-end envia o offer_token (JWT de Sessão) no header,
 * mantendo os tokens reais da API da Superbid protegidos no servidor.
 * 2. Contexto: O `offer_id` é enviado via Query Params, desacoplando a oferta da sessão.
 * 3. Gateway Bypass: Utiliza a Anon Key do Supabase para transpor o Kong Gateway.
 * 4. Delegação de Rota: Erros 401 lançam exceções, abortam o fluxo local e 
 * ativam o Protocolo de Amnésia global.
 * * @author Cesar Ismael Pereira da Costa
 * @version 2.0.0 (Correção Arquitetural JWT + URL Params)
 */

// Importando isoladamente apenas os 4 tipos reais do seu ecossistema
import type { Offer, Manager, Event, Seller } from "../components/shared/types";

// A Promise agora apenas agrupa os 4 tipos importados
export const fetchOfferDetails = async (
  offerToken: string, 
  offerId: string | number
): Promise<{ offer: Offer; manager: Manager; event: Event; seller: Seller }> => {
  
  const isBrowser = typeof window !== 'undefined';
  const storedAmbiente = isBrowser ? (localStorage.getItem("sandbox_env") || "stage") : "stage";
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

  // DEBUG: Validação do payload antes da chamada
  console.log("DEBUG_OFFER_SERVICE:", { 
    url: supabaseUrl, 
    offerId: offerId,
    hasKey: !!supabaseAnonKey, 
    token: offerToken ? "presente" : "ausente" 
  });
  
  // A URL agora embute o offer_id como parâmetro
  const response = await fetch(`${supabaseUrl}/functions/v1/sbx-offer?offer_id=${offerId}`, {
    method: "GET",
    headers: {
      "Authorization": `Bearer ${supabaseAnonKey}`,
      "apikey": supabaseAnonKey,
      "x-sbx-offer-token": offerToken, // Apenas a prova de identidade
      "x-sbx-env": storedAmbiente,
      "Content-Type": "application/json",
      "Accept": "application/json"
    },
  });

  // Tratamento de Sessão Inválida ou Expirada
  if (response.status === 401 || response.status === 403) {
    window.dispatchEvent(new CustomEvent('session_expired'));
    throw new Error("OFFER_ACCESS_DENIED");
  }

  // Tratamento de Oferta não encontrada / encerrada
  if (response.status === 410) {
    throw new Error("OFFER_EXPIRED");
  }

  // Falha Genérica / Upstream
  if (!response.ok) {
    throw new Error("OFFER_API_ERROR");
  }
  
  return response.json();
};