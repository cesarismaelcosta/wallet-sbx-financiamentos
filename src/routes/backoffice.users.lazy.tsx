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
 * - Operações críticas (Cadastrar, Mudar Cargo, Inativar e Editar Permissões) NUNCA 
 *   são realizadas via queries diretas no cliente (`.insert()` ou `.update()`).
 * - O frontend atua como um mensageiro (Dumb Client) e delega toda a intenção 
 *   de mudança para a Edge Function `manage-backoffice-users`. 
 * - É o servidor que assume a responsabilidade de auditar, validar o domínio e 
 *   limpar restrições residuais (ex: injetar `["*"]` ao promover um Viewer para Admin).
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
 *   action: CREATE | ACTIVATE | DEACTIVATE | ROLE_CHANGE | PERMISSIONS_CHANGE
 *   old_values / new_values: retrato {role, is_active, allowed_partners,
 *   allowed_products} ANTES e DEPOIS da ação (CREATE: old_values = null).
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
  UserX, Info, Filter, ChevronDown, Settings2 
} from "lucide-react";

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
  created_at: string;
  updated_at?: string;
};

type SelectOption = {
  id: string;
  name: string;
};

const ROLE_BADGE: Record<Role, string> = {
  admin: "bg-accent text-foreground font-medium",
  manager: "bg-accent text-foreground font-medium",
  viewer: "bg-accent text-muted-foreground font-normal",
};

async function callManage(payload: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke("manage-backoffice-users", { body: payload });
  if (error) throw new Error(error.message);
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

  const isAdmin = backofficeUser?.role === "admin";

  async function load() {
    setLoading(true);
    
    // =========================================================================
    // [ENTERPRISE ZERO-TRUST]: Chamada cega via RPC para carregar todos os dados
    // =========================================================================
    const { data, error } = await supabase.rpc('get_backoffice_users_data');

    if (error) {
      toast.error("Erro ao carregar dados de usuários.");
    } else if (data) {
      setUsers(data.users || []);
      setDomains(data.domains || []);
      setPartnersList(data.partners || []);
      setProductsList(data.products || []);
    }
    
    setLoading(false);
  }

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
      let current = prev.filter(p => p !== "*");
      if (current.includes(id)) return current.filter(p => p !== id);
      return [...current, id];
    });
  };

  const toggleEditProduct = (id: string) => {
    setEditProducts((prev) => {
      let current = prev.filter(p => p !== "*");
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

      await callManage({
        action: "register",
        name: registerData.name,
        email: `${registerData.emailPrefix}@${registerData.domain}`,
        role: registerData.role,
        allowed_partners,
        allowed_products
      });

      toast.success("Usuário cadastrado com sucesso!");
      setregisterOpen(false);
      setregisterData({ name: "", emailPrefix: "", domain: "", role: "viewer", partners: [], products: [] });
      load();
    } catch (e: any) {
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
    } catch (e: any) {
      toast.error(e.message || "Erro ao atualizar permissões");
    } finally {
      setIsUpdating(false);
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
    } catch (e: any) { toast.error(e.message || "Erro ao atualizar status"); }
  }

  async function changeRole(u: BackofficeUserRow, newRole: Role) {
    try {
      const payload: any = { action: "set_role", id: u.id, role: newRole };
      if (newRole === "admin" || newRole === "manager") {
        payload.allowed_partners = ["*"];
        payload.allowed_products = ["*"];
      }
      await callManage(payload);
      load();
    } catch (e: any) { toast.error(e.message); }
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
              value={registerData.emailPrefix}
              onChange={(e) => setregisterData({ ...registerData, emailPrefix: e.target.value })}
              className="rounded-none border-border focus-visible:ring-1 focus-visible:ring-foreground focus-visible:border-foreground text-xs"
            />
          </div>
          <div className="space-y-2">
            <Label className="text-foreground text-xs">Domínio</Label>
            <Select
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
        <Button variant="outline" onClick={() => setregisterOpen(false)} className="w-full sm:w-auto h-10 rounded-none border-border text-foreground text-xs hover:bg-primary hover:text-primary-foreground hover:border-primary">Cancelar</Button>
        <Button onClick={handleRegister} disabled={isSaving} className="cta-gradient border-0 w-full sm:w-auto text-white h-10 rounded-none font-medium text-xs">
          {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
          Cadastrar
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
        <Sheet open={registerOpen} onOpenChange={setregisterOpen}>
          <SheetContent side="bottom" className="rounded-none max-h-[85vh] overflow-y-auto p-6 bg-card border-t border-border">
            <SheetHeader className="text-left mb-4">
              <SheetTitle className="text-foreground text-base">Cadastrar novo usuário</SheetTitle>
              <SheetDescription className="text-muted-foreground text-xs">Preencha os dados abaixo para criar o acesso.</SheetDescription>
            </SheetHeader>
            {renderRegisterContent()}
          </SheetContent>
        </Sheet>
      ) : (
        <Dialog open={registerOpen} onOpenChange={setregisterOpen}>
          <DialogContent className="max-w-xl rounded-none sm:rounded-none bg-card border-border">
            <DialogHeader>
              <DialogTitle className="text-foreground text-base">Cadastrar novo usuário</DialogTitle>
              <DialogDescription className="text-muted-foreground text-xs">Preencha os dados abaixo para criar o acesso.</DialogDescription>
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

      <div className="overflow-hidden rounded-none border border-border bg-card shadow-xs">
        <div className="overflow-x-auto w-full pb-2">
          <table className="w-full text-xs">
            <thead className="border-b border-border bg-accent text-left text-muted-foreground uppercase tracking-wider text-[10px]">
              <tr>
                <th className="px-3 py-2.5 font-semibold">Usuário</th>
                <th className="px-3 py-2.5 font-semibold">Cargo</th>
                <th className="px-3 py-2.5 font-semibold">Status</th>
                <th className="px-3 py-2.5 text-right font-semibold">Ações</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => {
                const isMe = backofficeUser?.email?.toLowerCase() === u.email.toLowerCase();
                return (
                  <tr
                    key={u.id}
                    onClick={isAdmin ? () => setHistoryUser(u) : undefined}
                    title={isAdmin ? "Ver histórico do usuário" : undefined}
                    className={`border-b border-border hover:bg-muted transition-colors ${isAdmin ? "cursor-pointer" : ""}`}
                  >
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      <div className="font-medium text-foreground">{u.name}</div>
                      <div className="text-[11px] text-muted-foreground">{u.email}</div>
                    </td>
                    {/* stopPropagation: trocar o cargo não abre o histórico */}
                    <td className="px-3 py-2.5 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
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
                    <td className="px-3 py-2.5 text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                      {isAdmin && (
                        <div className="flex items-center justify-end gap-1">
                          {u.role === "viewer" && (
                            <Button variant="ghost" size="sm" onClick={() => openEditPermissions(u)} className="rounded-none hover:bg-accent text-foreground font-medium text-xs h-8">
                              <GradientIcon icon={Settings2} size={12} className="mr-1" /> Permissões
                            </Button>
                          )}
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
 * @description Painel lateral aberto ao clicar na linha de um usuário (só admin).
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
};
const ROLE_LABEL: Record<string, string> = { admin: "Administrador", manager: "Gestor", viewer: "Visualizador" };

function UserHistoryPanel({
  user, partners, products, onClose,
}: {
  user: BackofficeUserRow | null;
  partners: SelectOption[];
  products: SelectOption[];
  onClose: () => void;
}) {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [panelError, setPanelError] = useState<string | null>(null);

  useEffect(() => {
    setItems([]);
    setPanelError(null);
    if (!user) return;
    setLoading(true);
    supabase
      .rpc("get_backoffice_user_history" as any, { p_user_id: user.id } as any)
      .then(({ data, error }) => {
        if (error) setPanelError(error.message);
        else if ((data as any)?.error) setPanelError("Sem permissão para ver este histórico.");
        else setItems((data as any[]) || []);
      })
      .then(() => setLoading(false), () => setLoading(false));
  }, [user?.id]);

  // ["*"] = todos; ids viram nomes pela lista já carregada na tela.
  const names = (ids: any, list: SelectOption[]) => {
    const arr: string[] = Array.isArray(ids) ? ids.map(String) : [];
    if (arr.includes("*")) return ["Todos"];
    return arr.map((id) => list.find((o) => String(o.id) === id)?.name || `#${id}`);
  };
  const diff = (before: any, after: any, list: SelectOption[]) => {
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
                        Cargo: {ROLE_LABEL[o.role] || o.role || "—"} → <strong>{ROLE_LABEL[n.role] || n.role}</strong>
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
                      <HistoryField label="Cargo" value={ROLE_LABEL[n.role] || n.role} />
                      <HistoryField label="Status" value={n.is_active ? "Ativo" : "Inativo"} />
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
function HistoryField({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col min-w-0">
      <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{label}</span>
      <span className="text-foreground font-medium mt-0.5 break-words">{value || "—"}</span>
    </div>
  );
}
