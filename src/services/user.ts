/**
 * @fileoverview Serviço: User Profile
 * Busca os dados do usuário autenticado no endpoint /me.
 * 
 * Este serviço é agnóstico ao ambiente e deve receber a URL base ou ser 
 * chamado com o contexto do ambiente atual.
 * 
 * --------------------------------------------------------------------------------
 */

// Se precisar manter a configuração centralizada, você pode importar de um arquivo de config
// ou manter a lógica de seleção aqui.
const ENDPOINTS = {
  PROD: "https://api.s4bdigital.net",
  STAGING: "https://stgapi.s4bdigital.net"
};

export const fetchMyProfile = async (
  token: string, 
  ambiente: "stage" | "production" = "stage"
) => {
  const BASE_URL = ambiente === "stage" ? ENDPOINTS.STAGING : ENDPOINTS.PROD;
  const URL = `${BASE_URL}/account/v2/user/me`;

  const response = await fetch(URL, {
    method: "GET",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    // Tratamento de erro mais específico para debug
    console.error(`Erro ao buscar perfil (${response.status}):`, await response.text());
    throw new Error("Falha ao buscar dados do usuário");
  }

  return response.json();
};