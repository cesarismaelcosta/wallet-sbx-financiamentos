/**
 * @fileoverview Componente de Login Customizado (Rota: /accounts/signin)
 *
 * ARQUITETURA E RESOLUÇÃO DE AMBIENTE E SEGURANÇA:
 * Interface visual de autenticação que gerencia dinamicamente o ambiente de destino (`staging` | `production`)
 * e dispara a criação da sessão via Cookie HttpOnly através do Proxy de Autenticação (`sbx-auth`).
 *
 * ANTI-FLICKER & SSR SAFETY:
 * Todo estado derivado de `sessionStorage` ou de variáveis de build é gateado por `mounted`.
 * O SSR e o primeiro paint do client renderizam exatamente o mesmo HTML neutro, eliminando
 * qualquer divergência de hidratação (Hydration Mismatch) e o efeito "pisca" do seletor.
 * Renderização condicional limpa: aparece instantaneamente se necessário ou não ocupa espaço algum.
 *
 * PRINCIPAIS GARANTIAS DE SEGURANÇA:
 * 1. Zero LocalStorage (Token): Nenhuma chave de sessão ou token JWT é gravada no armazenamento local do navegador.
 * 2. Autenticação Stateless no Client: Executa a função `autenticateWalletsbX` e injeta a sessão estritamente na memória React Context.
 * 3. Redirecionamento Sem Vazamento (Zero Token Leak): Navega para a `redirect_uri` preservando a estrutura
 *    da URL sem injetar query params sensíveis (`auth_token`), aproveitando o envio automático do cookie pelo navegador.
 * 4. Prevenção de Loops de Redirecionamento: Toda a navegação pós-login ocorre exclusivamente dentro do handler
 *    de submit acionado pelo clique do usuário (`onSubmit`), anulando re-renderizações cíclicas de `useEffect`.
 */

import { createLazyFileRoute, useNavigate, useSearch } from "@tanstack/react-router";
import React, { useState, useEffect } from "react";
import { Eye, EyeOff, Loader2 } from "lucide-react"; 
import { autenticateWalletsbX } from "@/services/auth";
import { WalletLogo } from "@/components/brand/WalletLogo";
import { useFinancialAuth } from "@/integrations/auth/FinancialAuthContext";
import { 
  getDefaultSbxEnvironment, 
  isEnvironmentLocked, 
  setSbxEnvironmentPreference,
  hasSbxEnvironmentPreference 
} from "@/services/session";

// =========================================================================
// [HELPERS]: Validação e Formatação de Documentos (CPF / CNPJ)
// =========================================================================
const isCPF = (str: string) => /^\d{11}$/.test(str.replace(/\D/g, ''));
const isCNPJ = (str: string) => /^\d{14}$/.test(str.replace(/\D/g, ''));

const formatCPF = (val: string) => 
  val
    .replace(/\D/g, '')
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d{1,2})/, '$1-$2')
    .slice(0, 14);

const formatCNPJ = (val: string) => 
  val
    .replace(/\D/g, '')
    .replace(/(\d{2})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1/$2')
    .replace(/(\d{4})(\d{1,2})/, '$1-$2')
    .slice(0, 18);

// Constante de módulo: evita recriação a cada renderização
const HANDOFF_ERROR_MSGS = {
  expired: "Seu link de acesso seguro expirou. Por favor, faça login novamente.",
  invalid: "O link de acesso é inválido ou está corrompido.",
  network: "Houve um problema de rede ao validar seu acesso automático.",
  not_found: "Acesso seguro não encontrado. Faça login para continuar."
} as const;

export const Route = createLazyFileRoute('/accounts/signin')({
  component: CustomLogin,
});

export function CustomLogin() {
  const { setSession } = useFinancialAuth();
  const navigate = useNavigate();
  
  const search = useSearch({ from: '/accounts/signin' }) as { 
    redirect_uri?: string; 
    env?: "staging" | "production";
    handoff_error?: "not_found" | "invalid" | "network" | "expired";
  };
  
  // =========================================================================
  // [LÓGICA DE RESOLUÇÃO DE AMBIENTE CASCATA & ANTI-FLICKER]
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

  const isEnvFixed = mounted && isEnvironmentLocked();
  const hasPref = mounted && (hasSbxEnvironmentPreference() || !!search.env);
  const showEnvSelector = mounted && !isEnvFixed && !hasPref;
  const showStageBadge = mounted && ambienteAtivo === "staging" && isEnvFixed;

  const handleEnvChange = (env: "staging" | "production") => {
    setAmbienteAtivo(env);
  };

  // =========================================================================
  // [ESTADOS DE FORMULÁRIO E CONTROLE DE UI]
  // =========================================================================
  const [tipoPessoa, setTipoPessoa] = useState<"F" | "J">("F");
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [loginError, setLoginError] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [generalError, setGeneralError] = useState("");
  
  // ESTADO DE REDIRECIONAMENTO DE SEGURANÇA
  const [securityRedirectUrl, setSecurityRedirectUrl] = useState("");

  // ✨ FIX: Consumo reativo do erro de handoff disparando alerta visual via UI
  useEffect(() => {
    if (mounted && search.handoff_error) {
      console.warn(`[UX Login] Handoff rejeitado pelo Guard. Motivo: ${search.handoff_error}`);
      setGeneralError(HANDOFF_ERROR_MSGS[search.handoff_error] || "Sessão expirada. Faça login para continuar.");
      
      // Higiene de URL mantida comentada (decisão de UX)
      // window.history.replaceState(null, '', window.location.pathname + `?redirect_uri=${search.redirect_uri || '/'}`);
    }
  }, [mounted, search.handoff_error, search.redirect_uri]);

  const handleRealLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (securityRedirectUrl) {
      window.location.href = securityRedirectUrl;
      return;
    }

    setLoginError(""); 
    setPasswordError(""); 
    setGeneralError("");

    let hasError = false;
    if (!login.trim()) { 
      setLoginError(tipoPessoa === "F" ? "O e-mail ou login devem ser informados" : "O CNPJ ou login devem ser informados"); 
      hasError = true; 
    }
    if (!password.trim()) { 
      setPasswordError("A senha deve ser informada"); 
      hasError = true; 
    }
    
    const cleanLogin = login.replace(/\D/g, '');
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

    setSbxEnvironmentPreference(ambienteAtivo);
    setIsLoading(true);

    try {
      const response = await autenticateWalletsbX(login, password, ambienteAtivo);
      
      if (response?.success) {
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
          metadata: rawP.metadata || {}
        };

        setSession(response.session_token, response.userId, safeProfile);
        setIsLoading(false);

        const redirectUri = search.redirect_uri || "/sbxpay";
        window.location.href = redirectUri.startsWith('http') 
          ? redirectUri 
          : `${window.location.origin}${redirectUri.startsWith('/') ? '' : '/'}${redirectUri}`;
          
      } else {
        const action = response.action;

        if (action === "redirect" && response.redirect_path) {
          setGeneralError(response.message || "Identificamos que uma validação de segurança é necessária.");
          setSecurityRedirectUrl(response.redirect_path);
        } 
        else if (action === "show_inline_error") {
          setPasswordError(response.message || "Usuário ou senha inválidos.");
        } 
        else {
          setGeneralError(response.message || "Ocorreu um erro ao processar o login.");
        }
        
        setIsLoading(false);
      }
    } catch (err) {
      setGeneralError("Erro de comunicação com o servidor.");
      setIsLoading(false);
    }
  };

  const loginLabelText = tipoPessoa === "F" ? "E-mail, login ou CPF" : "CNPJ ou login";

  return (
    <div className="min-h-screen flex items-start justify-center pt-24 sm:pt-32 bg-gray-50 px-4 font-sans">
      <div className="w-full max-w-[440px] bg-white rounded-xl shadow-sm border border-gray-100 p-8 sm:p-10">
        
        <div className="flex justify-between items-center mb-6">
          <WalletLogo size="md" withTagline />
          <span 
            className={`text-[10px] uppercase font-bold px-2.5 py-1 rounded-full bg-gray-100 text-gray-700 border border-gray-200 transition-opacity duration-150 ${
              showStageBadge ? "opacity-100" : "opacity-0 pointer-events-none"
            }`}
            aria-hidden={!showStageBadge}
          >
            STAGE
          </span>
        </div>

        {mounted && showEnvSelector && !securityRedirectUrl && (
          <div className="mb-4">
            <p className="text-[11px] uppercase font-bold text-gray-500 mb-2 text-center tracking-wide">
              Selecione o ambiente de destino:
            </p>
            <div className="flex bg-gray-100 rounded-full p-1">
              <button
                type="button"
                onClick={() => handleEnvChange("staging")}
                className={`flex-1 py-1.5 text-xs font-bold rounded-full transition-all border ${
                  ambienteAtivo === "staging"
                    ? "bg-white text-[#B400FF] border-[#B400FF] shadow-sm"
                    : "text-gray-500 border-transparent hover:text-gray-700"
                }`}
              >
                STAGE
              </button>
              <button
                type="button"
                onClick={() => handleEnvChange("production")}
                className={`flex-1 py-1.5 text-xs font-bold rounded-full transition-all border ${
                  ambienteAtivo === "production"
                    ? "bg-white text-[#B400FF] border-[#B400FF] shadow-sm"
                    : "text-gray-500 border-transparent hover:text-gray-700"
                }`}
              >
                PRODUÇÃO
              </button>
            </div>
          </div>
        )}

        <form onSubmit={handleRealLogin} className="flex flex-col gap-5" noValidate>
          
          {!securityRedirectUrl && (
            <div className="flex w-full border-b border-gray-200 mb-2">
              <button
                type="button"
                disabled={isLoading}
                onClick={() => { setTipoPessoa("F"); setLogin(""); setLoginError(""); setPasswordError(""); }}
                className={`flex-1 text-sm font-semibold py-3 transition-all border-b-2 outline-none focus:outline-none ${
                  tipoPessoa === "F" 
                  ? "text-gray-900 border-gray-900" 
                  : "text-gray-400 border-transparent hover:text-gray-600"
                } disabled:opacity-50 ${isLoading ? "cursor-wait" : "cursor-pointer"}`}
              >
                Pessoa Física
              </button>
              <button
                type="button"
                disabled={isLoading}
                onClick={() => { setTipoPessoa("J"); setLogin(""); setLoginError(""); setPasswordError(""); }}
                className={`flex-1 text-sm font-semibold py-3 transition-all border-b-2 outline-none focus:outline-none ${
                  tipoPessoa === "J" 
                  ? "text-gray-900 border-gray-900" 
                  : "text-gray-400 border-transparent hover:text-gray-600"
                } disabled:opacity-50 ${isLoading ? "cursor-wait" : "cursor-pointer"}`}
              >
                Pessoa Jurídica
              </button>
            </div>
          )}

          {generalError && (
            <div className="flex items-center gap-4 bg-slate-50 text-slate-700 text-[13px] leading-relaxed p-4 rounded-xl border border-slate-200 shadow-sm font-medium animate-in fade-in zoom-in-95 duration-200">
              <img 
                src="/assets/error/error.webp" 
                alt="Aviso" 
                className="w-11 h-11 object-contain shrink-0 drop-shadow-sm" 
              />
              <span className="text-left flex-1">{generalError}</span>
            </div>
          )}

          {!securityRedirectUrl && (
            <>
              <div className="flex flex-col gap-1.5">
                <input
                  type="text"
                  disabled={isLoading}
                  value={login}
                  onChange={(e) => {
                    const rawValue = e.target.value;
                    const isNumeric = /^\d+$/.test(rawValue.replace(/\D/g, ''));
                    if (isNumeric) {
                      setLogin(tipoPessoa === "F" ? formatCPF(rawValue) : formatCNPJ(rawValue));
                    } else {
                      setLogin(rawValue);
                    }
                    if (loginError) setLoginError("");
                  }}
                  className={`w-full h-12 border rounded-full px-5 text-sm outline-none transition-all ${
                    loginError 
                      ? "border-gray-500 focus:border-gray-900 focus:ring-1 focus:ring-gray-900" 
                      : "border-gray-300 focus:border-[#B400FF] focus:ring-1 focus:ring-[#B400FF]"
                  } disabled:bg-gray-50 disabled:text-gray-500 ${isLoading ? "cursor-wait" : "cursor-text"}`}
                  placeholder={loginLabelText}
                />
                {loginError && <span className="text-gray-600 text-[11px] pl-5 font-medium mt-1">{loginError}</span>}
              </div>

              <div className="flex flex-col gap-1.5">
                <div className="relative flex items-center w-full">
                  <input
                    type={showPassword ? "text" : "password"}
                    disabled={isLoading}
                    value={password}
                    onChange={(e) => { setPassword(e.target.value); if (passwordError) setPasswordError(""); }}
                    className={`w-full h-12 border rounded-full pl-5 pr-12 text-sm outline-none transition-all ${
                      passwordError 
                        ? "border-gray-500 focus:border-gray-900 focus:ring-1 focus:ring-gray-900" 
                        : "border-gray-300 focus:border-[#B400FF] focus:ring-1 focus:ring-[#B400FF]"
                    } disabled:bg-gray-50 disabled:text-gray-500 ${isLoading ? "cursor-wait" : "cursor-text"}`}
                    placeholder="Senha"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 outline-none focus:outline-none flex items-center justify-center"
                  >
                    {showPassword ? <Eye size={18} /> : <EyeOff size={18} />}
                  </button>
                </div>
                {passwordError && <span className="text-gray-600 text-[11px] pl-5 font-medium mt-1">{passwordError}</span>}
              </div>
            </>
          )}

          <button
            type="submit"
            disabled={isLoading}
            className={`w-full h-12 bg-[#B400FF] text-white font-semibold rounded-full transition-all duration-300 flex items-center justify-center gap-2 ${
              isLoading ? "animate-pulse" : "hover:bg-[#9a00db]"
            }`}
          >
            {isLoading ? (
              <>
                <Loader2 className="animate-spin" size={20} />
                Validando...
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