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
type BackofficeUserRow = { id: string; email: string; name: string; role: Role; is_active: boolean; created_at: string; };

<<<<<<< Updated upstream
type BackofficeUserRow = {
  id: string;
  email: string;
  name: string;
  role: Role;
  is_active: boolean;
  created_at: string;
  updated_at?: string;
};

const ROLE_LABEL: Record<Role, string> = {
  admin: "Administrador",
  manager: "Gestor",
  viewer: "Visualizador",
};

const ROLE_BADGE: Record<Role, string> = {
  admin: "bg-primary/10 text-primary",
  manager: "bg-amber-500/10 text-amber-600",
  viewer: "bg-muted text-muted-foreground",
};

async function callManage(payload: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke(
    "manage-backoffice-users",
    { body: payload },
  );
  if (error) {
    const body = (error as { context?: { error?: string } })?.context?.error;
    throw new Error(body ?? error.message ?? "Erro inesperado");
  }
=======
const ROLE_BADGE: Record<Role, string> = { admin: "bg-primary/10 text-primary", user: "bg-muted text-muted-foreground" };

async function callManage(payload: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke("manage-backoffice-users", { body: payload });
  if (error) throw new Error(error.message);
>>>>>>> Stashed changes
  return data;
}

function UsuariosPage() {
  const { backofficeUser } = useAuth();
  const [users, setUsers] = useState<BackofficeUserRow[]>([]);
  const [domains, setDomains] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
<<<<<<< Updated upstream
  const [error, setError] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);

=======
  const [isSaving, setIsSaving] = useState(false); // [ALTERAÇÃO 1: Estado de loading]
>>>>>>> Stashed changes
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteData, setInviteData] = useState({ name: "", emailPrefix: "", domain: "", role: "user" as Role });

  const isAdmin = backofficeUser?.role === 'admin';

  async function load() {
    setLoading(true);
<<<<<<< Updated upstream
    setError(null);
    try {
      const data = await callManage({ action: "list" });
      setUsers(((data as { users: BackofficeUserRow[] }).users ?? []) as BackofficeUserRow[]);
      setIsAdmin(true);
    } catch (e) {
      const msg = (e as Error).message;
      if (msg === "forbidden") {
        setIsAdmin(false);
        const { data, error: selErr } = await (supabase as any)
          .from("backoffice_users")
          .select("id, email, name, role, is_active, created_at, updated_at")
          .order("created_at", { ascending: false });
        if (selErr) {
          setError(selErr.message);
        } else {
          setUsers((data ?? []) as BackofficeUserRow[]);
        }
      } else {
        setError(msg);
      }
    } finally {
      setLoading(false);
=======
    const { data: userData } = await supabase.from("backoffice_users").select("*").order("created_at", { ascending: false });
    const { data: domainData, error: domainError } = await supabase.from("oauth_config").select("domain").eq("is_active", true);
    
    if (userData) setUsers(userData as BackofficeUserRow[]);
    if (domainError) {
      console.error("Erro ao carregar domínios (verifique RLS):", domainError);
      toast.error("Não foi possível carregar os domínios permitidos.");
>>>>>>> Stashed changes
    }
    if (domainData) setDomains(domainData.map(d => d.domain));
    setLoading(false);
  }

  async function handleInvite() {
    // [ALTERAÇÃO 2: Bloqueio de e-mail mal formatado]
    if (inviteData.emailPrefix.includes('@')) {
      toast.error("O prefixo não deve conter o caractere @.");
      return;
    }
    if (!inviteData.name || !inviteData.emailPrefix || !inviteData.domain) {
      toast.error("Preencha todos os campos.");
      return;
    }

    setIsSaving(true); // [ALTERAÇÃO 1: Ativa loading]
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
    finally { setIsSaving(false); } // [ALTERAÇÃO 1: Desativa loading]
  }

  async function toggleActive(u: BackofficeUserRow) {
<<<<<<< Updated upstream
    try {
      await callManage({
        action: "set_active",
        id: u.id,
        is_active: !u.is_active,
      });
      toast.success(
        u.is_active ? `${u.name} foi desativado.` : `${u.name} foi reativado.`,
      );
      await load();
    } catch (e) {
      toast.error(`Erro: ${(e as Error).message}`);
=======
    if (backofficeUser?.email?.toLowerCase() === u.email.toLowerCase()) {
      toast.error("Você não pode desativar seu próprio usuário.");
      return;
>>>>>>> Stashed changes
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
          <p className="text-sm text-muted-foreground">Quem pode acessar a área interna da Wallet sbX.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="rounded-xl" onClick={load} disabled={loading}>
            <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Atualizar
          </Button>
          {isAdmin && (
            <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
              <DialogTrigger asChild>
                <Button size="sm" className="rounded-xl"><Plus className="mr-2 h-4 w-4" /> Cadastrar usuário</Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-md">
                <DialogHeader>
                  <DialogTitle>Cadastrar usuário do backoffice</DialogTitle>
                  <DialogDescription>
                    Preencha os dados abaixo para convidar um novo membro para o sistema.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 pt-2">
                  <Label>Nome</Label>
                  <Input value={inviteData.name} onChange={e => setInviteData({...inviteData, name: e.target.value})} />
                  
                  <Label>E-mail</Label>
                  <div className="flex gap-2">
                    {/* [ALTERAÇÃO 2: replace('@', '') força que não tenha o arroba no prefixo] */}
                    <Input className="flex-1" placeholder="usuario" value={inviteData.emailPrefix} onChange={e => setInviteData({...inviteData, emailPrefix: e.target.value.replace('@', '')})} />
                    <div className="w-[180px]">
                      <Select value={inviteData.domain} onValueChange={(v) => setInviteData({...inviteData, domain: v})}>
                        <SelectTrigger><SelectValue placeholder="Domínio" /></SelectTrigger>
                        <SelectContent>
                          {domains.map(d => <SelectItem key={d} value={d}>@{d}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <Label>Papel</Label>
                  <Select value={inviteData.role} onValueChange={(v: Role) => setInviteData({...inviteData, role: v})}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="admin">Administrador</SelectItem>
                      <SelectItem value="user">Usuário</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {/* [ALTERAÇÃO 1: Botão com estado de carregamento] */}
                <DialogFooter>
                  <Button onClick={handleInvite} disabled={isSaving}>
                    {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Confirmar cadastro
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-border bg-card">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/40 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              <th className="px-3 py-2">Usuário</th>
              <th className="px-3 py-2">Papel</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Adicionado em</th>
              <th className="w-32 px-3 py-2 text-right">Ações</th>
            </tr>
          </thead>
          <tbody>
<<<<<<< Updated upstream
            {loading ? (
              <tr>
                <td colSpan={5} className="px-4 py-12 text-center text-muted-foreground">
                  <Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin" />
                  Carregando usuários…
                </td>
              </tr>
            ) : users.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-12 text-center text-muted-foreground">
                  Nenhum usuário cadastrado.
                </td>
              </tr>
            ) : (
              users.map((u) => {
                const isMe =
                  backofficeUser?.email?.toLowerCase() === u.email.toLowerCase();
                const initials = u.name
                  .split(" ")
                  .map((p) => p[0])
                  .filter(Boolean)
                  .slice(0, 2)
                  .join("")
                  .toUpperCase();
                return (
                  <tr
                    key={u.id}
                    className="border-b border-border/60 transition-colors last:border-0 hover:bg-accent/40"
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[image:var(--gradient-primary)] text-xs font-bold text-primary-foreground">
                          {initials || "?"}
                        </div>
                        <div className="leading-tight">
                          <div className="font-semibold">
                            {u.name}
                            {isMe && (
                              <span className="ml-2 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold uppercase text-primary">
                                você
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {u.email}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {isAdmin && !isMe ? (
                        <Select
                          value={u.role}
                          onValueChange={(v) => changeRole(u, v as Role)}
                        >
                          <SelectTrigger
                            className={`h-8 w-36 rounded-lg border-0 ${ROLE_BADGE[u.role]}`}
                          >
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="viewer">Visualizador</SelectItem>
                            <SelectItem value="manager">Gestor</SelectItem>
                            <SelectItem value="admin">Administrador</SelectItem>
                          </SelectContent>
                        </Select>
                      ) : (
                        <span
                          className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold ${ROLE_BADGE[u.role]}`}
                        >
                          {ROLE_LABEL[u.role]}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {u.is_active ? (
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-success/15 px-2.5 py-1 text-[11px] font-semibold text-success">
                          <ShieldCheck className="h-3 w-3" />
                          Ativo
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-[11px] font-semibold text-muted-foreground">
                          <UserX className="h-3 w-3" />
                          Inativo
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {new Date(u.created_at).toLocaleDateString("pt-BR")}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {isAdmin && !isMe && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => toggleActive(u)}
                          className="rounded-lg"
                        >
                          {u.is_active ? (
                            <>
                              <UserX className="mr-1.5 h-3.5 w-3.5" /> Desativar
                            </>
                          ) : (
                            <>
                              <UserCheck className="mr-1.5 h-3.5 w-3.5" /> Ativar
                            </>
                          )}
                        </Button>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
=======
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
                  <td className="px-3 py-2 text-muted-foreground">{new Date(u.created_at).toLocaleDateString("pt-BR")}</td>
                  <td className="px-3 py-2 text-right">
                    {isAdmin && (
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        className="h-7 text-xs px-2"
                        onClick={() => toggleActive(u)}
                        disabled={isMe}
                      >
                        {u.is_active ? (
                          <><UserX className="mr-1 h-3 w-3" /> Desativar</>
                        ) : (
                          <><UserCheck className="mr-1 h-3 w-3" /> Ativar</>
                        )}
                      </Button>
                    )}
                  </td>
                </tr>
              );
            })}
>>>>>>> Stashed changes
          </tbody>
        </table>
      </div>
    </div>
  );
}