/**
 * GATEWAY DE NOTIFICAÇÕES - INSPEÇÃO DE SEGURANÇA
 */
Deno.serve(async (req) => {
  // Captura o secret enviado no Header
  const headerSecret = req.headers.get('x-gateway-secret');
  
  // Lê a variável de ambiente que deveria estar configurada
  const envSecret = Deno.env.get('NOTIFICATION_GATEWAY_SECRET');

  // Log detalhado para diagnóstico
  console.log("--- LOG DE DIAGNÓSTICO DO GATEWAY ---");
  console.log("Header 'x-gateway-secret' recebido:", headerSecret ? "PRESENTE" : "NULL/VAZIO");
  console.log("Variável de ambiente 'NOTIFICATION_GATEWAY_SECRET' configurada:", envSecret ? "SIM" : "NÃO");

  // Validação real
  if (!headerSecret || headerSecret !== envSecret) {
    console.error("ERRO 401: O secret recebido não confere com o esperado.");
    return new Response("Unauthorized", { status: 401 });
  }

  console.log("SUCESSO: Autenticação validada.");
  return new Response("Processado", { status: 200 });
});