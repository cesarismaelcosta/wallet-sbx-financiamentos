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
    // Busca do storage na inicialização
    const storedToken = localStorage.getItem("session_token");
    const storedUserId = localStorage.getItem("user_id");

    if (storedToken) {
      setToken(storedToken);
      setUserId(storedUserId);
    }
    setIsLoading(false);
  }, []);

  // Função para logar (salva no state e no storage simultaneamente)
  const setSession = (newToken: string, newUserId?: string) => {
    localStorage.setItem("session_token", newToken);
    setToken(newToken);
    
    if (newUserId) {
      localStorage.setItem("user_id", newUserId);
      setUserId(newUserId);
    }
  };

  // Função para deslogar (limpa state e storage)
  const logout = () => {
    localStorage.removeItem("session_token");
    localStorage.removeItem("user_id");
    setToken(null);
    setUserId(null);
  };

  return (
    <FinancialAuthContext.Provider value={{ token, userId, isLoading, setSession, logout }}>
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