/**
 * @fileoverview Contexto: FinancialAuthContext
 * @description Contexto de autenticação exclusivo para o sbXPAY/Financial Hub.
 * Lê, gerencia e propaga o session_token e user_id utilizando estritamente 
 * sessionStorage (Zero localStorage).
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
  // [SECURITY]: Protocolo de Amnésia
  // -----------------------------------------------------------------------
  useEffect(() => {
    const handleAmnesia = () => {
      console.warn("🚨 [SECURITY] Sessão expirada. Protocolo de Amnésia ativado.");
      
      // Limpeza restrita ao sessionStorage (Zero localStorage)
      sessionStorage.clear();

      setSessionToken(null);
      setUserId(null);
    };

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

  // -----------------------------------------------------------------------
  // [ACTIONS]: Métodos de Mutação
  // -----------------------------------------------------------------------
  const setSession = (newToken: string, newUserId?: string) => {
    sessionStorage.setItem("session_token", newToken);
    setSessionToken(newToken);
    
    if (newUserId) {
      sessionStorage.setItem("user_id", newUserId);
      setUserId(newUserId);
    }
  };

  const logout = () => {
    sessionStorage.clear();
    setSessionToken(null);
    setUserId(null);
  };

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