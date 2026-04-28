import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
);

function parseUserAgent(ua: string) {
  let os = 'Unknown';
  let device = 'Desktop';
  if (ua.includes('Win')) os = 'Windows';
  else if (ua.includes('Mac')) os = 'MacOS';
  else if (ua.includes('Linux')) os = 'Linux';
  else if (ua.includes('Android')) { os = 'Android'; device = 'Mobile'; }
  else if (ua.includes('iPhone')) { os = 'iOS'; device = 'Mobile'; }
  return { os, device };
}

async function getGeoFallback(ip: string) {
  try {
    const res = await fetch(`http://ip-api.com/json/${ip}?fields=country,regionName,city`);
    return await res.json();
  } catch { return null; }
}

Deno.serve(async (req) => {
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
    const ip = req.headers.get('cf-connecting-ip') || '0.0.0.0';
    
    let geo = {
      country: req.headers.get('cf-ipcountry'),
      state: req.headers.get('cf-region'),
      city: req.headers.get('cf-ipcity')
    };

    if (!geo.country) {
      const fallback = await getGeoFallback(ip);
      geo = {
        country: fallback?.country || null,
        state: fallback?.regionName || null,
        city: fallback?.city || null
      };
    }

    // Inserção com tratamento de erro detalhado
    const { error } = await supabase.from('login_history').insert({
      email: body.email,
      origin_page: body.origin_page || null,
      origin_function: body.origin_function || null,
      event: body.event,
      success: body.success,
      failure_reason: body.reason,
      ip_address: ip,
      country: geo.country,
      state: geo.state,
      city: geo.city,
      user_agent: ua,
      device_type: device,
      operating_system: os,
      metadata: body 
    });

    if (error) {
      console.error("ERRO DO BANCO:", JSON.stringify(error));
      throw error;
    }

    return new Response(JSON.stringify({ message: "Sucesso" }), {
      headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' },
      status: 200,
    });
  } catch (err) {
    console.error("ERRO GERAL:", err);
    return new Response(JSON.stringify({ error: err.message }), { 
      headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' },
      status: 500 
    });
  }
});