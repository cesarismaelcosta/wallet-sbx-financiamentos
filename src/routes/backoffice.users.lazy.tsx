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
 * ============================================================================
 */

import { createLazyFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { 
  Loader2, Plus, RefreshCw, ShieldCheck, UserCheck, 
  UserX, Info, Filter, ChevronDown, Settings2 
} from "lucide-react";

import { Button } from "@/components/ui/button";
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
  admin: "bg-neutral-200 text-neutral-900 font-medium",
  manager: "bg-neutral-200 text-neutral-900 font-medium",
  viewer: "bg-neutral-100 text-neutral-600 font-normal",
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
          <Label className="text-neutral-700 text-xs">Nome</Label>
          <Input
            value={registerData.name}
            onChange={(e) => setregisterData({ ...registerData, name: e.target.value })}
            className="rounded-none border-neutral-200 focus-visible:ring-1 focus-visible:ring-neutral-900 focus-visible:border-neutral-900 text-xs"
          />
        </div>
        
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label className="text-neutral-700 text-xs">E-mail (Prefixo)</Label>
            <Input
              value={registerData.emailPrefix}
              onChange={(e) => setregisterData({ ...registerData, emailPrefix: e.target.value })}
              className="rounded-none border-neutral-200 focus-visible:ring-1 focus-visible:ring-neutral-900 focus-visible:border-neutral-900 text-xs"
            />
          </div>
          <div className="space-y-2">
            <Label className="text-neutral-700 text-xs">Domínio</Label>
            <Select
              value={registerData.domain}
              onValueChange={(v) => setregisterData({ ...registerData, domain: v })}
            >
              <SelectTrigger className="rounded-none border-neutral-200 focus:ring-1 focus:ring-neutral-900 text-xs">
                <SelectValue placeholder="Selecione..." />
              </SelectTrigger>
              <SelectContent className="rounded-none border-neutral-200">
                {domains.map((d) => (
                  <SelectItem key={d} value={d} className="rounded-none cursor-pointer text-xs">@{d}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="space-y-2">
          <Label className="text-neutral-700 text-xs">Cargo</Label>
          <Select
            value={registerData.role}
            onValueChange={(v: Role) => setregisterData({ ...registerData, role: v })}
          >
            <SelectTrigger className="rounded-none border-neutral-200 focus:ring-1 focus:ring-neutral-900 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="rounded-none border-neutral-200">
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
              <Label className="text-neutral-700 text-xs">Parceiros Permitidos</Label>
              <Popover modal={true}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-10 w-full rounded-none gap-2 bg-white hover:bg-neutral-50 border-neutral-200 transition-colors text-neutral-900 justify-between font-normal shadow-xs text-xs"
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
                <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0 rounded-none border-neutral-200 shadow-xs" align="start">
                  <Command className="bg-white">
                    <CommandList 
                      className="max-h-56 overflow-y-auto overscroll-contain text-xs"
                      onWheelCapture={(e) => e.stopPropagation()}
                    >
                      <CommandGroup>
                        <CommandItem onSelect={() => setregisterData({ ...registerData, partners: ["*"] })} className="cursor-pointer font-medium text-neutral-900 rounded-none hover:bg-neutral-100">
                          <div className={`mr-2 flex h-4 w-4 items-center justify-center rounded-none border border-neutral-400 ${registerData.partners.includes("*") ? "bg-neutral-900 text-white border-neutral-900" : "opacity-50"}`}>
                            {registerData.partners.includes("*") && "✓"}
                          </div>
                          Todos (Acesso Total)
                        </CommandItem>
                        <CommandItem onSelect={() => setregisterData({ ...registerData, partners: [] })} className="cursor-pointer font-medium text-rose-600 rounded-none hover:bg-neutral-100">
                          <div className={`mr-2 flex h-4 w-4 items-center justify-center rounded-none border border-neutral-400 ${registerData.partners.length === 0 ? "bg-rose-600 text-white border-rose-600" : "opacity-50"}`}>
                            {registerData.partners.length === 0 && "✓"}
                          </div>
                          Nenhum (Bloqueado)
                        </CommandItem>
                        <div className="h-px bg-neutral-200 my-1" />
                        {partnersList.map((p) => {
                          const isSelected = registerData.partners.includes(String(p.id));
                          return (
                            <CommandItem key={p.id} onSelect={() => togglePartner(String(p.id))} className={`cursor-pointer rounded-none text-neutral-900 hover:bg-neutral-100 ${isSelected ? "bg-neutral-50 font-medium" : ""}`}>
                              <div className={`mr-2 flex h-4 w-4 items-center justify-center rounded-none border border-neutral-400 ${isSelected ? "bg-neutral-900 text-white border-neutral-900" : "opacity-50"}`}>
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
              <Label className="text-neutral-700 text-xs">Produtos Permitidos</Label>
              <Popover modal={true}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-10 w-full rounded-none gap-2 bg-white hover:bg-neutral-50 border-neutral-200 transition-colors text-neutral-900 justify-between font-normal shadow-xs text-xs"
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
                <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0 rounded-none border-neutral-200 shadow-xs" align="start">
                  <Command className="bg-white">
                    <CommandList 
                      className="max-h-56 overflow-y-auto overscroll-contain text-xs"
                      onWheelCapture={(e) => e.stopPropagation()}
                    >
                      <CommandGroup>
                        <CommandItem onSelect={() => setregisterData({ ...registerData, products: ["*"] })} className="cursor-pointer font-medium text-neutral-900 rounded-none hover:bg-neutral-100">
                          <div className={`mr-2 flex h-4 w-4 items-center justify-center rounded-none border border-neutral-400 ${registerData.products.includes("*") ? "bg-neutral-900 text-white border-neutral-900" : "opacity-50"}`}>
                            {registerData.products.includes("*") && "✓"}
                          </div>
                          Todos (Acesso Total)
                        </CommandItem>
                        <CommandItem onSelect={() => setregisterData({ ...registerData, products: [] })} className="cursor-pointer font-medium text-rose-600 rounded-none hover:bg-neutral-100">
                          <div className={`mr-2 flex h-4 w-4 items-center justify-center rounded-none border border-neutral-400 ${registerData.products.length === 0 ? "bg-rose-600 text-white border-rose-600" : "opacity-50"}`}>
                            {registerData.products.length === 0 && "✓"}
                          </div>
                          Nenhum (Bloqueado)
                        </CommandItem>
                        <div className="h-px bg-neutral-200 my-1" />
                        {productsList.map((p) => {
                          const isSelected = registerData.products.includes(String(p.id));
                          return (
                            <CommandItem key={p.id} onSelect={() => toggleProduct(String(p.id))} className={`cursor-pointer rounded-none text-neutral-900 hover:bg-neutral-100 ${isSelected ? "bg-neutral-50 font-medium" : ""}`}>
                              <div className={`mr-2 flex h-4 w-4 items-center justify-center rounded-none border border-neutral-400 ${isSelected ? "bg-neutral-900 text-white border-neutral-900" : "opacity-50"}`}>
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
          <div className="flex items-start gap-2 rounded-none border border-neutral-300 bg-neutral-50 p-3 text-xs text-neutral-700 animate-in fade-in duration-300">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-neutral-400" />
            <p>Usuários com perfil de <strong className="font-medium text-neutral-900">{registerData.role === "admin" ? "Administrador" : "Gerente"}</strong> possuem acesso irrestrito a todos os parceiros e produtos.</p>
          </div>
        )}
      </div>

      <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 mt-6">
        <Button variant="outline" onClick={() => setregisterOpen(false)} className="w-full sm:w-auto h-10 rounded-none border-neutral-200 hover:bg-neutral-100 text-neutral-900 text-xs">Cancelar</Button>
        <Button onClick={handleRegister} disabled={isSaving} className="w-full sm:w-auto bg-neutral-900 hover:bg-neutral-800 text-white h-10 rounded-none shadow-xs font-medium text-xs">
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
          <Label className="text-neutral-700 text-xs">Parceiros Permitidos</Label>
          <Popover modal={true}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="h-10 w-full rounded-none gap-2 bg-white hover:bg-neutral-50 border-neutral-200 transition-colors text-neutral-900 justify-between font-normal shadow-xs text-xs"
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
            <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0 rounded-none border-neutral-200 shadow-xs" align="start">
              <Command className="bg-white">
                <CommandList 
                  className="max-h-56 overflow-y-auto overscroll-contain text-xs"
                  onWheelCapture={(e) => e.stopPropagation()}
                >
                  <CommandGroup>
                    <CommandItem onSelect={() => setEditPartners(["*"])} className="cursor-pointer font-medium text-neutral-900 rounded-none hover:bg-neutral-100">
                      <div className={`mr-2 flex h-4 w-4 items-center justify-center rounded-none border border-neutral-400 ${editPartners.includes("*") ? "bg-neutral-900 text-white border-neutral-900" : "opacity-50"}`}>
                        {editPartners.includes("*") && "✓"}
                      </div>
                      Todos (Acesso Total)
                    </CommandItem>
                    <CommandItem onSelect={() => setEditPartners([])} className="cursor-pointer font-medium text-rose-600 rounded-none hover:bg-neutral-100">
                      <div className={`mr-2 flex h-4 w-4 items-center justify-center rounded-none border border-neutral-400 ${editPartners.length === 0 ? "bg-rose-600 text-white border-rose-600" : "opacity-50"}`}>
                        {editPartners.length === 0 && "✓"}
                      </div>
                      Nenhum (Bloqueado)
                    </CommandItem>
                    <div className="h-px bg-neutral-200 my-1" />
                    {partnersList.map((p) => {
                      const isSelected = editPartners.includes(String(p.id));
                      return (
                        <CommandItem key={p.id} onSelect={() => toggleEditPartner(String(p.id))} className={`cursor-pointer rounded-none text-neutral-900 hover:bg-neutral-100 ${isSelected ? "bg-neutral-50 font-medium" : ""}`}>
                          <div className={`mr-2 flex h-4 w-4 items-center justify-center rounded-none border border-neutral-400 ${isSelected ? "bg-neutral-900 text-white border-neutral-900" : "opacity-50"}`}>
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
          <Label className="text-neutral-700 text-xs">Produtos Permitidos</Label>
          <Popover modal={true}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="h-10 w-full rounded-none gap-2 bg-white hover:bg-neutral-50 border-neutral-200 transition-colors text-neutral-900 justify-between font-normal shadow-xs text-xs"
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
            <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0 rounded-none border-neutral-200 shadow-xs" align="start">
              <Command className="bg-white">
                <CommandList 
                  className="max-h-56 overflow-y-auto overscroll-contain text-xs"
                  onWheelCapture={(e) => e.stopPropagation()}
                >
                  <CommandGroup>
                    <CommandItem onSelect={() => setEditProducts(["*"])} className="cursor-pointer font-medium text-neutral-900 rounded-none hover:bg-neutral-100">
                      <div className={`mr-2 flex h-4 w-4 items-center justify-center rounded-none border border-neutral-400 ${editProducts.includes("*") ? "bg-neutral-900 text-white border-neutral-900" : "opacity-50"}`}>
                        {editProducts.includes("*") && "✓"}
                      </div>
                      Todos (Acesso Total)
                    </CommandItem>
                    <CommandItem onSelect={() => setEditProducts([])} className="cursor-pointer font-medium text-rose-600 rounded-none hover:bg-neutral-100">
                      <div className={`mr-2 flex h-4 w-4 items-center justify-center rounded-none border border-neutral-400 ${editProducts.length === 0 ? "bg-rose-600 text-white border-rose-600" : "opacity-50"}`}>
                        {editProducts.length === 0 && "✓"}
                      </div>
                      Nenhum (Bloqueado)
                    </CommandItem>
                    <div className="h-px bg-neutral-200 my-1" />
                    {productsList.map((p) => {
                      const isSelected = editProducts.includes(String(p.id));
                      return (
                        <CommandItem key={p.id} onSelect={() => toggleEditProduct(String(p.id))} className={`cursor-pointer rounded-none text-neutral-900 hover:bg-neutral-100 ${isSelected ? "bg-neutral-50 font-medium" : ""}`}>
                          <div className={`mr-2 flex h-4 w-4 items-center justify-center rounded-none border border-neutral-400 ${isSelected ? "bg-neutral-900 text-white border-neutral-900" : "opacity-50"}`}>
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
        <Button variant="outline" onClick={() => setEditOpen(false)} className="w-full sm:w-auto h-10 rounded-none border-neutral-200 text-neutral-900 hover:bg-neutral-100 text-xs">Cancelar</Button>
        <Button onClick={handleUpdatePermissions} disabled={isUpdating} className="w-full sm:w-auto bg-neutral-900 hover:bg-neutral-800 text-white font-medium h-10 rounded-none shadow-xs text-xs">
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
          <h1 className="text-2xl font-bold tracking-tight text-neutral-950">Usuários do backoffice</h1>
        </div>

        <div className="flex items-center gap-2">
          {isAdmin && (
            <Button size="sm" onClick={() => setregisterOpen(true)} className="rounded-none bg-neutral-900 hover:bg-neutral-800 text-white shadow-xs text-xs">
              <Plus className="mr-2 h-4 w-4" /> Cadastrar Usuário
            </Button>
          )}

          <Button variant="outline" size="sm" onClick={load} disabled={loading} className="rounded-none border-neutral-200 text-neutral-900 hover:bg-neutral-100 shadow-xs text-xs">
            <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Atualizar
          </Button>
        </div>
      </div>

      {isMobile ? (
        <Sheet open={registerOpen} onOpenChange={setregisterOpen}>
          <SheetContent side="bottom" className="rounded-none max-h-[85vh] overflow-y-auto p-6 bg-white border-t border-neutral-200">
            <SheetHeader className="text-left mb-4">
              <SheetTitle className="text-neutral-900 text-base">Cadastrar novo usuário</SheetTitle>
              <SheetDescription className="text-neutral-500 text-xs">Preencha os dados abaixo para criar o acesso.</SheetDescription>
            </SheetHeader>
            {renderRegisterContent()}
          </SheetContent>
        </Sheet>
      ) : (
        <Dialog open={registerOpen} onOpenChange={setregisterOpen}>
          <DialogContent className="max-w-xl rounded-none sm:rounded-none bg-white border-neutral-200">
            <DialogHeader>
              <DialogTitle className="text-neutral-900 text-base">Cadastrar novo usuário</DialogTitle>
              <DialogDescription className="text-neutral-500 text-xs">Preencha os dados abaixo para criar o acesso.</DialogDescription>
            </DialogHeader>
            {renderRegisterContent()}
          </DialogContent>
        </Dialog>
      )}

      {isMobile ? (
        <Sheet open={editOpen} onOpenChange={setEditOpen}>
          <SheetContent side="bottom" className="rounded-none max-h-[85vh] overflow-y-auto p-6 bg-white border-t border-neutral-200">
            <SheetHeader className="text-left mb-4">
              <SheetTitle className="text-neutral-900 text-base">Editar Permissões</SheetTitle>
              <SheetDescription className="text-neutral-500 text-xs">
                Ajuste os acessos de parceiros e produtos para <strong className="font-medium text-neutral-700">{editingUser?.name}</strong>.
              </SheetDescription>
            </SheetHeader>
            {renderEditContent()}
          </SheetContent>
        </Sheet>
      ) : (
        <Dialog open={editOpen} onOpenChange={setEditOpen}>
          <DialogContent className="max-w-md rounded-none sm:rounded-none bg-white border-neutral-200">
            <DialogHeader>
              <DialogTitle className="text-neutral-900 text-base">Editar Permissões</DialogTitle>
              <DialogDescription className="text-neutral-500 text-xs">
                Ajuste os acessos de parceiros e produtos para <strong className="font-medium text-neutral-700">{editingUser?.name}</strong>.
              </DialogDescription>
            </DialogHeader>
            {renderEditContent()}
          </DialogContent>
        </Dialog>
      )}

      <div className="overflow-hidden rounded-none border border-neutral-200 bg-white shadow-xs">
        <div className="overflow-x-auto w-full pb-2">
          <table className="w-full text-xs">
            <thead className="border-b border-neutral-200 bg-neutral-100 text-left text-neutral-600 uppercase tracking-wider text-[10px]">
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
                  <tr key={u.id} className="border-b border-neutral-100 hover:bg-neutral-50 transition-colors">
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      <div className="font-medium text-neutral-900">{u.name}</div>
                      <div className="text-[11px] text-neutral-400">{u.email}</div>
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      <Select value={u.role} onValueChange={(v: Role) => changeRole(u, v)} disabled={!isAdmin || isMe}>
                        <SelectTrigger className={`h-7 w-36 text-[10px] uppercase tracking-wider rounded-none border-none focus:ring-0 shadow-none ${ROLE_BADGE[u.role]}`}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="rounded-none border-neutral-200 text-xs">
                          <SelectItem value="admin" className="rounded-none cursor-pointer text-xs">Administrador</SelectItem>
                          <SelectItem value="manager" className="rounded-none cursor-pointer text-xs">Gerente</SelectItem>
                          <SelectItem value="viewer" className="rounded-none cursor-pointer text-xs">Visualizador</SelectItem>
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      <span
                        className={`inline-flex items-center gap-1 rounded-none px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${u.is_active ? "bg-emerald-500/10 text-emerald-600" : "bg-rose-500/10 text-rose-600"}`}
                      >
                        {u.is_active ? <ShieldCheck className="h-3 w-3" /> : <UserX className="h-3 w-3" />}
                        {u.is_active ? "Ativo" : "Inativo"}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-right whitespace-nowrap">
                      {isAdmin && (
                        <div className="flex items-center justify-end gap-1">
                          {u.role === "viewer" && (
                            <Button variant="ghost" size="sm" onClick={() => openEditPermissions(u)} className="rounded-none hover:bg-neutral-100 text-neutral-900 font-medium text-xs h-8">
                              <Settings2 className="mr-1 h-3 w-3 text-neutral-500" /> Permissões
                            </Button>
                          )}
                          <Button variant="ghost" size="sm" onClick={() => toggleActive(u)} disabled={isMe} className="rounded-none hover:bg-neutral-100 text-neutral-900 font-medium text-xs h-8">
                            {u.is_active ? (
                              <><UserX className="mr-1 h-3 w-3 text-rose-500" /> Desativar</>
                            ) : (
                              <><UserCheck className="mr-1 h-3 w-3 text-emerald-500" /> Ativar</>
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
    </div>
  );
}