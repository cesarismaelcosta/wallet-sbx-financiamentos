import { useState, useEffect } from "react";
import { createLazyFileRoute, useNavigate } from "@tanstack/react-router";
// import { Loader2, AlertCircle, ArrowLeft } from "lucide-react"; // Descomente se for usar

import { useFinancialAuth } from "@/integrations/auth/FinancialAuthContext";
import { orchestrateNavigation } from "@/features/financial-hub/core/hooks/useOrchestrator";
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
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<OfferDataPayload | null>(null);

  const token = auth.token || auth.accessToken; 

  // =====================================================================
  // 1. CAPTURAR O ID DA OFERTA (Pegando da URL do navegador)
  // Ex: se o usuário estiver em /sandbox/offer_new?offer_id=230896
  // =====================================================================
  const urlParams = new URLSearchParams(window.location.search);
  const offerId = urlParams.get("offer_id"); // Substitua por um ID fixo (ex: "230896") se quiser testar rápido

  useEffect(() => {
    const fetchOfferData = async () => {
      if (!token) {
        setError("Usuário não autenticado.");
        setLoading(false);
        return;
      }

      // Se a página for carregada sem o ID na URL, abortamos o fetch para evitar o erro 400
      if (!offerId) {
        setError("Nenhum ID de oferta foi passado na URL (?offer_id=...).");
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        // =====================================================================
        // 2. CORREÇÃO DO ERRO 400: Adicionando ?offer_id= na URL da Edge Function
        // =====================================================================
        const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/sbx-offer?offer_id=${offerId}`, {
          method: "GET",
          headers: {
            "x-sbx-offer-token": token, 
            "x-sbx-env": "stage",
          },
        });

        if (!response.ok) {
           const errorDetails = await response.text();
           throw new Error(`Erro na API (${response.status}): ${errorDetails}`);
        }

        const payload: OfferDataPayload = await response.json();
        setData(payload);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchOfferData();
  }, [token, offerId]); // offerId adicionado nas dependências

  const handleSimulacao = async () => {
    if (!data) return;
    const payload = {
      action: "SIMULATE",
      timestamp: new Date().toISOString(),
      offer: data.offer,
      manager: data.manager,
      event: data.event,
      seller: data.seller,
    };
    await orchestrateNavigation("SIMULATE", payload as any);
  };

  if (loading) return <div>Carregando...</div>;
  if (error) return <div style={{color: 'red'}}>Erro: {error}</div>;

  return (
    <div className="p-6">
      <button onClick={() => navigate({ to: "/sandbox" })}>Voltar</button>
      <h1 className="text-xl font-bold mt-4">{data?.offer.offer_description}</h1>
      <button onClick={handleSimulacao} className="bg-purple-600 text-white p-3 mt-4">
        Ir para Simulação
      </button>
    </div>
  );
}