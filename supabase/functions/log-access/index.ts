import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
);

// 1. Parser de User Agent (Agnóstico e simples)
function parseUserAgent(ua: string) {
  let os = null; // Iniciamos como null para banco de dados limpo
  let device = 'Desktop';
  
  if (ua.includes('Win')) os = 'Windows';
  else if (ua.includes('Mac')) os = 'MacOS';
  else if (ua.includes('Linux')) os = 'Linux';
  else if (ua.includes('Android')) { os = 'Android'; device = 'Mobile'; }
  else if (ua.includes('iPhone')) { os = 'iOS'; device = 'Mobile'; }
  else if (ua.includes('iPad')) { os = 'iOS'; device = 'Tablet'; }
  
  return { os, device };
}

// 2. Fallback de Geo (Somente campos necessários)
async function getGeoFallback(ip: string) {
  try {
    // Se for localhost, o ip-api não vai funcionar, passamos vazio para pegar o IP da própria chamada
    const queryIp = (ip === '0.0.0.0' || ip === '127.0.0.1') ? '' : ip;
    const res = await fetch(`http://ip-api.com/json/${queryIp}?fields=countryCode,regionName,city`);
    return await res.json();
  } catch { 
    return null; 
  }
}

Deno.serve(async (req) => {
  // CORS Handshake
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      },
    });
  }

  try {
    const body = await req.json();
    const ua = req.headers.get('user-agent') || '';
    const { os, device } = parseUserAgent(ua);
    
    // Captura de IP Multi-Header (Garante captura em Cloudflare, Vercel ou Direto)
    const ip = req.headers.get('cf-connecting-ip') || 
               req.headers.get('x-real-ip') || 
               req.headers.get('x-forwarded-for')?.split(',')[0] || 
               '0.0.0.0';
    
    // Captura de Geo via Headers (Padrão Cloudflare/Vercel)
    let geo = {
      country: req.headers.get('cf-ipcountry') || req.headers.get('x-vercel-ip-country'),
      state: req.headers.get('cf-region') || req.headers.get('x-vercel-ip-country-region'),
      city: req.headers.get('cf-ipcity') || req.headers.get('x-vercel-ip-city')
    };

    // Fallback agressivo: se não tem país ou se o país é desconhecido ('XX')
    if (!geo.country || geo.country === 'XX') {
      const fallback = await getGeoFallback(ip);
      geo = {
        country: fallback?.countryCode || null,
        state: fallback?.regionName || null,
        city: fallback?.city || null
      };
    }

    // Inserção no banco com campos higienizados
    const { error } = await supabase.from('login_history').insert({
      email: body.email?.toLowerCase().trim(),
      origin_page: body.origin_page || null,
      origin_function: body.origin_function || null,
      event: body.event,
      success: body.success ?? false,
      failure_reason: body.reason || null,
      ip_address: ip,
      country: geo.country || null,
      state: geo.state || null,
      city: geo.city || null,
      user_agent: ua,
      device_type: device,
      operating_system: os,
      origin_details: body // Snapshot completo do que veio do front
    });

    if (error) throw error;

    return new Response(JSON.stringify({ success: true }), {
      headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' },
      status: 200,
    });

  } catch (err) {
    console.error("[ORCHESTRATOR-ERROR]:", err.message);
    return new Response(JSON.stringify({ error: err.message }), { 
      headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' },
      status: 500 
    });
  }
});