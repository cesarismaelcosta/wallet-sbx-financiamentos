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

  useEffect(() => {
    const storedToken = localStorage.getItem("session_token");
    const storedUserId = localStorage.getItem("user_id");

    console.log("🔍 [AuthContext] Carregando sessão:", { 
      hasToken: !!storedToken, 
      userId: storedUserId 
    });

    // Só valida a sessão se os DOIS tokens existirem.
    // Se faltar o token da Superbid, a sessão é inválida e limpamos o estado.
    if (storedToken) {
      setToken(storedToken);
      setUserId(storedUserId);
    } else {
      localStorage.removeItem("session_token");
      localStorage.removeItem("user_id");
      setToken(null);
      setUserId(null);
    }
    setIsLoading(false);
  }, []);

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
    // 1. Remove TUDO o que foi salvo, sem exceção
    localStorage.removeItem("session_token");
    localStorage.removeItem("sbx_access_token");
    localStorage.removeItem("user_id");
    localStorage.removeItem("sandbox_env");

    // 2. Reseta o estado para null
    setToken(null);
    setSbxToken(null); // <--- Garante que o estado do React também limpe
    setUserId(null);

    // 3. Força o refresh para limpar qualquer cache em memória
    window.location.href = '/accounts/signin';
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