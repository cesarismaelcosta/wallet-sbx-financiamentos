/**
 * @fileoverview Componente: CustomLogin (Rota: /accounts/signin)
 * 
 * Mock local do formulário de login. Ele é o responsável por:
 * 1. Coletar as credenciais e o ambiente alvo ('staging' ou 'production').
 * 2. Enviar os dados para a nossa Edge Function (Proxy de Auth).
 * 3. Salvar o session_token (UUID) no localStorage de forma segura.
 * 4. Redirecionar o usuário de forma limpa (sem expor tokens na URL).
 * 
 * --------------------------------------------------------------------------------
 */

import { createLazyFileRoute, useNavigate, useSearch } from "@tanstack/react-router";
import React, { useState, useEffect } from "react";
import { Eye, EyeOff } from "lucide-react"; 
import { autenticateWalletsbX } from "@/services/auth";
import { WalletLogo } from "@/components/brand/WalletLogo";
import { useFinancialAuth } from "@/integrations/auth/FinancialAuthContext";

// =========================================================================
// TIPAGENS E INTERFACES
// =========================================================================
type AccountsSearch = {
  redirect_uri?: string;
  redirect?: string; // Adicionado para suportar a nova chave
  response_type?: string;
  client_id?: string;
  portal_id?: string;
  [key: string]: any; 
};

export const Route = createLazyFileRoute('/accounts/signin')({
  component: CustomLogin,
});

function CustomLogin() {
  // AJUSTE: Trouxemos o 'token' para ser observado
  const { setSession, token } = useFinancialAuth();
  const navigate = useNavigate();
  const searchParams = useSearch({ strict: false }) as AccountsSearch;
  
  // =========================================================================
  // ESTADOS GLOBAIS DO COMPONENTE
  // =========================================================================
  const [tipoPessoa, setTipoPessoa] = useState<"F" | "J">("F");
  
  // AJUSTE 1: Tipagem rigorosa alinhada com o Banco de Dados (Agora default é production)
  const [ambiente, setAmbiente] = useState<"staging" | "production">("production"); 
  
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  
  const [isLoginFocused, setIsLoginFocused] = useState(false);
  const [isPasswordFocused, setIsPasswordFocused] = useState(false);
  
  const [loginError, setLoginError] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [generalError, setGeneralError] = useState("");

// =========================================================================
  // OBSERVADOR DE SESSÃO (AUTO-REDIRECIONAMENTO)
  // =========================================================================
  // [BUSINESS LOGIC]: Inicializamos como null para garantir compatibilidade com SSR.
  const [redirectUri, setRedirectUri] = useState<string | null>(null);

  useEffect(() => {
    // [BUSINESS LOGIC]: Captura a URL real apenas no cliente (Browser) após a montagem.
    const params = new URLSearchParams(window.location.search);
    const target = params.get("redirect") || params.get("redirect_uri") || "/sandbox";
    setRedirectUri(target);
  }, []);

  useEffect(() => {
    // [BUSINESS LOGIC]: Aguarda token E o redirectUri estar definido para navegar.
    if (token && redirectUri) {
      console.log("🚀 [Login] Token detectado! Redirecionando para:", redirectUri);
      if (redirectUri.startsWith('http')) {
        window.location.href = redirectUri;
      } else {
        navigate({ to: redirectUri as any, replace: true });
      }
    }
  }, [token, navigate, redirectUri]);
  
  // =========================================================================
  // HANDLER: SUBMISSÃO DE LOGIN
  // =========================================================================
  const handleRealLogin = async (e: React.FormEvent) => {
    console.log("Teste: Iniciando handleRealLogin");

    e.preventDefault();
    setLoginError(""); setPasswordError(""); setGeneralError("");

    if (!login.trim() || !password.trim()) {
      if (!login.trim()) setLoginError("Campo obrigatório");
      if (!password.trim()) setPasswordError("A senha deve ser informada");
      return;
    }

    setIsLoading(true);

    // O serviço agora fala com a nossa Edge Function
    const response = await autenticateWalletsbX(login, password, ambiente);

    // DEBUG: Verifique no console do navegador o que o servidor devolveu
    console.log("🔍 [Login] Resposta da Edge Function:", response);

    if (response?.success && response.token) {
      localStorage.setItem('sandbox_env', ambiente); 
      const sbxToken = response.sbxToken || response.sbx_access_token;

      // 1. O setSession já salva no localStorage.
      // O useEffect (Observador) vai detectar essa mudança e acionar o "Passo 3" (Navegar) automaticamente
      setSession(response.token, sbxToken || "", response.userId);
    }
    else {
      // Exibe o erro tratado que veio da Edge Function
      setGeneralError(response?.message || "Login ou senha inválidos.");
      setIsLoading(false); // Retorna o botão ao estado normal apenas se der erro
    }
  };

  const loginLabelText = tipoPessoa === "F" ? "E-mail, login ou CPF" : "CNPJ ou login";

  // =========================================================================
  // RENDERIZAÇÃO
  // =========================================================================
  return (
    <div className="min-h-screen flex items-start justify-center pt-24 sm:pt-32 bg-gray-50 px-4 font-['Plus_Jakarta_Sans']">
      <div className="w-full max-w-[440px] bg-white rounded-xl shadow-sm border border-gray-100 p-8 sm:p-10">
        
        <div className="flex justify-start mb-6">
          <WalletLogo size="md" withTagline />
        </div>

        {/* ---------------------------------------------------------------------------
          SELETOR DE AMBIENTE 
          --------------------------------------------------------------------------- */}
        <div className="mb-6 p-1 bg-gray-100 rounded-full flex gap-1 border border-gray-200">
          <button
            type="button"
            onClick={() => setAmbiente("staging")}
            className={`flex-1 py-2 text-xs font-bold rounded-full transition-all border ${
              ambiente === "staging" 
                ? "bg-white text-[#B400FF] border-[#B400FF] shadow-sm"
                : "text-gray-500 hover:text-gray-700 border-transparent"
            }`}
          >
            STAGE
          </button>
          <button
            type="button"
            onClick={() => setAmbiente("production")}
            className={`flex-1 py-2 text-xs font-bold rounded-full transition-all border ${
              ambiente === "production" 
                ? "bg-white text-[#B400FF] border-[#B400FF] shadow-sm"
                : "text-gray-500 hover:text-gray-700 border-transparent"
            }`}
          >
            PRODUÇÃO
          </button>
        </div>

        {/* ---------------------------------------------------------------------------
          FORMULÁRIO DE LOGIN
          --------------------------------------------------------------------------- */}
        <form onSubmit={handleRealLogin} className="flex flex-col gap-5">
          
          <input type="hidden" name="personType" value={tipoPessoa} />

          <div className="flex w-full border-b border-gray-200 mb-2">
            <button
              type="button"
              onClick={() => { setTipoPessoa("F"); setLogin(""); setLoginError(""); setPasswordError(""); setGeneralError(""); }}
              className={`flex-1 text-sm font-semibold py-3 transition-all ${tipoPessoa === "F" ? "text-gray-900 border-b-2 border-gray-900" : "text-gray-400 hover:text-gray-600"}`}
            >
              Pessoa Física
            </button>
            <button
              type="button"
              onClick={() => { setTipoPessoa("J"); setLogin(""); setLoginError(""); setPasswordError(""); setGeneralError(""); }}
              className={`flex-1 text-sm font-semibold py-3 transition-all ${tipoPessoa === "J" ? "text-gray-900 border-b-2 border-gray-900" : "text-gray-400 hover:text-gray-600"}`}
            >
              Pessoa Jurídica
            </button>
          </div>

          {generalError && (
            <div className="bg-[#FEF2F2] text-[#C13535] text-sm p-3 rounded border border-[#C13535]/20 text-center font-medium">
              {generalError}
            </div>
          )}

          {/* CAMPO: LOGIN */}
          <div className="flex flex-col gap-1.5">
            <div className="relative">
              <input
                type="text"
                id="login"
                name="login"
                autoComplete="on"
                value={login}
                onFocus={() => setIsLoginFocused(true)}
                onBlur={() => setIsLoginFocused(false)}
                onChange={(e) => { setLogin(e.target.value); if (loginError) setLoginError(""); }}
                className={`peer w-full h-12 border rounded-full px-5 pt-4 pb-0 text-sm text-gray-900 focus:outline-none focus:ring-1 transition-colors bg-transparent placeholder-transparent ${
                  loginError ? "border-[#C13535] focus:border-[#C13535] focus:ring-[#C13535]" : "border-gray-300 focus:border-[#B400FF] focus:ring-[#B400FF]"
                }`}
                placeholder={loginLabelText}
              />
              <label 
                htmlFor="login"
                className={`absolute left-5 transition-all ${
                  (isLoginFocused || login) 
                    ? "top-1.5 text-[10px] text-[#B400FF]" 
                    : "top-3.5 text-sm text-gray-500"
                } ${loginError ? "!text-[#C13535]" : ""}`}
              >
                {loginLabelText}
              </label>
            </div>
            {loginError && <span className="text-[#C13535] text-[11px] pl-5 font-medium">{loginError}</span>}
          </div>

          {/* CAMPO: SENHA */}
          <div className="flex flex-col gap-1.5">
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                id="password"
                name="password"
                autoComplete="on"
                maxLength={20}
                value={password}
                onFocus={() => setIsPasswordFocused(true)}
                onBlur={() => setIsPasswordFocused(false)}
                onChange={(e) => { setPassword(e.target.value); if (passwordError) setPasswordError(""); }}
                className={`peer w-full h-12 border rounded-full pl-5 pr-12 pt-4 pb-0 text-sm text-gray-900 focus:outline-none focus:ring-1 transition-colors bg-transparent placeholder-transparent ${
                  passwordError ? "border-[#C13535] focus:border-[#C13535] focus:ring-[#C13535]" : "border-gray-300 focus:border-[#B400FF] focus:ring-[#B400FF]"
                }`}
                placeholder="Senha"
              />
              <label 
                htmlFor="password"
                className={`absolute left-5 transition-all ${
                  (isPasswordFocused || password) 
                    ? "top-1.5 text-[10px] text-[#B400FF]" 
                    : "top-3.5 text-sm text-gray-500"
                } ${passwordError ? "!text-[#C13535]" : ""}`}
              >
                Senha
              </label>
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-4 top-3.5 text-gray-400 hover:text-gray-600 outline-none focus:outline-none"
              >
                {showPassword ? <Eye size={18} /> : <EyeOff size={18} />}
              </button>
            </div>
            {passwordError && <span className="text-[#C13535] text-[11px] pl-5 font-medium">{passwordError}</span>}
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full h-12 bg-[#B400FF] hover:bg-[#9a00db] text-white font-semibold rounded-full transition-colors flex items-center justify-center disabled:opacity-70 disabled:cursor-not-allowed mt-2 text-base"
          >
            {isLoading ? "Validando..." : "Entrar"}
          </button>
        </form>
      </div>
    </div>
  );
}