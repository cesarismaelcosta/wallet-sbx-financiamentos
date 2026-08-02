/**
 * @fileoverview Componente: OfferDetailsNewSBXPAY (Rota: /sbxpay/consultasbx)
 * =========================================================================
 * [ARQUITETURA & CLEAN ARCHITECTURE]
 * =========================================================================
 * Página de sbXPAY isolada para integração do Motor de Ofertas.
 * Execução sequencial estrita: Autenticação -> Perfil (SessionStorage) -> Oferta.
 */

import { useState, useEffect, useMemo } from "react";
import { createLazyFileRoute, useSearch } from "@tanstack/react-router";
import { useFinancialAuth } from "@/integrations/auth/FinancialAuthContext";
import { getStoredUserProfile } from "@/services/session";
import type { BFFUserProfile } from "@/services/types";
import { fetchOfferDetails } from "@/services/offer";
import { Offer, Manager, Event, Seller } from "@/features/financial-hub/components/shared/types";

// =========================================================================
// [ROTEAMENTO]: Registro TanStack Router (Lazy Loading)
// =========================================================================
export const Route = createLazyFileRoute("/sbxpay/consultasbx")({
  component: OfferDetailsNewSBXPAY,
});

// =========================================================================
// [TIPAGEM]: Contratos de Domínio
// =========================================================================
interface OfferDataPayload {
  offer: Offer;
  manager: Manager;
  event: Event;
  seller: Seller;
}

// =========================================================================
// [COMPONENTE PRINCIPAL]
// =========================================================================
export function OfferDetailsNewSBXPAY() {
  const { sessionToken } = useFinancialAuth();
  const [fotoAtiva, setFotoAtiva] = useState(0);
  const navigate = Route.useNavigate();
  const search = useSearch({ strict: false });
  const offerParam = (search as any).offer as string | undefined;
  const DEFAULT_OFFER = "4755461";

  const offerId = offerParam || DEFAULT_OFFER;

  // Força URL com o ID padrão se não houver oferta informada
  useEffect(() => {
    if (!offerParam) {
      navigate({
        to: "/sbxpay/consultasbx",
        search: { offer: DEFAULT_OFFER },
        replace: true,
      });
    }
  }, [offerParam, navigate]);

  // =========================================================================
  // [STATE]: Gerenciamento de Estado UI e Dados
  // =========================================================================
  const [loading, setLoading] = useState(true);
  const [userData, setUserData] = useState<BFFUserProfile | null>(null);
  const [offerData, setOfferData] = useState<OfferDataPayload | null>(null);
  const [error, setError] = useState<string | null>(null);

  // =========================================================================
  // [EFFECTS]: Ciclo de Vida e Hidratação de Dados
  // =========================================================================
  useEffect(() => {
    const loadData = async () => {
      if (!sessionToken) {
        setError("Usuário não autenticado.");
        setLoading(false);
        return;
      }

      setLoading(true);

      try {
        // Passo A: Identificação do usuário via storage local seguro da sessão
        const profile = getStoredUserProfile() as BFFUserProfile | null;
        setUserData(profile);

        // Passo B: Resgate dos metadados da oferta e vendedor
        const offer = await fetchOfferDetails(offerId);
        setOfferData(offer);
      } catch (err: any) {
        setError(err.message || "Erro ao carregar os dados.");
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [sessionToken, offerId]);

  // =========================================================================
  // Imagens da oferta
  // =========================================================================
  const imagens = useMemo(() => {
    if (!offerData?.offer?.photos) return [];
    return [...offerData.offer.photos]
      .sort((a, b) => (a.highlight === b.highlight ? 0 : a.highlight ? -1 : 1))
      .map((p: any) => p.link);
  }, [offerData]);

  // =========================================================================
  // [VIEW 1]: Estado de Carregamento
  // =========================================================================
  if (loading) {
    return <div className="p-6 font-bold text-gray-500">Carregando dados...</div>;
  }

  // =========================================================================
  // [VIEW 2]: Renderização Principal (Data Display)
  // =========================================================================
  return (
    <div className="p-6 max-w-4xl mx-auto">
      {error && <div className="bg-red-50 p-4 mb-6 text-red-700 rounded border border-red-200 font-bold">{error}</div>}

      <div className="space-y-6">
        {/* 1. DETALHES DA OFERTA */}
        <section className="bg-white p-6 rounded shadow border-l-4 border-[#B300FF]">
          <h2 className="text-xs font-black uppercase text-[#B300FF] mb-2">Oferta Relacionada</h2>
          {offerData ? (
            <div className="text-sm">
              <p className="font-bold mb-4">{offerData.offer.offer_description}</p>

              {imagens.length > 0 && (
                <div className="relative w-full aspect-video bg-black rounded-lg overflow-hidden mb-4">
                  <img src={imagens[fotoAtiva]} className="w-full h-full object-contain" alt="Ativo" />
                  <button
                    onClick={() => setFotoAtiva((p) => (p - 1 + imagens.length) % imagens.length)}
                    className="absolute left-2 top-1/2 bg-black/50 text-white p-2"
                  >
                    ‹
                  </button>
                  <button
                    onClick={() => setFotoAtiva((p) => (p + 1) % imagens.length)}
                    className="absolute right-2 top-1/2 bg-black/50 text-white p-2"
                  >
                    ›
                  </button>
                </div>
              )}

              <pre className="font-mono text-[10px] bg-gray-50 p-3 rounded border overflow-x-auto">
                {JSON.stringify(offerData, null, 2)}
              </pre>
            </div>
          ) : (
            <p className="text-gray-400 italic">Carregando oferta...</p>
          )}
        </section>

        {/* 2. PERFIL DO USUÁRIO */}
        <section className="bg-white p-6 rounded shadow border-l-4 border-[#B300FF]">
          <h2 className="text-xs font-black uppercase text-[#B300FF] mb-2">Perfil Completo</h2>
          {userData ? (
            <pre className="font-mono text-[10px] bg-gray-50 p-3 rounded border overflow-x-auto text-gray-800">
              {JSON.stringify(userData, null, 2)}
            </pre>
          ) : (
            <p className="text-gray-400 italic">Nenhum perfil de sessão encontrado.</p>
          )}
        </section>
      </div>
    </div>
  );
}