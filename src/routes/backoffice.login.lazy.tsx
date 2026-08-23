/**
 * @fileoverview Rota de Autenticação Corporativa (Login Backoffice)
 * @path src/routes/backoffice.login.lazy.tsx
 * 
 * =========================================================================
 * 🤖 PADRÃO GEMINI PRO ARQUITETURA: ISOLAMENTO E SSO
 * =========================================================================
 * Este módulo atua como a única porta de entrada segura para o painel 
 * administrativo (Backoffice) do ecossistema sbX.
 * 
 * [MECÂNICA ARQUITETURAL]:
 * 1. {Scope Inheritance}: A rota foi declarada como `/backoffice/login` (sem 
 *    underline de escape) para herdar obrigatoriamente o contexto de estado 
 *    injetado pelo Guardião Mestre (`BackofficeGuard`), garantindo acesso ao 
 *    `AuthProvider` sem vazar lógica globalmente.
 * 2. {SSO Whitelist}: Integração direta com Google OAuth limitando o escopo
 *    de acesso exclusivamente a contas @superbid.net.
 * 3. {Silent Re-validation}: A interceptação de `handleInitialSession` garante 
 *    que sessões persistidas sejam validadas em background (RBAC/Whitelist)
 *    sem exigir novos cliques do usuário na tela de SignIn.
 * 4. {Bypass Visual}: Apesar de herdar o Guardião de segurança, o componente
 *    de layout pai renderiza apenas um `<Outlet/>` nesta URL, assegurando uma 
 *    apresentação visual limpa (sem sidebar ou topbar).
 * 
 * @author César Ismael Pereira da Costa
 * @author Gemini Pro
 */

import { createLazyFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AlertCircle, Loader2, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/integrations/auth/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { WalletLogo } from "@/components/brand/WalletLogo";
import googleLogo from "@/assets/google-logo.svg";

export const Route = createLazyFileRoute("/backoffice/login")({
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

  // =========================================================================
  // [STEP 1]: RESGATE SILENCIOSO DE SESSÃO
  // =========================================================================
  useEffect(() => {
    const handleInitialSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      // Se houver token mas a memória local do contexto estiver vazia, revalida no backend.
      if (session && !backofficeUser) {
        await validateUserAccess(session);
      }
    };
    handleInitialSession();
  }, [backofficeUser]);

  // =========================================================================
  // [STEP 2]: MOTOR DE REDIRECIONAMENTO REATIVO
  // =========================================================================
  useEffect(() => {
    // Transição permitida estritamente se todos os loading states estiverem false 
    // e o usuário corporativo estiver devidamente validado contra a whitelist.
    if (
      !authLoading &&
      !authorizationLoading &&
      backofficeUser &&
      isBackofficeAllowed
    ) {
      console.log("🚀 [SSO Gatekeeper] Autorização concedida. Navegando para a Dashboard...");
      navigate({ to: "/backoffice" });
    }
  }, [authLoading, authorizationLoading, backofficeUser, isBackofficeAllowed, navigate]);

  // =========================================================================
  // [STEP 3]: RESOLUÇÃO DE ERROS DE DOMÍNIO
  // =========================================================================
  const wrongWhitelist = !!backofficeUser && !authorizationLoading && !isBackofficeAllowed;
  const visibleDomainError = domainError || (wrongWhitelist ? "Acesso restrito a colaboradores da Superbid" : null);

  const handleGoogle = async () => {
    setError(null);
    clearDomainError();
    setSubmitting(true);
    try {
      await signInWithGoogle();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Falha ao iniciar handshake com provedor Google.",
      );
      setSubmitting(false);
    }
  };

  // =========================================================================
  // [OUTPUT]: RENDERIZAÇÃO ESTÉTICA (UI)
  // =========================================================================
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
            para acessar o painel de operações.
          </p>

          {/* Área de Erro Forense (Domínio/Whitelist) */}
          {visibleDomainError && (
            <div className="mt-5 flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <div>{visibleDomainError}</div>
            </div>
          )}

          {/* Área de Erro Geral (Timeout/API) */}
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
                  {authorizationLoading ? "Validando permissões..." : "Estabelecendo handshake…"}
                </>
              ) : (
                <>
                  <img
                    src={googleLogo}
                    alt=""
                    className="h-5 w-5"
                    aria-hidden
                  />
                  Entrar com conta corporativa
                </>
              )}
            </Button>
          </div>

          {/* Failsafe: Ejeção de conta inválida que ficou presa na cache do navegador */}
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
              Forçar saída desta conta
            </Button>
          )}

          <p className="mt-6 text-center text-[11px] text-muted-foreground">
            Ao entrar você concorda com a Política de Uso interna da Wallet sbX. <br/>Acessos são monitorados e registrados (Audit Trail).
          </p>
        </div>

        <div className="mt-6 text-center">
          <Link
            to="/"
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            ← Voltar para a área de clientes
          </Link>
        </div>
      </div>
    </div>
  );
}