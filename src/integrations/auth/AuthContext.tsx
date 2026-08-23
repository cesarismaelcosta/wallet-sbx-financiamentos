/**
 * @fileoverview Provedor de Autenticação Corporativa (AuthContext)
 * @path src/integrations/auth/AuthContext.tsx
 * 
 * =========================================================================
 * 🤖 PADRÃO GEMINI PRO ARQUITETURA: ZERO-TRUST HYBRID SESSION MANAGEMENT
 * =========================================================================
 * Este módulo gerencia o estado global de autenticação do Backoffice.
 * 
 * [DIRETRIZES DE SEGURANÇA E HIGIENE]:
 * 1. {Schema Obfuscation}: O frontend NUNCA consulta a tabela `backoffice_users`
 *    diretamente para evitar vazamento de estrutura (Nomes de Colunas/Tipos).
 * 2. {Auditoria Híbrida via Borda}: O front-end valida a sessão de forma blindada 
 *    via RPC (Cofre) e delega o registro de telemetria geográfica completa 
 *    (País, Estado, Cidade, IP e Dispositivo) para a Edge Function `log-access`.
 * 3. {Memory Cache}: O `sessionStorage` atua como sentinela para impedir 
 *    remounts do React (Lazy Loading) de bombardearem o banco de dados.
 * 
 * [CORREÇÕES DO RELATÓRIO DE AUDITORIA]:
 * - Remoção do ILIKE na Stored Procedure (Prevenção de Wildcard Bypass).
 * - Resolução de conflitos de parâmetros (Overload) no PostgreSQL.
 * - Captura nativa de geolocalização rica na borda via Edge Function.
 * 
 * =========================================================================
 * ⚙️ DEPENDÊNCIA DE INFRAESTRUTURA (POSTGRESQL RPC)
 * =========================================================================
 * Para que este contexto funcione, a seguinte Stored Procedure DEVE existir 
 * no Supabase SQL Editor:
 * 
 * CREATE OR REPLACE FUNCTION get_backoffice_session() 
 * RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
 * DECLARE
 *   v_caller_email TEXT := auth.jwt() ->> 'email';
 *   v_user_record RECORD;
 * BEGIN
 *   IF v_caller_email IS NULL THEN 
 *     RETURN jsonb_build_object('error', 'token_ausente_ou_invalido'); 
 *   END IF;
 *   
 *   SELECT * INTO v_user_record FROM backoffice_users WHERE LOWER(email) = LOWER(v_caller_email);
 *   
 *   IF NOT FOUND THEN 
 *     RETURN jsonb_build_object('error', 'user_does_not_exist');
 *   ELSIF v_user_record.is_active = FALSE THEN 
 *     RETURN jsonb_build_object('error', 'user_inactive');
 *   END IF;
 *   
 *   RETURN jsonb_build_object(
 *     'email', v_user_record.email, 
 *     'name', v_user_record.name, 
 *     'role', v_user_record.role, 
 *     'is_active', v_user_record.is_active, 
 *     'allowed_partners', v_user_record.allowed_partners, 
 *     'allowed_products', v_user_record.allowed_products
 *   );
 * END;
 * $$;
 * =========================================================================
 * 
 * @author César Ismael Pereira da Costa
 * @author Gemini Pro
 */

import { createContext, useCallback, useContext, useState, type ReactNode, useEffect, useRef } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

// =========================================================================
// 🛡️ TIPAGENS RIGOROSAS
// =========================================================================

export type BackofficeUser = {
  email: string;
  name: string;
  role: "admin" | "manager" | "viewer";
  is_active: boolean;
  allowed_partners: string[];
  allowed_products: string[];
  avatar?: string | null;
};

type AuthContextValue = {
  session: Session | null;
  authorizationLoading: boolean;
  domainError: string | null;
  backofficeUser: BackofficeUser | null;
  isBackofficeAllowed: boolean;
  authLoading: boolean;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
  validateUserAccess: (session: Session) => Promise<void>;
  clearDomainError: () => void;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [authorizationLoading, setAuthorizationLoading] = useState(false);
  const [domainError, setDomainError] = useState<string | null>(null);
  const [backofficeUser, setBackofficeUser] = useState<BackofficeUser | null>(null);
  const [isBackofficeAllowed, setIsBackofficeAllowed] = useState(false);
  const [authLoading, setAuthLoading] = useState(true);

  // Trava para evitar disparos duplicados de log na mesma sessão de navegação
  const hasLoggedThisSession = useRef(false);

  // =========================================================================
  // 🔄 CICLO DE VIDA E SINCRONIZAÇÃO DE SESSÃO
  // =========================================================================
  useEffect(() => {
    let mounted = true;
    
    // Inicialização silenciosa
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (mounted && session) validateUserAccess(session);
      else if (mounted) setAuthLoading(false);
    });

    // Escuta ativa de eventos de autenticação
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (mounted) {
        if (session && (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED')) {
          validateUserAccess(session);
        } else if (!session) {
          setSession(null);
          setBackofficeUser(null);
          setIsBackofficeAllowed(false);
          setAuthLoading(false);
          sessionStorage.removeItem('auth_validated_once');
          hasLoggedThisSession.current = false;
        }
      }
    });
    
    return () => { 
      mounted = false; 
      subscription.unsubscribe(); 
    };
  }, []);

  // =========================================================================
  // 🔐 MOTOR DE VALIDAÇÃO DE IDENTIDADE E CARGO (RPC + EDGE LOG GEOGRÁFICO)
  // =========================================================================
  const validateUserAccess = async (session: Session) => {
    const email = session.user.email?.toLowerCase();
    const alreadyValidated = sessionStorage.getItem('auth_validated_once') === 'true';
    
    // 🛑 CACHE MEMORY: Impede refetches desnecessários ativados pelo Router (Lazy Loading)
    if (backofficeUser && backofficeUser.email === email && alreadyValidated) return;

    setAuthorizationLoading(true);
    setDomainError(null);

    const eventType = alreadyValidated ? 'refresh' : 'login';
    
    // 1. Validação de Acesso via RPC
    const { data: userData, error: rpcError } = await supabase.rpc('get_backoffice_session');

    const responseData = userData as Record<string, unknown> | null;
    const jsonError = responseData?.error ? String(responseData.error) : null;
    const errorMsg = rpcError?.message || jsonError;

    if (rpcError || jsonError) {
      console.error("🚨 [AuthGuard] - Acesso Recusado:", errorMsg);
      setDomainError(errorMsg?.includes('user_inactive') ? "Usuário inativo." : "Acesso corporativo negado.");
      
      // 2. Auditoria de Falha via Edge Function (Captura Geolocalização Completa na Borda)
      if (!hasLoggedThisSession.current) {
        supabase.functions.invoke('log-access', {
          body: {
            origin_page: window.location.pathname,
            origin_function: "validateUserAccess",
            event: eventType,
            success: false,
            failureReason: errorMsg
          }
        }).catch(console.error);
        hasLoggedThisSession.current = true;
      }

      await supabase.auth.signOut();
      setBackofficeUser(null);
      setIsBackofficeAllowed(false);
      sessionStorage.removeItem('auth_validated_once');
    } else if (userData) {  
      // 2. Auditoria de Sucesso via Edge Function (Captura Geolocalização Completa na Borda)
      if (!hasLoggedThisSession.current) {
        supabase.functions.invoke('log-access', {
          body: {
            origin_page: window.location.pathname,
            origin_function: "validateUserAccess",
            event: eventType,
            success: true,
            failureReason: null
          }
        }).catch(console.error);
        hasLoggedThisSession.current = true;
      }
      
      setBackofficeUser(userData as unknown as BackofficeUser);
      setIsBackofficeAllowed(true); 
      setSession(session);
      sessionStorage.setItem('auth_validated_once', 'true');
    }
    
    setAuthorizationLoading(false);
    setAuthLoading(false);
  };

  // =========================================================================
  // 🚪 AÇÕES DE LOGIN E LOGOUT
  // =========================================================================
  const signInWithGoogle = useCallback(async () => {
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/backoffice/login` },
    });
  }, []);

  const signOut = useCallback(async () => {
    // Registra o logout na Edge Function preservando a geolocalização
    supabase.functions.invoke('log-access', {
      body: {
        origin_page: window.location.pathname,
        origin_function: "signOut",
        event: "logout",
        success: true,
        failureReason: null
      }
    }).catch(console.error);

    hasLoggedThisSession.current = false;
    await supabase.auth.signOut();
    setSession(null);
    setBackofficeUser(null);
    setIsBackofficeAllowed(false);
    sessionStorage.removeItem('auth_validated_once');
  }, []);

  return (
    <AuthContext.Provider value={{ 
      session, 
      authorizationLoading, 
      domainError, 
      backofficeUser, 
      isBackofficeAllowed, 
      authLoading, 
      signInWithGoogle, 
      signOut, 
      validateUserAccess, 
      clearDomainError: () => setDomainError(null) 
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext)!;