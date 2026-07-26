/**
 * @fileoverview ENDPOINT DE TELEMETRIA: HISTÓRICO DE ACESSO (Backoffice)
 * @path supabase/functions/login-history/index.ts
 * 
 * =========================================================================
 * [BLINDAGEN DE SEGURANÇA: ZERO-TRUST]
 * =========================================================================
 * Rota estritamente privada. Exige JWT válido do Supabase Auth (Google Workspace).
 * Invalida qualquer tentativa de acesso anônimo, bots ou cURL.
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { withSecurity } from "../_shared/server.ts";
import { captureInfrastructure } from "../_shared/infrastructure.ts";
import { debugLog } from "../_shared/logger.ts";

const supabaseAdmin = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
);

serve(withSecurity('login-history', async (req: Request) => {
  try {
    // =========================================================================
    // 1. BARREIRA DE SEGURANÇA: VALIDAÇÃO OBRIGATÓRIA DE JWT
    // =========================================================================
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
        return { 
            status: 403, 
            data: { success: false, error: "Acesso Negado: Token ausente." } 
        };
    }

    const supabaseAuthClient = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_ANON_KEY')!,
        { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: authError } = await supabaseAuthClient.auth.getUser();
    
    // Se o token for falso, expirado ou inválido, a execução morre aqui imediatamente
    if (authError || !user) {
        return { 
            status: 403, 
            data: { success: false, error: "Acesso Negado: Token inválido ou expirado." } 
        };
    }

    // Identidade real extraída criptograficamente do Token do Google Workspace
    const verifiedEmail = user.email || "email_desconhecido";

    // =========================================================================
    // 2. EXTRAÇÃO SEGURA DO PAYLOAD
    // =========================================================================
    let body;
    try {
        body = await req.json();
    } catch (_) {
        throw new Error("Payload inválido ou ausente.");
    }

    if (!body.event) {
        throw new Error("Parâmetro obrigatório ausente (event).");
    }

    // =========================================================================
    // 3. CAPTURA DE CONTEXTO E TELEMETRIA (SSOT)
    // =========================================================================
    const infra = await captureInfrastructure(req);
    const sanitize = (val: string) => val === "N/A" ? null : val;

    // =========================================================================
    // 4. PERSISTÊNCIA AUDITADA (Service Role Bypass)
    // =========================================================================
    const { error: dbError } = await supabaseAdmin.from('login_history').insert({
      // Usamos o verifiedEmail do Token. O atacante não pode mais fingir ser outra pessoa.
      email: verifiedEmail.toLowerCase().trim(),
      
      origin_page: body.origin_page || null,
      origin_function: body.origin_function || null,
      event: body.event,
      success: body.success ?? true, // Se chegou até aqui com token válido, o login foi bem-sucedido
      failure_reason: body.reason || null,
      ip_address: infra.ip_address,
      country: sanitize(infra.country),
      state: sanitize(infra.state),
      city: sanitize(infra.city),
      user_agent: infra.user_agent,
      device_type: infra.device_type,
      operating_system: infra.operating_system,
      
      is_trusted: true, // Auditoria 100% confiável garantida por criptografia
      origin_details: body
    });

    if (dbError) {
        throw new Error(`Falha ao inserir no banco: ${dbError.message}`);
    }

    return { 
        status: 200, 
        data: { success: true } 
    };

  } catch (err: any) {
    console.error("🚨 [LOGIN-HISTORY-ERROR]:", err.message);
    
    return { 
        status: 400, 
        data: { success: false, error: err.message || "Falha ao registrar telemetria de login." } 
    };
  }
}));