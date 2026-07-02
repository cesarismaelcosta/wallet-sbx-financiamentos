/**
 * @fileoverview Serviço: Autenticação da Wallet sbX
 * * Este serviço agora atua como cliente da nossa Edge Function (sbx-auth).
 * Toda a complexidade de OAuth2, client_id, portalid e CORS foi isolada no servidor.
 * * Ele gerencia:
 * 1. O envio seguro das credenciais e do ambiente selecionado.
 * 2. O tratamento do retorno seguro (nosso session_token UUID e o user_id).
 * 3. O cálculo do Clock Drift para sincronização de JWT.
 * --------------------------------------------------------------------------------
 */

import { jwtDecode } from "jwt-decode";

// Substitua pela URL real do seu projeto Supabase
const AUTH_PROXY_URL = "https://ldzutiojmcawhwdhojlo.supabase.co/functions/v1/sbx-auth";

// =========================================================================
// FUNÇÃO: autenticateWalletsbX
// =========================================================================
export const autenticateWalletsbX = async (
  user: string, 
  pass: string, 
  environment: "staging" | "production" = "staging" // Ajustado para o padrão do banco
) => {
  try {
    const response = await fetch(AUTH_PROXY_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
      },
      // Enviamos um JSON simples, a Edge Function cuida da conversão para a Superbid
      body: JSON.stringify({
        username: user,
        password: pass,
        environment: environment
      }),
    });

    // ---------------------------------------------------------------------------
    // TRATAMENTO DA RESPOSTA E SEGURANÇA
    // ---------------------------------------------------------------------------
    if (response.ok) {
      const data = await response.json();
      
      if (data.session_token) {

        // -----------------------------------------------------------------------
        // [SECURITY]: Cálculo de compensação do relógio (Clock Drift)
        // -----------------------------------------------------------------------
        // Calcula a diferença entre o relógio do servidor e o da máquina do usuário.
        // Feito na camada de serviço para encapsular a regra de negócio.
        try {
          if (data.sbx_access_token) {
            const decoded = jwtDecode<{ iat?: number }>(data.sbx_access_token);
            if (decoded.iat) {
              const serverTimeMs = decoded.iat * 1000;
              const localTimeMs = Date.now();
              const timeDelta = serverTimeMs - localTimeMs;
              
              localStorage.setItem('time_delta', timeDelta.toString());
              console.log(`⏱️ [AUTH Service] Clock Drift salvo. Delta: ${timeDelta}ms`);
            }
          }
        } catch (err) {
          console.warn("⚠️ [AUTH Service] Falha ao decodificar o token para o Clock Drift.", err);
        }

        return { 
          success: true, 
          token: data.session_token,      // Este é o nosso UUID (Cofre)
          userId: data.user_id,           // ID real do usuário retornado pela SBX
          sbxToken: data.sbx_access_token // Token da sbX (JWT Real)
        };
      } else {
        console.error("Proxy validado (200), mas sem token na resposta:", data);
        return { success: false, message: "Token ausente na resposta do servidor" };
      }
    } else {
      // Tenta extrair a mensagem de erro amigável que definimos na Edge Function
      const errorData = await response.json().catch(() => ({}));
      return { 
        success: false, 
        message: errorData.error || "Login ou senha inválidos" 
      };
    }

  } catch (error) {
    // ---------------------------------------------------------------------------
    // FALLBACK DE ERROS (Falhas de rede)
    // ---------------------------------------------------------------------------
    console.error("Erro crítico na comunicação com o Proxy de Autenticação:", error);
    return { success: false, message: "Erro de rede ao contatar o servidor interno" };
  }
};