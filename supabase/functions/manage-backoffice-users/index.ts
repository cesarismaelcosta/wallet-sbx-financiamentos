/**
 * @file manage-backoffice-users.ts
 * @description Edge Function de gestão de usuários.
 * Agora utiliza consulta direta à tabela 'backoffice_users' para validação de privilégios.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

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

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/**
 * Valida o usuário diretamente na tabela 'backoffice_users'.
 * Esta abordagem é mais robusta e não depende de RPCs legadas.
 */
async function ensureAdmin(authHeader: string | null) {
  if (!authHeader) return { ok: false as const, error: "missing_authorization" };
  
  const userClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) return { ok: false as const, error: "unauthenticated" };

  // Consulta direta na tabela de confiança
  const { data: profile, error } = await adminClient
    .from("backoffice_users")
    .select("role")
    .eq("email", user.email)
    .eq("is_active", true)
    .single();

  if (error || !profile || profile.role !== 'admin') {
    return { ok: false as const, error: "forbidden" };
  }
  
  return { ok: true as const };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });

  let payload: Payload;
  try { 
    payload = (await req.json()) as Payload; 
  } catch { 
    return json(400, { error: "invalid_json" }); 
  }

  // Verifica permissão de Admin antes de processar qualquer ação
  const adminCheck = await ensureAdmin(req.headers.get("Authorization"));
  if (!adminCheck.ok) {
    return json(adminCheck.error === "forbidden" ? 403 : 401, { error: adminCheck.error });
  }

  switch (payload.action) {
    case "list": {
      const { data, error } = await adminClient
        .from("backoffice_users")
        .select("*")
        .order("created_at", { ascending: false });
        
      if (error) return json(500, { error: error.message });
      return json(200, { users: data });
    }

    case "register": {
      const email = payload.email.trim().toLowerCase();
      if (!["admin", "manager", "viewer"].includes(payload.role)) return json(400, { error: "invalid_role" });
      
      const { data, error } = await adminClient
        .from("backoffice_users")
        .insert({ email, name: payload.name, role: payload.role, is_active: true })
        .select().single();
        
      if (error) return json(500, { error: error.message });
      return json(200, { user: data });
    }

    case "set_active": {
      // 1. Primeiro, buscamos o e-mail do usuário que está sendo desativado
      const { data: userRecord, error: fetchErr } = await adminClient
        .from("backoffice_users")
        .select("email")
        .eq("id", payload.id)
        .single();

      if (fetchErr) return json(500, { error: fetchErr.message });

      // 2. Executamos o update no banco
      const { data, error } = await adminClient
        .from("backoffice_users")
        .update({ is_active: payload.is_active })
        .eq("id", payload.id)
        .select().single();
        
      if (error) return json(500, { error: error.message });

      // 3. Se for desativação (is_active = false), forçamos o logout
      if (payload.is_active === false) {
        try {
          // Buscamos o usuário na tabela auth.users pelo e-mail
          const { data: usersData } = await adminClient.auth.admin.listUsers();
          const targetUser = usersData.users.find(u => u.email === userRecord.email);
          
          if (targetUser) {
            // Expulsa o usuário invalidando todos os seus tokens de refresh
            await adminClient.auth.admin.signOut(targetUser.id);
          }
        } catch (e) {
          console.error("Erro ao forçar logout:", e);
          // Não paramos a execução aqui, pois o usuário já foi desativado no banco
        }
      }

      return json(200, { user: data });
    }

    case "set_role": {
      if (!["admin", "manager", "viewer"].includes(payload.role)) return json(400, { error: "invalid_role" });
      
      const { data, error } = await adminClient
        .from("backoffice_users")
        .update({ role: payload.role })
        .eq("id", payload.id)
        .select().single();
        
      if (error) return json(500, { error: error.message });
      return json(200, { user: data });
    }

    default:
      return json(400, { error: "unknown_action" });
  }
});