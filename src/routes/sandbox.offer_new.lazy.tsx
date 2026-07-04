import { useState, useEffect } from "react";
import { createLazyFileRoute, useNavigate } from "@tanstack/react-router";
import { Loader2, AlertCircle, ArrowLeft } from "lucide-react";

// [IMPORTS CORRIGIDOS] - Verifique se o caminho abaixo está correto no seu projeto
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
  // Inicializando o hook de auth
  const auth = useFinancialAuth();
  
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<OfferDataPayload | null>(null);

  // [DEBUG] - Se o seu token estiver em outra propriedade, troque 'auth.token' pelo nome correto
  const token = auth.token || auth.accessToken; 

  useEffect(() => {
    const fetchOfferData = async () => {
      if (!token) {
        setError("Usuário não autenticado.");
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/sbx-offer`, {
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
  }, [token]);

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