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
 *    textos secundários e `bg-card` para o contêiner estrutural principal.
 * 3. Scope Inheritance: Mantém a herança de contexto do `BackofficeGuard`.
 *
 * [PEDIDO DE ACESSO]: quem entra com Google e não está em `backoffice_users`
 * (`accessRequestEmail` do AuthContext) vê o pedido de acesso no lugar do botão:
 * escolhe parceiros, produtos e o motivo; depois acompanha (pendente / recusado com
 * motivo, podendo pedir de novo). Tudo pela Edge Function `manage-backoffice-users`
 * (ações `my_access_request` e `request_access`), que confere login Google, domínio
 * ativo em `allowed_email_domains` e avisa os admins por e-mail.
 * =========================================================================
 */

import { createLazyFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AlertCircle, CheckCircle2, Clock, Loader2, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
    accessRequestEmail,
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
  // eslint-disable-next-line react-hooks/exhaustive-deps -- revalida só quando o usuário do contexto muda
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
    <div className="flex min-h-screen items-center justify-center bg-accent px-4">
      <div className="w-full max-w-md">
        <div className="rounded-none border border-border bg-card p-8 shadow-md">
          <div className="mb-6 flex justify-center">
            <WalletLogo size="lg" withTagline centered asLink followTheme />
          </div>

          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.2em] text-foreground">
            <ShieldCheck className="h-3.5 w-3.5" /> Backoffice
          </div>
          <h1 className="mt-3 page-header-title">
            Acesso restrito
          </h1>
          <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
            Entre com sua conta corporativa{" "}
            <span className="font-bold text-foreground">@superbid.net</span>{" "}
            para acessar o painel de operações.
          </p>

          {accessRequestEmail ? (
            <AccessRequestPanel email={accessRequestEmail} onSignOut={() => void signOut()} />
          ) : (
          <>
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
              className="h-12 w-full gap-3 rounded-none border-border font-bold text-foreground shadow-xs hover:bg-primary hover:text-primary-foreground hover:border-primary"
            >
              {submitting || authorizationLoading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin text-brand-accent" />
                  <span className="text-muted-foreground">
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
              className="mt-3 w-full rounded-none text-xs text-muted-foreground hover:text-foreground hover:bg-accent"
            >
              Forçar saída desta conta
            </Button>
          )}
          </>
          )}
        </div>
      </div>
    </div>
  );
}

// =========================================================================
// [PEDIDO DE ACESSO]
// =========================================================================

type Option = { id: string; name: string };
type AccessRequest = {
  id: string;
  status: "pending" | "approved" | "rejected";
  partners: string[];
  products: string[];
  reason: string;
  rejected_reason: string | null;
  requested_at: string;
  decided_at: string | null;
};
type MyAccessRequest = { email: string; name: string | null; request: AccessRequest | null; partners: Option[]; products: Option[] };

/** Erros da edge `manage-backoffice-users` no pedido → mensagem. */
const REQUEST_ERRORS: Record<string, string> = {
  google_only: "Entre com a conta Google corporativa para pedir acesso.",
  domain_not_allowed: "Este e-mail não pode pedir acesso ao backoffice.",
  request_pending: "Você já tem um pedido aguardando liberação.",
  invalid_scope: "Escolha ao menos um parceiro e um produto.",
  invalid_reason: "Informe o motivo (até 500 caracteres).",
};

async function callRequest(body: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke("manage-backoffice-users", { body });
  if (error) {
    const payload = await (error as { context?: Response }).context?.json?.().catch(() => null);
    const code = typeof payload?.error === "string" ? payload.error : "";
    throw Object.assign(new Error(REQUEST_ERRORS[code] || "Não foi possível concluir. Tente novamente."), { code });
  }
  return data;
}

const formatDate = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "";

function AccessRequestPanel({ email, onSignOut }: { email: string; onSignOut: () => void }) {
  const [data, setData] = useState<MyAccessRequest | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [partners, setPartners] = useState<string[]>([]);
  const [products, setProducts] = useState<string[]>([]);
  const [reason, setReason] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    callRequest({ action: "my_access_request" })
      .then((result) => { if (active) setData(result as MyAccessRequest); })
      .catch((err: Error) => { if (active) setLoadError(err.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const toggle = (list: string[], id: string) => (list.includes(id) ? list.filter((v) => v !== id) : [...list, id]);
  const nameOf = (options: Option[] | undefined, ids: string[]) =>
    ids.map((id) => options?.find((o) => o.id === id)?.name || id).join(", ");

  const handleSend = async () => {
    setSendError(null);
    if (!partners.length || !products.length) return setSendError(REQUEST_ERRORS.invalid_scope);
    if (!reason.trim()) return setSendError(REQUEST_ERRORS.invalid_reason);
    setSending(true);
    try {
      const result = (await callRequest({ action: "request_access", partners, products, reason: reason.trim() })) as { request: AccessRequest };
      setData((prev) => (prev ? { ...prev, request: result.request } : prev));
    } catch (err) {
      setSendError((err as Error).message);
    } finally {
      setSending(false);
    }
  };

  const request = data?.request || null;
  const pending = request?.status === "pending";
  const rejected = request?.status === "rejected";

  return (
    <div className="mt-5">
      <p className="text-xs text-muted-foreground">
        Conectado como <span className="font-bold text-foreground">{email}</span>
      </p>

      {loading ? (
        <div className="mt-6 flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
        </div>
      ) : loadError ? (
        <div className="mt-5 flex items-start gap-2 rounded-none border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <div>{loadError}</div>
        </div>
      ) : pending && request ? (
        <div className="mt-5 rounded-none border border-border bg-accent p-4 text-sm">
          <div className="flex items-center gap-2 font-bold text-foreground">
            <Clock className="h-4 w-4" /> Pedido enviado, aguardando liberação
          </div>
          <p className="mt-2 text-xs text-muted-foreground">Enviado em {formatDate(request.requested_at)}.</p>
          <dl className="mt-3 space-y-1 text-xs">
            <div><dt className="inline text-muted-foreground">Parceiros: </dt><dd className="inline text-foreground">{nameOf(data?.partners, request.partners)}</dd></div>
            <div><dt className="inline text-muted-foreground">Produtos: </dt><dd className="inline text-foreground">{nameOf(data?.products, request.products)}</dd></div>
          </dl>
          <p className="mt-3 text-xs text-muted-foreground">Você recebe um e-mail quando o pedido for analisado.</p>
        </div>
      ) : (
        <div className="mt-5">
          {rejected && request && (
            <div className="mb-5 flex items-start gap-2 rounded-none border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <div>
                Seu pedido de {formatDate(request.requested_at)} foi recusado
                {request.rejected_reason ? <>: <b>{request.rejected_reason}</b></> : "."} Você pode enviar um novo pedido.
              </div>
            </div>
          )}

          <h2 className="text-sm font-bold text-foreground">Solicitar acesso</h2>
          <p className="mt-1 text-xs text-muted-foreground">Escolha os parceiros e produtos que você precisa acessar.</p>

          <fieldset className="mt-4">
            <legend className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Parceiros *</legend>
            <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
              {data?.partners.map((o) => (
                <Label key={o.id} className="flex cursor-pointer items-center gap-2 text-sm font-normal">
                  <Checkbox checked={partners.includes(o.id)} onCheckedChange={() => setPartners((l) => toggle(l, o.id))} />
                  {o.name}
                </Label>
              ))}
            </div>
          </fieldset>

          <fieldset className="mt-4">
            <legend className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Produtos *</legend>
            <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
              {data?.products.map((o) => (
                <Label key={o.id} className="flex cursor-pointer items-center gap-2 text-sm font-normal">
                  <Checkbox checked={products.includes(o.id)} onCheckedChange={() => setProducts((l) => toggle(l, o.id))} />
                  {o.name}
                </Label>
              ))}
            </div>
          </fieldset>

          <div className="mt-4">
            <Label htmlFor="access-reason" className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Motivo *</Label>
            <Textarea
              id="access-reason"
              value={reason}
              maxLength={500}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Para que você precisa do acesso?"
              className="mt-2 rounded-none"
            />
            <p className="mt-1 text-right text-[11px] text-muted-foreground">{reason.length}/500</p>
          </div>

          {sendError && (
            <div className="mt-3 flex items-start gap-2 rounded-none border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <div>{sendError}</div>
            </div>
          )}

          <Button type="button" onClick={handleSend} disabled={sending} className="mt-4 h-11 w-full gap-2 rounded-none font-bold">
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
            Enviar pedido
          </Button>
        </div>
      )}

      <Button
        type="button"
        onClick={onSignOut}
        variant="ghost"
        size="sm"
        className="mt-3 w-full rounded-none text-xs text-muted-foreground hover:text-foreground hover:bg-accent"
      >
        Sair desta conta
      </Button>
    </div>
  );
}
