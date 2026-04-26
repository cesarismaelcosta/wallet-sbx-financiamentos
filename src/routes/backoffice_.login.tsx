import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AlertCircle, Loader2, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/integrations/auth/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { WalletLogo } from "@/components/brand/WalletLogo";
import googleLogo from "@/assets/google-logo.svg";

export const Route = createFileRoute("/backoffice_/login")({
  component: BackofficeLogin,
});

function BackofficeLogin() {
  const navigate = useNavigate();
  const {
    backofficeUser,
    isBackofficeAllowed,
    authorizationLoading,
    signInWithGoogle,
    signOut,
    authLoading,
    domainError,
    clearDomainError,
    validateUserAccess,
  } = useAuth();

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Detecta retorno do OAuth e valida automaticamente
  useEffect(() => {
    const handleInitialSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session && !backofficeUser) {
        await validateUserAccess(session);
      }
    };
    handleInitialSession();
  }, [backofficeUser]);

  // Monitora o estado para disparar a navegação
  useEffect(() => {
    console.log("DEBUG: Status autorização:", { 
      backofficeUser: !!backofficeUser, 
      isBackofficeAllowed, 
      authLoading, 
      authorizationLoading 
    });

    if (
      !authLoading &&
      !authorizationLoading &&
      backofficeUser &&
      isBackofficeAllowed
    ) {
      console.log("DEBUG: Autorização concedida. Navegando para /backoffice...");
      navigate({ to: "/backoffice" });
    }
  }, [authLoading, authorizationLoading, backofficeUser, isBackofficeAllowed, navigate]);

  const wrongWhitelist =
    !!backofficeUser && !authorizationLoading && !isBackofficeAllowed;
  const visibleDomainError =
    domainError ||
    (wrongWhitelist ? "Acesso restrito a colaboradores da Superbid" : null);

  const handleGoogle = async () => {
    setError(null);
    clearDomainError();
    setSubmitting(true);
    try {
      await signInWithGoogle();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Falha ao iniciar login com Google",
      );
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-[oklch(0.985_0.008_320)] px-4">
      <div className="w-full max-w-md">
        <div className="mb-8 flex justify-center">
          <WalletLogo size="lg" withTagline centered asLink />
        </div>

        <div className="rounded-3xl border border-border bg-card p-8 shadow-[var(--shadow-card)]">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-primary">
            <ShieldCheck className="h-3.5 w-3.5" /> Backoffice
          </div>
          <h1 className="mt-2 text-2xl font-bold tracking-tight">
            Acesso restrito
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Entre com sua conta corporativa{" "}
            <span className="font-semibold text-foreground">@superbid.net</span>{" "}
            para acessar o backoffice.
          </p>

          {visibleDomainError && (
            <div className="mt-5 flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <div>{visibleDomainError}</div>
            </div>
          )}

          {error && (
            <div className="mt-5 flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <div>{error}</div>
            </div>
          )}

          <div className="mt-6 flex flex-col items-center">
            <Button
              type="button"
              size="lg"
              variant="outline"
              onClick={handleGoogle}
              disabled={submitting || authLoading || authorizationLoading}
              className="h-12 w-full gap-3 rounded-xl font-semibold"
            >
              {submitting || authorizationLoading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {authorizationLoading ? "Validando..." : "Redirecionando…"}
                </>
              ) : (
                <>
                  <img
                    src={googleLogo}
                    alt=""
                    className="h-5 w-5"
                    aria-hidden
                  />
                  Entrar com Google
                </>
              )}
            </Button>
          </div>

          {wrongWhitelist && (
            <Button
              onClick={() => {
                clearDomainError();
                void signOut();
              }}
              variant="ghost"
              size="sm"
              className="mt-3 w-full rounded-xl text-xs"
            >
              Sair desta conta
            </Button>
          )}

          <p className="mt-6 text-center text-[11px] text-muted-foreground">
            Ao entrar você concorda com a Política de Uso interna da Wallet sbX.
          </p>
        </div>

        <div className="mt-6 text-center">
          <Link
            to="/"
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            ← Voltar ao site
          </Link>
        </div>
      </div>
    </div>
  );
}