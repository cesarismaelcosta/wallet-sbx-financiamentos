/**
 * @fileoverview Monitor de Destinatários de Alertas (Backoffice)
 * @route /backoffice/alertas
 * 
 * ============================================================================
 * [ARQUITETURA & CLEAN ARCHITECTURE]
 * ============================================================================
 * Tela de gerenciamento dos destinatários que receberão notificações de erro
 * do sistema (Outbox/System Message).
 * 
 * @architecture
 * - Data Fetching: Direto via Supabase Client (protegido por RLS no banco).
 * - Access Control: Apenas usuários com role 'admin' conseguem inserir/alterar.
 * - State Management: Gerenciamento local reativo para otimizar UX (Loading/Saving).
 * ============================================================================
 */

import { createLazyFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Loader2, Plus, RefreshCw, AlertTriangle, BellOff, BellRing, Trash2 } from "lucide-react";

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

// ============================================================================
// [REGISTRO DA ROTA TANSTACK ROUTER]
// ============================================================================
export const Route = createLazyFileRoute("/backoffice/alerts")({ 
  component: AlertsPage 
});

// ============================================================================
// [TIPAGENS]
// ============================================================================
type AlertCategory = "ALL" | "FATAL" | "GATEWAY";

type AlertRecipientRow = {
  id: string;
  name: string;
  email: string;
  alert_category: AlertCategory;
  is_active: boolean;
  created_at: string;
};

const CATEGORY_BADGE: Record<AlertCategory, { label: string, style: string }> = {
  ALL: { label: "Todos os Erros", style: "bg-purple-500/10 text-purple-600" },
  FATAL: { label: "Apenas Falhas Críticas", style: "bg-rose-500/10 text-rose-600" },
  GATEWAY: { label: "Erros de Integração", style: "bg-amber-500/10 text-amber-600" },
};

// ============================================================================
// [COMPONENTE PRINCIPAL]
// ============================================================================
function AlertsPage() {
  const { backofficeUser } = useAuth();
  const [recipients, setRecipients] = useState<AlertRecipientRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  
  const [registerOpen, setRegisterOpen] = useState(false);
  const [registerData, setRegisterData] = useState({ 
    name: "", 
    email: "", 
    alert_category: "ALL" as AlertCategory 
  });

  const isAdmin = backofficeUser?.role === "admin";

  /**
   * Extração primária dos destinatários
   */
  async function load() {
    setLoading(true);
    const { data, error } = await supabase
      .from("notification_alert_recipients")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Erro ao carregar destinatários:", error);
      toast.error("Não foi possível carregar a lista de alertas.");
    } else {
      setRecipients(data as AlertRecipientRow[]);
    }
    setLoading(false);
  }

  /**
   * Persiste um novo destinatário direto via Client (Blindado por RLS)
   */
  async function handleRegister() {
    if (!registerData.name || !registerData.email) {
      toast.error("Preencha o nome e o e-mail.");
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(registerData.email)) {
      toast.error("Insira um e-mail válido.");
      return;
    }

    setIsSaving(true);
    try {
      const { error } = await supabase
        .from("notification_alert_recipients")
        .insert([{
          name: registerData.name,
          email: registerData.email.toLowerCase().trim(),
          alert_category: registerData.alert_category,
          is_active: true
        }]);

      if (error) throw error;

      toast.success("Destinatário cadastrado com sucesso!");
      setRegisterOpen(false);
      setRegisterData({ name: "", email: "", alert_category: "ALL" });
      load();
    } catch (e: any) {
      if (e.code === '23505') {
        toast.error("Este e-mail já está cadastrado.");
      } else {
        toast.error(e.message || "Erro ao cadastrar destinatário.");
      }
    } finally {
      setIsSaving(false);
    }
  }

  /**
   * Altera o status ativo/inativo
   */
  async function toggleActive(r: AlertRecipientRow) {
    try {
      const { error } = await supabase
        .from("notification_alert_recipients")
        .update({ is_active: !r.is_active })
        .eq("id", r.id);

      if (error) throw error;
      
      toast.success(`Alerta ${!r.is_active ? 'ativado' : 'desativado'} para ${r.name}.`);
      load();
    } catch (e: any) { 
      toast.error(e.message || "Erro ao atualizar status"); 
    }
  }

  /**
   * Atualiza a categoria do alerta
   */
  async function changeCategory(r: AlertRecipientRow, newCategory: AlertCategory) {
    try {
      const { error } = await supabase
        .from("notification_alert_recipients")
        .update({ alert_category: newCategory })
        .eq("id", r.id);

      if (error) throw error;
      load();
    } catch (e: any) {
      toast.error(e.message || "Erro ao alterar categoria.");
    }
  }

  /**
   * Remove permanentemente (Hard Delete)
   */
  async function handleDelete(id: string) {
    if (!confirm("Tem certeza que deseja excluir este destinatário?")) return;
    
    try {
      const { error } = await supabase
        .from("notification_alert_recipients")
        .delete()
        .eq("id", id);

      if (error) throw error;
      
      toast.success("Destinatário removido com sucesso.");
      load();
    } catch (e: any) {
      toast.error(e.message || "Erro ao remover destinatário.");
    }
  }

  useEffect(() => {
    load();
  }, []);

  return (
    <div className="space-y-6">
      
      {/* HEADER DA TELA */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Alertas do Sistema</h1>
          <p className="text-sm text-muted-foreground">Gerencie quem recebe notificações de erros e infraestrutura.</p>
        </div>

        <div className="flex items-center gap-2">
          {isAdmin && (
            <Dialog open={registerOpen} onOpenChange={setRegisterOpen}>
              <DialogTrigger asChild>
                <Button size="sm" className="rounded-xl">
                  <Plus className="mr-2 h-4 w-4" /> Cadastrar E-mail
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Novo Destinatário de Alerta</DialogTitle>
                  <DialogDescription>Cadastre um membro da equipe técnica para receber logs de falhas.</DialogDescription>
                </DialogHeader>

                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label>Nome ou Setor (ex: Squad DevOps)</Label>
                    <Input
                      value={registerData.name}
                      placeholder="Ex: João da Silva"
                      onChange={(e) => setRegisterData({ ...registerData, name: e.target.value })}
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label>E-mail Completo</Label>
                    <Input
                      type="email"
                      placeholder="devops@suaempresa.com"
                      value={registerData.email}
                      onChange={(e) => setRegisterData({ ...registerData, email: e.target.value })}
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label>Categoria de Alerta</Label>
                    <Select
                      value={registerData.alert_category}
                      onValueChange={(v: AlertCategory) => setRegisterData({ ...registerData, alert_category: v })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ALL">Todos os Erros (Recomendado)</SelectItem>
                        <SelectItem value="FATAL">Apenas Falhas Críticas (500)</SelectItem>
                        <SelectItem value="GATEWAY">Erros de Integração (Parceiros)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <DialogFooter>
                  <Button variant="outline" className="rounded-xl" onClick={() => setRegisterOpen(false)}>
                    Cancelar
                  </Button>
                  <Button onClick={handleRegister} disabled={isSaving} className="rounded-xl">
                    {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
                    Cadastrar
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}

          <Button variant="outline" size="sm" onClick={load} disabled={loading} className="rounded-xl">
            <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Atualizar
          </Button>
        </div>
      </div>

      {/* TABELA DE DADOS */}
      <div className="overflow-hidden rounded-2xl border border-border bg-card">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/40 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              <th className="px-4 py-3 w-[250px]">Destinatário</th>
              <th className="px-4 py-3 w-[200px]">Categoria</th>
              <th className="px-4 py-3 w-[150px]">Status</th>
              <th className="px-4 py-3 text-right">Ações</th>
            </tr>
          </thead>
          <tbody>
            {recipients.length === 0 && !loading && (
              <tr>
                <td colSpan={4} className="p-8 text-center text-muted-foreground">
                  Nenhum destinatário de alerta configurado.
                </td>
              </tr>
            )}
            
            {recipients.map((r) => {
              const badge = CATEGORY_BADGE[r.alert_category] || CATEGORY_BADGE["ALL"];
              
              return (
                <tr key={r.id} className="border-b border-border/60 hover:bg-accent/40">
                  <td className="px-4 py-3">
                    <div className="font-semibold text-slate-800">{r.name}</div>
                    <div className="text-xs text-muted-foreground">{r.email}</div>
                  </td>
                  
                  <td className="px-4 py-3">
                    <Select value={r.alert_category} onValueChange={(v: AlertCategory) => changeCategory(r, v)} disabled={!isAdmin}>
                      <SelectTrigger className={`h-7 w-[160px] text-[11px] border-none font-semibold ${badge.style}`}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ALL">Todos os Erros</SelectItem>
                        <SelectItem value="FATAL">Falhas Críticas</SelectItem>
                        <SelectItem value="GATEWAY">Integração (Parceiros)</SelectItem>
                      </SelectContent>
                    </Select>
                  </td>
                  
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-bold ${
                        r.is_active ? "bg-emerald-500/10 text-emerald-600" : "bg-slate-500/10 text-slate-500"
                      }`}
                    >
                      {r.is_active ? <BellRing className="h-3 w-3" /> : <BellOff className="h-3 w-3" />}
                      {r.is_active ? "Ativo" : "Pausado"}
                    </span>
                  </td>
                  
                  <td className="px-4 py-3 text-right">
                    {isAdmin && (
                      <div className="flex justify-end gap-2">
                        <Button variant="ghost" size="sm" onClick={() => toggleActive(r)} className="h-8 px-2 text-xs">
                          {r.is_active ? "Pausar" : "Ativar"}
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => handleDelete(r.id)} className="h-8 w-8 text-rose-500 hover:text-rose-600 hover:bg-rose-50">
                          <Trash2 className="h-4 w-4" />
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
  );
}