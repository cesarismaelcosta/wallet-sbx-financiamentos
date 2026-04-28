import { createFileRoute } from "@tanstack/react-router";
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
  DialogTrigger 
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/integrations/auth/AuthContext";

export const Route = createFileRoute("/backoffice/usuarios")({ component: UsuariosPage });

type Role = "admin" | "user";
type BackofficeUserRow = { 
  id: string; 
  email: string; 
  name: string; 
  role: Role; 
  is_active: boolean; 
  created_at: string; 
  updated_at?: string; 
};

const ROLE_BADGE: Record<Role, string> = { 
  admin: "bg-primary/10 text-primary", 
  user: "bg-muted text-muted-foreground" 
};

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
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteData, setInviteData] = useState({ name: "", emailPrefix: "", domain: "", role: "user" as Role });

  const isAdmin = backofficeUser?.role === 'admin';

  async function load() {
    setLoading(true);
    const { data: userData } = await supabase.from("backoffice_users").select("*").order("created_at", { ascending: false });
    const { data: domainData, error: domainError } = await supabase.from("oauth_config").select("domain").eq("is_active", true);
    
    if (userData) setUsers(userData as BackofficeUserRow[]);
    if (domainError) {
      console.error("Erro ao carregar domínios:", domainError);
      toast.error("Não foi possível carregar os domínios permitidos.");
    }
    if (domainData) setDomains(domainData.map(d => d.domain));
    setLoading(false);
  }

  async function handleInvite() {
    if (inviteData.emailPrefix.includes('@')) {
      toast.error("O prefixo não deve conter o caractere @.");
      return;
    }
    if (!inviteData.name || !inviteData.emailPrefix || !inviteData.domain) {
      toast.error("Preencha todos os campos.");
      return;
    }

    setIsSaving(true);
    try {
      await callManage({ 
        action: "invite", 
        name: inviteData.name, 
        email: `${inviteData.emailPrefix}@${inviteData.domain}`, 
        role: inviteData.role 
      });
      toast.success("Usuário cadastrado com sucesso!");
      setInviteOpen(false);
      setInviteData({ name: "", emailPrefix: "", domain: "", role: "user" });
      load();
    } catch (e: any) { toast.error(e.message || "Erro ao cadastrar usuário"); }
    finally { setIsSaving(false); }
  }

  async function toggleActive(u: BackofficeUserRow) {
    if (backofficeUser?.email?.toLowerCase() === u.email.toLowerCase()) {
      toast.error("Você não pode desativar seu próprio usuário.");
      return;
    }
    try {
      await callManage({ action: "set_active", id: u.id, isactive: !u.is_active });
      toast.success(`Usuário ${!u.is_active ? 'ativado' : 'desativado'} com sucesso.`);
      load();
    } catch (e: any) { toast.error(e.message || "Erro ao atualizar status"); }
  }

  async function changeRole(u: BackofficeUserRow, newRole: Role) {
    try {
      await callManage({ action: "set_role", id: u.id, role: newRole });
      load();
    } catch (e: any) { toast.error(e.message); }
  }

  useEffect(() => { load(); }, []);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Usuários do backoffice</h1>
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={loading}>
          <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Atualizar
        </Button>
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
                        <SelectItem value="user">Usuário</SelectItem>
                      </SelectContent>
                    </Select>
                  </td>
                  <td className="px-3 py-2">
                    <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-semibold ${u.is_active ? "bg-emerald-500/10 text-emerald-600" : "bg-destructive/10 text-destructive"}`}>
                      {u.is_active ? <ShieldCheck className="h-3 w-3" /> : <UserX className="h-3 w-3" />}
                      {u.is_active ? "Ativo" : "Inativo"}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right">
                    {isAdmin && (
                      <Button variant="ghost" size="sm" onClick={() => toggleActive(u)} disabled={isMe}>
                        {u.is_active ? <><UserX className="mr-1 h-3 w-3" /> Desativar</> : <><UserCheck className="mr-1 h-3 w-3" /> Ativar</>}
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