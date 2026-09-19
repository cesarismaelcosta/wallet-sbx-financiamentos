/**
 * @fileoverview Rota de Autenticação Corporativa (Login Backoffice)
 * @path src/routes/backoffice.login.lazy.tsx
 * 
 * =========================================================================
 * 🤖 PADRÃO GEMINI PRO ARQUITETURA: ISOLAMENTO, SSO & ZERO-RADIUS
 * =========================================================================
 * Este módulo atua como a única porta de entrada segura para o painel 
 * administrativo (Backoffice) do ecossistema sbX.
 * 
 * [ATUALIZAÇÃO DE DESIGN SYSTEM]:
 * 1. Zero-Radius: Remoção absoluta de `rounded-3xl` e `rounded-xl`. Todos 
 *    os elementos (Card principal, Botões, Alertas de Erro) adotam `rounded-none`.
 * 2. Neutral Purity: Extinção de variáveis temáticas como `bg-card` ou `primary`. 
 *    Uso explícito da paleta `neutral-900` para focos, `neutral-500` para 
 *    textos secundários e `bg-white` para o contêiner estrutural principal.
 * 3. Scope Inheritance: Mantém a herança de contexto do `BackofficeGuard`.
 * =========================================================================
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
    <div className="flex min-h-screen items-center justify-center bg-neutral-100 px-4">
      <div className="w-full max-w-md">
        <div className="mb-8 flex justify-center">
          <WalletLogo size="lg" withTagline centered asLink />
        </div>

        <div className="rounded-none border border-neutral-200 bg-white p-8 shadow-md">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.2em] text-neutral-900">
            <ShieldCheck className="h-3.5 w-3.5" /> Backoffice
          </div>
          <h1 className="mt-3 text-2xl font-bold tracking-tight text-neutral-900">
            Acesso restrito
          </h1>
          <p className="mt-2 text-sm text-neutral-600 leading-relaxed">
            Entre com sua conta corporativa{" "}
            <span className="font-bold text-neutral-900">@superbid.net</span>{" "}
            para acessar o painel de operações.
          </p>

          {/* Área de Erro Forense (Domínio/Whitelist) */}
          {visibleDomainError && (
            <div className="mt-5 flex items-start gap-2 rounded-none border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <div>{visibleDomainError}</div>
            </div>
          )}

          {/* Área de Erro Geral (Timeout/API) */}
          {error && (
            <div className="mt-5 flex items-start gap-2 rounded-none border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
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
              className="h-12 w-full gap-3 rounded-none border-neutral-200 font-bold text-neutral-900 shadow-xs hover:bg-primary hover:text-primary-foreground hover:border-primary"
            >
              {submitting || authorizationLoading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin text-brand-accent" />
                  <span className="text-neutral-500">
                    {authorizationLoading ? "Validando permissões..." : "Estabelecendo handshake…"}
                  </span>
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
              className="mt-3 w-full rounded-none text-xs text-neutral-500 hover:text-neutral-900 hover:bg-neutral-100"
            >
              Forçar saída desta conta
            </Button>
          )}

          <p className="mt-6 text-center text-[10px] text-neutral-400 leading-relaxed uppercase tracking-wider">
            Ao entrar você concorda com a <br/> Política de Uso da Wallet sbX. <br/>Acessos são monitorados via Audit Trail.
          </p>
        </div>
      </div>
    </div>
  );
}