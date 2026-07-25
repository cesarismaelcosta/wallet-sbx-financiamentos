/**
 * @fileoverview Componente de Login Customizado (Rota: /accounts/signin)
 *
 * ARQUITETURA E RESOLUÇÃO DE AMBIENTE E SEGURANÇA:
 * Interface visual de autenticação que gerencia dinamicamente o ambiente de destino (`staging` | `production`)
 * e dispara a criação da sessão via Cookie HttpOnly através do Proxy de Autenticação (`sbx-auth`).
 *
 * REGRAS DE RESOLUÇÃO DE AMBIENTE (LÓGICA EM CASCATA):
 * 1. Prioridade 1 (Variável de Build - Vite): Se a variável `import.meta.env.VITE_APP_ENV` estiver
 *    configurada no arquivo `.env` do projeto, o ambiente fica travado (ex: Staging/Production)
 *    e o seletor visual da interface é OCULTADO.
 * 2. Prioridade 2 (Sessão Ativa / JWT): Em chamadas já autenticadas, a claim `environment` interna do JWT assume a regra.
 * 3. Fallback (UI Selector / URL Query): Se a variável `VITE_APP_ENV` NÃO estiver definida no build, o componente
 *    permite a escolha via parâmetro de URL (`?env=...`) ou exibe um seletor interativo na tela (STAGE / PRODUÇÃO)
 *    para o usuário definir o ambiente manualmente antes da submissão.
 *
 * PRINCIPAIS GARANTIAS DE SEGURANÇA:
 * 1. Zero LocalStorage: Nenhuma chave de sessão, token JWT ou preferência de ambiente é gravada no armazenamento local do navegador.
 * 2. Autenticação Stateless no Client: Executa a função `autenticateWalletsbX` e injeta a sessão estritamente na memória React Context.
 * 3. Redirecionamento Sem Vazamento (Zero Token Leak): Navega para a `redirect_uri` preservando a estrutura
 *    da URL sem injetar query params sensíveis (`auth_token`), aproveitando o envio automático do cookie pelo navegador.
 * 4. Prevenção de Loops de Redirecionamento: Toda a navegação pós-login ocorre exclusivamente dentro do handler
 *    de submit acionado pelo clique do usuário (`onSubmit`), anulando re-renderizações cíclicas de `useEffect`.
 */

import { createLazyFileRoute, useNavigate, useSearch } from "@tanstack/react-router";
import React, { useState } from "react";
import { Eye, EyeOff, Loader2 } from "lucide-react"; 
import { autenticateWalletsbX } from "@/services/auth";
import { WalletLogo } from "@/components/brand/WalletLogo";
import { useFinancialAuth } from "@/integrations/auth/FinancialAuthContext";

// =========================================================================
// [HELPERS]: Validação e Formatação de Documentos (CPF / CNPJ)
// =========================================================================

/**
 * Valida a estrutura numérica bruta de um CPF (11 dígitos).
 */
const isCPF = (str: string) => /^\d{11}$/.test(str.replace(/\D/g, ''));

/**
 * Valida a estrutura numérica bruta de um CNPJ (14 dígitos).
 */
const isCNPJ = (str: string) => /^\d{14}$/.test(str.replace(/\D/g, ''));

/**
 * Aplica a máscara visual padrão de CPF (000.000.000-00) em tempo real durante a digitação.
 */
const formatCPF = (val: string) => 
  val
    .replace(/\D/g, '')
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d{1,2})/, '$1-$2')
    .slice(0, 14);

/**
 * Aplica a máscara visual padrão de CNPJ (00.000.000/0001-00) em tempo real durante a digitação.
 */
const formatCNPJ = (val: string) => 
  val
    .replace(/\D/g, '')
    .replace(/(\d{2})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1/$2')
    .replace(/(\d{4})(\d{1,2})/, '$1-$2')
    .slice(0, 18);

// Configuração da rota lazy via TanStack Router
export const Route = createLazyFileRoute('/accounts/signin')({
  component: CustomLogin,
});

export function CustomLogin() {
  // Contexto de autenticação global em memória (não lê do disk)
  const { setSession } = useFinancialAuth();
  const navigate = useNavigate();
  
  // Hook do TanStack Router para capturar parâmetros de busca na URL (ex: ?redirect_uri=... & env=staging)
  const search = useSearch({ from: '/accounts/signin' }) as { 
    redirect_uri?: string; 
    env?: "staging" | "production";
  };
  
  // =========================================================================
  // [LÓGICA DE RESOLUÇÃO DE AMBIENTE CASCATA]
  // =========================================================================
  
  // 1. Tenta resgatar a variável de ambiente injetada no build do Vite (.env)
  const envFromVite = import.meta.env.VITE_APP_ENV as "staging" | "production" | undefined;
  
  // 2. Estado local para controle do seletor da UI (inicializado via URL query param ou 'production')
  const [userSelectedEnv, setUserSelectedEnv] = useState<"staging" | "production">(
    search.env || "production"
  );

  // 3. Determina se o ambiente está fixado via build ou se dependerá da escolha do usuário na interface
  const ambienteAtivo: "staging" | "production" = envFromVite || userSelectedEnv;
  const isEnvFixed = Boolean(envFromVite);

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

  /**
   * [HANDLER]: Processamento de Autenticação
   * Centraliza a validação dos campos, aciona o serviço do Proxy OAuth e executa
   * o redirecionamento limpo para a aplicação sem expor tokens na URL.
   */
  const handleRealLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError(""); 
    setPasswordError(""); 
    setGeneralError("");

    // -----------------------------------------------------------------------
    // STEP 1: Validação síncrona dos campos obrigatórios e formatos de documento
    // -----------------------------------------------------------------------
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

    setIsLoading(true);

    try {
      // -----------------------------------------------------------------------
      // STEP 2: Disparo da requisição para o serviço de autenticação proxy
      // Passa o ambiente ativo resolvido pela cascata (Vite Env ou UI Selector)
      // -----------------------------------------------------------------------
      const response = await autenticateWalletsbX(login, password, ambienteAtivo);

      if (response?.success) {
        // ---------------------------------------------------------------------
        // STEP 3: Atualização do estado global do usuário em memória
        // O cookie HttpOnly já foi injetado pelo navegador através do Set-Cookie
        // ---------------------------------------------------------------------
        setSession(response.userId);

        // ---------------------------------------------------------------------
        // STEP 4: Processamento de Redirecionamento Limpo
        // Navega para a URL destino sem anexar query params de autenticação
        // ---------------------------------------------------------------------
        const redirectUri = search.redirect_uri;
        if (redirectUri) {
          const base = redirectUri.startsWith('http') ? '' : window.location.origin;
          const urlObject = new URL(redirectUri, base || undefined);
          const finalUri = redirectUri.startsWith('http') 
            ? urlObject.toString() 
            : `${urlObject.pathname}${urlObject.search}`;

          if (redirectUri.startsWith('http')) {
            window.location.href = finalUri;
          } else {
            navigate({ to: finalUri as any, replace: true });
          }
        } else {
          // Fallback padrão para a raiz do sistema
          navigate({ to: "/", replace: true });
        }
      } else {
        setPasswordError(response.message || "Usuário ou senha inválidos.");
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
        
        {/* Cabeçalho do Card: Logo da Brand e Badge de Ambiente Fixo */}
        <div className="flex justify-between items-center mb-6">
          <WalletLogo size="md" withTagline />
          {/* Badge de indicação visual caso o ambiente STAGE esteja fixado via build (.env) */}
          {ambienteAtivo === 'staging' && isEnvFixed && (
            <span className="text-[10px] uppercase font-bold px-2 py-1 rounded-full border bg-red-50 text-red-600 border-red-200">
              STAGE
            </span>
          )}
        </div>

        {/* 
          SELETOR VISUAL DE AMBIENTE:
          Exibido apenas quando a variável VITE_APP_ENV NÃO estiver travada no arquivo de build.
          Permite que desenvolvedores e testadores alternem livremente antes de efetuar o login.
        */}
        {!isEnvFixed && (
          <div className="mb-6 p-3 bg-slate-50 border border-slate-200 rounded-xl">
            <p className="text-xs text-slate-500 font-medium mb-2 text-center">
              Selecione o ambiente de destino:
            </p>
            <div className="flex bg-gray-200 rounded-full p-1 border border-gray-300">
              <button
                type="button"
                disabled={isLoading}
                onClick={() => setUserSelectedEnv("staging")}
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
                disabled={isLoading}
                onClick={() => setUserSelectedEnv("production")}
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
          {/* Alternador de Tipo de Pessoa (Física x Jurídica) */}
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

          {/* Mensagem de Erro Geral da API */}
          {generalError && (
            <div className="bg-red-50 text-red-600 text-sm p-3 rounded border border-red-100 text-center font-medium">
              {generalError}
            </div>
          )}

          {/* Campo de Entrada de Login com Formatação Dinâmica (CPF/CNPJ/E-mail) */}
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
                loginError ? "border-[#C13535] focus:ring-1 focus:ring-[#C13535]" : "border-gray-300 focus:border-[#B400FF] focus:ring-1 focus:ring-[#B400FF]"
              } disabled:bg-gray-50 disabled:text-gray-500 ${isLoading ? "cursor-wait" : "cursor-text"}`}
              placeholder={loginLabelText}
            />
            {loginError && <span className="text-[#C13535] text-[11px] pl-5 font-medium mt-1">{loginError}</span>}
          </div>

          {/* Campo de Senha */}
          <div className="flex flex-col gap-1.5">
            <div className="relative flex items-center w-full">
              <input
                type={showPassword ? "text" : "password"}
                disabled={isLoading}
                value={password}
                onChange={(e) => { setPassword(e.target.value); if (passwordError) setPasswordError(""); }}
                className={`w-full h-12 border rounded-full pl-5 pr-12 text-sm outline-none transition-all ${
                  passwordError ? "border-[#C13535] focus:ring-1 focus:ring-[#C13535]" : "border-gray-300 focus:border-[#B400FF] focus:ring-1 focus:ring-[#B400FF]"
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
            {passwordError && <span className="text-[#C13535] text-[11px] pl-5 font-medium mt-1">{passwordError}</span>}
          </div>

          {/* Botão de Submissão com Indicador Visual de Carregamento */}
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
            ) : (
              "Entrar"
            )}
          </button>
        </form>
      </div>
    </div>
  );
}