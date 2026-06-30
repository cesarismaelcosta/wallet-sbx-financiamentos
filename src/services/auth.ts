/**
 * @fileoverview Serviço: Autenticação da Wallet sbX
 * 
 * Este serviço é responsável pela comunicação com os endpoints de OAuth2 da Superbid.
 * Ele gerencia:
 * 1. A seleção dinâmica de ambiente (Staging vs Produção) baseado na string recebida.
 * 2. A normalização da payload em x-www-form-urlencoded para conformidade com o padrão OAuth2.
 * 3. O parsing da resposta da API, garantindo a extração segura do access_token.
 * 
 * --------------------------------------------------------------------------------
 */

const ENV_URLS = {
  PROD: "https://api.s4bdigital.net/account/oauth/token",
  STAGING: "https://stgapi.s4bdigital.net/account/oauth/token"
};

// =========================================================================
// FUNÇÃO: autenticateWalletsbX
// =========================================================================
export const autenticateWalletsbX = async (
  user: string, 
  pass: string, 
  ambiente: "stage" | "production" = "stage"
) => {
  const API_URL = ambiente === "stage" ? ENV_URLS.STAGING : ENV_URLS.PROD;

  try {
    const details = new URLSearchParams();
    details.append("username", user);
    details.append("password", pass);
    details.append("grant_type", "password");
    details.append("client_id", "dzqC3VodSoXukD45BQKg3NQU6-faststore");
    details.append("portalid", "2");

    const response = await fetch(API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: details.toString(),
    });

    // ---------------------------------------------------------------------------
    // TRATAMENTO DA RESPOSTA (Parsing de JSON e extração de token)
    // ---------------------------------------------------------------------------
    if (response.ok) {
      const data = await response.json();
      
      if (data.access_token) {
        return { success: true, token: data.access_token };
      } else {
        console.error("API validada (200), mas sem token na resposta:", data);
        return { success: false, message: "Token ausente na resposta da API" };
      }
    } else {
      return { success: false, message: "Login ou senha inválidos ou erro de autorização" };
    }

  } catch (error) {
    // ---------------------------------------------------------------------------
    // FALLBACK DE ERROS (Falhas de rede ou CORS)
    // ---------------------------------------------------------------------------
    console.error("Erro crítico na comunicação com a API:", error);
    return { success: false, message: "Erro de rede" };
  }
};