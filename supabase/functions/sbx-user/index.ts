/**
 * @fileoverview Edge Function: sbx-user (Security Gatekeeper & User BFF)
 * * ARQUITETURA DE SEGURANÇA E CONTEXTO:
 * Esta função atua como o validador de identidade primordial do ecossistema sbX.
 * Ela adota uma postura de "Zero Confiança" no cliente: valida matematicamente o JWT,
 * valida o estado e o TTL da sessão diretamente no banco de dados corporativo, resolve
 * o token upstream oculto e realiza o proxy seguro para a API da Superbid.
 * * [RESPONSABILIDADES]:
 * 1. Identidade: Verifica a assinatura HMAC-SHA256 e as claims de expiração do JWT.
 * 2. Estado: Valida o ciclo de vida e revogação da sessão via tabela `sbx_sessions`.
 * 3. Integração Upstream: Realiza a chamada à API da Superbid injetando o Bearer token real.
 * 4. Resiliência End-to-End: Intercepta tokens de parceiros expirados (401) e propaga o erro
 * para disparar o Protocolo de Amnésia global no Frontend.
 * * @author Cesar Ismael Pereira da Costa
 * @version 2.0.0 (Refatoração de Exceções Semânticas e Alinhamento com sbx-offer)
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { verify } from "https://deno.land/x/djwt@v2.8/mod.ts";

const DEBUG_MODE = true;

const debugLog = (message: string, data?: any) => {
  if (DEBUG_MODE) {
    console.log(`[SBX-USER] ${message}`, data ? JSON.stringify(data) : "");
  }
};

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-sbx-env, x-session-token',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
};

serve(async (req) => {
  // =========================================================================
  // 1. HANDSHAKE (OPTIONS) - Preflight CORS
  // =========================================================================
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const sessionToken = req.headers.get("x-session-token");
    const env = req.headers.get("x-sbx-env") || "stage";
    const baseUrl = env === "production" ? "https://api.s4bdigital.net" : "https://stgapi.s4bdigital.net";

    // Validação de presença do token de entrada
    if (!sessionToken) {
      throw new Error("AUTH_REQUIRED: Cabeçalho x-session-token não fornecido.");
    }

    // =========================================================================
    // 2. SEGURANÇA: VALIDAÇÃO DO JWT DA APLICAÇÃO
    // =========================================================================
    const jwtSecret = Deno.env.get("JWT_SECRET");
    if (!jwtSecret) throw new Error("INTERNAL_CONFIG_ERROR: JWT_SECRET não configurado.");

    const key = await crypto.subtle.importKey(
      "raw", new TextEncoder().encode(jwtSecret), 
      { name: "HMAC", hash: "SHA-256" }, false, ["verify"]
    );
    
    // O método verify valida a assinatura e a expiração (exp) nativamente
    const payload = await verify(sessionToken, key);
    const sessionId = payload.jti as string; 

    // =========================================================================
    // 3. ESTADO: CONSULTA E VALIDAÇÃO DA SESSÃO NO BANCO DE DADOS
    // =========================================================================
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '', 
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );
    
    const { data: session, error: sessionError } = await supabaseAdmin
      .from('sbx_sessions')
      .select('sbx_access_token, expires_at')
      .eq('session_token', sessionId)
      .single();

    if (sessionError || !session) {
      throw new Error("SESSION_INVALID: Sessão revogada ou inexistente no banco de dados.");
    }

    // Validação de TTL da sessão interna da aplicação
    if (new Date() > new Date(session.expires_at)) {
      throw new Error("SESSION_EXPIRED: O tempo de vida da sessão no ecossistema expirou.");
    }

    // =========================================================================
    // 4. INTEGRAÇÃO: CHAMADA UPSTREAM (Superbid API)
    // =========================================================================
    const response = await fetch(`${baseUrl}/account/v2/user/me`, {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${session.sbx_access_token}`, // Injeção do token upstream protegido
        "Content-Type": "application/json"
      },
    });

    // Interceptação de Token do Parceiro Expirado / Revogado na Superbid
    if (response.status === 401) {
        throw new Error("SESSION_UPSTREAM_EXPIRED: O token real da Superbid expirou na API de destino.");
    }
    
    // Tratamento de indisponibilidade da API externa
    if (!response.ok) {
        throw new Error(`UPSTREAM_API_UNAVAILABLE (${response.status})`);
    }
    
    // =========================================================================
    // 5. HIDRATAÇÃO: MAPEAMENTO E CONTRATO BFF (Alinhado com BFFUserProfile)
    // =========================================================================
    const data = await response.json();
    const account = data.userAccounts?.[0];
    const mainAddress = account?.addresses?.[0];

    const enrichedData = {
      entity_id: String(account?.id),
      name: account?.basicInfo?.fullName || "N/A",
      document: account?.documents?.find((doc: any) => doc.typeName === "cpf")?.number || "",
      document_rg: account?.documents?.find((doc: any) => doc.typeName === 'rg')?.number || "",
      email: account?.basicInfo?.email?.address || "",
      phone: account?.phones?.find((p: any) => p.type === 3)?.fullPhoneNumber || "",
      birth_date: account?.birthDate?.split('T')[0] || "",
      gender: account?.gender === "M" ? "M" : "F",
      login: account?.credentials?.login || "",
      mothers_name: account?.mothersName || "",
      address: mainAddress ? {
        street: mainAddress.addressLine1 || "",
        number: mainAddress.number || "",
        complement: mainAddress.addressLine2 || "",
        neighborhood: mainAddress.district || "",
        city: mainAddress.city || "",
        state: mainAddress.state || "",
        zip_code: mainAddress.zipCode || "",
        country: mainAddress.countryIsoKey || "BR"
      } : null
    };

    return new Response(JSON.stringify(enrichedData), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });

  } catch (err: any) {
    debugLog("Fatal Exception in sbx-user:", err.message);
    
    let status = 500;
    // Centralização de segurança: Qualquer falha interna ou externa de sessão resulta em 401
    if (err.message.includes("AUTH") || err.message.includes("SESSION") || err.message.includes("jwt") || err.message.includes("expired")) {
      status = 401;
    } else if (err.message.includes("UPSTREAM_API_UNAVAILABLE")) {
      status = 502; // Bad Gateway para falhas sistêmicas do parceiro
    }

    // Para manter a segurança da API corporativa, mapeamos a mensagem real tratada no ecossistema
    const errorResponse = status === 401 ? err.message : "INTERNAL_SERVER_ERROR";

    return new Response(JSON.stringify({ error: errorResponse }), { 
      status, 
      headers: corsHeaders 
    });
  }
});