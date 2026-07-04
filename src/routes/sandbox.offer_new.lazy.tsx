/**
 * @fileoverview Componente: OfferDetailsNewSandbox (Test View Integrada)
 * * ARQUITETURA DE VIEW E AGREGAÇÃO DE SERVIÇOS:
 * Este componente atua como a camada de apresentação pura, agregando dados de 
 * múltiplos domínios (User Profile e Offer Details) sem acoplamento de infraestrutura.
 * * [RESPONSABILIDADES]:
 * 1. Consumo de Múltiplos Serviços: Importa e executa `fetchMyProfile` e `fetchOfferDetails`.
 * 2. Concorrência: Utiliza Promise.all para buscar os dados em paralelo (Otimização E2E).
 * 3. Apresentação: Renderiza cards separados para o perfil do usuário e para a oferta do Jaguar.
 * 4. Delegação: Transmite o payload consolidado para o Hub Financeiro.
 * * @author Cesar Ismael Pereira da Costa
 * @version 3.0.0 (Agregação Paralela de Serviços User e Offer)
 */

import { useState, useEffect } from "react";
import { createLazyFileRoute, useNavigate } from "@tanstack/react-router";

// Hooks globais de autenticação e navegação do ecossistema
import { useFinancialAuth } from "@/integrations/auth/FinancialAuthContext";
import { orchestrateNavigation } from "@/features/financial-hub/core/hooks/useOrchestrator";

// Importação exclusiva da camada de serviços (A página não sabe o que é Supabase)
import { fetchOfferDetails } from "../../services/offer"; // Ajuste o caminho se necessário
import { fetchMyProfile, type BFFUserProfile } from "../../services/user"; // Ajuste o caminho se necessário

// Importação do Contrato de Tipagem (E2E Type Safety)
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
  
  // Estados separados para gerenciar as duas fontes de dados de forma limpa
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [offerData, setOfferData] = useState<OfferDataPayload | null>(null);
  const [userData, setUserData] = useState<BFFUserProfile | null>(null);

  const token = auth.token || auth.accessToken; 
  const offerId = "4755890"; // ID do Jaguar fixo para o teste

  useEffect(() => {
    const fetchAllData = async () => {
      if (!token) {
        setError("Usuário não autenticado.");
        setLoading(false);
        return;
      }

      try {
        setLoading(true);

        // =====================================================================
        // AGREGAÇÃO PARALELA DE SERVIÇOS (Alta Performance)
        // Dispara o fetch do perfil e da oferta ao mesmo tempo.
        // =====================================================================
        const [userResult, offerResult] = await Promise.all([
          fetchMyProfile(token),
          fetchOfferDetails(token, offerId)
        ]);

        // Hidrata os estados após o sucesso de ambas as requisições
        setUserData(userResult);
        setOfferData(offerResult);

      } catch (err: any) {
        // Se qualquer um dos serviços falhar ou retornar 401, o catch intercepta
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchAllData();
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

  if (loading) return <div className="p-6 font-bold text-gray-700">Carregando Perfil e Jaguar...</div>;
  if (error) return <div className="p-6 text-red-500 font-bold">Erro: {error}</div>;

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <button onClick={() => navigate({ to: "/sandbox" })} className="mb-6 text-blue-600 underline hover:text-blue-800">
        Voltar
      </button>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
        {/* CARD DO USUÁRIO */}
        <div className="bg-white border-l-4 border-blue-500 shadow p-6 rounded">
          <h2 className="text-sm font-bold text-blue-500 uppercase tracking-wider mb-2">Dados do Usuário (sbx-user)</h2>
          <h1 className="text-xl font-bold text-gray-800">{userData?.name}</h1>
          <p className="text-gray-600 mt-1"><strong>CPF:</strong> {userData?.document}</p>
          <p className="text-gray-600"><strong>Email:</strong> {userData?.email}</p>
          <p className="text-gray-600"><strong>Telefone:</strong> {userData?.phone}</p>
          {userData?.address && (
            <p className="text-sm text-gray-500 mt-3 border-t pt-2">
              {userData.address.street}, {userData.address.number} - {userData.address.city}/{userData.address.state}
            </p>
          )}
        </div>

        {/* CARD DA OFERTA */}
        <div className="bg-white border-l-4 border-green-500 shadow p-6 rounded">
          <h2 className="text-sm font-bold text-green-500 uppercase tracking-wider mb-2">Dados da Oferta (sbx-offer)</h2>
          <h1 className="text-xl font-bold text-gray-800 line-clamp-2">{offerData?.offer.offer_description}</h1>
          <p className="text-gray-600 mt-1"><strong>Lote:</strong> {offerData?.offer.lot_number}</p>
          <p className="text-gray-600"><strong>Vendedor:</strong> {offerData?.seller.trade_name}</p>
          <p className="text-green-600 font-bold text-2xl mt-3 border-t pt-2">
            R$ {offerData?.offer.offer_value?.toLocaleString('pt-BR')}
          </p>
        </div>
      </div>

      <div className="flex justify-end mt-8">
        <button 
          onClick={handleSimulacao} 
          className="bg-purple-600 text-white font-bold py-3 px-8 rounded shadow-lg hover:bg-purple-700 transition transform hover:scale-105"
        >
          Ir para Simulação
        </button>
      </div>
    </div>
  );
}