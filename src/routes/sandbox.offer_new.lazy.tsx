/**
 * @fileoverview Componente: OfferDetailsNewSandbox (Flow: Sequential Auth & Resilient Orchestration)
 * * ARQUITETURA DE VIEW E AGREGAÇÃO SEQUENCIAL:
 * Este componente garante a integridade da sessão do usuário antes de buscar dados 
 * da oferta, prevenindo chamadas órfãs e isolando falhas de serviço.
 * * [RESPONSABILIDADES]:
 * 1. Sequenciamento: Executa o fetch do usuário e, mediante sucesso, tenta buscar a oferta.
 * 2. Resiliência: Isola o erro da oferta para permitir a visualização parcial do perfil.
 * 3. Renderização: Exibe os dois contextos de forma unificada e reativa.
 * * @author Cesar Ismael Pereira da Costa
 * @version 4.2.0 (Refatoração: Isolamento de falhas e estados independentes)
 */

import { useState, useEffect } from "react";
import { createLazyFileRoute, useNavigate } from "@tanstack/react-router";

import { useFinancialAuth } from "@/integrations/auth/FinancialAuthContext";
import { orchestrateNavigation } from "@/features/financial-hub/core/hooks/useOrchestrator";

// [NETWORK]: Importação explícita dos dois serviços
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
  const [userError, setUserError] = useState<string | null>(null);
  const [offerError, setOfferError] = useState<string | null>(null);
  
  const [userData, setUserData] = useState<BFFUserProfile | null>(null);
  const [offerData, setOfferData] = useState<OfferDataPayload | null>(null);

  const token = auth.token || auth.accessToken; 
  const offerId = "2969794";

  useEffect(() => {
    const runSequence = async () => {
      if (!token) {
        setUserError("Usuário não autenticado.");
        setLoading(false);
        return;
      }

      setLoading(true);

      // [FLOW]: Chamada 1 - Perfil do Usuário (Obrigatório)
      try {
        const user = await fetchMyProfile(token);
        setUserData(user);
        
        // [FLOW]: Chamada 2 - Detalhes da Oferta (Opcional para a tela)
        try {
          const offer = await fetchOfferDetails(token, offerId);
          setOfferData(offer);
        } catch (err: any) {
          setOfferError(err.message); // Apenas marca o erro da oferta
        }

      } catch (err: any) {
        setUserError(err.message); // Falha crítica: usuário não carregou
      } finally {
        setLoading(false);
      }
    };

    runSequence();
  }, [token]);

  const handleSimulacao = async () => {
    if (!offerData) return;
    const payload = {
      action: "SIMULATE",
      timestamp: new Date().toISOString(),
      offer: offerData.offer,
      manager: offerData.manager,
      event: offerData.event,
      seller: offerData.seller,
    };
    await orchestrateNavigation("SIMULATE", payload as any);
  };

  // [RENDER]: Estados de Loading ou Erro Crítico de Identidade
  if (loading) return <div className="p-6">Orquestrando fluxos...</div>;
  if (userError) return <div className="p-6 text-red-500 font-bold">Erro Crítico: {userError}</div>;

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <button onClick={() => navigate({ to: "/sandbox" })} className="mb-6 underline">Voltar</button>
      
      <div className="space-y-6">
        {/* PERFIL (Sempre visível se carregou) */}
        <section className="bg-white p-6 rounded shadow border-l-4 border-blue-500">
          <h2 className="text-xs font-black uppercase text-blue-500 mb-2">Perfil Identificado</h2>
          <p className="font-bold">{userData?.name}</p>
        </section>

        {/* OFERTA (Com tratamento de erro independente) */}
        <section className="bg-white p-6 rounded shadow border-l-4 border-green-500">
          <h2 className="text-xs font-black uppercase text-green-500 mb-2">Oferta Relacionada</h2>
          {offerError ? (
            <p className="text-red-500 italic">Erro ao carregar oferta: {offerError}</p>
          ) : (
            <p className="font-bold">{offerData?.offer.offer_description}</p>
          )}
        </section>
      </div>

      {!offerError && (
        <button onClick={handleSimulacao} className="mt-8 w-full bg-purple-600 text-white p-4 rounded font-bold">
          Ir para Simulação
        </button>
      )}
    </div>
  );
}