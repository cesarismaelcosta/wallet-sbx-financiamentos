/**
 * @fileoverview Contexto: FinancialAuthContext
 * @path src/integrations/auth/FinancialAuthContext.tsx
 * @description Contexto de autenticação exclusivo para o sbXPAY/Financial Hub.
 * Lê, gerencia e propaga o session_token, user_id e user_profile utilizando estritamente 
 * sessionStorage (Zero localStorage), com preservação de preferência de ambiente 
 * na expiração automática (amnésia) e limpeza total no logout manual.
 */

import React, { createContext, useContext, useState, useEffect } from "react";
import { manualLogout, clearSession, setSessionToken, authHeaders } from "@/services/session";

interface FinancialAuthContextType {
  sessionToken: string | null;
  userId: string | null;
  userProfile: any | null; // 👈 Perfil unificado (/me) propagado em memória
  isLoading: boolean;
  setSession: (token: string, userId?: string, profile?: any) => void; 
  logout: (opts?: { purgeEnv?: boolean }) => void;
}

const FinancialAuthContext = createContext<FinancialAuthContextType | undefined>(undefined);

export function FinancialAuthProvider({ children }: { children: React.ReactNode }) {
  const [sessionToken, setSessionTokenState] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [userProfile, setUserProfile] = useState<any | null>(null); // 👈 Estado reativo do perfil
  const [isLoading, setIsLoading] = useState(true);

  // -----------------------------------------------------------------------
  // [ACTIONS]: Métodos de Mutação e Gestão de Sessão
  // -----------------------------------------------------------------------

  /**
   * Armazena o token, o ID e o perfil unificado do usuário utilizando o gerenciador session.ts
   * e atualiza o estado reativo do contexto.
   */
  const setSession = (token: string, newUserId?: string, profile?: any) => {
    if (typeof window !== 'undefined') {
      setSessionToken(token); // Delega para session.ts (respeita USE_COOKIE e TOKEN_KEY)
      
      if (newUserId) {
        sessionStorage.setItem("user_id", newUserId);
        setUserId(newUserId);
      }
      
      if (profile) {
        sessionStorage.setItem("user_profile", JSON.stringify(profile));
        setUserProfile(profile);
      }
    }
    setSessionTokenState(token);
  };

  /**
   * Protocolo de Amnésia (Expiração automática / Timeout):
   * Remove apenas os tokens e metadados de sessão, mantendo 'sbx_env_pref' intacto.
   */
  const handleAmnesia = () => {
    
    if (typeof window !== 'undefined') {
      clearSession(); // Utiliza o purgador centralizado do session.ts
      sessionStorage.removeItem("user_id");
      sessionStorage.removeItem("user_profile");
      sessionStorage.removeItem("session_expires_at");
      sessionStorage.removeItem("time_delta");
    }

    setSessionTokenState(null);
    setUserId(null);
    setUserProfile(null);
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
      sessionStorage.removeItem("user_profile");
    }

    setSessionTokenState(null);
    setUserId(null);
    setUserProfile(null);
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
    
    const storedToken = sessionStorage.getItem("session_token");
    const storedUserId = sessionStorage.getItem("user_id");
    const storedProfile = sessionStorage.getItem("user_profile");

    // CORREÇÃO: Em PROD (USE_COOKIE = true), o token está no Cookie e não no storage.
    // Portanto, a hidratação do Perfil não pode depender do 'if (storedToken)'.
    
    if (storedToken) {
      setSessionTokenState(storedToken);
    }
    
    if (storedUserId) {
      setUserId(storedUserId);
    }

    if (storedProfile) {
      try {
        setUserProfile(JSON.parse(storedProfile));
      } catch (e) {
        console.error("🚨 [AuthContext] Erro ao parsear user_profile do sessionStorage:", e);
      }
    }
    
    setIsLoading(false);
  }, []);

  return (
    <FinancialAuthContext.Provider value={{ sessionToken, userId, userProfile, isLoading, setSession, logout }}>
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