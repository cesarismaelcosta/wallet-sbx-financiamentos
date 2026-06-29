import { createLazyFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Eye, EyeOff } from "lucide-react"; 
import { autenticateWalletsbX } from "@/services/auth"; 

// A mágica do roteador acontece nesta linha. O caminho deve bater com o nome do arquivo!
export const Route = createLazyFileRoute('/sandbox/login')({
  component: SandboxLogin,
});

function SandboxLogin() {
  const navigate = useNavigate();
  
  const [tipoPessoa, setTipoPessoa] = useState<"F" | "J">("F");
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError("");

    // Testando a API invisível
    const response = await autenticateWalletsbX(login, password);

    if (response.success) {
      console.log("✅ Token de Produção capturado com sucesso no Sandbox!");
      // Direciona para o simulador se der certo
      navigate({ to: "/financiamentos/simulacao" });
    } else {
      setError("E-mail, CPF ou senha incorretos. Tente novamente.");
    }
    
    setIsLoading(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4 font-['Plus_Jakarta_Sans']">
      <div className="w-full max-w-[440px] bg-white rounded-xl shadow-sm border border-gray-100 p-8 sm:p-10">
        
        <div className="flex justify-center mb-8">
          <img 
            src="/images/walletlong.png" 
            alt="Wallet sbX Logo" 
            className="h-10 w-auto object-contain"
            onError={(e) => {
              e.currentTarget.style.display = 'none';
              e.currentTarget.nextElementSibling?.classList.remove('hidden');
            }}
          />
          <h1 className="hidden text-2xl font-bold text-gray-900">Wallet sbX Sandbox</h1>
        </div>

        <form onSubmit={handleLogin} className="flex flex-col gap-6">
          
          <div className="flex w-full bg-gray-100 rounded-md p-1">
            <button
              type="button"
              onClick={() => setTipoPessoa("F")}
              className={`flex-1 text-sm font-semibold py-2 rounded transition-all ${
                tipoPessoa === "F" ? "bg-white text-gray-900 shadow" : "text-gray-400 hover:text-gray-600"
              }`}
            >
              Pessoa Física
            </button>
            <button
              type="button"
              onClick={() => setTipoPessoa("J")}
              className={`flex-1 text-sm font-semibold py-2 rounded transition-all ${
                tipoPessoa === "J" ? "bg-white text-gray-900 shadow" : "text-gray-400 hover:text-gray-600"
              }`}
            >
              Pessoa Jurídica
            </button>
          </div>

          {error && (
            <div className="bg-red-50 text-red-600 text-sm p-3 rounded border border-red-100">
              {error}
            </div>
          )}

          <div className="relative">
            <input
              type="text"
              id="login"
              required
              value={login}
              onChange={(e) => setLogin(e.target.value)}
              className="peer w-full h-14 border border-gray-300 rounded-md px-4 pt-4 pb-1 text-gray-900 focus:outline-none focus:border-blue-600 focus:ring-1 focus:ring-blue-600 transition-colors bg-transparent placeholder-transparent"
              placeholder="E-mail, login ou CPF"
            />
            <label 
              htmlFor="login"
              className="absolute left-4 top-4 text-gray-500 text-base transition-all peer-placeholder-shown:text-base peer-placeholder-shown:top-4 peer-focus:top-2 peer-focus:text-xs peer-focus:text-blue-600"
            >
              E-mail, login ou CPF
            </label>
          </div>

          <div className="relative">
            <input
              type={showPassword ? "text" : "password"}
              id="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="peer w-full h-14 border border-gray-300 rounded-md pl-4 pr-12 pt-4 pb-1 text-gray-900 focus:outline-none focus:border-blue-600 focus:ring-1 focus:ring-blue-600 transition-colors bg-transparent placeholder-transparent"
              placeholder="Senha"
            />
            <label 
              htmlFor="password"
              className="absolute left-4 top-4 text-gray-500 text-base transition-all peer-placeholder-shown:text-base peer-placeholder-shown:top-4 peer-focus:top-2 peer-focus:text-xs peer-focus:text-blue-600"
            >
              Senha
            </label>
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-4 top-4 text-gray-400 hover:text-gray-600"
            >
              {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
            </button>
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full h-12 bg-[#0052CC] hover:bg-[#0047b3] text-white font-semibold rounded-md transition-colors flex items-center justify-center disabled:opacity-70 disabled:cursor-not-allowed mt-2"
          >
            {isLoading ? "Autenticando..." : "Entrar (Sandbox)"}
          </button>

        </form>
      </div>
    </div>
  );
}