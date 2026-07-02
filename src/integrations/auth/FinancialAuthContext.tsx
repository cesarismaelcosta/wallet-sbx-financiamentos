/**
 * @fileoverview FinancialAuthContext
 * @description Contexto de autenticação exclusivo para o Sandbox/Financial Hub.
 * Lê, gerencia e propaga o session_token e user_id para toda a aplicação.
 */

import React, { createContext, useContext, useState, useEffect } from "react";

interface FinancialAuthContextType {
  token: string | null; // Nosso session_token (UUID)
  sbxToken: string | null; // Novo: o token da Superbid
  userId: string | null;
  isLoading: boolean;
  setSession: (token: string, sbxToken: string, userId?: string) => void; 
  logout: () => void;
}

const FinancialAuthContext = createContext<FinancialAuthContextType | undefined>(undefined);

export function FinancialAuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [sbxToken, setSbxToken] = useState<string | null>(null); // Novo estado
  const [userId, setUserId] = useState<string | null>(null);
  
  // Começa como true para evitar renderizar rotas protegidas antes de ler o storage
  const [isLoading, setIsLoading] = useState(true);

  // -----------------------------------------------------------------------
  // [SECURITY]: Protocolo de Amnésia (Escuta Global)
  // -----------------------------------------------------------------------
  useEffect(() => {
    const handleAmnesia = () => {
      console.warn("🚨 [SECURITY] Sessão expirada. Protocolo de Amnésia ativado.");
      
      // 1. LIMPEZA TOTAL AGRESSIVA (Evita Cross-User Data Leak na esteira de crédito)
      localStorage.clear();
      sessionStorage.clear();

      // 2. RESETA O ESTADO GLOBAL
      setToken(null);
      setSbxToken(null);
      setUserId(null);
      
      // 3. EXPULSÃO FÍSICA E DEFINITIVA
      // Diferente do logout manual, não guardamos o "redirect" da URL. 
      // Se a sessão expirou no meio da simulação, a esteira foi corrompida. 
      // O usuário (ou o próximo) deve recomeçar do zero.
      window.location.href = '/accounts/signin?reason=expired';
    };

    // Abre os ouvidos para escutar os disparos dos Guards (financiamentos.lazy) e API (user.ts)
    window.addEventListener('session_expired', handleAmnesia);
    
    return () => window.removeEventListener('session_expired', handleAmnesia);
  }, []);

  // -----------------------------------------------------------------------
  // [STATE]: Hidratação Inicial (Mount)
  // -----------------------------------------------------------------------
  useEffect(() => {
    // [BUSINESS LOGIC]: Hidratação segura dos dados persistidos no cliente
    const storedToken = localStorage.getItem("session_token");
    const storedSbxToken = localStorage.getItem("sbx_access_token"); // [FIX]: Agora o sbxToken sobrevive ao F5
    const storedUserId = localStorage.getItem("user_id");

    console.log("🔍 [AuthContext] Carregando sessão:", { 
      hasToken: !!storedToken, 
      userId: storedUserId 
    });

    if (storedToken) {
      setToken(storedToken);
      setSbxToken(storedSbxToken);
      setUserId(storedUserId);
    }
    
    // [COMPLIANCE]: Desliga o carregador apenas após garantir que o state absorveu o storage
    setIsLoading(false);
  }, []);

  // -----------------------------------------------------------------------
  // [ACTIONS]: Métodos de Mutação
  // -----------------------------------------------------------------------
  // Função para logar (salva no state e no storage simultaneamente)
  const setSession = (newToken: string, newSbxToken: string, newUserId?: string) => {
    localStorage.setItem("session_token", newToken);
    localStorage.setItem("sbx_access_token", newSbxToken); // Salva no storage
    setToken(newToken);
    setSbxToken(newSbxToken);
    
    if (newUserId) {
      localStorage.setItem("user_id", newUserId);
      setUserId(newUserId);
    }
  };

  // Função para deslogar (limpa state e storage corretamente)
  const logout = () => {
    // 1. Removemos tudo agressivamente para garantir segurança máxima em apps financeiros
    localStorage.clear();
    sessionStorage.clear();

    // 2. Reseta o estado para null
    setToken(null);
    setSbxToken(null);
    setUserId(null);
    
    // 3. Redireciona para a tela de login mantendo o redirect apenas se for intencional
    const currentPath = window.location.pathname + window.location.search;
    window.location.href = `/accounts/signin?redirect=${encodeURIComponent(currentPath)}`;
  };

  return (
    <FinancialAuthContext.Provider value={{ token, sbxToken, userId, isLoading, setSession, logout }}>
      {children}
    </FinancialAuthContext.Provider>
  );
}

// Hook personalizado para usar em qualquer componente
export function useFinancialAuth() {
  const context = useContext(FinancialAuthContext);
  if (context === undefined) {
    throw new Error("useFinancialAuth deve ser usado dentro de um FinancialAuthProvider");
  }
  return context;
}