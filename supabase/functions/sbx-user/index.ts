/**
 * @fileoverview Edge Function: sbx-user (Security Gatekeeper & User BFF)
 *
 * ARQUITETURA DE SEGURANÇA E CONTEXTO:
 * Esta função atua como o BFF (Backend For Frontend) de dados do perfil do usuário no ecossistema sbX.
 * Adota uma postura de "Zero Confiança": delega a validação criptográfica do JWT e a resolução
 * do estado da sessão para o utilitário `validateRequest`.
 *
 * PRINCIPAIS RESPONSABILIDADES:
 * 1. Identidade & Autenticação Zero-Trust: Invoca `validateRequest(req)`, que extrai a sessão
 *    (via Cookie HttpOnly ou Header Authorization) e devolve os tokens de parceiro pré-validados.
 * 2. Roteamento Dinâmico de Ambiente: Utiliza o campo `environment` ("staging" | "production")
 *    retornado diretamente da sessão validada para apontar para a API correta da Superbid.
 * 3. Integração Upstream (Superbid API): Realiza a chamada ao endpoint `/account/v2/user/me` injetando
 *    o `sbx_access_token` de forma opaca em relação ao navegador.
 * 4. Normalização & Contrato BFF: Sanitiza a estrutura bruta de dados da Superbid e devolve o contrato
 *    enxuto de perfil do usuário (`BFFUserProfile`).
 * 5. Tratamento de Exceções Semânticas: Converte erros de sessão expirada (401), permissão (403) ou
 *    indisponibilidade da API parceira (502) em respostas padronizadas para o Frontend.
 *
 * @author César Ismael Pereira da Costa
 * @version 3.2.0 (Otimização SSOT, Suporte Nativo a HttpOnly e Standard Docs)
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { validateRequest } from "../_shared/auth.ts";
import { withSecurity } from "../_shared/server.ts";
import { debugLog } from "../_shared/logger.ts";

/**
 * Mapeamento centralizado de URLs base da API da Superbid por ambiente
 */
const ENV_URLS = {
  production: "https://api.s4bdigital.net",
  staging: "https://stgapi.s4bdigital.net"
};

// =========================================================================
// HANDLER PRINCIPAL (Envelopado pelo Wrapper Central de Segurança)
// =========================================================================
serve(withSecurity('sbx-user', async (req: Request) => {

  // -----------------------------------------------------------------------
  // FASE 1: SEGURANÇA E IDENTIDADE (Handshake Zero Trust)
  // O validateRequest verifica a assinatura do JWT e já resolve o sbx_access_token
  // e o ambiente diretamente do banco/cookie, eliminando a necessidade de decode() manual.
  // -----------------------------------------------------------------------
  let auth;
  try {
    auth = await validateRequest(req);
  } catch (err: any) {
    const originPath = req.headers.get("x-original-url") || "/";
    const authUrl = req.headers.get("x-auth-fallback-url") || "/accounts/signin";

    let userMessage = "Falha de autenticação. Por favor, faça login novamente.";
    let errorCode = "UNAUTHORIZED";
    let fallbackUrl = authUrl;
    let statusCode = 401;

    // Tradução e categorização semântica do erro para a UX do Frontend
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

  // -----------------------------------------------------------------------
  // FASE 2: ROTEAMENTO E INTEGRAÇÃO UPSTREAM (Superbid API)
  // -----------------------------------------------------------------------
  try {
    const originPath = req.headers.get("x-original-url") || "/";
    const authUrl = req.headers.get("x-auth-fallback-url") || "/accounts/signin";

    // Resolução dinâmica da URL base a partir do ambiente validado no token
    const baseUrl = ENV_URLS[auth.environment] || ENV_URLS.staging;

    debugLog(`[sbx-user] Roteando requisição de usuário para ambiente Upstream: ${auth.environment} (${baseUrl})`);

    // Chamada Upstream injetando o Bearer token real obtido do cofre/DB
    const response = await fetch(`${baseUrl}/account/v2/user/me`, {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${auth.sbx_access_token}`,
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

    // -----------------------------------------------------------------------
    // FASE 3: HIDRATAÇÃO E MAPEAMENTO DO CONTRATO BFF
    // -----------------------------------------------------------------------
    const rawData = await response.json();
    const account = rawData.userAccounts?.[0];
    const mainAddress = account?.addresses?.[0];

    const isJuridica = account?.type === "J";

    // Extração dinâmica do documento correto (CNPJ se PJ, CPF se Física)
    const targetDocTypeName = isJuridica ? "cnpj" : "cpf";
    const rawDocument = account?.documents?.find((doc: any) => doc.typeName === targetDocTypeName)?.number || "";
    const cleanDocument = rawDocument.replace(/\D/g, '');

    // Extração segura da data de nascimento (para PJ, pode vir do representante legal se necessário)
    const rawBirthDate = isJuridica 
      ? account?.companyRepresentative?.dateOfBirth 
      : account?.birthDate;
    
    const formattedBirthDate = rawBirthDate ? rawBirthDate.split("T")[0] : "";

    // Mapeamento sanitizado e estruturado para o frontend
    const enrichedData = {
      entity_id: String(account?.id || auth.user_id),
      name: account?.basicInfo?.fullName || "N/A",
      document: cleanDocument,
      document_rg: account?.documents?.find((doc: any) => doc.typeName === "rg")?.number || "",
      email: account?.basicInfo?.email?.address || "",
      phone: account?.phones?.find((p: any) => p.type === 3)?.fullPhoneNumber || "",
      birth_date: formattedBirthDate,
      gender: isJuridica ? (account?.companyRepresentative?.gender || "M") : (account?.gender === "F" ? "F" : "M"),
      login: account?.credentials?.login || "",
      mothers_name: isJuridica ? (account?.companyRepresentative?.mothersName || "") : (account?.mothersName || ""),
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
    debugLog(`[sbx-user] Falha na operação: ${error.message}`);

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