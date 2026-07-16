/**
 * @fileoverview EDGE FUNCTION: SBX-USER (Security Gatekeeper & User BFF)
 * * ============================================================================
 * ARQUITETURA DE SEGURANÇA E CONTEXTO (BFF Contract)
 * ============================================================================
 * Esta função atua como o validador de identidade primordial e provedor de perfil
 * do ecossistema sbX.
 * 
 * 1. Identidade: Delega a validação criptográfica para o shared/auth (validateRequest).
 * 2. SSOT (Single Source of Truth): Extrai o `environment` e `sbx_access_token` 
 *    EXCLUSIVAMENTE do banco de dados (session_tokens). O frontend não dita o ambiente.
 * 3. Integração Upstream: Realiza a chamada à API da Superbid injetando o Bearer real.
 * 4. Resiliência: Intercepta tokens upstream expirados (401) e devolve o contrato padrão
 *    para disparar o Protocolo de Amnésia global no Frontend.
 * 5. Type Safety: Mapeia o payload bruto de perfil de usuário com tipagem forte.
 * 
 * @author Cesar Ismael Pereira da Costa
 * @description Single Source of Truth para perfil de usuário com Handshake Zero Trust.
 * @version 3.0.0 (Integração Total com sbX Core Auth e Blindagem de Ambiente)
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

// IMPORTANTE: Trazendo o Gatekeeper unificado do ecossistema
import { validateRequest } from "../_shared/auth.ts";

/**
 * ============================================================================
 * CONFIGURAÇÕES GLOBAIS E SEGURANÇA
 * ============================================================================
 */
const DEBUG_MODE = Deno.env.get("DEBUG_MODE") === "true";

/**
 * @function debugLog
 * @description Centraliza os logs do pipeline. Em produção, DEBUG_MODE deve ser false
 * para evitar exposição de PII (Personally Identifiable Information).
 */
const debugLog = (message: string, data?: any) => {
  if (DEBUG_MODE) {
    console.log(`[SBX-USER-DEBUG] ${message}`, data ? JSON.stringify(data, null, 2) : "");
  }
};

/**
 * CONFIGURAÇÃO GLOBAL DE CORS (Única Fonte de Verdade)
 * @description Espelha as regras estritas do Orquestrador Central.
 * A inclusão do 'x-session-token' é vital para o Handshake Zero Trust (Validação de Identidade).
 * NOTA DE SEGURANÇA: x-sbx-env foi removido. O ambiente agora é ditado 100% pelo Backend/DB.
 */
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-session-token, x-original-url, x-auth-fallback-url",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

/**
 * ============================================================================
 * HANDLER PRINCIPAL (PIPELINE DE LEITURA DO PERFIL)
 * ============================================================================
 */
serve(async (req: Request) => {
  // 1. AVALIAÇÃO DE CORS E PREFLIGHT
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  // 2. INICIALIZAÇÃO DE CONTEXTO (Bypass RLS para operações internas de sessão)
  const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!, 
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
      auth: { persistSession: false },
  });

  // =========================================================================
  // FASE 1: SEGURANÇA E IDENTIDADE (Handshake Zero Trust)
  // =========================================================================
  let auth;
  try {
      auth = await validateRequest(req);
  } catch (err: any) {
      // 1. Descoberta da Origem
      const originPath = req.headers.get("x-original-url");
      const authUrl = req.headers.get("x-auth-fallback-url");

      if (!originPath) {
          return new Response(JSON.stringify({ 
              success: false,
              code: "INTERNAL_ERROR",
              message: "Erro de segurança: A origem da requisição não foi identificada.",
              fallback_url: "/"
          }), { 
              status: 400, 
              headers: { ...corsHeaders, "Content-Type": "application/json" } 
          });
      }

      // 2. Padronização de Variáveis e Tradução UX
      let userMessage = "Falha de autenticação. Por favor, faça login novamente.";
      let errorCode = "UNAUTHORIZED";
      let fallbackUrl = authUrl;
      let statusCode = 401;

      if (err.message.includes("SESSION_EXPIRED")) {
          userMessage = "Sua sessão expirou. Por favor, faça login novamente.";
          errorCode = "SESSION_EXPIRED";
      } else if (err.message.includes("FORBIDDEN")) {
          userMessage = "Você não tem permissão para acessar este recurso.";
          errorCode = "FORBIDDEN";
          fallbackUrl = originPath; 
          statusCode = 403;
      } else if (err.message.includes("INTERNAL_ERROR")) {
          userMessage = "Ocorreu um erro interno ao validar sua sessão.";
          errorCode = "INTERNAL_ERROR";
          fallbackUrl = "/"; 
          statusCode = 500;
      }

      // 3. Retorno seguindo o contrato oficial da API
      return new Response(JSON.stringify({ 
          success: false,
          code: errorCode,
          message: userMessage,
          fallback_url: fallbackUrl 
      }), { 
          status: statusCode, 
          headers: { ...corsHeaders, "Content-Type": "application/json" } 
      });
  }

  // =========================================================================
  // FASE 2: LÓGICA DE NEGÓCIO E PERFIL (Single Source of Truth)
  // =========================================================================
  try {
    const originPath = req.headers.get("x-original-url") || "/";
    const authUrl = req.headers.get("x-auth-fallback-url") || "/";

    // A. Busca do Access Token e Ambiente da Superbid no Banco
    const sessionToken = req.headers.get("x-session-token");
    
    // 🔒 SSOT: A verdade sobre o ambiente e TTL vem exclusivamente do banco de dados.
    const { data: session } = await supabaseAdmin
        .from("session_tokens")
        .select("sbx_access_token, environment") 
        .eq("session_token", auth?.jti || sessionToken) 
        .single();
        
    if (!session) {
      const err = new Error("Sua sessão na plataforma expirou ou foi revogada.");
      (err as any).code = "SESSION_EXPIRED";
      (err as any).fallback_url = authUrl;
      throw err;
    }

    // 🔒 SEGURANÇA BLINDADA: O ambiente da integração Upstream é ditado pelo banco.
    const env = session.environment || "stage";
    const baseUrl = env === "production" ? "https://api.s4bdigital.net" : "https://stgapi.s4bdigital.net";
    
    debugLog(`[INFO] Roteando requisição de usuário para ambiente Upstream: ${env}`);

    // B. Integração Upstream (Superbid API - User Profile)
    const response = await fetch(`${baseUrl}/account/v2/user/me`, {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${session.sbx_access_token}`, 
        "Content-Type": "application/json"
      },
    });

    if (response.status === 401) {
      const err = new Error("Sua sessão com a plataforma expirou. Por favor, faça login novamente.");
      (err as any).code = "SESSION_EXPIRED";
      (err as any).fallback_url = authUrl;
      throw err;
    }
    
    if (!response.ok) {
        const errBody = await response.text();
        const err = new Error(`Instabilidade na integração com a plataforma (${response.status}).`);
        (err as any).code = "UPSTREAM_ERROR";
        (err as any).fallback_url = originPath;
        throw err;
    }
    
    // C. Hidratação: Mapeamento e Contrato BFF
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

    // D. Resposta de Sucesso
    return new Response(JSON.stringify(enrichedData), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });

  } catch (err: any) {
    debugLog(`[SBX-USER] Falha na operação: ${err.message}`);
    
    // Extrativismo de Propriedades Injetadas ou Default
    const errorCode = err.code || "UNKNOWN_ERROR";
    const fallbackUrl = err.fallback_url || "/";
    
    let statusCode = 400;
    if (errorCode === "UNAUTHORIZED" || errorCode === "SESSION_EXPIRED") statusCode = 401;
    if (errorCode === "FORBIDDEN") statusCode = 403;
    if (errorCode === "UPSTREAM_ERROR") statusCode = 502;
    if (errorCode === "UNKNOWN_ERROR") statusCode = 500;

    return new Response(JSON.stringify({ 
        success: false,
        code: errorCode,             
        message: err.message,        
        fallback_url: fallbackUrl 
    }), { 
        status: statusCode, 
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
    });
  }
});