/**
 * @fileoverview Componente: OfferDetailsNewSBXPAY (Rota: /sbxpay/consultasbx)
 * * =========================================================================
 * [ARQUITETURA & CLEAN ARCHITECTURE]
 * =========================================================================
 * Página de sbXPAY isolada para integração do Motor de Ofertas.
 * Execução sequencial estrita: Autenticação -> Perfil (BFF) -> Oferta.
 * * [RESPONSABILIDADES DA REFATORAÇÃO (COERÊNCIA DE CONTRATO)]:
 * 1. Higienização de Estado: Desestruturação explícita do 'sessionToken' do contexto.
 * 2. Segurança de Tipagem: Eliminação do fallback inseguro 'auth.accesssessionToken'.
 * 3. Ciclo de Vida Reativo: Blindagem do useEffect para reagir apenas à sessão oficial.
 */

import { useState, useEffect, useMemo, useContext } from "react";
import { createLazyFileRoute, useSearch } from "@tanstack/react-router";
import { useFinancialAuth } from "@/integrations/auth/FinancialAuthContext";
import { fetchMyProfile, type BFFUserProfile } from "@/services/user";
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
  // 1. [SECURITY CORE]: Extração Desestruturada de Identidade
  // Ao invés de importar o objeto 'auth' inteiro e usar condicionais (auth.sessionToken || auth.accesssessionToken),
  // forçamos o contrato da interface. O 'sessionToken' extraído aqui é, arquiteturalmente,
  // o 'session_sessionToken' (JWT interno assinado pela nossa Edge Function).
  const { sessionToken } = useFinancialAuth();
  const [fotoAtiva, setFotoAtiva] = useState(0);
  const navigate = Route.useNavigate(); 
  // Pegue o search de forma bruta, sem precisar de validateSearch
  const search = useSearch({ strict: false });
  const offerParam = (search as any).offer as string | undefined;
  const DEFAULT_OFFER = "4755461";

  // Define o ID de forma estática, sem forçar navegação
  const offerId = offerParam || DEFAULT_OFFER;

  // 1. FORÇAR URL: Se não houver offer, redireciona para a mesma rota com o ID padrão
  useEffect(() => {
    if (!offerParam) {
      navigate({
        to: "/sbxpay/consultasbx",
        search: { offer: DEFAULT_OFFER },
        replace: true, // Importante: não polui o histórico
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
  // [EFFECTS]: Ciclo de Vida e Chamadas de Rede (BFF)
  // =========================================================================
  useEffect(() => {
    // Função assíncrona encapsulada para evitar vazamento de memória e 
    // manter a sincronia limpa com a array de dependências do React.
    const loadData = async () => {
      
      // 2. [GUARD CLAUSE]: Prevenção de chamadas anônimas
      // Se não há JWT assinado, aborta a renderização de dados imediatamente.
      // Isso protege as APIs upstream contra requisições malformadas (401).
      if (!sessionToken) {
        setError("Usuário não autenticado.");
        setLoading(false);
        return;
      }

      setLoading(true);

      try {
        // 3. [ORQUESTRAÇÃO SEQUENCIAL]
        // Passo A: Identificação do usuário
        const user = await fetchMyProfile(sessionToken);
        setUserData(user);
        
        // Passo B: Resgate dos metadados da oferta e vendedor
        const offer = await fetchOfferDetails(sessionToken, offerId);
        setOfferData(offer);

      } catch (err: any) {
        // [ERROR HANDLING]: Captura unificada para exibir na UI
        setError(err.message || "Erro ao carregar os dados.");
      } finally {
        // [UI RELEASE]: Libera a tela independentemente de sucesso ou falha
        setLoading(false);
      }
    };

    loadData();
  }, [sessionToken]); // O efeito reage EXCLUSIVAMENTE a mudanças no JWT assinado.

  
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
      
      {/* ALERTA DE ERRO DE SISTEMA/REDE */}
      {error && (
        <div className="bg-red-50 p-4 mb-6 text-red-700 rounded border border-red-200 font-bold">
          {error}
        </div>
      )}
      
      <div className="space-y-6">
        
        {/* 1. SESSÃO: DETALHES DA OFERTA (Agora no topo - Cor: #B300FF) */}
        <section className="bg-white p-6 rounded shadow border-l-4 border-[#B300FF]">
          <h2 className="text-xs font-black uppercase text-[#B300FF] mb-2">Oferta Relacionada</h2>
          {offerData ? (
            <div className="text-sm">
              <p className="font-bold mb-4">{offerData.offer.offer_description}</p>
              
              {/* Quadro das Fotos (Integrado) */}
              {imagens.length > 0 && (
                <div className="relative w-full aspect-video bg-black rounded-lg overflow-hidden mb-4">
                  <img src={imagens[fotoAtiva]} className="w-full h-full object-contain" alt="Ativo" />
                  <button onClick={() => setFotoAtiva(p => (p - 1 + imagens.length) % imagens.length)} className="absolute left-2 top-1/2 bg-black/50 text-white p-2">‹</button>
                  <button onClick={() => setFotoAtiva(p => (p + 1) % imagens.length)} className="absolute right-2 top-1/2 bg-black/50 text-white p-2">›</button>
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

        {/* 2. SESSÃO: PERFIL DO USUÁRIO (Abaixo da oferta) */}
        <section className="bg-white p-6 rounded shadow border-l-4 border-[#B300FF]">
          <h2 className="text-xs font-black uppercase text-[#B300FF] mb-2">Perfil Completo</h2>
          {userData ? (
            <pre className="font-mono text-[10px] bg-gray-50 p-3 rounded border overflow-x-auto text-gray-800">
              {JSON.stringify(userData, null, 2)}
            </pre>
          ) : (
            <p className="text-gray-400 italic">Carregando...</p>
          )}
        </section>

      </div>
    </div>
  );
}