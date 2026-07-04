/**
 * @fileoverview Componente: OfferDetailsNewSandbox
 * Execução sequencial: Perfil -> Oferta.
 */

import { useState, useEffect } from "react";
import { createLazyFileRoute } from "@tanstack/react-router";
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
  const auth = useFinancialAuth();
  
  const [loading, setLoading] = useState(true);
  const [userData, setUserData] = useState<BFFUserProfile | null>(null);
  const [offerData, setOfferData] = useState<OfferDataPayload | null>(null);
  const [error, setError] = useState<string | null>(null);

  const token = auth.token || auth.accessToken; 
  const offerId = "2969794";

  useEffect(() => {
    const loadData = async () => {
      if (!token) {
        setError("Usuário não autenticado.");
        setLoading(false);
        return;
      }

      setLoading(true);
      try {
        const user = await fetchMyProfile(token);
        setUserData(user);
        
        const offer = await fetchOfferDetails(token, offerId);
        setOfferData(offer);
      } catch (err: any) {
        setError(err.message || "Erro ao carregar os dados.");
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [token]);

  if (loading) return <div className="p-6">Carregando dados...</div>;

  return (
    <div className="p-6 max-w-4xl mx-auto">
      {error && (
        <div className="bg-red-50 p-4 mb-6 text-red-700 rounded border border-red-200 font-bold">
          {error}
        </div>
      )}
      
      <div className="space-y-6">
        <section className="bg-white p-6 rounded shadow border-l-4 border-blue-500">
          <h2 className="text-xs font-black uppercase text-blue-500 mb-2">Perfil Completo</h2>
          {userData ? (
            <pre className="font-mono text-[10px] bg-gray-50 p-3 rounded border overflow-x-auto text-gray-800">
              {JSON.stringify(userData, null, 2)}
            </pre>
          ) : (
            <p className="text-gray-400 italic">Carregando...</p>
          )}
        </section>

        <section className="bg-white p-6 rounded shadow border-l-4 border-green-500">
          <h2 className="text-xs font-black uppercase text-green-500 mb-2">Oferta Relacionada</h2>
          {offerData ? (
            <div className="text-sm">
              <p className="font-bold mb-4">{offerData.offer.offer_description}</p>
              <pre className="font-mono text-[10px] bg-gray-50 p-3 rounded border overflow-x-auto">
                {JSON.stringify(offerData, null, 2)}
              </pre>
            </div>
          ) : (
            <p className="text-gray-400 italic">Sem dados de oferta disponíveis.</p>
          )}
        </section>
      </div>
    </div>
  );
}