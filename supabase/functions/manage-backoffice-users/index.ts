/**
 * @fileoverview GESTÃO DE USUÁRIOS DO BACKOFFICE (Admin Control Plane)
 * @path supabase/functions/manage-backoffice-users/index.ts
 * 
 * =========================================================================
 * [ARQUITETURA DE CONTROLE DE ACESSO - RBAC]
 * =========================================================================
 * Endpoint restrito e protegido estritamente para administradores do sistema.
 * 
 * RESPONSABILIDADES:
 * 1. Auditoria de Identidade: Validação criptográfica do JWT do solicitante.
 * 2. Verificação de Privilégios: Consulta cruzada na tabela `backoffice_users`.
 * 3. Gestão de Ciclo de Vida: Registro, alteração de papéis e desativação 
 *    com encerramento forçado de sessão (Kill Switch).
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { withSecurity } from "../_shared/server.ts";
import { debugLog } from "../_shared/logger.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";

// Cliente administrativo restrito ao escopo do servidor
const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

type Role = "admin" | "manager" | "viewer";

interface RegisterPayload { action: "register"; email: string; name: string; role: Role; }
interface SetActivePayload { action: "set_active"; id: string; is_active: boolean; }
interface SetRolePayload { action: "set_role"; id: string; role: Role; }
interface ListPayload { action: "list"; }
type Payload = RegisterPayload | SetActivePayload | SetRolePayload | ListPayload;

/**
 * Valida se o solicitante possui privilégios administrativos ativos.
 * @param {string | null} authHeader - Token JWT enviado no header Authorization.
 * @returns {Promise<{ ok: true } | { ok: false; error: string }>}
 */
async function ensureAdmin(authHeader: string | null) {
  debugLog("DEBUG [ensureAdmin]: Iniciando verificação de privilégios...");

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

  debugLog("DEBUG [ensureAdmin]: Usuário autenticado ->", user.email);

  // Consulta restrita na tabela de confiança do Backoffice
  const { data: profile, error } = await adminClient
    .from("backoffice_users")
    .select("role")
    .ilike("email", user.email)
    .eq("is_active", true)
    .single();

  if (error || !profile || profile.role !== 'admin') {
    debugLog("DEBUG [ensureAdmin]: Acesso negado. Perfil não é admin ou está inativo.");
    return { ok: false as const, error: "forbidden" };
  }
  
  debugLog("DEBUG [ensureAdmin]: Administrador validado com sucesso.");
  return { ok: true as const };
}

serve(withSecurity('manage-backoffice-users', async (req: Request) => {
  if (req.method !== "POST") {
      return { status: 405, data: { error: "method_not_allowed" } };
  }

  let payload: Payload;
  try { 
    payload = (await req.json()) as Payload; 
  } catch { 
    return { status: 400, data: { error: "invalid_json" } };
  }

  // Barreira de segurança global para todas as ações administrativas
  const adminCheck = await ensureAdmin(req.headers.get("Authorization"));
  if (!adminCheck.ok) {
    const statusCode = adminCheck.error === "forbidden" ? 403 : 401;
    return { status: statusCode, data: { error: adminCheck.error } };
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
      if (!["admin", "manager", "viewer"].includes(payload.role)) {
          return { status: 400, data: { error: "invalid_role" } };
      }
      
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

      // [KILL SWITCH]: Se o admin desativou o usuário, revoga a sessão imediatamente
      if (payload.is_active === false) {
        try {
          const { data: usersData } = await adminClient.auth.admin.listUsers();
          const targetUser = usersData.users.find(u => u.email === userRecord.email);
          
          if (targetUser) {
            await adminClient.auth.admin.signOut(targetUser.id);
          }
        } catch (e) {
          debugLog("Erro ao forçar logout do usuário desativado:", e);
        }
      }

      return { status: 200, data: { user: data } };
    }

    case "set_role": {
      if (!["admin", "manager", "viewer"].includes(payload.role)) {
          return { status: 400, data: { error: "invalid_role" } };
      }
      
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