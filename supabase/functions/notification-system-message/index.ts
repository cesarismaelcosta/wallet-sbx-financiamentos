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
import { withSecurity } from "../_shared/server.ts";
import { validateRequest } from "../_shared/auth.ts";
import { dispatchSystemAlert } from "../_shared/alert.ts";
import { debugLog } from "../_shared/logger.ts";

const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SUPABASE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

serve(withSecurity('notification-system-message', async (req: Request) => {

  // -----------------------------------------------------------------------
  // [PERÍMETRO]: Exige sessão de usuário válida — checagem manual, mesmo
  // padrão real já usado em financial-gateway/index.ts, orchestrator/index.ts,
  // sbx-offer/index.ts, sbx-event/index.ts, sbx-offer-query/index.ts e
  // orchestrator-configs/index.ts (a flag `requiresSession` do registry
  // nunca é usada em nenhuma function real — não introduzimos esse caminho
  // não-testado aqui).
  // -----------------------------------------------------------------------
  try {
    await validateRequest(req);
  } catch (err: any) {
    debugLog("[UNAUTHORIZED]: Chamada sem sessão válida rejeitada.", err.message);
    return { status: 401, data: { error: "Sessão inválida ou ausente." } };
  }

  // -----------------------------------------------------------------------
  // [INFRAESTRUTURA]: Inicialização do Client Supabase (Service Role)
  // -----------------------------------------------------------------------
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    debugLog("[CRITICAL CONFIG ERROR]: Variáveis de infraestrutura ausentes no ambiente Supabase.");
    return { status: 500, data: { error: "Erro interno de configuração na nuvem." } };
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

  try {
    const rawBody = await req.json();
    const result = await dispatchSystemAlert(supabase, rawBody);
    return { status: 200, data: result };
  } catch (err: any) {
    debugLog("[EDGE FUNCTION CRITICAL EXCEPTION]:", err.message);
    return { status: 500, data: { error: err.message } };
  }
}));