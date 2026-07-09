/**
 * @fileoverview Componente: CustomLogin (Rota: /accounts/signin)
 * @description Interface de autenticação local com validação estrita.
 */

import { createLazyFileRoute, useNavigate } from "@tanstack/react-router";
import React, { useState, useEffect } from "react";
import { Eye, EyeOff } from "lucide-react"; 
import { autenticateWalletsbX } from "@/services/auth";
import { WalletLogo } from "@/components/brand/WalletLogo";
import { useFinancialAuth } from "@/integrations/auth/FinancialAuthContext";

// =========================================================================
// [HELPERS]: Validação e Formatação de Documentos (Mantidos)
// =========================================================================
const isCPF = (str: string) => /^\d{11}$/.test(str.replace(/\D/g, ''));
const isCNPJ = (str: string) => /^\d{14}$/.test(str.replace(/\D/g, ''));

const formatCPF = (val: string) => 
  val.replace(/\D/g, '').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d{1,2})/, '$1-$2').slice(0, 14);

const formatCNPJ = (val: string) => 
  val.replace(/\D/g, '').replace(/(\d{2})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1/$2').replace(/(\d{4})(\d{1,2})/, '$1-$2').slice(0, 18);

export const Route = createLazyFileRoute('/accounts/signin')({
  component: CustomLogin,
});

export function CustomLogin() {
  const { setSession, token } = useFinancialAuth();
  const navigate = useNavigate();
  
  const [tipoPessoa, setTipoPessoa] = useState<"F" | "J">("F");
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  
  const [loginError, setLoginError] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [generalError, setGeneralError] = useState("");
  
  const [ambienteAtual] = useState(() => 
    typeof window !== "undefined" ? localStorage.getItem("sbx_environment") || "production" : "production"
  );

  const [redirectUri, setRedirectUri] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const target = params.get("redirect_uri");
    setRedirectUri(target);
  }, []);

  useEffect(() => {
    if (token && redirectUri) {
      if (redirectUri.startsWith('http')) {
        window.location.href = redirectUri;
      } else {
        navigate({ to: redirectUri as any, replace: true });
      }
    }
  }, [token, redirectUri, navigate]);

  const handleRealLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError(""); setPasswordError(""); setGeneralError("");

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
      const env = localStorage.getItem("sbx_environment") as "staging" | "production" || "production";
      const response = await autenticateWalletsbX(login, password, env);

      if (response?.success) {
        // Apenas atualiza a sessão. O useEffect vai detectar o token e navegar.
        setSession(response.session_token, response.userId);
      } else {
        setPasswordError("Usuário ou senha inválidos.");
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
          {ambienteAtual === 'staging' && (
            <span className="text-[10px] uppercase font-bold px-2 py-1 rounded-full border bg-red-50 text-red-600 border-red-200">
              STAGE
            </span>
          )}
        </div>

        <form onSubmit={handleRealLogin} className="flex flex-col gap-5" noValidate>
          {/* [UI/UX]: Tab Switcher Minimalista (Com outline-none para remover o quadrado) */}
          <div className="flex w-full border-b border-gray-200 mb-2">
            <button
              type="button"
              onClick={() => { setTipoPessoa("F"); setLogin(""); setLoginError(""); setPasswordError(""); }}
              className={`flex-1 text-sm font-semibold py-3 transition-all border-b-2 outline-none focus:outline-none ${
                tipoPessoa === "F" 
                ? "text-gray-900 border-gray-900" 
                : "text-gray-400 border-transparent hover:text-gray-600"
              }`}
            >
              Pessoa Física
            </button>
            <button
              type="button"
              onClick={() => { setTipoPessoa("J"); setLogin(""); setLoginError(""); setPasswordError(""); }}
              className={`flex-1 text-sm font-semibold py-3 transition-all border-b-2 outline-none focus:outline-none ${
                tipoPessoa === "J" 
                ? "text-gray-900 border-gray-900" 
                : "text-gray-400 border-transparent hover:text-gray-600"
              }`}
            >
              Pessoa Jurídica
            </button>
          </div>

          {generalError && (
            <div className="bg-red-50 text-red-600 text-sm p-3 rounded border border-red-100 text-center font-medium">
              {generalError}
            </div>
          )}

          <div className="flex flex-col gap-1.5">
            <input
              type="text"
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
              }`}
              placeholder={loginLabelText}
            />
            {loginError && <span className="text-[#C13535] text-[11px] pl-5 font-medium mt-1">{loginError}</span>}
          </div>

          <div className="relative flex flex-col gap-1.5">
            <input
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => { setPassword(e.target.value); if (passwordError) setPasswordError(""); }}
              className={`w-full h-12 border rounded-full pl-5 pr-12 text-sm outline-none transition-all ${
                passwordError ? "border-[#C13535] focus:ring-1 focus:ring-[#C13535]" : "border-gray-300 focus:border-[#B400FF] focus:ring-1 focus:ring-[#B400FF]"
              }`}
              placeholder="Senha"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-4 top-3.5 text-gray-400 hover:text-gray-600 outline-none focus:outline-none"
            >
              {showPassword ? <Eye size={18} /> : <EyeOff size={18} />}
            </button>
            {passwordError && <span className="text-[#C13535] text-[11px] pl-5 font-medium mt-1">{passwordError}</span>}
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full h-12 bg-[#B400FF] hover:bg-[#9a00db] text-white font-semibold rounded-full transition-colors disabled:opacity-70 mt-2"
          >
            {isLoading ? "Validando..." : "Entrar"}
          </button>
        </form>
      </div>
    </div>);
}