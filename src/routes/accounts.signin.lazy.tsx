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
  
  // Hook do TanStack Router para capturar parâmetros de busca na URL
  const search = useSearch({ from: '/accounts/signin' }) as { 
    redirect_uri?: string; 
    env?: "staging" | "production";
  };
  
  // =========================================================================
  // [LÓGICA DE RESOLUÇÃO DE AMBIENTE CASCATA & ANTI-FLICKER]
  // =========================================================================

  // Flag de montagem para garantir paridade exata entre SSR e primeiro paint do client
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  // O estado default utiliza o parâmetro da URL ou o default seguro do environment
  const [ambienteAtivo, setAmbienteAtivo] = useState<"staging" | "production">(() => {
    return search.env || getDefaultSbxEnvironment();
  });

  // Sincroniza o ambiente real após a montagem no client (lendo sessionStorage/env)
  useEffect(() => {
    if (!mounted) return;
    setAmbienteAtivo(search.env || getDefaultSbxEnvironment());
  }, [mounted, search.env]);

  // Propriedades derivadas estritamente ativas após a hidratação no client
  const isEnvFixed = mounted && isEnvironmentLocked();
  const hasPref = mounted && (hasSbxEnvironmentPreference() || !!search.env);

  // O seletor só aparece se não estiver travado e se NENHUMA preferência tiver sido definida ainda
  const showEnvSelector = mounted && !isEnvFixed && !hasPref;
  const showStageBadge = mounted && ambienteAtivo === "staging" && isEnvFixed;

  /**
   * [HANDLER]: Troca Manual de Ambiente
   * Atualiza o estado, persiste a escolha no session storage.
   */
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

    // Garante que o ambiente ativo seja persistido usando o serviço
    setSbxEnvironmentPreference(ambienteAtivo);

    setIsLoading(true);

    try {
      // -----------------------------------------------------------------------
      // [STEP 2] DISPARO DO PROXY: Autenticação via Edge Function sbx-auth
      // O ambiente ativo foi resolvido com segurança na montagem ou escolha.
      // -----------------------------------------------------------------------
      const response = await autenticateWalletsbX(login, password, ambienteAtivo);
      console.log("🚨 O QUE O BACKEND DEVOLVEU:", response);
      if (response?.success) {
        // 1. NORMALIZAÇÃO BLINDADA (Deep Merge): Puxa de onde estiver disponível,
        // garantindo que nenhum campo obrigatório do Orquestrador fique de fora.
        const rawP = response.user_profile || {};
        const safeProfile = {
          entity_id: rawP.entity_id || response.entity_id || response.userId || "",
          entity_type: rawP.entity_type || response.entity_type || "F",
          name: rawP.name || response.name || "",
          document: rawP.document || response.document || "",
          document_rg: rawP.document_rg || response.document_rg || "",
          email: rawP.email || response.email || "",
          phone: rawP.phone || response.phone || "",
          birth_date: rawP.birth_date || response.birth_date || "",
          gender: rawP.gender || response.gender || "",
          login: rawP.login || response.login || "",
          mothers_name: rawP.mothers_name || response.mothers_name || "",
          address: rawP.address || response.address || null,
          metadata: rawP.metadata || response.metadata || {}
        };

        // 2. Salva usando o seu Contexto (que já fala com o session.ts e salva no sessionStorage)
        setSession(response.session_token, response.userId, safeProfile);

        // 3. Libera o botão
        setIsLoading(false);

        // 4. NAVEGAÇÃO NATIVA: Dá um reload forçado e limpo para o /sbxpay
        // Isso impede que o Router carregue a tela com o estado em memória desatualizado
        const redirectUri = search.redirect_uri || "/sbxpay";
        window.location.href = redirectUri.startsWith('http') 
          ? redirectUri 
          : `${window.location.origin}${redirectUri.startsWith('/') ? '' : '/'}${redirectUri}`;
          
      } else {
        // MANTENHA O ELSE AQUI PARA NÃO QUEBRAR O TRATAMENTO DE ERRO!
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
          <span 
            className={`text-[10px] uppercase font-bold px-2 py-1 rounded-full border bg-red-50 text-red-600 border-red-200 transition-opacity duration-150 ${
              showStageBadge ? "opacity-100" : "opacity-0 pointer-events-none"
            }`}
            aria-hidden={!showStageBadge}
          >
            STAGE
          </span>
        </div>

        {/* 
          SELETOR DE AMBIENTE
          - Sem fade, sem min-height fixo.
          - Enquanto !mounted, nada é renderizado (SSR/1º paint = neutro).
          - Após mount, se `showEnvSelector` for true, aparece INSTANTANEAMENTE
            no seu tamanho natural. Se false, não ocupa espaço algum.
        */}
        {mounted && showEnvSelector && (
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