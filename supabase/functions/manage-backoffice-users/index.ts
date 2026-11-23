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
 * 3. Gestão de Ciclo de Vida: Registro, alteração de papéis, permissões granulares e desativação 
 *    com encerramento forçado de sessão (Kill Switch).
 * 4. Login Superbid (`sbx_login`): login do usuário interno na Superbid; mostra o link "Backoffice"
 *    no menu do avatar do hub (ver `_shared/backoffice-access.ts`). Opcional, sem espaços,
 *    2 a 100 caracteres, único sem diferenciar maiúsculas (índice backoffice_users_sbx_login_key).
 * 5. Pedido de acesso (tabela `backoffice_access_requests`, migração 20261123100000):
 *    - `my_access_request` / `request_access`: qualquer pessoa logada com GOOGLE, e-mail num domínio
 *      ativo de `allowed_email_domains` e fora de `backoffice_users`. Pede só PRODUTOS e o motivo
 *      (quem pede não conhece os parceiros); um pedido pendente por vez; e-mail aos admins ativos.
 *    - `list_requests` / `approve_request` / `reject_request`: só admin. A lista traz
 *      `suggested_partners`: parceiros com rota ativa (orchestrator_configs, PRODUCT ou CATEGORY via
 *      category_types.product_id) para os produtos pedidos; a tela de liberação já os marca. Liberar cria o usuário
 *      (mesma regra do `register`, e-mail do pedido) e avisa a pessoa; recusar exige motivo e avisa.
 *    E-mails: `_shared/backoffice-access-email.ts` (notification_outbox, context_type BACKOFFICE_ACCESS).
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { withSecurity } from "../_shared/server.ts";
import { debugLog } from "../_shared/logger.ts";
import { queueAccessEmail } from "../_shared/backoffice-access-email.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";

// Cliente administrativo restrito ao escopo do servidor
const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

type Role = "admin" | "manager" | "viewer";

// ATUALIZADO: Adicionado suporte para as colunas JSONB nas Interfaces
interface RegisterPayload { 
  action: "register"; 
  email: string; 
  name: string; 
  role: Role; 
  allowed_partners?: string[]; 
  allowed_products?: string[]; 
  sbx_login?: string | null;
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
  allowed_partners?: string[]; 
  allowed_products?: string[]; 
}
// NOVA AÇÃO: Atualizar permissões na tabela
interface UpdatePermissionsPayload {
  action: "update_permissions";
  id: string;
  allowed_partners: string[];
  allowed_products: string[];
}
interface SetSbxLoginPayload {
  action: "set_sbx_login";
  id: string;
  sbx_login: string | null;
}
interface ListPayload { action: "list"; }
interface MyAccessRequestPayload { action: "my_access_request"; }
interface RequestAccessPayload {
  action: "request_access";
  products: string[];
  reason: string;
}
interface ListRequestsPayload { action: "list_requests"; }
interface ApproveRequestPayload {
  action: "approve_request";
  id: string;
  name: string;
  role: Role;
  allowed_partners?: string[];
  allowed_products?: string[];
  sbx_login?: string | null;
}
interface RejectRequestPayload { action: "reject_request"; id: string; reason: string; }

type Payload = RegisterPayload | SetActivePayload | SetRolePayload | UpdatePermissionsPayload | SetSbxLoginPayload | ListPayload
  | MyAccessRequestPayload | RequestAccessPayload | ListRequestsPayload | ApproveRequestPayload | RejectRequestPayload;

/** Ações de quem ainda não é usuário do backoffice (pedido de acesso). */
const REQUESTER_ACTIONS = new Set(["my_access_request", "request_access"]);

/** Lista de ids (texto), só os que existem em `valid`, sem repetir. */
function pickIds(value: unknown, valid: Set<string>): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((v) => String(v)).filter((v) => valid.has(v)))];
}

/** Parceiros e produtos (id + nome) para a tela do pedido e para os e-mails. */
async function loadCatalog() {
  const [{ data: partners }, { data: products }] = await Promise.all([
    adminClient.from("partners").select("id, name").order("name"),
    adminClient.from("product_types").select("id, name").order("name"),
  ]);
  const toOptions = (rows: { id: number | string; name: string }[] | null) =>
    (rows || []).map((r) => ({ id: String(r.id), name: r.name }));
  return { partners: toOptions(partners), products: toOptions(products) };
}

/** Nomes dos ids (para o e-mail); id sem nome fica como está. */
function namesOf(ids: string[], options: { id: string; name: string }[]) {
  return ids.map((id) => options.find((o) => o.id === id)?.name || id);
}

/** Produto → parceiros com rota ativa (orchestrator_configs PRODUCT, ou CATEGORY pela categoria do produto). */
async function partnersByProduct(): Promise<Map<string, Set<string>>> {
  const [{ data: configs }, { data: categories }] = await Promise.all([
    adminClient.from("orchestrator_configs").select("partner_id, config_type, lookup_id").eq("is_active", true),
    adminClient.from("category_types").select("id, product_id"),
  ]);
  const categoryProduct = new Map((categories || []).map((c: { id: number; product_id: number | null }) => [String(c.id), String(c.product_id ?? "")]));
  const map = new Map<string, Set<string>>();
  for (const c of (configs || []) as { partner_id: number | null; config_type: string; lookup_id: number | null }[]) {
    if (c.partner_id == null || c.lookup_id == null) continue;
    const product = c.config_type === "PRODUCT" ? String(c.lookup_id)
      : c.config_type === "CATEGORY" ? categoryProduct.get(String(c.lookup_id)) || "" : "";
    if (!product) continue;
    if (!map.has(product)) map.set(product, new Set());
    map.get(product)!.add(String(c.partner_id));
  }
  return map;
}

/** E-mail para `ilike` exato (sem curingas % e _). */
const likeExact = (value: string) => value.replace(/[\\%_]/g, "\\$&");

/** E-mails dos admins ativos (destinatários do pedido). */
async function adminEmails(): Promise<string[]> {
  const { data } = await adminClient.from("backoffice_users").select("email").eq("role", "admin").eq("is_active", true);
  return (data || []).map((r: { email: string }) => r.email);
}

/**
 * Quem pede acesso: sessão válida, login pelo GOOGLE, e-mail de domínio ativo em
 * `allowed_email_domains` e ainda fora de `backoffice_users`.
 */
async function ensureRequester(authHeader: string | null) {
  if (!authHeader) return { ok: false as const, status: 401, error: "missing_authorization" };
  const token = authHeader.replace(/bearer\s+/i, "").trim();
  const userClient = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: { user }, error } = await userClient.auth.getUser(token);
  if (error || !user?.email) return { ok: false as const, status: 401, error: "unauthenticated" };
  if (user.app_metadata?.provider !== "google") return { ok: false as const, status: 403, error: "google_only" };

  const email = user.email.toLowerCase();
  const domain = email.split("@")[1] || "";
  const { data: domainRow } = await adminClient
    .from("allowed_email_domains").select("domain").eq("domain", domain).eq("is_active", true).maybeSingle();
  if (!domainRow) return { ok: false as const, status: 403, error: "domain_not_allowed" };

  const { data: existing } = await adminClient
    .from("backoffice_users").select("id").ilike("email", likeExact(email)).maybeSingle();
  if (existing) return { ok: false as const, status: 409, error: "already_registered" };

  const meta = (user.user_metadata || {}) as Record<string, unknown>;
  const name = String(meta.full_name || meta.name || "").trim().slice(0, 200) || null;
  return { ok: true as const, email, name };
}

/** Login Superbid normalizado: vazio = null; inválido (espaço, tamanho) = undefined. */
function normalizeSbxLogin(value: unknown): string | null | undefined {
  if (value === null || value === undefined) return null;
  const login = String(value).trim();
  if (!login) return null;
  return /^\S{2,100}$/.test(login) ? login : undefined;
}

/**
 * Erro de gravação → resposta. Login já usado = 409 sbx_login_in_use; e-mail já cadastrado =
 * 409 email_in_use. Demais: 500 genérico (a mensagem do banco fica só no log, não vai ao navegador).
 */
function writeError(error: { code?: string; message: string }) {
  if (error.code === "23505" && /sbx_login/.test(error.message)) {
    return { status: 409, data: { error: "sbx_login_in_use" } };
  }
  if (error.code === "23505" && /email/.test(error.message)) {
    return { status: 409, data: { error: "email_in_use" } };
  }
  debugLog("[manage-backoffice-users] Erro de banco:", error.message);
  return { status: 500, data: { error: "database_error" } };
}

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
  
  const token = authHeader.replace(/bearer\s+/i, "").trim();
  
  const userClient = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  
  const { data: { user }, error: authError } = await userClient.auth.getUser(token);
  
  if (authError || !user) {
    debugLog("DEBUG [ensureAdmin]: Erro Auth ->", authError);
    return { ok: false as const, error: "unauthenticated" };
  }

  debugLog("DEBUG [ensureAdmin]: Usuário autenticado ->", user.email);

  // Consulta restrita na tabela de confiança do Backoffice
  const { data: profile, error } = await adminClient
    .from("backoffice_users")
    .select("role")
    .eq("email", user.email.toLowerCase())
    .eq("is_active", true)
    .single();

  if (error || !profile || profile.role !== 'admin') {
    debugLog("DEBUG [ensureAdmin]: Acesso negado. Perfil não é admin ou está inativo.");
    return { ok: false as const, error: "forbidden" };
  }
  
  debugLog("DEBUG [ensureAdmin]: Administrador validado com sucesso.");
  // [AUDITORIA]: e-mail do admin vai em `updated_by` -> trigger grava backoffice_user_details.
  return { ok: true as const, email: user.email.toLowerCase() };
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

  // Pedido de acesso: quem ainda não é usuário do backoffice
  if (REQUESTER_ACTIONS.has(payload.action)) {
    const requester = await ensureRequester(req.headers.get("Authorization"));
    if (!requester.ok) return { status: requester.status, data: { error: requester.error } };

    const catalog = await loadCatalog();
    const { data: last } = await adminClient
      .from("backoffice_access_requests")
      .select("id, status, partners, products, reason, rejected_reason, requested_at, decided_at")
      .ilike("email", likeExact(requester.email))
      .order("requested_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (payload.action === "my_access_request") {
      return { status: 200, data: { email: requester.email, name: requester.name, request: last || null, products: catalog.products } };
    }

    // request_access
    if (last?.status === "pending") return { status: 409, data: { error: "request_pending" } };
    const p = payload as RequestAccessPayload;
    const products = pickIds(p.products, new Set(catalog.products.map((o) => o.id)));
    const reason = String(p.reason ?? "").trim();
    if (!products.length) return { status: 400, data: { error: "invalid_scope" } };
    if (reason.length < 1 || reason.length > 500) return { status: 400, data: { error: "invalid_reason" } };

    const { data: created, error } = await adminClient
      .from("backoffice_access_requests")
      .insert({ email: requester.email, name: requester.name, partners: [], products, reason })
      .select("id, status, partners, products, reason, rejected_reason, requested_at, decided_at")
      .single();
    if (error) {
      if (error.code === "23505") return { status: 409, data: { error: "request_pending" } };
      return { status: 500, data: { error: "request_failed" } };
    }

    await queueAccessEmail(adminClient, {
      kind: "pedido",
      to: await adminEmails(),
      name: requester.name,
      email: requester.email,
      partners: [],
      products: namesOf(products, catalog.products),
      reason,
    });
    return { status: 200, data: { request: created } };
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
        
      if (error) return writeError(error);
      return { status: 200, data: { users: data } };
    }

    case "register": {
      const email = payload.email.trim().toLowerCase();
      if (!["admin", "manager", "viewer"].includes(payload.role)) {
          return { status: 400, data: { error: "invalid_role" } };
      }
      const sbxLogin = normalizeSbxLogin(payload.sbx_login);
      if (sbxLogin === undefined) return { status: 400, data: { error: "invalid_sbx_login" } };
      
      const { data, error } = await adminClient
        .from("backoffice_users")
        .insert({ 
          email, 
          name: payload.name, 
          sbx_login: sbxLogin,
          role: payload.role, 
          is_active: true,
          updated_by: adminCheck.email,
          // ATUALIZADO: Salva as permissões já na criação
          allowed_partners: payload.allowed_partners || ["*"],
          allowed_products: payload.allowed_products || ["*"]
        })
        .select().single();
        
      if (error) return writeError(error);

      // Cadastro direto de quem tinha pedido pendente: o pedido fica como liberado
      await adminClient
        .from("backoffice_access_requests")
        .update({ status: "approved", decided_at: new Date().toISOString(), decided_by: adminCheck.email })
        .ilike("email", likeExact(email))
        .eq("status", "pending");

      return { status: 200, data: { user: data } };
    }

    // Login Superbid do usuário interno (null remove). Auditoria: SBX_LOGIN_CHANGE (trigger).
    case "set_sbx_login": {
      const sbxLogin = normalizeSbxLogin(payload.sbx_login);
      if (sbxLogin === undefined) return { status: 400, data: { error: "invalid_sbx_login" } };

      const { data, error } = await adminClient
        .from("backoffice_users")
        .update({ sbx_login: sbxLogin, updated_by: adminCheck.email })
        .eq("id", payload.id)
        .select().single();

      if (error) return writeError(error);
      return { status: 200, data: { user: data } };
    }

    case "set_active": {
      const { data: userRecord, error: fetchErr } = await adminClient
        .from("backoffice_users")
        .select("email")
        .eq("id", payload.id)
        .single();

      if (fetchErr) return writeError(fetchErr);

      const { data, error } = await adminClient
        .from("backoffice_users")
        .update({ is_active: payload.is_active, updated_by: adminCheck.email })
        .eq("id", payload.id)
        .select().single();
        
      if (error) return writeError(error);

      // [KILL SWITCH]: Se o admin desativou o usuário, revoga a sessão imediatamente
      if (payload.is_active === false) {
        try {
          const { data: usersData } = await adminClient.auth.admin.listUsers();
          const targetUser = usersData.users.find((u: { id: string; email?: string }) => u.email === userRecord.email);
          
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
      
      // ATUALIZADO: Prepara o objeto de atualização com a Role
      const updateData: Record<string, unknown> = { role: payload.role, updated_by: adminCheck.email };
      
      // Se houver instruções de limpar JSONB (Admin/Manager), acopla no update
      if (payload.allowed_partners) updateData.allowed_partners = payload.allowed_partners;
      if (payload.allowed_products) updateData.allowed_products = payload.allowed_products;

      const { data, error } = await adminClient
        .from("backoffice_users")
        .update(updateData)
        .eq("id", payload.id)
        .select().single();
        
      if (error) return writeError(error);
      return { status: 200, data: { user: data } };
    }

    // NOVA AÇÃO: Atualizar diretamente as permissões JSONB na tabela
    case "update_permissions": {
      const { data, error } = await adminClient
        .from("backoffice_users")
        .update({ 
          allowed_partners: payload.allowed_partners,
          allowed_products: payload.allowed_products,
          updated_by: adminCheck.email,
        })
        .eq("id", payload.id)
        .select().single();
        
      if (error) return writeError(error);
      return { status: 200, data: { user: data } };
    }

    // Pedidos de acesso pendentes (mais antigos primeiro)
    case "list_requests": {
      const { data, error } = await adminClient
        .from("backoffice_access_requests")
        .select("id, email, name, partners, products, reason, requested_at")
        .eq("status", "pending")
        .order("requested_at", { ascending: true });
      if (error) return { status: 500, data: { error: "list_requests_failed" } };
      const byProduct = await partnersByProduct();
      const requests = (data || []).map((r: { products: string[] }) => ({
        ...r,
        suggested_partners: [...new Set((r.products || []).flatMap((id) => [...(byProduct.get(String(id)) || [])]))],
      }));
      return { status: 200, data: { requests } };
    }

    // Libera: cria o usuário com o e-mail do pedido (mesma regra do register) e avisa a pessoa
    case "approve_request": {
      if (!["admin", "manager", "viewer"].includes(payload.role)) {
        return { status: 400, data: { error: "invalid_role" } };
      }
      const sbxLogin = normalizeSbxLogin(payload.sbx_login);
      if (sbxLogin === undefined) return { status: 400, data: { error: "invalid_sbx_login" } };

      const { data: request } = await adminClient
        .from("backoffice_access_requests").select("*").eq("id", payload.id).eq("status", "pending").maybeSingle();
      if (!request) return { status: 404, data: { error: "request_not_found" } };

      const fullScope = payload.role === "admin" || payload.role === "manager";
      const allowed_partners = fullScope ? ["*"] : (payload.allowed_partners || []);
      const allowed_products = fullScope ? ["*"] : (payload.allowed_products || []);

      const { data: user, error } = await adminClient
        .from("backoffice_users")
        .insert({
          email: String(request.email).toLowerCase(),
          name: String(payload.name || request.name || "").trim() || null,
          sbx_login: sbxLogin,
          role: payload.role,
          is_active: true,
          updated_by: adminCheck.email,
          allowed_partners,
          allowed_products,
        })
        .select().single();
      if (error) {
        return writeError(error);
      }

      await adminClient
        .from("backoffice_access_requests")
        .update({ status: "approved", decided_at: new Date().toISOString(), decided_by: adminCheck.email })
        .eq("id", request.id);

      const catalog = await loadCatalog();
      await queueAccessEmail(adminClient, {
        kind: "liberado",
        to: [request.email],
        name: user.name,
        email: request.email,
        role: payload.role,
        partners: namesOf(allowed_partners, catalog.partners),
        products: namesOf(allowed_products, catalog.products),
      });
      return { status: 200, data: { user } };
    }

    // Recusa com motivo e avisa a pessoa (ela pode pedir de novo)
    case "reject_request": {
      const reason = String(payload.reason ?? "").trim();
      if (reason.length < 1 || reason.length > 500) return { status: 400, data: { error: "invalid_reason" } };

      const { data: request, error } = await adminClient
        .from("backoffice_access_requests")
        .update({ status: "rejected", rejected_reason: reason, decided_at: new Date().toISOString(), decided_by: adminCheck.email })
        .eq("id", payload.id)
        .eq("status", "pending")
        .select("*")
        .maybeSingle();
      if (error) return { status: 500, data: { error: "reject_failed" } };
      if (!request) return { status: 404, data: { error: "request_not_found" } };

      await queueAccessEmail(adminClient, {
        kind: "recusado",
        to: [request.email],
        name: request.name,
        email: request.email,
        partners: [],
        products: [],
        reason,
      });
      return { status: 200, data: { ok: true } };
    }

    default:
      return { status: 400, data: { error: "unknown_action" } };
  }
}));