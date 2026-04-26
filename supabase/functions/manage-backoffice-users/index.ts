// Edge function to manage backoffice users (admin only).
// Actions: list, invite, set_active, set_role
//
// IMPORTANT: This edge function still lives on the OLD Lovable Cloud project.
// It writes to the OLD database (jxtrwsuddhadsiwcrmia), NOT to the user's new
// Supabase (qadgbfhjtgufioxtyamq). To make it write to the new Supabase,
// set the env vars MY_SUPABASE_URL / MY_SUPABASE_SERVICE_ROLE_KEY / MY_SUPABASE_ANON_KEY
// as Supabase function secrets in the OLD project — falls back to the old project's
// own SUPABASE_* vars if those are not set.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL =
  Deno.env.get("MY_SUPABASE_URL") ?? Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY =
  Deno.env.get("MY_SUPABASE_SERVICE_ROLE_KEY") ??
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ??
  "";
const ANON_KEY =
  Deno.env.get("MY_SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY") ?? "";

type Role = "admin" | "manager" | "viewer";

interface InvitePayload {
  action: "invite";
  email: string;
  name: string;
  role: Role;
}
interface SetActivePayload {
  action: "set_active";
  id: string;
  is_active: boolean;
}
interface SetRolePayload {
  action: "set_role";
  id: string;
  role: Role;
}
interface ListPayload {
  action: "list";
}

type Payload = InvitePayload | SetActivePayload | SetRolePayload | ListPayload;

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function ensureAdmin(authHeader: string | null) {
  if (!authHeader) {
    return { ok: false as const, error: "missing_authorization" };
  }
  const userClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData.user) {
    return { ok: false as const, error: "unauthenticated" };
  }
  const { data: isAdmin, error: rpcErr } = await userClient.rpc(
    "is_current_user_backoffice_admin",
  );
  if (rpcErr) {
    console.error("admin check rpc error", rpcErr);
    return { ok: false as const, error: "admin_check_failed" };
  }
  if (isAdmin !== true) {
    return { ok: false as const, error: "forbidden" };
  }
  return { ok: true as const, user: userData.user };
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

  const adminCheck = await ensureAdmin(req.headers.get("Authorization"));
  if (!adminCheck.ok) {
    const status =
      adminCheck.error === "forbidden" || adminCheck.error === "unauthenticated"
        ? 403
        : 400;
    return json(status, { error: adminCheck.error });
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  switch (payload.action) {
    case "list": {
      const { data, error } = await admin
        .from("backoffice_users")
        .select("id, email, name, role, is_active, created_at, updated_at")
        .order("created_at", { ascending: false });
      if (error) return json(500, { error: error.message });
      return json(200, { users: data });
    }

    case "invite": {
      const email = (payload.email ?? "").trim().toLowerCase();
      const name = (payload.name ?? "").trim();
      const role = payload.role;
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return json(400, { error: "invalid_email" });
      }
      if (!name) return json(400, { error: "name_required" });
      if (!["admin", "manager", "viewer"].includes(role)) {
        return json(400, { error: "invalid_role" });
      }
      const { data, error } = await admin
        .from("backoffice_users")
        .insert({ email, name, role, is_active: true })
        .select("id, email, name, role, is_active, created_at")
        .single();
      if (error) {
        if (error.code === "23505") {
          return json(409, { error: "email_already_exists" });
        }
        return json(500, { error: error.message });
      }
      return json(200, { user: data });
    }

    case "set_active": {
      if (!payload.id) return json(400, { error: "id_required" });
      const { data, error } = await admin
        .from("backoffice_users")
        .update({ is_active: payload.is_active })
        .eq("id", payload.id)
        .select("id, email, name, role, is_active")
        .single();
      if (error) return json(500, { error: error.message });
      return json(200, { user: data });
    }

    case "set_role": {
      if (!payload.id) return json(400, { error: "id_required" });
      if (!["admin", "manager", "viewer"].includes(payload.role)) {
        return json(400, { error: "invalid_role" });
      }
      const { data, error } = await admin
        .from("backoffice_users")
        .update({ role: payload.role })
        .eq("id", payload.id)
        .select("id, email, name, role, is_active")
        .single();
      if (error) return json(500, { error: error.message });
      return json(200, { user: data });
    }

    default:
      return json(400, { error: "unknown_action" });
  }
});
