/**
 * @fileoverview Contexto: FinancialAuthContext
 * @path src/integrations/auth/FinancialAuthContext.tsx
 * @description Contexto de autenticação exclusivo para o sbXPAY/Financial Hub.
 * Lê, gerencia e propaga o session_token e user_id utilizando estritamente 
 * sessionStorage (Zero localStorage), com preservação de preferência de ambiente 
 * na expiração automática (amnésia) e limpeza total no logout manual.
 */

import React, { createContext, useContext, useState, useEffect } from "react";

interface FinancialAuthContextType {
  sessionToken: string | null;
  userId: string | null;
  isLoading: boolean;
  setSession: (token: string, userId?: string) => void; 
  logout: () => void;
}

const FinancialAuthContext = createContext<FinancialAuthContextType | undefined>(undefined);

export function FinancialAuthProvider({ children }: { children: React.ReactNode }) {
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // -----------------------------------------------------------------------
  // [ACTIONS]: Métodos de Mutação e Gestão de Sessão
  // -----------------------------------------------------------------------

  /**
   * Armazena o token e opcionalmente o ID do usuário no sessionStorage
   * e atualiza o estado reativo do contexto.
   */
  const setSession = (token: string, newUserId?: string) => {
    if (typeof window !== 'undefined') {
      sessionStorage.setItem("session_token", token);
      if (newUserId) {
        sessionStorage.setItem("user_id", newUserId);
        setUserId(newUserId);
      }
    }
    setSessionToken(token);
  };

  /**
   * Protocolo de Amnésia (Expiração automática / Timeout):
   * Remove apenas os tokens e metadados de sessão, mantendo 'sbx_env_pref' intacto.
   */
  const handleAmnesia = () => {
    console.warn("🚨 [SECURITY] Sessão expirada. Protocolo de Amnésia ativado.");
    
    if (typeof window !== 'undefined') {
      sessionStorage.removeItem("session_token");
      sessionStorage.removeItem("user_id");
      sessionStorage.removeItem("session_expires_at");
      sessionStorage.removeItem("time_delta");
    }

    setSessionToken(null);
    setUserId(null);
  };

  /**
   * Logout manual (Clique no botão de Sair):
   * Executa limpeza total do sessionStorage, apagando tudo inclusive o 'sbx_env_pref'.
   */
  const logout = () => {
    if (typeof window !== 'undefined') {
      sessionStorage.clear(); // Apaga tudo, inclusive o 'sbx_env_pref'
    }
    setSessionToken(null);
    setUserId(null);
  };

  // -----------------------------------------------------------------------
  // [SECURITY]: Listener Global do Protocolo de Amnésia
  // -----------------------------------------------------------------------
  useEffect(() => {
    window.addEventListener('session_expired', handleAmnesia);
    return () => window.removeEventListener('session_expired', handleAmnesia);
  }, []);

  // -----------------------------------------------------------------------
  // [STATE]: Hidratação Inicial (Mount via SessionStorage)
  // -----------------------------------------------------------------------
  useEffect(() => {
    if (typeof window === 'undefined') return;
    
    const storedToken = sessionStorage.getItem("session_token");
    const storedUserId = sessionStorage.getItem("user_id");

    if (storedToken) {
      setSessionToken(storedToken);
      setUserId(storedUserId);
    }
    
    setIsLoading(false);
  }, []);

  return (
    <FinancialAuthContext.Provider value={{ sessionToken, userId, isLoading, setSession, logout }}>
      {children}
    </FinancialAuthContext.Provider>
  );
}

export function useFinancialAuth() {
  const context = useContext(FinancialAuthContext);
  if (context === undefined) {
    throw new Error("useFinancialAuth deve ser usado dentro de um FinancialAuthProvider");
  }
  return context;
}