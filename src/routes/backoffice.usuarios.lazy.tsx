import { createLazyFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Loader2, Plus, RefreshCw, ShieldCheck, UserCheck, UserX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/integrations/auth/AuthContext";

/**
 * Rota: /backoffice/usuarios
 * Responsabilidade: Gerenciamento administrativo de usuários do backoffice (RBAC).
 */
export const Route = createLazyFileRoute("/backoffice/usuarios")({ component: UsuariosPage });

type Role = "admin" | "manager" | "viewer";
type BackofficeUserRow = {
  id: string;
  email: string;
  name: string;
  role: Role;
  is_active: boolean;
  created_at: string;
  updated_at?: string;
};

// Mapeamento de estilos para badges de cada cargo
const ROLE_BADGE: Record<Role, string> = {
  admin: "bg-primary/10 text-primary",
  manager: "bg-blue-500/10 text-blue-600",
  viewer: "bg-muted text-muted-foreground",
};

/**
 * Função utilitária para invocar a Edge Function 'manage-backoffice-users'.
 * Usa Service Role para contornar restrições de RLS (Row Level Security).
 */
async function callManage(payload: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke("manage-backoffice-users", { body: payload });
  if (error) throw new Error(error.message);
  return data;
}

function UsuariosPage() {
  const { backofficeUser } = useAuth();
  const [users, setUsers] = useState<BackofficeUserRow[]>([]);
  const [domains, setDomains] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [registerOpen, setregisterOpen] = useState(false);
  const [registerData, setregisterData] = useState({ name: "", emailPrefix: "", domain: "", role: "viewer" as Role });

  // Define se o usuário autenticado possui privilégio de admin
  const isAdmin = backofficeUser?.role === "admin";

  /**
   * Carrega dados iniciais: Lista de usuários e domínios permitidos.
   * As queries abaixo são filtradas e protegidas pelo RLS no banco.
   */
  async function load() {
    setLoading(true);
    const { data: userData } = await supabase
      .from("backoffice_users")
      .select("*")
      .order("created_at", { ascending: false });
    const { data: domainData, error: domainError } = await supabase
      .from("allowed_email_domains")
      .select("domain")
      .eq("is_active", true);

    if (userData) setUsers(userData as BackofficeUserRow[]);
    if (domainError) {
      console.error("Erro ao carregar domínios:", domainError);
      toast.error("Não foi possível carregar os domínios permitidos.");
    }
    if (domainData) setDomains(domainData.map((d) => d.domain));
    setLoading(false);
  }

  /**
   * Executa a operação de cadastro de novo usuário.
   * Utiliza a Edge Function para criar o usuário e atribuir permissões.
   */
  async function handleRegister() {
    // --- MODIFIED: Renomeado de handleregister para refletir semântica
    if (registerData.emailPrefix.includes("@")) {
      toast.error("O prefixo não deve conter o caractere @.");
      return;
    }
    if (!registerData.name || !registerData.emailPrefix || !registerData.domain) {
      toast.error("Preencha todos os campos.");
      return;
    }

    setIsSaving(true);
    try {
      await callManage({
        action: "register",
        name: registerData.name,
        email: `${registerData.emailPrefix}@${registerData.domain}`,
        role: registerData.role,
      });
      toast.success("Usuário cadastrado com sucesso!");
      setregisterOpen(false);
      setregisterData({ name: "", emailPrefix: "", domain: "", role: "viewer" });
      load();
    } catch (e: any) {
      toast.error(e.message || "Erro ao cadastrar usuário");
    } finally {
      setIsSaving(false);
    }
  }

  /**
   * Ativa ou desativa um usuário específico.
   * Impede a auto-desativação.
   */
  async function toggleActive(u: BackofficeUserRow) {
    console.log("-> Botão Desativar clicado para:", u.email);
    
    if (backofficeUser?.email?.toLowerCase() === u.email.toLowerCase()) {
      toast.error("Você não pode desativar seu próprio usuário.");
      return;
    }

    const payload = { action: "set_active", id: u.id, is_active: !u.is_active };
    console.log("-> Payload sendo enviado:", payload);

    try {
      const response = await callManage(payload);
      console.log("-> Resposta da Edge Function:", response);
      
      toast.success(`Usuário ${!u.is_active ? 'ativado' : 'desativado'} com sucesso.`);
      load();
    } catch (e: any) { 
      console.error("-> Erro na Edge Function:", e);
      toast.error(e.message || "Erro ao atualizar status"); 
    }
  }

  /**
   * Atualiza a role de um usuário via Edge Function.
   */
  async function changeRole(u: BackofficeUserRow, newRole: Role) {
    try {
      await callManage({ action: "set_role", id: u.id, role: newRole });
      load();
    } catch (e: any) {
      toast.error(e.message);
    }
  }

  // Carregamento inicial de dados
  useEffect(() => {
    load();
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Usuários do backoffice</h1>
        </div>

        <div className="flex items-center gap-2">
          {/* --- MODIFIED: Acesso condicional para o novo botão de "Cadastrar" --- */}
          {isAdmin && (
            <Dialog open={registerOpen} onOpenChange={setregisterOpen}>
              <DialogTrigger asChild>
                <Button size="sm">
                  {/* --- MODIFIED: Texto alterado de 'Convidar' para 'Cadastrar' --- */}
                  <Plus className="mr-2 h-4 w-4" /> Cadastrar Usuário
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  {/* --- MODIFIED: Título alterado --- */}
                  <DialogTitle>Cadastrar novo usuário</DialogTitle>
                  {/* --- MODIFIED: Descrição alterada --- */}
                  <DialogDescription>Preencha os dados abaixo para criar o acesso.</DialogDescription>
                </DialogHeader>

                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label>Nome</Label>
                    <Input
                      value={registerData.name}
                      onChange={(e) => setregisterData({ ...registerData, name: e.target.value })}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>E-mail (Prefixo)</Label>
                      <Input
                        value={registerData.emailPrefix}
                        onChange={(e) => setregisterData({ ...registerData, emailPrefix: e.target.value })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Domínio</Label>
                      <Select
                        value={registerData.domain}
                        onValueChange={(v) => setregisterData({ ...registerData, domain: v })}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione..." />
                        </SelectTrigger>
                        <SelectContent>
                          {domains.map((d) => (
                            <SelectItem key={d} value={d}>
                              @{d}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Cargo</Label>
                    <Select
                      value={registerData.role}
                      onValueChange={(v: Role) => setregisterData({ ...registerData, role: v })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="admin">Administrador</SelectItem>
                        <SelectItem value="manager">Gerente</SelectItem>
                        <SelectItem value="viewer">Visualizador</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <DialogFooter>
                  <Button variant="outline" onClick={() => setregisterOpen(false)}>
                    Cancelar
                  </Button>
                  {/* --- MODIFIED: Botão principal renomeado para Cadastrar --- */}
                  <Button onClick={handleRegister} disabled={isSaving}>
                    {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
                    Cadastrar
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}

          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Atualizar
          </Button>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-border bg-card">
        <table className="w-full text-sm">
          <tbody>
            {users.map((u) => {
              const isMe = backofficeUser?.email?.toLowerCase() === u.email.toLowerCase();
              return (
                <tr key={u.id} className="border-b border-border/60 hover:bg-accent/40">
                  <td className="px-3 py-2">
                    <div className="font-semibold">{u.name}</div>
                    <div className="text-xs text-muted-foreground">{u.email}</div>
                  </td>
                  <td className="px-3 py-2">
                    <Select value={u.role} onValueChange={(v: Role) => changeRole(u, v)} disabled={!isAdmin || isMe}>
                      <SelectTrigger className={`h-7 w-40 text-xs ${ROLE_BADGE[u.role]}`}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="admin">Administrador</SelectItem>
                        <SelectItem value="manager">Gerente</SelectItem>
                        <SelectItem value="viewer">Visualizador</SelectItem>
                      </SelectContent>
                    </Select>
                  </td>
                  <td className="px-3 py-2">
                    <span
                      className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-semibold ${u.is_active ? "bg-emerald-500/10 text-emerald-600" : "bg-destructive/10 text-destructive"}`}
                    >
                      {u.is_active ? <ShieldCheck className="h-3 w-3" /> : <UserX className="h-3 w-3" />}
                      {u.is_active ? "Ativo" : "Inativo"}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right">
                    {isAdmin && (
                      <Button variant="ghost" size="sm" onClick={() => toggleActive(u)} disabled={isMe}>
                        {u.is_active ? (
                          <>
                            <UserX className="mr-1 h-3 w-3" /> Desativar
                          </>
                        ) : (
                          <>
                            <UserCheck className="mr-1 h-3 w-3" /> Ativar
                          </>
                        )}
                      </Button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
