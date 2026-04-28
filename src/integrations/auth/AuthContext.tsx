import { createContext, useCallback, useContext, useState, type ReactNode, useEffect } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

type AuthContextValue = {
  session: Session | null;
  authorizationLoading: boolean;
  domainError: string | null;
  backofficeUser: any | null;
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
  const [backofficeUser, setBackofficeUser] = useState<any | null>(null);
  const [isBackofficeAllowed, setIsBackofficeAllowed] = useState(false);
  const [authLoading, setAuthLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (mounted && session) validateUserAccess(session);
      else if (mounted) setAuthLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (mounted) {
        if (session && (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED')) validateUserAccess(session);
        else if (!session) {
          setSession(null);
          setBackofficeUser(null);
          setIsBackofficeAllowed(false);
          setAuthLoading(false);
          sessionStorage.removeItem('auth_validated_once');
        }
      }
    });
    return () => { mounted = false; subscription.unsubscribe(); };
  }, []);

  const validateUserAccess = async (session: Session) => {
    const email = session.user.email?.toLowerCase();
    const alreadyValidated = sessionStorage.getItem('auth_validated_once') === 'true';
    
    if (backofficeUser && backofficeUser.email === email && alreadyValidated) return;

    setAuthorizationLoading(true);
    setDomainError(null);

    const { data: userData, error: userError } = await supabase
      .from('backoffice_users')
      .select('is_active, role, name, email') 
      .eq('email', email)
      .maybeSingle();

    let failureReason: string | null = null;
    if (userError || !userData) failureReason = "userDoesNotExist";
    else if (userData.is_active !== true) failureReason = "userInactive";

    const eventType = failureReason ? 'blocked' : (alreadyValidated ? 'refresh' : 'login');

    await supabase.functions.invoke('log-access', {
      body: { 
        email, 
        event: eventType, 
        success: !failureReason, 
        reason: failureReason || (alreadyValidated ? 'sessionRefresh' : 'loginSuccess'),
        origin_page: window.location.pathname,
        origin_function: 'validateUserAccess'
      }
    });

    if (failureReason) {
      setDomainError(failureReason === "userDoesNotExist" ? `Usuário ${email} não cadastrado.` : `Usuário ${email} inativo.`);
      await supabase.auth.signOut();
      sessionStorage.removeItem('auth_validated_once');
    } else {
      setBackofficeUser({ ...userData, email }); 
      setIsBackofficeAllowed(true); 
      setSession(session);
      sessionStorage.setItem('auth_validated_once', 'true');
    }
    setAuthorizationLoading(false);
    setAuthLoading(false);
  };

  const signInWithGoogle = useCallback(async () => {
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/backoffice/login` },
    });
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setSession(null);
    setBackofficeUser(null);
    setIsBackofficeAllowed(false);
    sessionStorage.removeItem('auth_validated_once');
  }, []);

  return (
    <AuthContext.Provider value={{ session, authorizationLoading, domainError, backofficeUser, isBackofficeAllowed, authLoading, signInWithGoogle, signOut, validateUserAccess, clearDomainError: () => setDomainError(null) }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext)!;