export const fandiService = {
  async enviarSimulacao(dados: any) {
    const response = await fetch("https://api-hml.fandi.com.br/hml/v1/checkout/simulacao", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer 236323cc-2971-4b3f-aa28-ab4722de0103",
        "fandi-tipo-servico": "checkout"
      },
      body: JSON.stringify(dados)
    });
    return response.json();
  }
};