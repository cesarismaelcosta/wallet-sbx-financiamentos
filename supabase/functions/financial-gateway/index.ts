import { handleFandi } from "./fandiService.ts";

export default async function financingGateway(req) {
  const { categoria, ...payload } = await req.json();

  const ROUTE_MAP = {
    'CARROS': 'FANDI',
    'CAMINHOES': 'FANDI', 
    'IMOVEIS': 'CREDITAS'
  };

  const normalizedCategory = categoria
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase();

  const partner = ROUTE_MAP[normalizedCategory];

  if (!partner) {
    return new Response(JSON.stringify({ error: 'Categoria não suportada: ' + categoria }), { status: 400 });
  }

  switch (partner) {
    case 'FANDI':
      return await handleFandi(payload);
    case 'CREDITAS':
      return new Response(JSON.stringify({ message: 'Em desenvolvimento' }), { status: 501 });
    default:
      return new Response('Erro de roteamento', { status: 500 });
  }
}