/**
 * ============================================================================
 * @fileoverview Gerenciamento de Usuários (Backoffice)
 * @module Backoffice/Users
 * @route /backoffice/users
 *
 * @description
 * Gerencia a interface de administração e RBAC (Role-Based Access Control) dos 
 * usuários do Backoffice. Controla a criação, ativação/desativação e elevação de privilégios.
 * 
 * @rules Regras de Negócio (Controle de Escopo / Filtros):
 * - Admin e Manager: Possuem acesso global ao sistema. O payload injeta 
 *   automaticamente o curinga `["*"]` nos campos `allowed_partners` e `allowed_products`.
 * - Viewer: Possui acesso granular e restrito. A seleção é feita a partir de uma listagem 
 *   dinâmica. Agora permite explicitamente enviar `["*"]` caso precise dar acesso total.
 * 
 * [MUTAÇÕES & DELEGAÇÃO SERVERLESS]:
 * - Pedidos de acesso (quem entrou com Google e não é usuário): lista no topo, só admin.
 *   "Liberar" abre o cadastro preenchido com o pedido (e-mail fixo) e chama `approve_request`;
 *   "Recusar" pede o motivo (`reject_request`). A pessoa recebe e-mail nos dois casos.
 * - Operações críticas (Cadastrar, Mudar Cargo, Inativar e Editar Permissões) NUNCA 
 *   são realizadas via queries diretas no cliente (`.insert()` ou `.update()`).
 * - O frontend atua como um mensageiro (Dumb Client) e delega toda a intenção 
 *   de mudança para a Edge Function `manage-backoffice-users`. 
 * - É o servidor que assume a responsabilidade de auditar, validar o domínio e 
 *   limpar restrições residuais (ex: injetar `["*"]` ao promover um Viewer para Admin).
 * - Login Superbid (`sbx_login`): no cadastro e pelo botão "Login Superbid" (ação
 *   `set_sbx_login`; vazio remove). Faz aparecer o link "Backoffice" no menu do avatar
 *   do hub para esse login, a partir do próximo login dele. Único por usuário.
 * 
 * [ENTERPRISE ZERO-TRUST - OBFUSCATION V3]:
 * - As 4 consultas originais de LEITURA (`backoffice_users`, `domains`, `partners`, 
 *   `products`) foram consolidadas na RPC `get_backoffice_users_data`. Isso elimina 
 *   a exposição do esquema de tabelas estruturais de segurança na aba Network (F12) 
 *   e reduz o tempo de carregamento da tela via otimização de Round-Trips de rede.
 * 
 * =========================================================================
 * ⚙️ DEPENDÊNCIA DE INFRAESTRUTURA (POSTGRESQL RPCs)
 * =========================================================================
 * Para proteger o esquema, as queries de leitura em lote dependem desta Procedure:
 * 
 * -------------------------------------------------------------------------
 * PROCEDURE: Busca Consolidada de Usuários e Metadados
 * -------------------------------------------------------------------------
 * CREATE OR REPLACE FUNCTION get_backoffice_users_data() RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
 * DECLARE v_result JSONB;
 * BEGIN
 *   SELECT jsonb_build_object(
 *     'users', (SELECT COALESCE(jsonb_agg(row_to_json(bu)), '[]'::jsonb) FROM (SELECT * FROM backoffice_users ORDER BY created_at DESC) bu),
 *     'domains', (SELECT COALESCE(jsonb_agg(d.domain), '[]'::jsonb) FROM allowed_email_domains d WHERE d.is_active = true),
 *     'partners', (SELECT COALESCE(jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name)), '[]'::jsonb) FROM partners p),
 *     'products', (SELECT COALESCE(jsonb_agg(jsonb_build_object('id', pt.id, 'name', pt.name)), '[]'::jsonb) FROM product_types pt)
 *   ) INTO v_result;
 *   RETURN v_result;
 * END;
 * $$;
 *
 * -------------------------------------------------------------------------
 * [AUDITORIA] HISTÓRICO DE USUÁRIOS — migração 20260930190400
 * -------------------------------------------------------------------------
 * Tabela backoffice_user_details (RLS ligada, policy só admin, sem grant para
 * anon/authenticated): 1 linha por ação sobre um usuário do backoffice.
 *   action: CREATE | ACTIVATE | DEACTIVATE | ROLE_CHANGE | PERMISSIONS_CHANGE | SBX_LOGIN_CHANGE
 *   old_values / new_values: retrato {role, is_active, sbx_login, allowed_partners,
 *   allowed_products} ANTES e DEPOIS da ação (CREATE: old_values = null).
 *   [20261120210000]: backoffice_users recriada com sbx_login (login da Superbid,
 *   único sem diferenciar maiúsculas) logo depois de email; CHECK de action inclui
 *   SBX_LOGIN_CHANGE; mesma RLS (Leitura_Staff), permissões, triggers e FK.
 *   actor_email: quem fez — vem de backoffice_users.updated_by, que a edge
 *   function manage-backoffice-users preenche com o e-mail do admin logado.
 * Gravação: trigger trg_backoffice_user_details (AFTER INSERT/UPDATE em
 *   backoffice_users) -> log_backoffice_user_change(). Uma mudança que altere
 *   cargo e permissões juntos gera uma linha para cada tipo de ação.
 *
 * CREATE FUNCTION get_backoffice_user_history(p_user_id uuid) RETURNS jsonb
 *   SECURITY DEFINER -- só admin (current_backoffice_actor); senão {error:'forbidden'}.
 *   SELECT jsonb_agg(jsonb_build_object('id', d.id, 'action', d.action, 'actor_email', d.actor_email,
 *     'old_values', d.old_values, 'new_values', d.new_values, 'created_at', d.created_at)
 *     ORDER BY d.created_at DESC)
 *   FROM backoffice_user_details d WHERE d.backoffice_user_id = p_user_id;
 * ============================================================================
 */

import { createLazyFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { 
  Loader2, Plus, RefreshCw, ShieldCheck, UserCheck, 
  UserX, Info, Filter, ChevronDown, Settings2, History, KeyRound, Inbox 
} from "lucide-react";
import { Textarea } from "@/components/ui/textarea";

import { Button } from "@/components/ui/button";
import { GradientIcon } from "@/design-system/sbx-design-system-9f1c03/components/ui/gradient-icon";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandGroup, CommandItem, CommandList } from "@/components/ui/command";

import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/integrations/auth/AuthContext";

export const Route = createLazyFileRoute("/backoffice/users")({ component: UsuariosPage });

type Role = "admin" | "manager" | "viewer";

type BackofficeUserRow = {
  id: string;
  email: string;
  name: string;
  role: Role;
  is_active: boolean;
  allowed_partners?: string[];
  allowed_products?: string[];
  /** Login da Superbid: mostra o link "Backoffice" no menu do avatar do hub. */
  sbx_login?: string | null;
  created_at: string;
  updated_at?: string;
};

type SelectOption = {
  id: string;
  name: string;
};

/** Pedido de acesso pendente (tabela backoffice_access_requests, via manage-backoffice-users). */
type AccessRequestRow = {
  id: string;
  email: string;
  name: string | null;
  partners: string[];
  products: string[];
  /** Parceiros com rota ativa para os produtos pedidos (calculado pela edge). */
  suggested_partners?: string[];
  /** Por produto pedido: parceiros com rota ativa (liberados juntos). */
  product_partners?: Record<string, string[]>;
  reason: string;
  requested_at: string;
};

const ROLE_BADGE: Record<Role, string> = {
  admin: "bg-accent text-foreground font-medium",
  manager: "bg-accent text-foreground font-medium",
  viewer: "bg-accent text-muted-foreground font-normal",
};

/** Erros de negócio da edge function `manage-backoffice-users` → mensagem para o admin. */
const MANAGE_ERRORS: Record<string, string> = {
  sbx_login_in_use: "Este login da Superbid já está cadastrado em outro usuário.",
  invalid_sbx_login: "Login da Superbid inválido: sem espaços, de 2 a 100 caracteres.",
  email_in_use: "Este e-mail já está cadastrado.",
  request_not_found: "Este pedido já foi analisado.",
  invalid_reason: "Informe o motivo (até 500 caracteres).",
  invalid_role: "Cargo inválido.",
  database_error: "Erro ao gravar. Tente novamente.",
};

async function callManage(payload: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke("manage-backoffice-users", { body: payload });
  if (error) {
    // Erro HTTP da edge: o código vem no corpo ({ error: "..." })
    const body = await (error as { context?: Response }).context?.json?.().catch(() => null);
    const code = typeof body?.error === "string" ? body.error : "";
    throw new Error(MANAGE_ERRORS[code] || error.message);
  }
  return data;
}

export function useIsMobile() {
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);
  return isMobile;
}

function UsuariosPage() {
  const { backofficeUser } = useAuth();
  const isMobile = useIsMobile();
  
  const [users, setUsers] = useState<BackofficeUserRow[]>([]);
  const [domains, setDomains] = useState<string[]>([]);
  
  const [partnersList, setPartnersList] = useState<SelectOption[]>([]);
  const [productsList, setProductsList] = useState<SelectOption[]>([]);
  
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  
  const [registerOpen, setregisterOpen] = useState(false);
  const [registerData, setregisterData] = useState({ 
    name: "", 
    emailPrefix: "", 
    domain: "", 
    role: "viewer" as Role,
    sbxLogin: "",
    partners: [] as string[],
    products: [] as string[]
  });

  const [editOpen, setEditOpen] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [editingUser, setEditingUser] = useState<BackofficeUserRow | null>(null);
  // [AUDITORIA]: usuário cujo histórico está aberto no painel lateral.
  const [historyUser, setHistoryUser] = useState<BackofficeUserRow | null>(null);
  const [editPartners, setEditPartners] = useState<string[]>([]);
  const [editProducts, setEditProducts] = useState<string[]>([]);
  // Login Superbid: usuário em edição e valor digitado
  const [sbxUser, setSbxUser] = useState<BackofficeUserRow | null>(null);
  const [sbxValue, setSbxValue] = useState("");
  const [isSavingSbx, setIsSavingSbx] = useState(false);
  // Pedidos de acesso: lista pendente, pedido sendo liberado (usa o cadastro) e recusa
  const [requests, setRequests] = useState<AccessRequestRow[]>([]);
  const [approvingRequest, setApprovingRequest] = useState<AccessRequestRow | null>(null);
  const [rejectingRequest, setRejectingRequest] = useState<AccessRequestRow | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [isRejecting, setIsRejecting] = useState(false);
  // Produtos desmarcados por pedido (padrão: todos os pedidos marcados)
  const [unselected, setUnselected] = useState<Record<string, string[]>>({});

  const isAdmin = backofficeUser?.role === "admin";

  async function load() {
    setLoading(true);
    
    // =========================================================================
    // [ENTERPRISE ZERO-TRUST]: Chamada cega via RPC para carregar todos os dados
    // =========================================================================
    const { data: rpcData, error } = await supabase.rpc('get_backoffice_users_data');
    const data = rpcData as {
      users?: BackofficeUserRow[];
      domains?: string[];
      partners?: SelectOption[];
      products?: SelectOption[];
    } | null;

    if (error) {
      toast.error("Erro ao carregar dados de usuários.");
    } else if (data) {
      setUsers(data.users || []);
      setDomains(data.domains || []);
      setPartnersList(data.partners || []);
      setProductsList(data.products || []);
    }

    try {
      const result = (await callManage({ action: "list_requests" })) as { requests?: AccessRequestRow[] };
      setRequests(result?.requests || []);
    } catch {
      setRequests([]);
    }
    
    setLoading(false);
  }

  /** Produtos do pedido ainda marcados para liberar. */
  const selectedProducts = (r: AccessRequestRow) => (r.products || []).filter((id) => !(unselected[r.id] || []).includes(String(id)));

  /** Parceiros necessários para os produtos marcados. */
  const partnersFor = (r: AccessRequestRow, products: string[]) =>
    [...new Set(products.flatMap((id) => r.product_partners?.[String(id)] || []))];

  function toggleRequestProduct(r: AccessRequestRow, id: string) {
    setUnselected((prev) => {
      const list = prev[r.id] || [];
      return { ...prev, [r.id]: list.includes(id) ? list.filter((v) => v !== id) : [...list, id] };
    });
  }

  /** Liberar: abre o cadastro preenchido com o pedido (e-mail fixo), produtos marcados e seus parceiros. */
  function openApprove(r: AccessRequestRow) {
    const products = selectedProducts(r);
    if (!products.length) {
      toast.error("Marque ao menos um produto para liberar.");
      return;
    }
    const [prefix, domain] = r.email.split("@");
    setApprovingRequest(r);
    setregisterData({
      name: r.name || "",
      emailPrefix: prefix || "",
      domain: domain || "",
      role: "viewer",
      sbxLogin: "",
      partners: partnersFor(r, products),
      products,
    });
    setregisterOpen(true);
  }

  function closeRegister(open: boolean) {
    setregisterOpen(open);
    if (!open) {
      setApprovingRequest(null);
      setregisterData({ name: "", emailPrefix: "", domain: "", role: "viewer", sbxLogin: "", partners: [], products: [] });
    }
  }

  async function handleReject() {
    if (!rejectingRequest) return;
    const reason = rejectReason.trim();
    if (!reason) {
      toast.error("Informe o motivo da recusa.");
      return;
    }
    setIsRejecting(true);
    try {
      await callManage({ action: "reject_request", id: rejectingRequest.id, reason });
      toast.success("Pedido recusado. A pessoa foi avisada por e-mail.");
      setRejectingRequest(null);
      setRejectReason("");
      load();
    } catch (caught: unknown) {
      toast.error((caught as Error).message || "Erro ao recusar pedido");
    } finally {
      setIsRejecting(false);
    }
  }

  const optionNames = (options: SelectOption[], ids: string[]) =>
    ids.map((id) => options.find((o) => String(o.id) === String(id))?.name || id).join(", ");

  const togglePartner = (id: string) => {
    setregisterData((prev) => {
      let current = prev.partners.filter(p => p !== "*");
      if (current.includes(id)) {
        current = current.filter(p => p !== id);
      } else {
        current.push(id);
      }
      return { ...prev, partners: current };
    });
  };

  const toggleProduct = (id: string) => {
    setregisterData((prev) => {
      let current = prev.products.filter(p => p !== "*");
      if (current.includes(id)) {
        current = current.filter(p => p !== id);
      } else {
        current.push(id);
      }
      return { ...prev, products: current };
    });
  };

  const toggleEditPartner = (id: string) => {
    setEditPartners((prev) => {
      const current = prev.filter(p => p !== "*");
      if (current.includes(id)) return current.filter(p => p !== id);
      return [...current, id];
    });
  };

  const toggleEditProduct = (id: string) => {
    setEditProducts((prev) => {
      const current = prev.filter(p => p !== "*");
      if (current.includes(id)) return current.filter(p => p !== id);
      return [...current, id];
    });
  };

  async function handleRegister() {
    if (registerData.emailPrefix.includes("@")) {
      toast.error("O prefixo não deve conter o caractere @.");
      return;
    }
    if (!registerData.name || !registerData.emailPrefix || !registerData.domain) {
      toast.error("Preencha todos os campos obrigatórios.");
      return;
    }

    setIsSaving(true);
    try {
      const allowed_partners = (registerData.role === "admin" || registerData.role === "manager") ? ["*"] : registerData.partners;
      const allowed_products = (registerData.role === "admin" || registerData.role === "manager") ? ["*"] : registerData.products;

      if (approvingRequest) {
        await callManage({
          action: "approve_request",
          id: approvingRequest.id,
          name: registerData.name,
          role: registerData.role,
          sbx_login: registerData.sbxLogin.trim() || null,
          allowed_partners,
          allowed_products,
        });
        toast.success("Acesso liberado. A pessoa foi avisada por e-mail.");
        closeRegister(false);
        load();
        return;
      }

      await callManage({
        action: "register",
        name: registerData.name,
        email: `${registerData.emailPrefix}@${registerData.domain}`,
        role: registerData.role,
        sbx_login: registerData.sbxLogin.trim() || null,
        allowed_partners,
        allowed_products
      });

      toast.success("Usuário cadastrado com sucesso!");
      setregisterOpen(false);
      setregisterData({ name: "", emailPrefix: "", domain: "", role: "viewer", sbxLogin: "", partners: [], products: [] });
      load();
    } catch (caught: unknown) {
      const e = caught as Error; // erros do Supabase/edge trazem message
      toast.error(e.message || "Erro ao cadastrar usuário");
    } finally {
      setIsSaving(false);
    }
  }

  function openEditPermissions(user: BackofficeUserRow) {
    setEditingUser(user);
    setEditPartners(user.allowed_partners || []);
    setEditProducts(user.allowed_products || []);
    setEditOpen(true);
  }

  async function handleUpdatePermissions() {
    if (!editingUser) return;
    setIsUpdating(true);
    try {
      await callManage({
        action: "update_permissions",
        id: editingUser.id,
        allowed_partners: editPartners,
        allowed_products: editProducts
      });

      toast.success("Permissões atualizadas com sucesso!");
      setEditOpen(false);
      setEditingUser(null);
      load();
    } catch (caught: unknown) {
      const e = caught as Error; // erros do Supabase/edge trazem message
      toast.error(e.message || "Erro ao atualizar permissões");
    } finally {
      setIsUpdating(false);
    }
  }

  function openSbxLogin(user: BackofficeUserRow) {
    setSbxUser(user);
    setSbxValue(user.sbx_login || "");
  }

  /** Grava (ou remove, se vazio) o login da Superbid do usuário. Auditoria: SBX_LOGIN_CHANGE. */
  async function handleSaveSbxLogin() {
    if (!sbxUser) return;
    setIsSavingSbx(true);
    try {
      await callManage({ action: "set_sbx_login", id: sbxUser.id, sbx_login: sbxValue.trim() || null });
      toast.success("Login da Superbid atualizado.");
      setSbxUser(null);
      load();
    } catch (caught: unknown) {
      const e = caught as Error;
      toast.error(e.message || "Erro ao atualizar o login da Superbid");
    } finally {
      setIsSavingSbx(false);
    }
  }

  async function toggleActive(u: BackofficeUserRow) {
    if (backofficeUser?.email?.toLowerCase() === u.email.toLowerCase()) {
      toast.error("Você não pode desativar seu próprio usuário.");
      return;
    }
    try {
      await callManage({ action: "set_active", id: u.id, is_active: !u.is_active });
      toast.success(`Usuário ${!u.is_active ? 'ativado' : 'desativado'} com sucesso.`);
      load();
    } catch (caught: unknown) {
      const e = caught as Error;
      toast.error(e.message || "Erro ao atualizar status"); }
  }

  async function changeRole(u: BackofficeUserRow, newRole: Role) {
    try {
      const payload: Record<string, unknown> = { action: "set_role", id: u.id, role: newRole };
      if (newRole === "admin" || newRole === "manager") {
        payload.allowed_partners = ["*"];
        payload.allowed_products = ["*"];
      }
      await callManage(payload);
      load();
    } catch (caught: unknown) {
      const e = caught as Error;
      toast.error(e.message); }
  }

  useEffect(() => { load(); }, []);

  const renderRegisterContent = () => (
    <>
      <div className="space-y-4 py-4">
        <div className="space-y-2">
          <Label className="text-foreground text-xs">Nome</Label>
          <Input
            value={registerData.name}
            onChange={(e) => setregisterData({ ...registerData, name: e.target.value })}
            className="rounded-none border-border focus-visible:ring-1 focus-visible:ring-foreground focus-visible:border-foreground text-xs"
          />
        </div>
        
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label className="text-foreground text-xs">E-mail (Prefixo)</Label>
            <Input
              disabled={!!approvingRequest}
              value={registerData.emailPrefix}
              onChange={(e) => setregisterData({ ...registerData, emailPrefix: e.target.value })}
              className="rounded-none border-border focus-visible:ring-1 focus-visible:ring-foreground focus-visible:border-foreground text-xs"
            />
          </div>
          <div className="space-y-2">
            <Label className="text-foreground text-xs">Domínio</Label>
            <Select
              disabled={!!approvingRequest}
              value={registerData.domain}
              onValueChange={(v) => setregisterData({ ...registerData, domain: v })}
            >
              <SelectTrigger className="rounded-none border-border focus:ring-1 focus:ring-foreground text-xs">
                <SelectValue placeholder="Selecione..." />
              </SelectTrigger>
              <SelectContent className="rounded-none border-border">
                {domains.map((d) => (
                  <SelectItem key={d} value={d} className="rounded-none cursor-pointer text-xs">@{d}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="space-y-2">
          <Label className="text-foreground text-xs">Login Superbid</Label>
          <Input
            value={registerData.sbxLogin}
            maxLength={100}
            onChange={(e) => setregisterData({ ...registerData, sbxLogin: e.target.value })}
            className="rounded-none border-border focus-visible:ring-1 focus-visible:ring-foreground focus-visible:border-foreground text-xs"
          />
        </div>
        <div className="space-y-2">
          <Label className="text-foreground text-xs">Cargo</Label>
          <Select
            value={registerData.role}
            onValueChange={(v: Role) => setregisterData({ ...registerData, role: v })}
          >
            <SelectTrigger className="rounded-none border-border focus:ring-1 focus:ring-foreground text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="rounded-none border-border">
              <SelectItem value="admin" className="rounded-none cursor-pointer text-xs">Administrador</SelectItem>
              <SelectItem value="manager" className="rounded-none cursor-pointer text-xs">Gerente</SelectItem>
              <SelectItem value="viewer" className="rounded-none cursor-pointer text-xs">Visualizador</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {registerData.role === "viewer" ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 animate-in fade-in slide-in-from-top-2 duration-300">
            {/* PARCEIROS */}
            <div className="space-y-2 flex flex-col">
              <Label className="text-foreground text-xs">Parceiros Permitidos</Label>
              <Popover modal={true}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-10 w-full rounded-none gap-2 bg-card border-border transition-colors text-foreground justify-between font-normal shadow-xs text-xs hover:bg-primary hover:text-primary-foreground hover:border-primary"
                  >
                    <span className="flex items-center gap-2 truncate">
                      <Filter className="h-3.5 w-3.5 opacity-50 shrink-0" />
                      <span className="truncate">
                        {registerData.partners.includes("*") 
                          ? "Todos (Acesso Total)" 
                          : registerData.partners.length === 0 
                            ? "Nenhum (Bloqueado)" 
                            : `${registerData.partners.length} selecionado(s)`}
                      </span>
                    </span>
                    <ChevronDown className="h-3 w-3 opacity-40 shrink-0" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0 rounded-none border-border shadow-xs" align="start">
                  <Command className="bg-card">
                    <CommandList 
                      className="max-h-56 overflow-y-auto overscroll-contain text-xs"
                      onWheelCapture={(e) => e.stopPropagation()}
                    >
                      <CommandGroup>
                        <CommandItem onSelect={() => setregisterData({ ...registerData, partners: ["*"] })} className="cursor-pointer font-medium text-foreground rounded-none hover:bg-accent">
                          <div className={`mr-2 flex h-4 w-4 items-center justify-center rounded-none border border-muted-foreground ${registerData.partners.includes("*") ? "bg-foreground text-background border-foreground" : "opacity-50"}`}>
                            {registerData.partners.includes("*") && "✓"}
                          </div>
                          Todos (Acesso Total)
                        </CommandItem>
                        <CommandItem onSelect={() => setregisterData({ ...registerData, partners: [] })} className="cursor-pointer font-medium text-destructive rounded-none hover:bg-accent">
                          <div className={`mr-2 flex h-4 w-4 items-center justify-center rounded-none border border-muted-foreground ${registerData.partners.length === 0 ? "bg-destructive text-white border-destructive" : "opacity-50"}`}>
                            {registerData.partners.length === 0 && "✓"}
                          </div>
                          Nenhum (Bloqueado)
                        </CommandItem>
                        <div className="h-px bg-accent my-1" />
                        {partnersList.map((p) => {
                          const isSelected = registerData.partners.includes(String(p.id));
                          return (
                            <CommandItem key={p.id} onSelect={() => togglePartner(String(p.id))} className={`cursor-pointer rounded-none text-foreground hover:bg-accent ${isSelected ? "bg-muted font-medium" : ""}`}>
                              <div className={`mr-2 flex h-4 w-4 items-center justify-center rounded-none border border-muted-foreground ${isSelected ? "bg-foreground text-background border-foreground" : "opacity-50"}`}>
                                {isSelected && "✓"}
                              </div>
                              {p.name}
                            </CommandItem>
                          );
                        })}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>

            {/* PRODUTOS */}
            <div className="space-y-2 flex flex-col">
              <Label className="text-foreground text-xs">Produtos Permitidos</Label>
              <Popover modal={true}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-10 w-full rounded-none gap-2 bg-card border-border transition-colors text-foreground justify-between font-normal shadow-xs text-xs hover:bg-primary hover:text-primary-foreground hover:border-primary"
                  >
                    <span className="flex items-center gap-2 truncate">
                      <Filter className="h-3.5 w-3.5 opacity-50 shrink-0" />
                      <span className="truncate">
                        {registerData.products.includes("*") 
                          ? "Todos (Acesso Total)" 
                          : registerData.products.length === 0 
                            ? "Nenhum (Bloqueado)" 
                            : `${registerData.products.length} selecionado(s)`}
                      </span>
                    </span>
                    <ChevronDown className="h-3 w-3 opacity-40 shrink-0" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0 rounded-none border-border shadow-xs" align="start">
                  <Command className="bg-card">
                    <CommandList 
                      className="max-h-56 overflow-y-auto overscroll-contain text-xs"
                      onWheelCapture={(e) => e.stopPropagation()}
                    >
                      <CommandGroup>
                        <CommandItem onSelect={() => setregisterData({ ...registerData, products: ["*"] })} className="cursor-pointer font-medium text-foreground rounded-none hover:bg-accent">
                          <div className={`mr-2 flex h-4 w-4 items-center justify-center rounded-none border border-muted-foreground ${registerData.products.includes("*") ? "bg-foreground text-background border-foreground" : "opacity-50"}`}>
                            {registerData.products.includes("*") && "✓"}
                          </div>
                          Todos (Acesso Total)
                        </CommandItem>
                        <CommandItem onSelect={() => setregisterData({ ...registerData, products: [] })} className="cursor-pointer font-medium text-destructive rounded-none hover:bg-accent">
                          <div className={`mr-2 flex h-4 w-4 items-center justify-center rounded-none border border-muted-foreground ${registerData.products.length === 0 ? "bg-destructive text-white border-destructive" : "opacity-50"}`}>
                            {registerData.products.length === 0 && "✓"}
                          </div>
                          Nenhum (Bloqueado)
                        </CommandItem>
                        <div className="h-px bg-accent my-1" />
                        {productsList.map((p) => {
                          const isSelected = registerData.products.includes(String(p.id));
                          return (
                            <CommandItem key={p.id} onSelect={() => toggleProduct(String(p.id))} className={`cursor-pointer rounded-none text-foreground hover:bg-accent ${isSelected ? "bg-muted font-medium" : ""}`}>
                              <div className={`mr-2 flex h-4 w-4 items-center justify-center rounded-none border border-muted-foreground ${isSelected ? "bg-foreground text-background border-foreground" : "opacity-50"}`}>
                                {isSelected && "✓"}
                              </div>
                              {p.name}
                            </CommandItem>
                          );
                        })}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>
          </div>
        ) : (
          <div className="flex items-start gap-2 rounded-none border border-border bg-muted p-3 text-xs text-foreground animate-in fade-in duration-300">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
            <p>Usuários com perfil de <strong className="font-medium text-foreground">{registerData.role === "admin" ? "Administrador" : "Gerente"}</strong> possuem acesso irrestrito a todos os parceiros e produtos.</p>
          </div>
        )}
      </div>

      <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 mt-6">
        <Button variant="outline" onClick={() => closeRegister(false)} className="w-full sm:w-auto h-10 rounded-none border-border text-foreground text-xs hover:bg-primary hover:text-primary-foreground hover:border-primary">Cancelar</Button>
        <Button onClick={handleRegister} disabled={isSaving} className="cta-gradient border-0 w-full sm:w-auto text-white h-10 rounded-none font-medium text-xs">
          {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : approvingRequest ? <UserCheck className="mr-2 h-4 w-4" /> : <Plus className="mr-2 h-4 w-4" />}
          {approvingRequest ? "Liberar acesso" : "Cadastrar"}
        </Button>
      </div>
    </>
  );

  const renderEditContent = () => (
    <>
      <div className="space-y-4 py-4 text-xs">
        {/* EDIÇÃO PARCEIROS */}
        <div className="space-y-2 flex flex-col">
          <Label className="text-foreground text-xs">Parceiros Permitidos</Label>
          <Popover modal={true}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="h-10 w-full rounded-none gap-2 bg-card border-border transition-colors text-foreground justify-between font-normal shadow-xs text-xs hover:bg-primary hover:text-primary-foreground hover:border-primary"
              >
                <span className="flex items-center gap-2 truncate">
                  <Filter className="h-3.5 w-3.5 opacity-50 shrink-0" />
                  <span className="truncate">
                    {editPartners.includes("*") 
                      ? "Todos (Acesso Total)" 
                      : editPartners.length === 0 
                        ? "Nenhum (Bloqueado)" 
                        : `${editPartners.length} selecionado(s)`}
                  </span>
                </span>
                <ChevronDown className="h-3 w-3 opacity-40 shrink-0" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0 rounded-none border-border shadow-xs" align="start">
              <Command className="bg-card">
                <CommandList 
                  className="max-h-56 overflow-y-auto overscroll-contain text-xs"
                  onWheelCapture={(e) => e.stopPropagation()}
                >
                  <CommandGroup>
                    <CommandItem onSelect={() => setEditPartners(["*"])} className="cursor-pointer font-medium text-foreground rounded-none hover:bg-accent">
                      <div className={`mr-2 flex h-4 w-4 items-center justify-center rounded-none border border-muted-foreground ${editPartners.includes("*") ? "bg-foreground text-background border-foreground" : "opacity-50"}`}>
                        {editPartners.includes("*") && "✓"}
                      </div>
                      Todos (Acesso Total)
                    </CommandItem>
                    <CommandItem onSelect={() => setEditPartners([])} className="cursor-pointer font-medium text-destructive rounded-none hover:bg-accent">
                      <div className={`mr-2 flex h-4 w-4 items-center justify-center rounded-none border border-muted-foreground ${editPartners.length === 0 ? "bg-destructive text-white border-destructive" : "opacity-50"}`}>
                        {editPartners.length === 0 && "✓"}
                      </div>
                      Nenhum (Bloqueado)
                    </CommandItem>
                    <div className="h-px bg-accent my-1" />
                    {partnersList.map((p) => {
                      const isSelected = editPartners.includes(String(p.id));
                      return (
                        <CommandItem key={p.id} onSelect={() => toggleEditPartner(String(p.id))} className={`cursor-pointer rounded-none text-foreground hover:bg-accent ${isSelected ? "bg-muted font-medium" : ""}`}>
                          <div className={`mr-2 flex h-4 w-4 items-center justify-center rounded-none border border-muted-foreground ${isSelected ? "bg-foreground text-background border-foreground" : "opacity-50"}`}>
                            {isSelected && "✓"}
                          </div>
                          {p.name}
                        </CommandItem>
                      );
                    })}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
        </div>

        {/* EDIÇÃO PRODUTOS */}
        <div className="space-y-2 flex flex-col">
          <Label className="text-foreground text-xs">Produtos Permitidos</Label>
          <Popover modal={true}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="h-10 w-full rounded-none gap-2 bg-card border-border transition-colors text-foreground justify-between font-normal shadow-xs text-xs hover:bg-primary hover:text-primary-foreground hover:border-primary"
              >
                <span className="flex items-center gap-2 truncate">
                  <Filter className="h-3.5 w-3.5 opacity-50 shrink-0" />
                  <span className="truncate">
                    {editProducts.includes("*") 
                      ? "Todos (Acesso Total)" 
                      : editProducts.length === 0 
                        ? "Nenhum (Bloqueado)" 
                        : `${editProducts.length} selecionado(s)`}
                  </span>
                </span>
                <ChevronDown className="h-3 w-3 opacity-40 shrink-0" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0 rounded-none border-border shadow-xs" align="start">
              <Command className="bg-card">
                <CommandList 
                  className="max-h-56 overflow-y-auto overscroll-contain text-xs"
                  onWheelCapture={(e) => e.stopPropagation()}
                >
                  <CommandGroup>
                    <CommandItem onSelect={() => setEditProducts(["*"])} className="cursor-pointer font-medium text-foreground rounded-none hover:bg-accent">
                      <div className={`mr-2 flex h-4 w-4 items-center justify-center rounded-none border border-muted-foreground ${editProducts.includes("*") ? "bg-foreground text-background border-foreground" : "opacity-50"}`}>
                        {editProducts.includes("*") && "✓"}
                      </div>
                      Todos (Acesso Total)
                    </CommandItem>
                    <CommandItem onSelect={() => setEditProducts([])} className="cursor-pointer font-medium text-destructive rounded-none hover:bg-accent">
                      <div className={`mr-2 flex h-4 w-4 items-center justify-center rounded-none border border-muted-foreground ${editProducts.length === 0 ? "bg-destructive text-white border-destructive" : "opacity-50"}`}>
                        {editProducts.length === 0 && "✓"}
                      </div>
                      Nenhum (Bloqueado)
                    </CommandItem>
                    <div className="h-px bg-accent my-1" />
                    {productsList.map((p) => {
                      const isSelected = editProducts.includes(String(p.id));
                      return (
                        <CommandItem key={p.id} onSelect={() => toggleEditProduct(String(p.id))} className={`cursor-pointer rounded-none text-foreground hover:bg-accent ${isSelected ? "bg-muted font-medium" : ""}`}>
                          <div className={`mr-2 flex h-4 w-4 items-center justify-center rounded-none border border-muted-foreground ${isSelected ? "bg-foreground text-background border-foreground" : "opacity-50"}`}>
                            {isSelected && "✓"}
                          </div>
                          {p.name}
                        </CommandItem>
                      );
                    })}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
        </div>
      </div>

      <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 mt-4">
        <Button variant="outline" onClick={() => setEditOpen(false)} className="w-full sm:w-auto h-10 rounded-none border-border text-foreground text-xs hover:bg-primary hover:text-primary-foreground hover:border-primary">Cancelar</Button>
        <Button onClick={handleUpdatePermissions} disabled={isUpdating} className="cta-gradient border-0 w-full sm:w-auto text-white font-medium h-10 rounded-none text-xs">
          {isUpdating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Salvar Permissões
        </Button>
      </div>
    </>
  );

  const renderSbxContent = () => (
    <>
      <div className="space-y-2 py-4">
        <Label className="text-foreground text-xs">Login Superbid</Label>
        <Input
          value={sbxValue}
          maxLength={100}
          onChange={(e) => setSbxValue(e.target.value)}
          className="rounded-none border-border focus-visible:ring-1 focus-visible:ring-foreground focus-visible:border-foreground text-xs"
        />
      </div>
      <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 mt-2">
        <Button variant="outline" onClick={() => setSbxUser(null)} className="w-full sm:w-auto h-10 rounded-none border-border text-foreground text-xs hover:bg-primary hover:text-primary-foreground hover:border-primary">Cancelar</Button>
        <Button onClick={handleSaveSbxLogin} disabled={isSavingSbx} className="cta-gradient border-0 w-full sm:w-auto text-white font-medium h-10 rounded-none text-xs">
          {isSavingSbx && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Salvar
        </Button>
      </div>
    </>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="page-header-title">Usuários do backoffice</h1>
        </div>

        <div className="flex items-center gap-2">
          {isAdmin && (
            <Button variant="outline" size="sm" onClick={() => setregisterOpen(true)} className="rounded-none border-border text-foreground shadow-xs text-xs hover:bg-primary hover:text-primary-foreground hover:border-primary">
              <Plus className="mr-2 h-4 w-4" /> Cadastrar Usuário
            </Button>
          )}

          <Button size="sm" onClick={load} disabled={loading} className="cta-gradient border-0 rounded-none text-white text-xs">
            <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Atualizar
          </Button>
        </div>
      </div>

      {isMobile ? (
        <Sheet open={registerOpen} onOpenChange={closeRegister}>
          <SheetContent side="bottom" className="rounded-none max-h-[85vh] overflow-y-auto p-6 bg-card border-t border-border">
            <SheetHeader className="text-left mb-4">
              <SheetTitle className="text-foreground text-base">{approvingRequest ? "Liberar acesso" : "Cadastrar novo usuário"}</SheetTitle>
              <SheetDescription className="text-muted-foreground text-xs">{approvingRequest ? "Produtos marcados no pedido e os parceiros deles já vêm preenchidos. Escolha o cargo e confira." : "Preencha os dados abaixo para criar o acesso."}</SheetDescription>
            </SheetHeader>
            {renderRegisterContent()}
          </SheetContent>
        </Sheet>
      ) : (
        <Dialog open={registerOpen} onOpenChange={closeRegister}>
          <DialogContent className="max-w-xl rounded-none sm:rounded-none bg-card border-border">
            <DialogHeader>
              <DialogTitle className="text-foreground text-base">{approvingRequest ? "Liberar acesso" : "Cadastrar novo usuário"}</DialogTitle>
              <DialogDescription className="text-muted-foreground text-xs">{approvingRequest ? "Produtos marcados no pedido e os parceiros deles já vêm preenchidos. Escolha o cargo e confira." : "Preencha os dados abaixo para criar o acesso."}</DialogDescription>
            </DialogHeader>
            {renderRegisterContent()}
          </DialogContent>
        </Dialog>
      )}

      {isMobile ? (
        <Sheet open={editOpen} onOpenChange={setEditOpen}>
          <SheetContent side="bottom" className="rounded-none max-h-[85vh] overflow-y-auto p-6 bg-card border-t border-border">
            <SheetHeader className="text-left mb-4">
              <SheetTitle className="text-foreground text-base">Editar Permissões</SheetTitle>
              <SheetDescription className="text-muted-foreground text-xs">
                Ajuste os acessos de parceiros e produtos para <strong className="font-medium text-foreground">{editingUser?.name}</strong>.
              </SheetDescription>
            </SheetHeader>
            {renderEditContent()}
          </SheetContent>
        </Sheet>
      ) : (
        <Dialog open={editOpen} onOpenChange={setEditOpen}>
          <DialogContent className="max-w-md rounded-none sm:rounded-none bg-card border-border">
            <DialogHeader>
              <DialogTitle className="text-foreground text-base">Editar Permissões</DialogTitle>
              <DialogDescription className="text-muted-foreground text-xs">
                Ajuste os acessos de parceiros e produtos para <strong className="font-medium text-foreground">{editingUser?.name}</strong>.
              </DialogDescription>
            </DialogHeader>
            {renderEditContent()}
          </DialogContent>
        </Dialog>
      )}

      {isMobile ? (
        <Sheet open={!!sbxUser} onOpenChange={(open) => !open && setSbxUser(null)}>
          <SheetContent side="bottom" className="rounded-none max-h-[85vh] overflow-y-auto p-6 bg-card border-t border-border">
            <SheetHeader className="text-left mb-4">
              <SheetTitle className="text-foreground text-base">Login Superbid</SheetTitle>
              <SheetDescription className="text-muted-foreground text-xs">
                Login da Superbid de <strong className="font-medium text-foreground">{sbxUser?.name}</strong>. Deixe vazio para remover.
              </SheetDescription>
            </SheetHeader>
            {renderSbxContent()}
          </SheetContent>
        </Sheet>
      ) : (
        <Dialog open={!!sbxUser} onOpenChange={(open) => !open && setSbxUser(null)}>
          <DialogContent className="max-w-md rounded-none sm:rounded-none bg-card border-border">
            <DialogHeader>
              <DialogTitle className="text-foreground text-base">Login Superbid</DialogTitle>
              <DialogDescription className="text-muted-foreground text-xs">
                Login da Superbid de <strong className="font-medium text-foreground">{sbxUser?.name}</strong>. Deixe vazio para remover.
              </DialogDescription>
            </DialogHeader>
            {renderSbxContent()}
          </DialogContent>
        </Dialog>
      )}

      {isAdmin && requests.length > 0 && (
        <div className="rounded-none border border-border bg-card shadow-xs">
          <div className="flex items-center gap-2 border-b border-border bg-accent px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            <Inbox className="h-3.5 w-3.5" /> Pedidos de acesso ({requests.length})
          </div>
          <ul className="divide-y divide-border">
            {requests.map((r) => (
              <li key={r.id} className="space-y-3 px-3 py-3 text-xs">
                <div className="min-w-0 space-y-1">
                  <div className="font-medium text-foreground">{r.name || r.email}</div>
                  <div className="text-[11px] text-muted-foreground">{r.email} · {new Date(r.requested_at).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}</div>
                  <div className="break-words"><span className="text-muted-foreground">Motivo: </span>{r.reason}</div>
                </div>

                {/* Produto pedido → parceiros liberados junto; desmarque o que não vai liberar */}
                <div className="overflow-x-auto border border-border">
                  <table className="w-full text-xs">
                    <thead className="bg-accent text-left text-[10px] uppercase tracking-wider text-muted-foreground">
                      <tr>
                        <th className="w-8 px-3 py-2" />
                        <th className="px-3 py-2 font-semibold">Produto</th>
                        <th className="px-3 py-2 font-semibold">Parceiros liberados junto</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(r.products || []).map((id) => {
                        const pid = String(id);
                        const checked = !(unselected[r.id] || []).includes(pid);
                        const partners = r.product_partners?.[pid] || [];
                        return (
                          <tr key={pid} className={`border-t border-border ${checked ? "" : "opacity-50"}`}>
                            <td className="px-3 py-2">
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() => toggleRequestProduct(r, pid)}
                                className="h-3.5 w-3.5 cursor-pointer accent-foreground"
                                aria-label={`Liberar ${optionNames(productsList, [pid])}`}
                              />
                            </td>
                            <td className="px-3 py-2 text-foreground">{optionNames(productsList, [pid])}</td>
                            <td className="px-3 py-2 text-foreground">
                              {partners.length ? optionNames(partnersList, partners) : <span className="text-muted-foreground">Sem rota ativa</span>}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="text-[11px] text-muted-foreground">
                    Vai liberar: {selectedProducts(r).length} produto(s) · parceiros {optionNames(partnersList, partnersFor(r, selectedProducts(r))) || "—"}
                  </div>
                  <div className="flex shrink-0 gap-2">
                  <Button variant="outline" size="sm" onClick={() => { setRejectingRequest(r); setRejectReason(""); }} className="h-8 rounded-none border-border text-xs hover:bg-primary hover:text-primary-foreground hover:border-primary">
                    <UserX className="mr-1.5 h-3.5 w-3.5" /> Recusar
                  </Button>
                  <Button size="sm" onClick={() => openApprove(r)} className="cta-gradient h-8 rounded-none border-0 text-xs text-white">
                    <UserCheck className="mr-1.5 h-3.5 w-3.5" /> Liberar
                  </Button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      <Dialog open={!!rejectingRequest} onOpenChange={(open) => !open && setRejectingRequest(null)}>
        <DialogContent className="max-w-md rounded-none sm:rounded-none bg-card border-border">
          <DialogHeader>
            <DialogTitle className="text-foreground text-base">Recusar pedido</DialogTitle>
            <DialogDescription className="text-muted-foreground text-xs">
              Pedido de <strong className="font-medium text-foreground">{rejectingRequest?.name || rejectingRequest?.email}</strong>. O motivo vai no e-mail para a pessoa.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label className="text-foreground text-xs">Motivo</Label>
            <Textarea
              value={rejectReason}
              maxLength={500}
              onChange={(e) => setRejectReason(e.target.value)}
              className="rounded-none border-border text-xs"
            />
          </div>
          <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 mt-2">
            <Button variant="outline" onClick={() => setRejectingRequest(null)} className="w-full sm:w-auto h-10 rounded-none border-border text-foreground text-xs hover:bg-primary hover:text-primary-foreground hover:border-primary">Cancelar</Button>
            <Button onClick={handleReject} disabled={isRejecting} className="cta-gradient border-0 w-full sm:w-auto text-white font-medium h-10 rounded-none text-xs">
              {isRejecting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Recusar
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <div className="overflow-hidden rounded-none border border-border bg-card shadow-xs">
        <div className="overflow-x-auto w-full pb-2">
          <table className="w-full text-xs">
            <thead className="border-b border-border bg-accent text-left text-muted-foreground uppercase tracking-wider text-[10px]">
              <tr>
                <th className="px-3 py-2.5 font-semibold">Usuário</th>
                <th className="px-3 py-2.5 font-semibold">Login Superbid</th>
                <th className="px-3 py-2.5 font-semibold">Cargo</th>
                <th className="px-3 py-2.5 font-semibold">Status</th>
                <th className="px-3 py-2.5 text-right font-semibold">Ações</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => {
                const isMe = backofficeUser?.email?.toLowerCase() === u.email.toLowerCase();
                return (
                  <tr key={u.id} className="border-b border-border hover:bg-muted transition-colors group">
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      <div className="font-medium text-foreground">{u.name}</div>
                      <div className="text-[11px] text-muted-foreground">{u.email}</div>
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap text-foreground">{u.sbx_login || "—"}</td>
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      <Select value={u.role} onValueChange={(v: Role) => changeRole(u, v)} disabled={!isAdmin || isMe}>
                        <SelectTrigger className={`h-7 w-36 text-[10px] uppercase tracking-wider rounded-none border-none focus:ring-0 shadow-none ${ROLE_BADGE[u.role]}`}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="rounded-none border-border text-xs">
                          <SelectItem value="admin" className="rounded-none cursor-pointer text-xs">Administrador</SelectItem>
                          <SelectItem value="manager" className="rounded-none cursor-pointer text-xs">Gerente</SelectItem>
                          <SelectItem value="viewer" className="rounded-none cursor-pointer text-xs">Visualizador</SelectItem>
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      <span
                        className={`inline-flex items-center gap-1 rounded-none px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${u.is_active ? "bg-success/10 text-success" : "bg-muted text-muted-foreground"}`}
                      >
                        {u.is_active ? <ShieldCheck className="h-3 w-3" /> : <UserX className="h-3 w-3" />}
                        {u.is_active ? "Ativo" : "Inativo"}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-right whitespace-nowrap">
                      {isAdmin && (
                        <div className="flex items-center justify-end gap-1">
                          {u.role === "viewer" && (
                            <Button variant="ghost" size="sm" onClick={() => openEditPermissions(u)} className="rounded-none hover:bg-accent text-foreground font-medium text-xs h-8">
                              <GradientIcon icon={Settings2} size={12} className="mr-1" /> Permissões
                            </Button>
                          )}
                          <Button variant="ghost" size="sm" onClick={() => openSbxLogin(u)} className="rounded-none hover:bg-accent text-foreground font-medium text-xs h-8">
                            <GradientIcon icon={KeyRound} size={12} className="mr-1" /> Login Superbid
                          </Button>
                          {/* [AUDITORIA]: botão Histórico sempre visível, colado ao Ativar/Desativar (mesma posição em todas as linhas) */}
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setHistoryUser(u)}
                            className="rounded-none hover:bg-accent text-foreground font-medium text-xs h-8"
                          >
                            <GradientIcon icon={History} size={12} className="mr-1" /> Histórico
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => toggleActive(u)} disabled={isMe} className="rounded-none hover:bg-accent text-foreground font-medium text-xs h-8">
                            {u.is_active ? (
                              <><UserX className="mr-1 h-3 w-3 text-destructive" /> Desativar</>
                            ) : (
                              <><UserCheck className="mr-1 h-3 w-3 text-success" /> Ativar</>
                            )}
                          </Button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* [AUDITORIA]: painel lateral com o histórico do usuário */}
      <UserHistoryPanel
        user={historyUser}
        partners={partnersList}
        products={productsList}
        onClose={() => setHistoryUser(null)}
      />
    </div>
  );
}

// =========================================================================
// [AUDITORIA] PAINEL LATERAL — HISTÓRICO DO USUÁRIO DO BACKOFFICE
// =========================================================================
/**
 * @component UserHistoryPanel
 * @description Painel lateral aberto pelo botão "Histórico" da linha do usuário (só admin;
 * o botão fica sempre visível, entre Permissões e Ativar/Desativar).
 * Mesmo padrão do painel da Auditoria: Sheet lateral (tela cheia no celular),
 * tokens bg-card/text-foreground/border-border (modo claro e escuro).
 *
 * [FONTE DE DADOS]: RPC `get_backoffice_user_history(p_user_id)` — linhas de
 * backoffice_user_details, mais recentes primeiro. Para cada ação mostra quem fez,
 * quando e o que mudou; parceiros/produtos aparecem pelo NOME (partners/products
 * já carregados pela tela) com o que foi incluído e removido.
 */
const ACTION_LABEL: Record<string, string> = {
  CREATE: "Usuário criado",
  ACTIVATE: "Usuário ativado",
  DEACTIVATE: "Usuário inativado",
  ROLE_CHANGE: "Cargo alterado",
  PERMISSIONS_CHANGE: "Permissões alteradas",
  SBX_LOGIN_CHANGE: "Login Superbid alterado",
};
const ROLE_LABEL: Record<string, string> = { admin: "Administrador", manager: "Gerente", viewer: "Visualizador" };

/** Valores antes/depois de uma alteração de usuário (backoffice_user_details). */
type UserHistoryValues = {
  role?: string;
  allowed_partners?: string[] | null;
  allowed_products?: string[] | null;
  [key: string]: unknown;
};

/** Uma linha do histórico (get_backoffice_user_history). */
type UserHistoryItem = {
  id: string;
  action: string;
  actor_email: string;
  created_at: string;
  old_values: UserHistoryValues | null;
  new_values: UserHistoryValues | null;
};

function UserHistoryPanel({
  user, partners, products, onClose,
}: {
  user: BackofficeUserRow | null;
  partners: SelectOption[];
  products: SelectOption[];
  onClose: () => void;
}) {
  const [items, setItems] = useState<UserHistoryItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [panelError, setPanelError] = useState<string | null>(null);

  useEffect(() => {
    setItems([]);
    setPanelError(null);
    if (!user) return;
    setLoading(true);
    supabase
      .rpc("get_backoffice_user_history", { p_user_id: user.id })
      .then(({ data, error }) => {
        if (error) setPanelError(error.message);
        else if ((data as { error?: string } | null)?.error) setPanelError("Sem permissão para ver este histórico.");
        else setItems((data as UserHistoryItem[] | null) || []);
      })
      .then(() => setLoading(false), () => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps -- busca só quando o usuário aberto muda
  }, [user?.id]);

  // ["*"] = todos; ids viram nomes pela lista já carregada na tela.
  const names = (ids: unknown, list: SelectOption[]) => {
    const arr: string[] = Array.isArray(ids) ? ids.map(String) : [];
    if (arr.includes("*")) return ["Todos"];
    return arr.map((id) => list.find((o) => String(o.id) === id)?.name || `#${id}`);
  };
  const diff = (before: unknown, after: unknown, list: SelectOption[]) => {
    const b = names(before, list);
    const a = names(after, list);
    return { added: a.filter((x) => !b.includes(x)), removed: b.filter((x) => !a.includes(x)), after: a };
  };

  return (
    <Sheet open={!!user} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-xl p-0 flex flex-col rounded-none bg-card border-l border-border">
        {user && (
          <>
            <div className="p-6 border-b border-border bg-card shrink-0">
              <SheetHeader className="space-y-1 text-left">
                <span className="text-[11px] font-bold text-foreground uppercase tracking-wider">Histórico do usuário</span>
                <SheetTitle className="text-lg sm:text-xl font-bold text-foreground break-words text-left">{user.name}</SheetTitle>
                <SheetDescription className="text-xs text-muted-foreground break-all">{user.email}</SheetDescription>
              </SheetHeader>
            </div>

            <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
              {loading && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" /> Carregando histórico...
                </div>
              )}
              {panelError && <div className="text-xs font-medium text-destructive">{panelError}</div>}
              {!loading && !panelError && items.length === 0 && (
                <div className="text-xs text-muted-foreground">Nenhuma ação registrada para este usuário.</div>
              )}

              {items.map((h) => {
                const o = h.old_values || {};
                const n = h.new_values || {};
                const when = new Date(h.created_at).toLocaleString("pt-BR");
                const pd = diff(o.allowed_partners, n.allowed_partners, partners);
                const prd = diff(o.allowed_products, n.allowed_products, products);
                return (
                  <div key={h.id} className="rounded-none border border-border bg-card p-4 space-y-2 shadow-xs text-xs">
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-2">
                      <span className="text-[11px] font-semibold uppercase tracking-wider text-foreground">
                        {ACTION_LABEL[h.action] || h.action}
                      </span>
                      <span className="text-muted-foreground">{when}</span>
                    </div>
                    <div className="text-muted-foreground">
                      Por <span className="font-medium text-foreground break-all">{h.actor_email}</span>
                    </div>

                    {h.action === "ROLE_CHANGE" && (
                      <div className="text-foreground">
                        Cargo: {ROLE_LABEL[o.role as string] || o.role || "—"} → <strong>{ROLE_LABEL[n.role as string] || n.role}</strong>
                      </div>
                    )}
                    {h.action === "SBX_LOGIN_CHANGE" && (
                      <div className="text-foreground">
                        Login Superbid: {(o.sbx_login as string) || "—"} → <strong>{(n.sbx_login as string) || "—"}</strong>
                      </div>
                    )}
                    {h.action === "PERMISSIONS_CHANGE" && (
                      <div className="space-y-1 text-foreground">
                        {(pd.added.length > 0 || pd.removed.length > 0) && (
                          <div>
                            Parceiros:
                            {pd.added.length > 0 && <span> incluído(s) <strong>{pd.added.join(", ")}</strong></span>}
                            {pd.removed.length > 0 && <span> removido(s) <strong>{pd.removed.join(", ")}</strong></span>}
                          </div>
                        )}
                        {(prd.added.length > 0 || prd.removed.length > 0) && (
                          <div>
                            Produtos:
                            {prd.added.length > 0 && <span> incluído(s) <strong>{prd.added.join(", ")}</strong></span>}
                            {prd.removed.length > 0 && <span> removido(s) <strong>{prd.removed.join(", ")}</strong></span>}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Retrato do usuário APÓS a ação (antes: na linha anterior do histórico) */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-2 border-t border-border">
                      <HistoryField label="Cargo" value={ROLE_LABEL[n.role as string] || n.role} />
                      <HistoryField label="Status" value={n.is_active ? "Ativo" : "Inativo"} />
                      <HistoryField label="Login Superbid" value={(n.sbx_login as string) || "—"} />
                      <HistoryField label="Parceiros" value={pd.after.join(", ") || "—"} />
                      <HistoryField label="Produtos" value={prd.after.join(", ") || "—"} />
                    </div>
                    {h.old_values && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-muted-foreground">
                        <HistoryField label="Antes · Parceiros" value={names(o.allowed_partners, partners).join(", ") || "—"} />
                        <HistoryField label="Antes · Produtos" value={names(o.allowed_products, products).join(", ") || "—"} />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

/** Campo rótulo/valor em micro-tipografia (mesmo padrão do painel da Auditoria). */
function HistoryField({ label, value }: { label: string; value: string | undefined }) {
  return (
    <div className="flex flex-col min-w-0">
      <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{label}</span>
      <span className="text-foreground font-medium mt-0.5 break-words">{value || "—"}</span>
    </div>
  );
}
