/**
 * @fileoverview Serviço: User Profile
 * Busca os dados do usuário autenticado através da Edge Function sbx-data.
 * Centraliza a chamada para garantir compliance e segurança.
 * 
 * [RESPONSABILIDADES]:
 * 1. Interface de comunicação: O front-end envia apenas o session_token (UUID),
 *    mantendo os tokens reais da API (sbx_access_token) protegidos no servidor.
 * 2. Segurança: O erro 401 é tratado como SESSION_EXPIRED, garantindo o ciclo
 *    de vida da sessão baseado na validade real (expires_at) do banco.
 */

// 1. Tipagem Exata do retorno da nossa Edge Function (BFF)
export interface BFFUserProfile {
  entity_id: string;
  name: string;
  document: string; // Padrão unificado
  email: string;
  phone: string;
  birth_date: string;
  gender: string;
  login: string;
  mothers_name: string;
  address: {
    street: string;
    number: string;
    complement: string;
    neighborhood: string;
    city: string;
    state: string;
    zip_code: string;
    country: string;
  } | null;
  metadata: {
    processedAt: string;
    originIp: string;
  };
}

// 2. Função de requisição agora tipada com Promise<BFFUserProfile>
/**
 * Busca o perfil do usuário no servidor.
 * @param sessionToken O UUID de sessão (Cofre) salvo no banco de dados.
 */
export const fetchMyProfile = async (sessionToken: string): Promise<BFFUserProfile> => {
  const storedAmbiente = localStorage.getItem("sandbox_env") || "stage";
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;

  // Chamada segura via Proxy/BFF
  const response = await fetch(`${supabaseUrl}/functions/v1/sbx-data`, {
    method: "GET",
    headers: {
      "Authorization": `Bearer ${sessionToken}`, // O UUID é o nosso identificador de cofre
      "x-sbx-env": storedAmbiente,
      "Content-Type": "application/json",
      "Accept": "application/json"
    },
  });

  if (response.status === 401) {
    // 1. Limpa o storage imediatamente
    localStorage.removeItem("session_token");
    localStorage.removeItem("sbx_access_token");
    localStorage.removeItem("user_id");
    
    // 2. Redireciona via navegador (força o reload da app para limpar memória)
    window.location.href = '/accounts/signin';
    
    // 3. Retorna null ou um erro que não deve ser tratado pelo Guard
    return null;
  }

  if (!response.ok) throw new Error("API_ERROR");
  
  // Retorno dos dados hidratados e limpos pelo BFF
  return response.json();
};