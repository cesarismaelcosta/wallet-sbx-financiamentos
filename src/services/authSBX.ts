/**
 * @fileoverview Serviço de Autenticação Federada (Bridge para Edge Functions)
 * --------------------------------------------------------------------------------
 * 1. OBJETIVO: Centralizar validação de tokens externos e troca para JWT interno.
 * 2. PADRÃO: Integração com Edge Functions (Supabase) via fetch nativo.
 * 3. SEGURANÇA: Comunicação segura utilizando AnonKey para chamadas de sistema.
 * --------------------------------------------------------------------------------
 * @author Cesar Ismael Pereira da Costa
 * @version 1.0.0
 */

/**
 * @function exchangeAuthSBX
 * @description Realiza o exchange (troca) do token externo pelo token da sessão interna.
 * Utilizado pelo Loader do Gateway para validar credenciais antes da renderização.
 * @param superbidToken - Token original provido pela Superbid.
 * @param environment - Ambiente de execução ("staging" | "production").
 */
export const exchangeAuthSBX = async (sbx_access_token: string, environment: "staging" | "production") => {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

  try {
    const response = await fetch(`${supabaseUrl}/functions/v1/sbx-auth-exchange`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${supabaseAnonKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ 
        sbx_access_token: sbx_access_token, 
        environment 
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.message || `Auth Exchange falhou: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error("🚨 [authSBX.ts | exchangeAuthSBX] Falha no Token Exchange:", error);
    throw error;
  }
};

/**
 * @function authenticateSBXToken
 * @description Valida token externo no endpoint /me da Superbid.
 * @param sbx_access_token - Token original para validação.
 */
export const authenticateSBXToken = async (sbx_access_token: string) => {
  try {
    // 1. VALIDAÇÃO EXTERNA: Bate no /me da Superbid usando APENAS o token deles
    const response = await fetch('https://api.superbid.net/v1/me', { 
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${sbx_access_token}`, 
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error(`[authSBX.ts | authenticateSBXToken] Token sbX inválido ou expirado (Status: ${response.status})`);
    }

    // 2. EXTRAÇÃO DE DADOS
    const sbxUserData = await response.json();

    // 3. RETORNO PARA O GATEWAY
    return {
      sbx_access_token: sbx_access_token, 
      sbx_user: sbxUserData, 
      isValid: true
    };

  } catch (error) {
    console.error("🚨 [authSBX.ts | authenticateSBXToken] : Falha na validação do token externo:", error);
    throw error;
  }
};