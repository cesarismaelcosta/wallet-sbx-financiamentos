/**
 * @fileoverview Serviço: User Profile
 * Busca os dados do usuário autenticado no endpoint /me.
 */

const ENDPOINTS = {
  PROD: "https://api.s4bdigital.net",
  STAGING: "https://stgapi.s4bdigital.net"
};

export const fetchMyProfile = async (sbxToken: string) => {
  // Lê o ambiente salvo no login para não misturar Staging com Prod
  const storedAmbiente = localStorage.getItem("sandbox_env") || "stage";
  const BASE_URL = storedAmbiente === "production" ? ENDPOINTS.PROD : ENDPOINTS.STAGING;
  
  const URL = `${BASE_URL}/account/v2/user/me`;

  const response = await fetch(URL, {
    method: "GET",
    headers: {
      "Authorization": `Bearer ${sbxToken}`,
      "Content-Type": "application/json",
      "Accept": "application/json"
    },
  });

  if (!response.ok) {
    console.error(`Erro ao buscar perfil no ambiente ${storedAmbiente} (${response.status}):`, await response.text());
    
    if (response.status === 401 || response.status === 403) {
      throw new Error("SESSION_EXPIRED");
    }
    throw new Error("Falha ao buscar dados do usuário");
  }

  return response.json();
};