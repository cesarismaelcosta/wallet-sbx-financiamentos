/**
 * @fileoverview Edge Function: sbx-user (Security Gatekeeper & User BFF)
 * * ============================================================================
 * ARQUITETURA DE SEGURANÇA E CONTEXTO:
 * ============================================================================
 * Esta função atua como o validador de identidade primordial do ecossistema sbX.
 * Ela adota uma postura de "Zero Confiança" no cliente: valida matematicamente o JWT,
 * valida o estado e o TTL da sessão diretamente no banco de dados corporativo, resolve
 * o token upstream oculto e realiza o proxy seguro para a API da Superbid.
 *
 * * [RESPONSABILIDADES]:
 * 1. Identidade: Delega a verificação HMAC-SHA256 para o shared/auth (validateRequest).
 * 2. Estado (SSOT): Valida o ciclo de vida e ambiente via tabela `session_tokens`.
 * 3. Integração Upstream: Realiza a chamada à API da Superbid injetando o Bearer token real.
 * 4. Resiliência End-to-End: Intercepta tokens de parceiros expirados (401) e propaga o erro
 *    para disparar o Protocolo de Amnésia global no Frontend.
 *
 * @author Cesar Ismael Pereira da Costa
 * @version 3.1.0 (Refatoração de Exceções Semânticas, SSOT e Alinhamento com Orchestrator)
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { decode } from "https://deno.land/x/djwt@v2.8/mod.ts";
import { validateRequest } from "../_shared/auth.ts";
import { withSecurity } from "../_shared/server.ts";

/**
 * ============================================================================
 * CONFIGURAÇÕES GLOBAIS E SEGURANÇA
 * ============================================================================
 */
const DEBUG_MODE = true;

const debugLog = (message: string, data?: any) => {
  if (DEBUG_MODE) {
    console.log(`[SBX-USER-DEBUG] ${message}`, data ? JSON.stringify(data, null, 2) : "");
  }
};

/**
 * ============================================================================
 * HANDLER PRINCIPAL
 * ============================================================================
 */
serve(withSecurity('sbx-user', async (req: Request) => {

  // Bypass RLS para operações críticas do motor
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false },
  });

  // =========================================================================
  // 1. FASE 1: SEGURANÇA E IDENTIDADE (Handshake Zero Trust)
  // =========================================================================
  let auth;
  try {
    auth = await validateRequest(req);
  } catch (err: any) {
    const originPath = req.headers.get("x-original-url");
    const authUrl = req.headers.get("x-auth-fallback-url");

    if (!originPath) {
      // Failsafe: Se o frontend não enviou o header, barramos aqui.
      return {
        status: 400,
        data: {
          success: false,
          code: "INTERNAL_ERROR",
          message: "Erro de segurança: A origem da requisição não foi identificada.",
          fallback_url: "/",
        }
      };
    }

    let userMessage = "Falha de autenticação. Por favor, faça login novamente.";
    let errorCode = "UNAUTHORIZED";
    let fallbackUrl = authUrl;
    let statusCode = 401;

    // Tradução do Erro para Experiência do Usuário (UX)
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

    return {
      status: statusCode,
      data: {
        success: false,
        code: errorCode,
        message: userMessage,
        fallback_url: fallbackUrl,
      }
    };
  }

  // =========================================================================
  // 2. FASE 2: ESTADO E INTEGRAÇÃO UPSTREAM (SSOT)
  // =========================================================================
  try {
    const originPath = req.headers.get("x-original-url") || "/";
    const authUrl = req.headers.get("x-auth-fallback-url") || "/";
    const sessionToken = req.headers.get("x-session-token")!;

    // 🔒 EXTRAÇÃO LIMPA: Usa a lib oficial para ler o JWT sem validar a assinatura novamente
    const [, jwtPayload] = decode(sessionToken);
    const sessionId = (jwtPayload as any).jti;

    // 🔒 SSOT: Busca a sessão no banco usando o JTI exato
    const { data: session } = await supabase
      .from("session_tokens")
      .select("sbx_access_token, environment")
      .eq("session_token", sessionId)
      .single();

    if (!session) {
      const err = new Error("Sua sessão na plataforma expirou ou foi revogada.");
      (err as any).errorCode = "SESSION_EXPIRED";
      (err as any).fallback_url = authUrl;
      throw err;
    }

    const env = session.environment || "stage";
    const baseUrl = env === "production" ? "https://api.s4bdigital.net" : "https://stgapi.s4bdigital.net";

    debugLog(`[INFO] Roteando requisição de usuário para ambiente Upstream: ${env}`);

    // Chamada Upstream (Superbid API)
    const response = await fetch(`${baseUrl}/account/v2/user/me`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${session.sbx_access_token}`, // Injeção do token upstream protegido
        "Content-Type": "application/json",
      },
    });

    // Interceptação de Token do Parceiro Expirado / Revogado na Superbid
    if (response.status === 401) {
      const err = new Error("Sua sessão com a plataforma expirou. Por favor, faça login novamente.");
      (err as any).errorCode = "SESSION_EXPIRED";
      (err as any).fallback_url = authUrl;
      throw err;
    }

    // Tratamento de indisponibilidade da API externa
    if (!response.ok) {
      const err = new Error(`Instabilidade na integração com a plataforma (${response.status}).`);
      (err as any).errorCode = "UPSTREAM_ERROR";
      (err as any).fallback_url = originPath;
      throw err;
    }

    // =========================================================================
    // 3. HIDRATAÇÃO: MAPEAMENTO E CONTRATO BFF
    // =========================================================================
    const data = await response.json();
    const account = data.userAccounts?.[0];
    const mainAddress = account?.addresses?.[0];

    const enrichedData = {
      entity_id: String(account?.id),
      name: account?.basicInfo?.fullName || "N/A",
      document: account?.documents?.find((doc: any) => doc.typeName === "cpf")?.number || "",
      document_rg: account?.documents?.find((doc: any) => doc.typeName === "rg")?.number || "",
      email: account?.basicInfo?.email?.address || "",
      phone: account?.phones?.find((p: any) => p.type === 3)?.fullPhoneNumber || "",
      birth_date: account?.birthDate?.split("T")[0] || "",
      gender: account?.gender === "M" ? "M" : "F",
      login: account?.credentials?.login || "",
      mothers_name: account?.mothersName || "",
      address: mainAddress
        ? {
            street: mainAddress.addressLine1 || "",
            number: mainAddress.number || "",
            complement: mainAddress.addressLine2 || "",
            neighborhood: mainAddress.district || "",
            city: mainAddress.city || "",
            state: mainAddress.state || "",
            zip_code: mainAddress.zipCode || "",
            country: mainAddress.countryIsoKey || "BR",
          }
        : null,
    };

    return { status: 200, data: enrichedData };

  } catch (error: any) {
    debugLog(`[SBX-USER] Falha na operação: ${error.message}`);

    // Extraímos o código que injetamos lá no bloco de validação (Padrão Orchestrator)
    const errorCode = error.errorCode || "UNKNOWN_ERROR";

    let statusCode = 400;
    if (errorCode === "UNAUTHORIZED" || errorCode === "SESSION_EXPIRED") statusCode = 401;
    if (errorCode === "FORBIDDEN") statusCode = 403;
    if (errorCode === "UPSTREAM_ERROR") statusCode = 502;
    if (errorCode === "UNKNOWN_ERROR") statusCode = 500;

    return {
      status: statusCode,
      data: {
        success: false,
        code: errorCode,
        message: error.message,
        fallback_url: error.fallback_url || "/",
      }
    };
  }
}));