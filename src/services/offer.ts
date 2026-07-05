/**
 * @fileoverview Serviço: Offer Details
 * Busca os detalhes da oferta através da Edge Function sbx-offer.
 * Centraliza a chamada para garantir compliance e segurança.
 * * [RESPONSABILIDADES]:
 * 1. Identidade: O front-end envia o sessionToken (JWT Próprio) no header customizado,
 * mantendo o espelho exato da autenticação de user.ts e protegendo os tokens reais.
 * 2. Contexto: O `offer_id` é enviado via Query Params, desacoplando a oferta da sessão.
 * 3. Gateway Bypass: Utiliza a Anon Key do Supabase para transpor o Kong Gateway.
 * 4. Delegação de Rota: Erros 401 lançam exceções, abortam o fluxo local e 
 * ativam o Protocolo de Amnésia global.
 * * @author Cesar Ismael Pereira da Costa
 * @version 2.1.0 (Alinhamento de Autenticação x-session-token)
 */

import type { Offer, Manager, Event, Seller } from "../components/shared/types";

export const fetchOfferDetails = async (
  sessionToken: string, 
  offerId: string | number
): Promise<{ offer: Offer; manager: Manager; event: Event; seller: Seller }> => {
  
  const isBrowser = typeof window !== 'undefined';
  const storedAmbiente = isBrowser ? (localStorage.getItem("sbx_environment") || "stage") : "stage";
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

  // DEBUG: Validação do payload e do id da oferta antes da chamada
  console.log("DEBUG_OFFER_SERVICE:", { 
    url: supabaseUrl, 
    offerId: offerId,
    hasKey: !!supabaseAnonKey, 
    token: sessionToken ? "presente" : "ausente" 
  });
  
  // A URL embute o offer_id como parâmetro (Contexto)
  const response = await fetch(`${supabaseUrl}/functions/v1/sbx-offer?offer_id=${offerId}`, {
    method: "GET",
    headers: {
      "Authorization": `Bearer ${supabaseAnonKey}`,
      "apikey": supabaseAnonKey,
      "x-session-token": sessionToken, // Identidade (Alinhado com fetchMyProfile)
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