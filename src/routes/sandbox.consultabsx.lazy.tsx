/**
 * @fileoverview Componente: OfferDetailsNewSandbox (Rota: /sandbox/consultabsx)
 * * =========================================================================
 * [ARQUITETURA & CLEAN ARCHITECTURE]
 * =========================================================================
 * Página de Sandbox isolada para testes de integração do Motor de Ofertas.
 * Execução sequencial estrita: Autenticação -> Perfil (BFF) -> Oferta.
 * * [RESPONSABILIDADES DA REFATORAÇÃO (COERÊNCIA DE CONTRATO)]:
 * 1. Higienização de Estado: Desestruturação explícita do 'token' do contexto.
 * 2. Segurança de Tipagem: Eliminação do fallback inseguro 'auth.accessToken'.
 * 3. Ciclo de Vida Reativo: Blindagem do useEffect para reagir apenas à sessão oficial.
 */

import { useState, useEffect } from "react";
import { createLazyFileRoute } from "@tanstack/react-router";
import { useFinancialAuth } from "@/integrations/auth/FinancialAuthContext";
import { fetchMyProfile, type BFFUserProfile } from "@/services/user";
import { fetchOfferDetails } from "@/services/offer";
import { Offer, Manager, Event, Seller } from "../_shared/types";

// =========================================================================
// [ROTEAMENTO]: Registro TanStack Router (Lazy Loading)
// =========================================================================
export const Route = createLazyFileRoute("/sandbox/consultabsx")({
  component: OfferDetailsNewSandbox,
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
export function OfferDetailsNewSandbox() {
  // 1. [SECURITY CORE]: Extração Desestruturada de Identidade
  // Ao invés de importar o objeto 'auth' inteiro e usar condicionais (auth.token || auth.accessToken),
  // forçamos o contrato da interface. O 'token' extraído aqui é, arquiteturalmente,
  // o 'session_token' (JWT interno assinado pela nossa Edge Function).
  const { token } = useFinancialAuth();
  
  // =========================================================================
  // [STATE]: Gerenciamento de Estado UI e Dados
  // =========================================================================
  const [loading, setLoading] = useState(true);
  const [userData, setUserData] = useState<BFFUserProfile | null>(null);
  const [offerData, setOfferData] = useState<OfferDataPayload | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Mock de ID de Oferta para o ambiente de testes
  const offerId = "4739764";

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
      if (!token) {
        setError("Usuário não autenticado.");
        setLoading(false);
        return;
      }

      setLoading(true);
      
      try {
        // 3. [ORQUESTRAÇÃO SEQUENCIAL]
        // Passo A: Identificação do usuário
        const user = await fetchMyProfile(token);
        setUserData(user);
        
        // Passo B: Resgate dos metadados da oferta e vendedor
        const offer = await fetchOfferDetails(token, offerId);
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
  }, [token]); // O efeito reage EXCLUSIVAMENTE a mudanças no JWT assinado.

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
        {/* SESSÃO: PERFIL DO USUÁRIO (BFF) */}
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

        {/* SESSÃO: DETALHES DA OFERTA (UPSTREAM) */}
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