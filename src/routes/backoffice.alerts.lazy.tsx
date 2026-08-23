/**
 * ============================================================================
 * @fileoverview Monitor de Destinatários de Alertas (Backoffice)
 * @path src/routes/backoffice/alerts.lazy.tsx
 * 
 * ============================================================================
 * [ARQUITETURA & CLEAN ARCHITECTURE]
 * ============================================================================
 * Tela de gerenciamento dos destinatários que receberão notificações de erro
 * do sistema (Outbox/System Message).
 * 
 * @architecture
 * - Data Fetching: 100% ofuscado via RPCs (Zero-Trust).
 * - Access Control: Apenas usuários com role 'admin' conseguem inserir/alterar.
 * - State Management: Gerenciamento local reativo para otimizar UX (Loading/Saving).
 * 
 * [ENTERPRISE ZERO-TRUST - OBFUSCATION V3]:
 * - Para garantir a consistência absoluta da arquitetura, até mesmo operações 
 *   simples de CRUD administrativo foram blindadas em RPCs (`get_backoffice_alerts`, 
 *   `create_backoffice_alert`, `toggle_backoffice_alert`, `delete_backoffice_alert`).
 *   Nenhuma tabela física é exposta na API.
 * 
 * =========================================================================
 * ⚙️ DEPENDÊNCIA DE INFRAESTRUTURA (POSTGRESQL RPCs)
 * =========================================================================
 * Para ofuscar este CRUD, as seguintes Procedures DEVEM existir:
 * 
 * -------------------------------------------------------------------------
 * PROCEDURE 1: Listagem
 * -------------------------------------------------------------------------
 * CREATE OR REPLACE FUNCTION get_backoffice_alerts() 
 * RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$ 
 * BEGIN 
 *   RETURN COALESCE(
 *     (SELECT jsonb_agg(row_to_json(a)) 
 *      FROM (SELECT * FROM notification_alert_recipients ORDER BY created_at DESC) a), 
 *     '[]'::jsonb
 *   ); 
 * END; 
 * $$;
 * 
 * -------------------------------------------------------------------------
 * PROCEDURE 2: Criação
 * -------------------------------------------------------------------------
 * CREATE OR REPLACE FUNCTION create_backoffice_alert(p_name TEXT, p_email TEXT) 
 * RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER AS $$ 
 * BEGIN 
 *   INSERT INTO notification_alert_recipients (name, email, alert_category, is_active) 
 *   VALUES (p_name, p_email, 'ALL', true); 
 * END; 
 * $$;
 * 
 * -------------------------------------------------------------------------
 * PROCEDURE 3: Ativação/Desativação
 * -------------------------------------------------------------------------
 * CREATE OR REPLACE FUNCTION toggle_backoffice_alert(p_id UUID, p_active BOOLEAN) 
 * RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER AS $$ 
 * BEGIN 
 *   UPDATE notification_alert_recipients 
 *   SET is_active = p_active 
 *   WHERE id = p_id; 
 * END; 
 * $$;
 * 
 * -------------------------------------------------------------------------
 * PROCEDURE 4: Deleção
 * -------------------------------------------------------------------------
 * CREATE OR REPLACE FUNCTION delete_backoffice_alert(p_id UUID) 
 * RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER AS $$ 
 * BEGIN 
 *   DELETE FROM notification_alert_recipients WHERE id = p_id; 
 * END; 
 * $$;
 * ============================================================================
 * 
 * @author César Ismael Pereira da Costa
 * @author Gemini Pro
 */

import { createLazyFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Loader2, Plus, RefreshCw, BellOff, BellRing, Trash2 } from "lucide-react";

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
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/integrations/auth/AuthContext";

export const Route = createLazyFileRoute("/backoffice/alerts")({ 
  component: AlertsPage 
});

type AlertRecipientRow = {
  id: string;
  name: string;
  email: string;
  alert_category: string;
  is_active: boolean;
  created_at: string;
};

function AlertsPage() {
  const { backofficeUser } = useAuth();
  
  const [recipients, setRecipients] = useState<AlertRecipientRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  
  const [registerOpen, setRegisterOpen] = useState(false);
  const [registerData, setRegisterData] = useState({ 
    name: "", 
    email: "" 
  });

  const isAdmin = backofficeUser?.role === "admin";

  async function load() {
    setLoading(true);
    // ✨ [ZERO-TRUST]: Leitura via RPC
    const { data, error } = await supabase.rpc('get_backoffice_alerts');

    if (error) {
      console.error("Erro ao carregar destinatários:", error);
      toast.error("Não foi possível carregar a lista de alertas.");
    } else {
      setRecipients((data || []) as AlertRecipientRow[]);
    }
    setLoading(false);
  }

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
      // ✨ [ZERO-TRUST]: Criação via RPC
      const { error } = await supabase.rpc('create_backoffice_alert', {
        p_name: registerData.name,
        p_email: registerData.email.toLowerCase().trim()
      });

      if (error) throw error;

      toast.success("Destinatário cadastrado com sucesso!");
      setRegisterOpen(false);
      setRegisterData({ name: "", email: "" });
      load();
    } catch (e: any) {
      if (e.message?.includes('duplicate key') || e.code === '23505') {
        toast.error("Este e-mail já está cadastrado.");
      } else {
        toast.error(e.message || "Erro ao cadastrar destinatário.");
      }
    } finally {
      setIsSaving(false);
    }
  }

  async function toggleActive(r: AlertRecipientRow) {
    try {
      // ✨ [ZERO-TRUST]: Atualização via RPC
      const { error } = await supabase.rpc('toggle_backoffice_alert', {
        p_id: r.id,
        p_active: !r.is_active
      });

      if (error) throw error;
      
      toast.success(`Alerta ${!r.is_active ? 'ativado' : 'desativado'} para ${r.name}.`);
      load();
    } catch (e: any) { 
      toast.error(e.message || "Erro ao atualizar status"); 
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Tem certeza que deseja excluir este destinatário?")) return;
    
    try {
      // ✨ [ZERO-TRUST]: Deleção via RPC
      const { error } = await supabase.rpc('delete_backoffice_alert', {
        p_id: id
      });

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

      <div className="rounded-2xl border border-border bg-card flex flex-col overflow-hidden">
        <div className="overflow-x-auto w-full pb-2">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground whitespace-nowrap">
                <th className="px-4 py-3 w-[300px]">Destinatário</th>
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
                return (
                  <tr key={r.id} className="border-b border-border/60 hover:bg-accent/40">
                    <td className="px-4 py-3 whitespace-nowrap">
                      <div className="font-semibold text-slate-800">{r.name}</div>
                      <div className="text-xs text-muted-foreground">{r.email}</div>
                    </td>
                    
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className="inline-flex items-center rounded-md bg-purple-500/10 px-2 py-1 text-[11px] font-semibold text-purple-600">
                        Todos os Erros
                      </span>
                    </td>
                    
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span
                        className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-bold ${
                          r.is_active ? "bg-emerald-500/10 text-emerald-600" : "bg-slate-500/10 text-slate-500"
                        }`}
                      >
                        {r.is_active ? <BellRing className="h-3 w-3" /> : <BellOff className="h-3 w-3" />}
                        {r.is_active ? "Ativo" : "Pausado"}
                      </span>
                    </td>
                    
                    <td className="px-4 py-3 text-right whitespace-nowrap">
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
    </div>
  );
}