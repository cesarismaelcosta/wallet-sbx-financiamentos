/**
 * @fileoverview Componente: OfferDetailsNewSandbox (Flow: Sequential Auth & Resilient Orchestration)
 * * ARQUITETURA DE VIEW E AGREGAÇÃO SEQUENCIAL:
 * Garantia de execução sequencial: 1. Auth/Perfil -> 2. Oferta.
 * Implementa logs agressivos para diagnóstico de rede no console.
 * * [RESPONSABILIDADES]:
 * 1. Sequenciamento: Executa o fetch do usuário e, mediante sucesso, busca a oferta.
 * 2. Observabilidade: Logs de console em cada etapa da orquestração.
 * 3. Renderização: Exibe os dois contextos de forma unificada e reativa.
 * * @author Cesar Ismael Pereira da Costa
 * @version 4.3.0 (Debugging Ativo)
 */

import { useState, useEffect } from "react";
import { createLazyFileRoute, useNavigate } from "@tanstack/react-router";
import { useFinancialAuth } from "@/integrations/auth/FinancialAuthContext";
import { fetchMyProfile, type BFFUserProfile } from "@/services/user";
import { fetchOfferDetails } from "@/services/offer";
import { Offer, Manager, Event, Seller } from "../_shared/types";

export const Route = createLazyFileRoute("/sandbox/offer_new")({
  component: OfferDetailsNewSandbox,
});

interface OfferDataPayload {
  offer: Offer;
  manager: Manager;
  event: Event;
  seller: Seller;
}

export function OfferDetailsNewSandbox() {
  const navigate = useNavigate();
  const auth = useFinancialAuth();
  
  const [loading, setLoading] = useState(true);
  const [userData, setUserData] = useState<BFFUserProfile | null>(null);
  const [offerData, setOfferData] = useState<OfferDataPayload | null>(null);
  const [errorLog, setErrorLog] = useState<string | null>(null);

  const token = auth.token || auth.accessToken; 
  const offerId = "2969794";

  useEffect(() => {
    const runSequence = async () => {
      console.log("[DEBUG:FLOW] Iniciando sequência...");
      
      if (!token) {
        console.error("[DEBUG:FLOW] Token ausente!");
        setErrorLog("Token ausente");
        setLoading(false);
        return;
      }

      setLoading(true);

      // PASSO 1: Fetch Usuário
      try {
        console.log("[DEBUG:FLOW] Chamando fetchMyProfile...");
        const user = await fetchMyProfile(token);
        console.log("[DEBUG:FLOW] Usuário recebido:", user);
        setUserData(user);
        
        // PASSO 2: Fetch Oferta
        try {
          console.log("[DEBUG:FLOW] Chamando fetchOfferDetails...");
          const offer = await fetchOfferDetails(token, offerId);
          console.log("[DEBUG:FLOW] Oferta recebida:", offer);
          setOfferData(offer);
        } catch (err: any) {
          console.error("[DEBUG:FLOW] Erro na Oferta:", err);
          setErrorLog(`Oferta: ${err.message}`);
        }
      } catch (err: any) {
        console.error("[DEBUG:FLOW] Erro no Usuário:", err);
        setErrorLog(`Usuário: ${err.message}`);
      } finally {
        setLoading(false);
      }
    };

    runSequence();
  }, [token]);

  if (loading) return <div className="p-6">Carregando dados...</div>;

  return (
    <div className="p-6 max-w-4xl mx-auto">
      {errorLog && <div className="bg-red-100 p-4 mb-4 text-red-700">Erro: {errorLog}</div>}
      
      <section className="bg-white p-6 rounded shadow border-l-4 border-blue-500 mb-6">
        <h2 className="text-xs font-black uppercase text-blue-500 mb-2">Perfil Identificado</h2>
        <p className="font-bold">{userData?.name || "Não carregado"}</p>
      </section>

      <section className="bg-white p-6 rounded shadow border-l-4 border-green-500">
        <h2 className="text-xs font-black uppercase text-green-500 mb-2">Oferta Relacionada</h2>
        <pre className="font-mono text-xs">{JSON.stringify(offerData, null, 2)}</pre>
      </section>
    </div>
  );
}