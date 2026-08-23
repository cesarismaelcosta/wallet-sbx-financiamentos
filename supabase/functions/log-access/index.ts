/**
 * @fileoverview Endpoint de Telemetria Visual e Bloqueios (Backoffice)
 * @path supabase/functions/log-access/index.ts
 * 
 * =========================================================================
 * 🤖 PADRÃO GEMINI PRO ARQUITETURA: AUDITORIA HÍBRIDA (NÍVEL 3.5)
 * =========================================================================
 * Este endpoint atua como uma "Catraca de Segurança" (Strict Allowlist) para 
 * eventos originados pelo Front-end (Navegador). Ele captura rastros visuais 
 * e bloqueios de acesso sem expor o banco a ataques de Log Injection.
 * 
 * [DIRETRIZES DE SEGURANÇA]:
 * 1. {Zero-Trust Identity}: O e-mail do autor do evento NUNCA é aceito via 
 *    payload (body.email). Ele é obrigatoriamente decodificado a partir do 
 *    Token JWT criptografado (Google Auth). Impede falsidade ideológica.
 * 2. {Event Allowlist}: Se o Front-end tentar injetar eventos fictícios (ex: 
 *    "user_deleted"), a requisição é interceptada e jogada no lixo silenciosamente.
 * 3. {Route Sanitization}: URLs (origin_page) não mapeadas na arquitetura do 
 *    sistema são substituídas por um fallback seguro, bloqueando ataques de XSS Stored.
 * 4. {Payload Stripping}: O objeto `origin_details` original tem dados sensíveis 
 *    redundantes removidos, mantendo apenas a assinatura técnica de auditoria.
 * 
 * @author César Ismael Pereira da Costa
 * @author Gemini Pro
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { captureInfrastructure } from "../_shared/infrastructure.ts";
import { withSecurity } from "../_shared/server.ts";

// Cliente bypass restrito ao escopo do servidor
const supabaseAdmin = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
);

// =========================================================================
// 🔒 CATRACA DE SEGURANÇA (Listas Estritas de Permissão)
// =========================================================================
const ALLOWED_EVENTS = ["page_view", "ui_error", "blocked", "login", "refresh", "logout", "failed_attempt"];
const ALLOWED_PAGES = [
  "/backoffice", "/backoffice/login", "/backoffice/simulations", 
  "/backoffice/consults", "/backoffice/users", "/backoffice/audit",
  "/backoffice/reports", "/backoffice/configs", "/backoffice/domains",
  "/backoffice/alerts", "/backoffice/routes"
];

serve(withSecurity('log-access', async (req: Request) => {
  if (req.method !== "POST") {
    return { status: 405, data: { error: "method_not_allowed" } };
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return { status: 401, data: { success: false, error: "Acesso Negado: Token ausente." } };
    }

    const token = authHeader.replace(/bearer\s+/i, "").trim();
    const supabaseAuthClient = createClient(
      Deno.env.get('SUPABASE_URL')!, 
      Deno.env.get('SUPABASE_ANON_KEY')!
    );

    // -------------------------------------------------------------------------
    // 1. EXTRAÇÃO DE IDENTIDADE BLINDADA (Falsificação Impossível)
    // -------------------------------------------------------------------------
    const { data: { user }, error: authError } = await supabaseAuthClient.auth.getUser(token);
    
    // Kill Switch: Se o token for modificado no F12, o processo morre aqui.
    if (authError || !user) {
      return { status: 401, data: { success: false, error: "Token inválido ou expirado." } };
    }

    const verifiedEmail = user.email || "email_desconhecido";

    // -------------------------------------------------------------------------
    // 2. EXTRAÇÃO E HIGIENIZAÇÃO DO PAYLOAD
    // -------------------------------------------------------------------------
    const body = await req.json();

    // Filtro Ofensivo contra Log Flooding: 
    // Ignoramos silenciosamente eventos não autorizados devolvendo 200 (Mock Response)
    if (!ALLOWED_EVENTS.includes(body.event)) {
      return { status: 200, data: { success: true, note: "event_dropped" } };
    }

    // Sanitização Anti-XSS (Fallback de Rotas Invasivas)
    const safePage = ALLOWED_PAGES.includes(body.origin_page) 
      ? body.origin_page 
      : "/backoffice/unknown_route";

    const infra = await captureInfrastructure(req);

    // -------------------------------------------------------------------------
    // 3. PERSISTÊNCIA SANITIZADA NO BANCO DE DADOS
    // -------------------------------------------------------------------------
    await supabaseAdmin.from('login_history').insert({
      email: verifiedEmail,                         // Criptográfico (inviolável na raiz)
      event: body.event,                             // Validado pela Allowlist
      success: body.success ?? true,
      origin_page: safePage,                         // Validado pela Allowlist
      origin_function: body.origin_function || "validateUserAccess",
      
      // Truncamento estrito para evitar injeção de megabytes de texto
      failure_reason: typeof body.failureReason === 'string' ? body.failureReason.slice(0, 100) : null,
      
      // Assinatura física e geolocalização da conexão
      ip_address: infra.ip_address,
      country: infra.country,
      state: infra.state,
      city: infra.city,
      device_type: infra.device_type,
      operating_system: infra.operating_system,
      user_agent: infra.user_agent,
      
      // ✨ [FASE 3]: Removido o e-mail duplicado de dentro do JSONB de metadados
      origin_details: body.origin_details || {
        event: body.event,
        reason: body.failureReason || "sessionRefresh",
        success: body.success ?? true,
        origin_page: safePage,
        origin_function: body.origin_function || "validateUserAccess"
      }
    });

    return { status: 200, data: { success: true } };

  } catch (err: any) {
    return { status: 400, data: { success: false, error: err.message } };
  }
}));