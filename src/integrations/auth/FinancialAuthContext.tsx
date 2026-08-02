/**
 * @fileoverview Contexto: FinancialAuthContext
 * @path src/integrations/auth/FinancialAuthContext.tsx
 * @description Contexto de autenticação exclusivo para o sbXPAY/Financial Hub.
 * Lê, gerencia e propaga o session_token e user_id utilizando estritamente 
 * sessionStorage (Zero localStorage), com preservação de preferência de ambiente 
 * na expiração automática (amnésia) e limpeza total no logout manual.
 */

import React, { createContext, useContext, useState, useEffect } from "react";
import { manualLogout, clearSession, setSessionToken, authHeaders } from "@/services/session";

interface FinancialAuthContextType {
  sessionToken: string | null;
  userId: string | null;
  isLoading: boolean;
  setSession: (token: string, userId?: string) => void; 
  logout: (opts?: { purgeEnv?: boolean }) => void;
}

const FinancialAuthContext = createContext<FinancialAuthContextType | undefined>(undefined);

export function FinancialAuthProvider({ children }: { children: React.ReactNode }) {
  const [sessionToken, setSessionTokenState] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // -----------------------------------------------------------------------
  // [ACTIONS]: Métodos de Mutação e Gestão de Sessão
  // -----------------------------------------------------------------------

  /**
   * Armazena o token e opcionalmente o ID do usuário utilizando o gerenciador session.ts
   * e atualiza o estado reativo do contexto.
   */
  const setSession = (token: string, newUserId?: string) => {
    if (typeof window !== 'undefined') {
      setSessionToken(token); // Delega para session.ts (respeita USE_COOKIE e TOKEN_KEY)
      if (newUserId) {
        sessionStorage.setItem("user_id", newUserId);
        setUserId(newUserId);
      }
    }
    setSessionTokenState(token);
  };

  /**
   * Protocolo de Amnésia (Expiração automática / Timeout):
   * Remove apenas os tokens e metadados de sessão, mantendo 'sbx_env_pref' intacto.
   */
  const handleAmnesia = () => {
    console.warn("🚨 [SECURITY] Sessão expirada. Protocolo de Amnésia ativado.");
    
    if (typeof window !== 'undefined') {
      clearSession(); // Utiliza o purgador centralizado do session.ts
      sessionStorage.removeItem("user_id");
      sessionStorage.removeItem("session_expires_at");
      sessionStorage.removeItem("time_delta");
    }

    setSessionTokenState(null);
    setUserId(null);
  };

  /**
   * Encerra a sessão atual. 
   * Se purgeEnv for true (logout manual explícito), limpa também a preferência de ambiente.
   * Se for falso ou omitido (expiração/timeout), preserva o sbx_env_pref.
   */
  const logout = (opts?: { purgeEnv?: boolean }) => {
    if (typeof window !== 'undefined') {
      if (opts?.purgeEnv) {
        manualLogout(); // Limpa tokens e apaga sbx_env_pref (Logout manual explícito)
      } else {
        clearSession(); // Limpa apenas tokens, preservando o sbx_env_pref (Expiração/Timeout)
      }
      sessionStorage.removeItem("user_id");
    }

    setSessionTokenState(null);
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
  // [STATE]: Hidratação Inicial (Mount via SessionStorage / Gateway)
  // -----------------------------------------------------------------------
  useEffect(() => {
    if (typeof window === 'undefined') return;
    
    // Resgata o token priorizando o sessionStorage da aba ou validando via headers/contexto
    const storedToken = sessionStorage.getItem("session_token");
    const storedUserId = sessionStorage.getItem("user_id");

    if (storedToken) {
      setSessionTokenState(storedToken);
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