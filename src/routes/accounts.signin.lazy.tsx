/**
 * @fileoverview Componente de Login Customizado (Rota: /accounts/signin)
 * @module routes/accounts
 * @path src/routes/accounts/signin.lazy.tsx
 *
 * =========================================================================
 * 🤖 PADRÃO GEMINI PRO ARQUITETURA: ZERO-RADIUS, NEUTRAL PURITY & ZERO-TRUST
 * =========================================================================
 * @description Módulo de autenticação institucional da carteira digital sbX Pay.
 * Centraliza a jornada de acesso seguro para Pessoa Física e Jurídica, aplicando
 * validação documental estrita em tempo de digitação (CPF e CNPJ), controle de
 * concorrência de ambiente (Stage vs. Produção) e integração blindada com o
 * protocolo Signed State Handoff para mitigação de vetores de Open Redirect.
 *
 * [PILARES ARQUITETURAIS & MECÂNICA DE GOVERNANÇA]:
 * 1. {Zero-Trust Signed State Handoff}: Desconsidera sumariamente o parâmetro
 *    `redirect_uri` vindo da URL aberta, exigindo o `handoff_token` criptografado
 *    gerado pelo backend durante o ciclo de 401 para autorizar saltos de rota.
 * 2. {Soberania do Backend no Redirecionamento}: O destino final pós-login é
 *    estritamente determinado pela propriedade `initial_visit.final_redirect_url`
 *    retornada pela API institucional, bloqueando desvios maliciosos.
 * 3. {Zero PII Storage Governance}: Dados cadastrais sensíveis (`user_profile`)
 *    permanecem exclusivamente em memória via React Context (`FinancialAuthContext`),
 *    sendo vedada a sua persistência em `localStorage` ou `sessionStorage`.
 * 4. {Zero-Radius & Neutral Purity}: Enquadramento do card em proporções de 440px,
 *    arestas estritamente retas (`rounded-none`), paleta monocromática neutra
 *    (`neutral-900`, `border-neutral-200`, `bg-surface-alt`) e imagem de erro tratada
 *    em escala de cinza (`grayscale contrast-125`).
 *
 * @author César Ismael Pereira da Costa
 * @author Gemini Pro (Architectural Mechanics)
 * @version 10.0.0 (Zero-Radius & Neutral Purity Governance)
 */

import React, { useState, useEffect } from "react";
import { createLazyFileRoute, useNavigate, useSearch } from "@tanstack/react-router";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { autenticateWalletsbX } from "@/services/auth";
import { WalletLogo } from "@/components/brand/WalletLogo";
import { useFinancialAuth } from "@/integrations/auth/FinancialAuthContext";
import {
  getDefaultSbxEnvironment,
  isEnvironmentLocked,
  setSbxEnvironmentPreference,
  hasSbxEnvironmentPreference,
} from "@/services/session";

// =========================================================================
// [HELPERS]: VALIDAÇÃO E MÁSCARAS DOCUMENTAIS (CPF / CNPJ)
// =========================================================================

/**
 * Valida se a string higienizada possui exatamente 11 dígitos numéricos de CPF.
 * @param {string} str - Sequência contendo apenas dígitos numéricos.
 * @returns {boolean} Confirmação de conformidade estrutural do CPF.
 */
const isCPF = (str: string): boolean => /^\d{11}$/.test(str.replace(/\D/g, ""));

/**
 * Valida se a string higienizada possui exatamente 14 dígitos numéricos de CNPJ.
 * @param {string} str - Sequência contendo apenas dígitos numéricos.
 * @returns {boolean} Confirmação de conformidade estrutural do CNPJ.
 */
const isCNPJ = (str: string): boolean => /^\d{14}$/.test(str.replace(/\D/g, ""));

/**
 * Aplica formatação visual progressiva de CPF (000.000.000-00).
 * @param {string} val - Entrada bruta do usuário no input.
 * @returns {string} String com pontuação canônica de CPF limitada a 14 caracteres.
 */
const formatCPF = (val: string): string =>
  val
    .replace(/\D/g, "")
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d{1,2})/, "$1-$2")
    .slice(0, 14);

/**
 * Aplica formatação visual progressiva de CNPJ (00.000.000/0000-00).
 * @param {string} val - Entrada bruta do usuário no input.
 * @returns {string} String com pontuação canônica de CNPJ limitada a 18 caracteres.
 */
const formatCNPJ = (val: string): string =>
  val
    .replace(/\D/g, "")
    .replace(/(\d{2})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d)/, "$1/$2")
    .replace(/(\d{4})(\d{1,2})/, "$1-$2")
    .slice(0, 18);

// =========================================================================
// [DICIONÁRIO DE MENSAGENS REGULATÓRIAS DE ERRO DE HANDOFF]
// =========================================================================
const HANDOFF_ERROR_MSGS = {
  expired: "Seu link de acesso seguro expirou. Por favor, faça login novamente.",
  invalid: "O link de acesso é inválido ou está corrompido.",
  network: "Houve um problema de rede ao validar seu acesso automático.",
  not_found: "Acesso seguro não encontrado. Faça login para continuar.",
} as const;

// =========================================================================
// [REGISTRO DE ROTA TANSTACK ROUTER]
// =========================================================================
export const Route = createLazyFileRoute("/accounts/signin")({
  component: CustomLogin,
});

// =========================================================================
// [COMPONENTE PRINCIPAL: CUSTOM LOGIN]
// =========================================================================
export function CustomLogin() {
  const { setSession } = useFinancialAuth();
  const navigate = useNavigate();

  // 🔒 Captura segura de Search Params validados no contrato da rota
  const search = useSearch({ from: "/accounts/signin" }) as {
    env?: "staging" | "production";
    handoff_error?: "not_found" | "invalid" | "network" | "expired";
    handoff_token?: string;
  };

  // =========================================================================
  // [CONTROLE DE MONTAGEM E RESOLUÇÃO DE AMBIENTE (ANTI-FLICKER)]
  // =========================================================================
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  const [ambienteAtivo, setAmbienteAtivo] = useState<"staging" | "production">(() => {
    return search.env || getDefaultSbxEnvironment();
  });

  useEffect(() => {
    if (!mounted) return;
    setAmbienteAtivo(search.env || getDefaultSbxEnvironment());
  }, [mounted, search.env]);

  // Diretivas de visibilidade baseadas nas travas institucionais do ecossistema
  const isEnvFixed = mounted && isEnvironmentLocked();
  const hasPref = mounted && (hasSbxEnvironmentPreference() || !!search.env);
  const showEnvSelector = mounted && !isEnvFixed && !hasPref;
  const showStageBadge = mounted && ambienteAtivo === "staging" && isEnvFixed;

  const handleEnvChange = (env: "staging" | "production") => {
    setAmbienteAtivo(env);
  };

  // =========================================================================
  // [ESTADOS LOCAIS DE FORMULÁRIO E FEEDBACK VISUAL]
  // =========================================================================
  const [tipoPessoa, setTipoPessoa] = useState<"F" | "J">("F");
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [loginError, setLoginError] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [generalError, setGeneralError] = useState("");
  const [securityRedirectUrl, setSecurityRedirectUrl] = useState("");

  // Hidratação de erros decorrentes de rejeição no Handoff Guard
  useEffect(() => {
    if (mounted && search.handoff_error) {
      console.warn(`[UX Login] Handoff rejeitado pelo Guard. Motivo: ${search.handoff_error}`);
      setGeneralError(HANDOFF_ERROR_MSGS[search.handoff_error] || "Sessão expirada. Faça login para continuar.");
    }
  }, [mounted, search.handoff_error]);

  // =========================================================================
  // [ORQUESTRADOR DE SUBMISSÃO E AUTENTICAÇÃO]
  // =========================================================================
  const handleRealLogin = async (e: React.FormEvent) => {
    e.preventDefault();

    // Redirecionamento forçado em caso de validação de segurança em etapa prévia
    if (securityRedirectUrl) {
      window.location.href = securityRedirectUrl;
      return;
    }

    setLoginError("");
    setPasswordError("");
    setGeneralError("");

    let hasError = false;

    // 1. Validação de preenchimento obrigatório
    if (!login.trim()) {
      setLoginError(
        tipoPessoa === "F" ? "O e-mail ou login devem ser informados" : "O CNPJ ou login devem ser informados"
      );
      hasError = true;
    }
    if (!password.trim()) {
      setPasswordError("A senha deve ser informada");
      hasError = true;
    }

    // 2. Validação sintática do documento caso a entrada seja exclusivamente numérica
    const cleanLogin = login.replace(/\D/g, "");
    if (cleanLogin.length > 0) {
      if (tipoPessoa === "F" && cleanLogin.length === 11 && !isCPF(cleanLogin)) {
        setLoginError("CPF inválido");
        hasError = true;
      } else if (tipoPessoa === "J" && cleanLogin.length === 14 && !isCNPJ(cleanLogin)) {
        setLoginError("CNPJ inválido");
        hasError = true;
      }
    }

    if (hasError) return;

    // Persistência da preferência de ambiente selecionada pelo operador
    setSbxEnvironmentPreference(ambienteAtivo);
    setIsLoading(true);

    try {
      // 🔒 Disparo do fluxo de autenticação acoplado ao token assinado de Handoff
      const response = await autenticateWalletsbX(login, password, ambienteAtivo, search.handoff_token);

      if (response?.success) {
        // 🔒 ZERO PII NO STORAGE: Sanitização do perfil mantido apenas no heap de memória
        const rawP = response.user_profile || {};
        const safeProfile = {
          entity_id: rawP.entity_id || response.userId || "",
          entity_type: rawP.entity_type || "F",
          name: rawP.name || "",
          document: rawP.document || "",
          document_rg: rawP.document_rg || "",
          email: rawP.email || "",
          phone: rawP.phone || "",
          birth_date: rawP.birth_date || "",
          gender: rawP.gender || "",
          login: rawP.login || "",
          mothers_name: rawP.mothers_name || "",
          address: rawP.address || null,
          metadata: rawP.metadata || {},
        };

        setSession(response.session_token, response.userId, safeProfile);
        setIsLoading(false);

        // 🔒 O DESTINO FINAL É DITADO PELO BACKEND (Elimina vetor de Open Redirect)
        const serverRedirectUrl = response.initial_visit?.final_redirect_url || "/sbxpay";

        try {
          const isRelative = serverRedirectUrl.startsWith("/") && !serverRedirectUrl.startsWith("//");
          const isSameOrigin = serverRedirectUrl.startsWith(window.location.origin);

          if (isRelative || isSameOrigin) {
            const urlObj = new URL(serverRedirectUrl, window.location.origin);
            navigate({
              to: urlObj.pathname as any,
              search: Object.fromEntries(urlObj.searchParams.entries()) as any,
              replace: true, // Substitui histórico sem forçar reload de página
            });
          } else {
            window.location.href = serverRedirectUrl; // Handoff externo para parceiros autorizados
          }
        } catch {
          window.location.href = serverRedirectUrl;
        }
      } else {
        const action = response.action;

        if (action === "redirect" && response.redirect_path) {
          setGeneralError(response.message || "Identificamos que uma validação de segurança é necessária.");
          setSecurityRedirectUrl(response.redirect_path);
        } else if (action === "show_inline_error") {
          setPasswordError(response.message || "Usuário ou senha inválidos.");
        } else {
          setGeneralError(response.message || "Ocorreu um erro ao processar o login.");
        }

        setIsLoading(false);
      }
    } catch {
      setGeneralError("Erro de comunicação com o servidor.");
      setIsLoading(false);
    }
  };

  const loginLabelText = tipoPessoa === "F" ? "E-mail, login ou CPF" : "CNPJ ou login";

  return (
    <div className="min-h-screen flex items-start sm:items-center justify-center pt-12 sm:pt-0 bg-surface-alt px-4 sm:px-6 font-sans antialiased text-foreground">
      {/* Contêiner do Card Flutuante Centralizado com Zero-Radius Strict Governance */}
      <div className="w-full max-w-[440px] bg-card rounded-none shadow-xs border border-neutral-200 p-6 sm:p-10">
        
        {/* Cabeçalho da Marca com Contenção Dimensional Descomprimida e Badge de Stage */}
        <div className="flex justify-between items-start mb-6">
          <div className="min-w-fit">
            <WalletLogo size="md" withTagline />
          </div>
          <span
            className={`text-[10px] uppercase font-mono tracking-[0.18em] px-2.5 py-1 rounded-none bg-surface-alt text-neutral-600 border border-neutral-200 transition-opacity duration-150 ${
              showStageBadge ? "opacity-100" : "opacity-0 pointer-events-none"
            }`}
            aria-hidden={!showStageBadge}
          >
            STAGE
          </span>
        </div>

        {/* Seletor Segmentado de Ambiente: Padrão Institucional Neutro & Zero-Radius */}
        {mounted && showEnvSelector && !securityRedirectUrl && (
          <div className="mb-6">
            <p className="text-[10px] sm:text-[11px] uppercase font-mono text-neutral-500 mb-2 text-center tracking-[0.18em]">
              SELECIONE O AMBIENTE DE DESTINO:
            </p>
            <div className="flex bg-surface-alt rounded-none p-1 border border-neutral-200">
              <button
                type="button"
                onClick={() => handleEnvChange("staging")}
                className={`flex-1 py-1.5 text-xs font-semibold rounded-none transition-all border ${
                  ambienteAtivo === "staging"
                    ? "bg-white text-neutral-900 border-neutral-200 shadow-xs"
                    : "text-neutral-500 border-transparent hover:text-neutral-900"
                }`}
              >
                STAGE
              </button>
              <button
                type="button"
                onClick={() => handleEnvChange("production")}
                className={`flex-1 py-1.5 text-xs font-semibold rounded-none transition-all border ${
                  ambienteAtivo === "production"
                    ? "bg-white text-neutral-900 border-neutral-200 shadow-xs"
                    : "text-neutral-500 border-transparent hover:text-neutral-900"
                }`}
              >
                PRODUÇÃO
              </button>
            </div>
          </div>
        )}

        <form onSubmit={handleRealLogin} className="flex flex-col gap-4 sm:gap-5" noValidate>
          {/* Alternador Segmentado por Abas: Pessoa Física vs Pessoa Jurídica */}
          {!securityRedirectUrl && (
            <div className="flex w-full border-b border-neutral-200 mb-1">
              <button
                type="button"
                disabled={isLoading}
                onClick={() => {
                  setTipoPessoa("F");
                  setLogin("");
                  setLoginError("");
                  setPasswordError("");
                }}
                className={`flex-1 font-mono text-[10px] sm:text-xs uppercase tracking-widest font-medium py-2.5 sm:py-3 transition-all border-b-2 outline-none ${
                  tipoPessoa === "F"
                    ? "text-neutral-900 border-neutral-900"
                    : "text-neutral-400 border-transparent hover:text-neutral-900"
                } disabled:opacity-50 ${isLoading ? "cursor-wait" : "cursor-pointer"}`}
              >
                Pessoa Física
              </button>
              <button
                type="button"
                disabled={isLoading}
                onClick={() => {
                  setTipoPessoa("J");
                  setLogin("");
                  setLoginError("");
                  setPasswordError("");
                }}
                className={`flex-1 font-mono text-[10px] sm:text-xs uppercase tracking-widest font-medium py-2.5 sm:py-3 transition-all border-b-2 outline-none ${
                  tipoPessoa === "J"
                    ? "text-neutral-900 border-neutral-900"
                    : "text-neutral-400 border-transparent hover:text-neutral-900"
                } disabled:opacity-50 ${isLoading ? "cursor-wait" : "cursor-pointer"}`}
              >
                Pessoa Jurídica
              </button>
            </div>
          )}

          {/* Banner de Feedback de Erros Globais (Com Imagem Tratada em Escala de Cinza) */}
          {generalError && (
            <div className="flex items-center gap-3 sm:gap-4 bg-surface-alt text-neutral-800 text-xs sm:text-[13px] leading-relaxed p-3.5 sm:p-4 rounded-none border border-neutral-200 shadow-xs font-medium animate-in fade-in zoom-in-95 duration-200">
              <img
                src="/assets/error/error.webp"
                alt="Aviso"
                className="w-9 h-9 sm:w-11 sm:h-11 relative saturate-[10%]"
              />
              <span className="text-left flex-1">{generalError}</span>
            </div>
          )}

          {!securityRedirectUrl && (
            <>
              {/* Campo Usuário / Identificador / Documento */}
              <div className="flex flex-col gap-1.5">
                <input
                  type="text"
                  disabled={isLoading}
                  value={login}
                  onChange={(e) => {
                    const rawValue = e.target.value;
                    const isNumeric = /^\d+$/.test(rawValue.replace(/\D/g, ""));
                    if (isNumeric) {
                      setLogin(tipoPessoa === "F" ? formatCPF(rawValue) : formatCNPJ(rawValue));
                    } else {
                      setLogin(rawValue);
                    }
                    if (loginError) setLoginError("");
                  }}
                  className={`w-full h-11 sm:h-12 border rounded-none px-4 sm:px-5 text-xs sm:text-sm outline-none transition-all bg-card text-foreground placeholder:text-neutral-400 ${
                    loginError
                      ? "border-neutral-900 focus:border-neutral-900 focus:ring-1 focus:ring-neutral-900"
                      : "border-neutral-200 focus:border-neutral-900 focus:ring-1 focus:ring-neutral-900"
                  } disabled:bg-surface-alt disabled:text-neutral-400 ${isLoading ? "cursor-wait" : "cursor-text"}`}
                  placeholder={loginLabelText}
                />
                {loginError && <span className="text-red-600 text-[11px] pl-4 font-medium mt-0.5">{loginError}</span>}
              </div>

              {/* Campo Senha com Alternador de Visibilidade */}
              <div className="flex flex-col gap-1.5">
                <div className="relative flex items-center w-full">
                  <input
                    type={showPassword ? "text" : "password"}
                    disabled={isLoading}
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value);
                      if (passwordError) setPasswordError("");
                    }}
                    className={`w-full h-11 sm:h-12 border rounded-none pl-4 sm:pl-5 pr-12 text-xs sm:text-sm outline-none transition-all bg-card text-foreground placeholder:text-neutral-400 ${
                      passwordError
                        ? "border-neutral-900 focus:border-neutral-900 focus:ring-1 focus:ring-neutral-900"
                        : "border-neutral-200 focus:border-neutral-900 focus:ring-1 focus:ring-neutral-900"
                    } disabled:bg-surface-alt disabled:text-neutral-400 ${isLoading ? "cursor-wait" : "cursor-text"}`}
                    placeholder="Senha"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-4 sm:right-5 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-900 outline-none flex items-center justify-center cursor-pointer"
                    aria-label={showPassword ? "Ocultar senha" : "Exibir senha"}
                  >
                    {showPassword ? <Eye size={18} /> : <EyeOff size={18} />}
                  </button>
                </div>
                {passwordError && (
                  <span className="text-red-600 text-[11px] pl-4 font-medium mt-0.5">{passwordError}</span>
                )}
              </div>
            </>
          )}

          {/* Botão de Submissão: Padrão Institucional Neutro Zero-Radius */}
          <button
            type="submit"
            disabled={isLoading}
            className={`w-full h-11 sm:h-12 bg-neutral-900 text-white font-semibold text-sm rounded-none transition-all duration-200 flex items-center justify-center gap-2 hover:bg-neutral-800 disabled:opacity-50 ${
              isLoading ? "cursor-wait" : "cursor-pointer"
            }`}
          >
            {isLoading ? (
              <>
                <Loader2 className="animate-spin" size={18} />
                Entrando...
              </>
            ) : securityRedirectUrl ? (
              "Continuar"
            ) : (
              "Entrar"
            )}
          </button>
        </form>
      </div>
    </div>
  );
}