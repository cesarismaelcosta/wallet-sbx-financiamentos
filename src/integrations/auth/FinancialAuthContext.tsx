/**
 * @fileoverview Contexto: FinancialAuthContext
 * @path src/integrations/auth/FinancialAuthContext.tsx
 * @description Contexto de autenticação exclusivo para o sbXPAY/Financial Hub.
 * Gerencia o session_token e o user_id via sessionStorage (Zero localStorage) e
 * mantém o user_profile (PII) EXCLUSIVAMENTE em memória (Zero PII no storage),
 * com preservação de preferência de ambiente na expiração automática (amnésia)
 * e limpeza total no logout manual.
 *
 * [v2.0.0 - ZERO PII NO CLIENT STORAGE]
 * - Removido o write/read de `user_profile` no sessionStorage.
 * - O perfil vive apenas no estado React; após um F5 ele é reidratado pelo
 *   backend (hidratação /me via JWT no perímetro das Edge Functions).
 * - `backofficeAccess` (claim do token de sessão, assinado no servidor): login cadastrado
 *   em usuário ativo do backoffice. Lido no login e no F5; só mostra o link "Backoffice"
 *   no menu do avatar.
 */

import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from "react";
// 🧹 FIX: Importando getTokenForPayload para ler do Cookie em Prod
import { manualLogout, clearSession, setSessionToken, authHeaders, getTokenForPayload } from "@/services/session";
import type { BFFUserProfile } from "@/features/financial-hub/components/shared/types";


interface FinancialAuthContextType {
  sessionToken: string | null;
  userId: string | null;
  userProfile: Partial<BFFUserProfile> | null; // 👈 Perfil unificado (/me) propagado em memória
  isLoading: boolean;
  setSession: (token: string, userId?: string, profile?: Partial<BFFUserProfile>) => void;
  logout: (opts?: { purgeEnv?: boolean }) => void;
}

const FinancialAuthContext = createContext<FinancialAuthContextType | undefined>(undefined);

/** Claims do token de sessão (Fat JWT), sem validar assinatura: só para exibição. */
function readSessionClaims(token: string): Record<string, unknown> | null {
  try {
    const base64Url = token.split(".")[1];
    if (!base64Url) return null;
    const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
    const json = decodeURIComponent(
      window.atob(base64).split("").map((c) => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2)).join(""),
    );
    return JSON.parse(json);
  } catch {
    return null;
  }
}

export function FinancialAuthProvider({ children }: { children: React.ReactNode }) {
  const [sessionToken, setSessionTokenState] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [userProfile, setUserProfile] = useState<Partial<BFFUserProfile> | null>(null); // 👈 Estado reativo do perfil
  const [isLoading, setIsLoading] = useState(true);

  // -----------------------------------------------------------------------
  // [ACTIONS]: Métodos de Mutação e Gestão de Sessão
  // -----------------------------------------------------------------------

  /**
   * Armazena o token, o ID e o perfil unificado do usuário utilizando o gerenciador session.ts
   * e atualiza o estado reativo do contexto.
   */
  // 🧹 FIX: useCallback adicionado para evitar re-criação da função a cada render
  const setSession = useCallback((token: string, newUserId?: string, profile?: Partial<BFFUserProfile>) => {
    if (typeof window !== "undefined") {
      setSessionToken(token); // Delega para session.ts (respeita USE_COOKIE e TOKEN_KEY)

      if (newUserId) {
        sessionStorage.setItem("user_id", newUserId);
        setUserId(newUserId);
      }

      // 🔒 ZERO PII: o perfil NÃO é persistido em storage. Vive apenas em memória.
      if (profile) {
        const backofficeAccess = readSessionClaims(token)?.backofficeAccess === true;
        setUserProfile({ ...profile, backofficeAccess });
      }

    }
    setSessionTokenState(token);
  }, []);

  /**
   * Protocolo de Amnésia (Expiração automática / Timeout):
   * Remove apenas os tokens e metadados de sessão, mantendo 'sbx_env_pref' intacto.
   */
  const handleAmnesia = useCallback(() => {
    if (typeof window !== "undefined") {
      clearSession(); // Utiliza o purgador centralizado do session.ts
      sessionStorage.removeItem("user_id");
      sessionStorage.removeItem("user_profile"); // 🧹 Legado: limpa resíduos de versões anteriores

      sessionStorage.removeItem("session_expires_at");
      sessionStorage.removeItem("time_delta");
    }

    setSessionTokenState(null);
    setUserId(null);
    setUserProfile(null);
  }, []);

  /**
   * Encerra a sessão atual.
   * Se purgeEnv for true (logout manual explícito), limpa também a preferência de ambiente.
   * Se for falso ou omitido (expiração/timeout), preserva o sbx_env_pref.
   */
  // 🧹 FIX: useCallback adicionado
  const logout = useCallback((opts?: { purgeEnv?: boolean }) => {
    if (typeof window !== "undefined") {
      if (opts?.purgeEnv) {
        manualLogout(); // Limpa tokens e apaga sbx_env_pref (Logout manual explícito)
      } else {
        clearSession(); // Limpa apenas tokens, preservando o sbx_env_pref (Expiração/Timeout)
      }
      sessionStorage.removeItem("user_id");
      sessionStorage.removeItem("user_profile"); // 🧹 Legado: limpa resíduos de versões anteriores

    }

    setSessionTokenState(null);
    setUserId(null);
    setUserProfile(null);
  }, []);

  // -----------------------------------------------------------------------
  // [CORE]: Lógica Reutilizável de Hidratação
  // -----------------------------------------------------------------------
  const hydrateSession = useCallback(() => {
    if (typeof window === "undefined") return;

    // 🧹 FIX: Lê do storage (DEV) OU do Cookie (PROD) usando getTokenForPayload
    const storedToken = sessionStorage.getItem("session_token") || getTokenForPayload();
    const storedUserId = sessionStorage.getItem("user_id");

    // 🔒 ZERO PII: nada de perfil no storage. Após um F5 o perfil fica nulo em memória
    // e é o backend (hidratação /me via JWT, no perímetro das Edge Functions) que
    // devolve os dados cadastrais quando necessário.
    sessionStorage.removeItem("user_profile"); // 🧹 Purga resíduo legado

    if (storedToken) {
      setSessionTokenState(storedToken);

      // ✨ EXTRAÇÃO FAT JWT: Abre o token em memória (0ms) e resgata as PIIs visuais
      const decodedToken = readSessionClaims(storedToken);
      if (!decodedToken) {
        console.error("💧 [AuthContext] Falha ao decodificar Fat JWT no F5");
      } else if (decodedToken.userName || decodedToken.login) {
        // Restaura o perfil na memória do React para o Header consumir
        setUserProfile({
          name: String(decodedToken.userName || ""),
          login: String(decodedToken.login || ""),
          backofficeAccess: decodedToken.backofficeAccess === true,
        });
      }
    }

    if (storedUserId) {
      setUserId(storedUserId);
    }

    setIsLoading(false);
  }, []);


  // -----------------------------------------------------------------------
  // [EVENTS & LIFECYCLE]: Escuta de Handoff (Hydrate) e Expiração (Amnésia)
  // -----------------------------------------------------------------------
  useEffect(() => {
    // 1. Executa a hidratação imediatamente no Mount
    hydrateSession();

    // 2. Define o listener para re-hidratação via Handoff (#xt=)
    const onSessionHydrated = () => {
      console.log("💧 [AuthContext] Evento 'session_hydrated' capturado. Re-hidratando estado...");
      hydrateSession();
    };

    window.addEventListener("session_hydrated", onSessionHydrated);
    window.addEventListener("session_expired", handleAmnesia);

    // 3. Cleanup rigoroso na desmontagem
    return () => {
      window.removeEventListener("session_hydrated", onSessionHydrated);
      window.removeEventListener("session_expired", handleAmnesia);
    };
  }, [hydrateSession, handleAmnesia]);

  // 🧹 FIX: Memoização do Value inteiro. Evita que o React dispare renders
  // em todos os componentes filhos apenas porque o Provider foi reavaliado.
  const contextValue = useMemo(
    () => ({
      sessionToken,
      userId,
      userProfile,
      isLoading,
      setSession,
      logout,
    }),
    [sessionToken, userId, userProfile, isLoading, setSession, logout],
  );

  return <FinancialAuthContext.Provider value={contextValue}>{children}</FinancialAuthContext.Provider>;
}

export function useFinancialAuth() {
  const context = useContext(FinancialAuthContext);
  if (context === undefined) {
    throw new Error("useFinancialAuth deve ser usado dentro de um FinancialAuthProvider");
  }
  return context;
}
