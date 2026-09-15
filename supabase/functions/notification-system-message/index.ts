/**
 * @fileoverview Serviço: Notification System Message
 * @path supabase/functions/notification-system-message/index.ts
 * =========================================================================
 * [ARQUITETURA & CLEAN ARCHITECTURE]
 * =========================================================================
 * Porta HTTP de ingestão de alertas técnicos vindos do FRONT-END (ex:
 * `logSystemError` em `src/services/systemNotification.ts`). Exige sessão
 * de usuário válida — chamada sem sessão é rejeitada com 401.
 *
 * Toda a lógica de sanitização, resolução de destinatários, renderização
 * do e-mail e gravação na Outbox vive em `_shared/alert.ts`
 * (`dispatchSystemAlert`) — usada também, em processo (sem HTTP, sem
 * segredo), pelas engines internas do financial-gateway (`fandi-service.ts`).
 * Esta function hoje é só o adaptador HTTP dessa mesma lógica.
 */

import { createClient } from 'jsr:@supabase/supabase-js@2'
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { withSecurity, type RequestContext } from "../_shared/server.ts";
import { dispatchSystemAlert } from "../_shared/alert.ts";
import { debugLog } from "../_shared/logger.ts";

const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SUPABASE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

serve(withSecurity('notification-system-message', async (req: Request, ctx?: RequestContext) => {
  // -----------------------------------------------------------------------
  // [PERÍMETRO]: [v2.0.0 — MIGRADA, grupo 2] sessão agora validada
  // centralmente pelo wrapper (registry.ts: authMode.type === 'session',
  // enforcement: 'wrapper') via `_shared/session-guard.ts` — o handler nem
  // chega a rodar se a sessão for inválida. A checagem manual
  // (`validateRequest`) que existia aqui foi removida.
  //
  // [MUDANÇA DE COMPORTAMENTO]: antes, uma sessão inválida/expirada
  // devolvia sempre um 401 plano (`{ error: "Sessão inválida ou ausente." }`),
  // sem fallback_url/handoff token — era a única das 7 rotas de sessão sem
  // essa cobertura. Agora usa o mesmo formato canônico das demais
  // (`{success, code, message, fallback_url}`) e GANHA handoff token, que
  // nunca teve antes.
  // -----------------------------------------------------------------------

  // -----------------------------------------------------------------------
  // [INFRAESTRUTURA]: Inicialização do Client Supabase (Service Role)
  // -----------------------------------------------------------------------
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    debugLog("[CRITICAL CONFIG ERROR]: Variáveis de infraestrutura ausentes no ambiente Supabase.");
    return { status: 500, data: { error: "Erro interno de configuração na nuvem." } };
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

  try {
    // [v2.0.0]: corpo já lido uma vez pelo wrapper (necessário pra montar o
    // handoff token em caso de sessão expirada) e repassado em `ctx.rawBody`
    // — não podemos ler `req.json()` de novo aqui (stream já consumido).
    const rawBody = JSON.parse(ctx?.rawBody || "");
    const result = await dispatchSystemAlert(supabase, rawBody);
    return { status: 200, data: result };
  } catch (err: any) {
    debugLog("[EDGE FUNCTION CRITICAL EXCEPTION]:", err.message);
    return { status: 500, data: { error: err.message } };
  }
}));