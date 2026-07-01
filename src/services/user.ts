/**
 * @fileoverview Serviço: User Profile
 * Busca os dados do usuário autenticado através da Edge Function sbx-data.
 * Centraliza a chamada para garantir compliance e segurança.
 */

// 1. Tipagem Exata do retorno da nossa Edge Function
export interface BFFUserProfile {
  entity_id: string;
  name: string;
  cpf: string;
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
export const fetchMyProfile = async (sbxToken: string): Promise<BFFUserProfile> => {
  const storedAmbiente = localStorage.getItem("sandbox_env") || "stage";
  
  // Garantimos o uso da URL absoluta para evitar o erro 500 do Vite
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;

  const response = await fetch(`${supabaseUrl}/functions/v1/sbx-data`, {
    method: "GET",
    headers: {
      "Authorization": `Bearer ${sbxToken}`,
      "x-sbx-env": storedAmbiente,
      "Content-Type": "application/json",
      "Accept": "application/json"
    },
  });

  if (!response.ok) {
    console.error(`[ERROR] Falha ao buscar perfil via sbx-data (${response.status})`);
    
    // Dispara a deslogada automática se o token estiver inválido/expirado
    if (response.status === 401 || response.status === 403) {
      throw new Error("SESSION_EXPIRED");
    }
    throw new Error("Falha ao buscar dados do usuário");
  }

  // O response.json() agora é automaticamente reconhecido como BFFUserProfile
  return response.json();
};