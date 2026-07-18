/**
 * @file manage-backoffice-users.ts
 * @description Edge Function de gestão de usuários.
 * Versão com DEBUG LOGS para diagnóstico de acesso.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { withSecurity } from "../_shared/server.ts";

/**
 * FUNÇÃO DE LOG PADRONIZADA
 * Centraliza o rastreio do pipeline respeitando a flag DEBUG_MODE.
 */
import { debugLog } from "../_shared/logger.ts";


const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";

// Cliente administrativo (Service Role) inicializado no escopo global
const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

type Role = "admin" | "manager" | "viewer";

// --- Definição de Interfaces ---
interface RegisterPayload { action: "register"; email: string; name: string; role: Role; }
interface SetActivePayload { action: "set_active"; id: string; is_active: boolean; }
interface SetRolePayload { action: "set_role"; id: string; role: Role; }
interface ListPayload { action: "list"; }
type Payload = RegisterPayload | SetActivePayload | SetRolePayload | ListPayload;

/**
 * Valida o usuário diretamente na tabela 'backoffice_users'.
 * INJETADO COM LOGS DE DEBUG
 */
async function ensureAdmin(authHeader: string | null) {
  debugLog("DEBUG [ensureAdmin]: Iniciando verificação...");

  if (!authHeader) {
    debugLog("DEBUG [ensureAdmin]: Erro -> missing_authorization");
    return { ok: false as const, error: "missing_authorization" };
  }
  
  const userClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  
  const { data: { user }, error: authError } = await userClient.auth.getUser();
  
  if (authError || !user) {
    debugLog("DEBUG [ensureAdmin]: Erro Auth ->", authError);
    return { ok: false as const, error: "unauthenticated" };
  }

  debugLog("DEBUG [ensureAdmin]: Usuário logado ->", user.email);

  // Consulta direta na tabela de confiança
  // Alterado para .ilike para ignorar case sensitive
  const { data: profile, error } = await adminClient
    .from("backoffice_users")
    .select("role")
    .ilike("email", user.email)
    .eq("is_active", true)
    .single();

  if (error) {
    debugLog("DEBUG [ensureAdmin]: Erro DB ->", error);
  } else {
    debugLog("DEBUG [ensureAdmin]: Perfil encontrado ->", profile);
  }

  if (error || !profile || profile.role !== 'admin') {
    debugLog("DEBUG [ensureAdmin]: Forbidden. Perfil ou Role inválido.");
    return { ok: false as const, error: "forbidden" };
  }
  
  debugLog("DEBUG [ensureAdmin]: Admin validado com sucesso.");
  return { ok: true as const };
}

serve(withSecurity('manage-backoffice-users', async (req: Request) => {
  if (req.method !== "POST") return { status: 405, data: { error: "method_not_allowed" } };

  let payload: Payload;
  try { 
    payload = (await req.json()) as Payload; 
  } catch { 
    return { status: 400, data: { error: "invalid_json" } };
  }

  // Verifica permissão de Admin antes de processar qualquer ação
  const adminCheck = await ensureAdmin(req.headers.get("Authorization"));
  if (!adminCheck.ok) {
    return { status: adminCheck.error === "forbidden" ? 403 : 401, data: { error: adminCheck.error } };
  }

  switch (payload.action) {
    case "list": {
      const { data, error } = await adminClient
        .from("backoffice_users")
        .select("*")
        .order("created_at", { ascending: false });
        
      if (error) return { status: 500, data: { error: error.message } };
      return { status: 200, data: { users: data } };
    }

    case "register": {
      const email = payload.email.trim().toLowerCase();
      if (!["admin", "manager", "viewer"].includes(payload.role)) return { status: 400, data: { error: "invalid_role" } };
      
      const { data, error } = await adminClient
        .from("backoffice_users")
        .insert({ email, name: payload.name, role: payload.role, is_active: true })
        .select().single();
        
      if (error) return { status: 500, data: { error: error.message } };
      return { status: 200, data: { user: data } };
    }

    case "set_active": {
      const { data: userRecord, error: fetchErr } = await adminClient
        .from("backoffice_users")
        .select("email")
        .eq("id", payload.id)
        .single();

      if (fetchErr) return { status: 500, data: { error: fetchErr.message } };

      const { data, error } = await adminClient
        .from("backoffice_users")
        .update({ is_active: payload.is_active })
        .eq("id", payload.id)
        .select().single();
        
      if (error) return { status: 500, data: { error: error.message } };

      if (payload.is_active === false) {
        try {
          const { data: usersData } = await adminClient.auth.admin.listUsers();
          const targetUser = usersData.users.find(u => u.email === userRecord.email);
          
          if (targetUser) {
            await adminClient.auth.admin.signOut(targetUser.id);
          }
        } catch (e) {
          debugLog("Erro ao forçar logout:", e);
        }
      }

      return { status: 200, data: { user: data } };
    }

    case "set_role": {
      if (!["admin", "manager", "viewer"].includes(payload.role)) return { status: 400, data: { error: "invalid_role" } };
      
      const { data, error } = await adminClient
        .from("backoffice_users")
        .update({ role: payload.role })
        .eq("id", payload.id)
        .select().single();
        
      if (error) return { status: 500, data: { error: error.message } };
      return { status: 200, data: { user: data } };
    }

    default:
      return { status: 400, data: { error: "unknown_action" } };
  }
}));