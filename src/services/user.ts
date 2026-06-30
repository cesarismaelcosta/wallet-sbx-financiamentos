/**
 * @fileoverview Serviço: User Profile
 * Busca os dados do usuário autenticado através da Edge Function sbx-data.
 * Centraliza a chamada para garantir compliance e segurança.
 */

export const fetchMyProfile = async (sbxToken: string) => {
  // Lê o ambiente salvo para informar à Edge Function onde buscar os dados
  const storedAmbiente = localStorage.getItem("sandbox_env") || "stage";

  // A chamada agora aponta para a nossa infraestrutura centralizada (Supabase)
  const response = await fetch("/functions/v1/sbx-data", {
    method: "GET",
    headers: {
      "Authorization": `Bearer ${sbxToken}`,
      "x-sbx-env": storedAmbiente, // Header customizado para a Edge Function
      "Content-Type": "application/json",
      "Accept": "application/json"
    },
  });

  if (!response.ok) {
    console.error(`Erro ao buscar perfil via sbx-data (${response.status}):`, await response.text());
    
    // Mantemos o tratamento de expiração para o orquestrador do front-end agir
    if (response.status === 401 || response.status === 403) {
      throw new Error("SESSION_EXPIRED");
    }
    throw new Error("Falha ao buscar dados do usuário");
  }

  return response.json();
};