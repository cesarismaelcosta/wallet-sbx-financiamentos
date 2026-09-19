/**
 * ============================================================================
 * @fileoverview Gerenciamento de Domínios Permitidos (Backoffice)
 * @path src/routes/backoffice/domains.lazy.tsx
 * 
 * ============================================================================
 * [ARQUITETURA & CLEAN ARCHITECTURE]
 * ============================================================================
 * Tela responsável pelo gerenciamento da Whitelist corporativa (SSO). Define 
 * quais domínios de e-mail (ex: @superbid.net) estão autorizados a realizar 
 * handshake com o Backoffice.
 * 
 * @architecture
 * - Data Fetching: 100% ofuscado via RPCs (Zero-Trust).
 * - Access Control: Apenas usuários com role 'admin' conseguem inserir/alterar.
 * - Segurança de Borda: A validação em si ocorre na `AuthContext` e na Edge Function.
 * 
 * [ENTERPRISE ZERO-TRUST - OBFUSCATION V3]:
 * - Para evitar que invasores mapeiem as regras da Whitelist através do Network Tab (F12),
 *   todas as operações de CRUD da tabela `allowed_email_domains` foram encapsuladas em 
 *   Procedures (RPCs). O frontend atua como um mensageiro cego.
 * 
 * =========================================================================
 * ⚙️ DEPENDÊNCIA DE INFRAESTRUTURA (POSTGRESQL RPCs)
 * =========================================================================
 * Para ofuscar este CRUD, as seguintes Procedures DEVEM existir:
 * 
 * -------------------------------------------------------------------------
 * PROCEDURE 1: Listagem
 * -------------------------------------------------------------------------
 * CREATE OR REPLACE FUNCTION get_backoffice_domains() 
 * RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$ 
 * BEGIN 
 *   RETURN COALESCE(
 *     (SELECT jsonb_agg(row_to_json(d)) 
 *      FROM (SELECT id, domain, is_active, created_at, updated_at FROM allowed_email_domains ORDER BY created_at DESC) d), 
 *     '[]'::jsonb
 *   ); 
 * END; 
 * $$;
 * 
 * -------------------------------------------------------------------------
 * PROCEDURE 2: Criação
 * -------------------------------------------------------------------------
 * CREATE OR REPLACE FUNCTION create_backoffice_domain(p_domain TEXT) 
 * RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER AS $$ 
 * BEGIN 
 *   INSERT INTO allowed_email_domains (domain, is_active) VALUES (p_domain, true); 
 * END; 
 * $$;
 * 
 * -------------------------------------------------------------------------
 * PROCEDURE 3: Ativação/Desativação
 * -------------------------------------------------------------------------
 * CREATE OR REPLACE FUNCTION toggle_backoffice_domain(p_id UUID, p_active BOOLEAN) 
 * RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER AS $$ 
 * BEGIN 
 *   UPDATE allowed_email_domains SET is_active = p_active, updated_at = NOW() WHERE id = p_id; 
 * END; 
 * $$;
 * ============================================================================
 * 
 * @author César Ismael Pereira da Costa
 * @author Gemini Pro
 */

import { createLazyFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Loader2, Plus, RefreshCw, UserCheck, UserX, ToggleLeft, ToggleRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/integrations/auth/AuthContext";

export const Route = createLazyFileRoute("/backoffice/domains")({
  component: DominiosPage,
});

type DomainRow = { id: string; domain: string; is_active: boolean; created_at: string; updated_at: string | null; };

function DominiosPage() {
  const { backofficeUser } = useAuth();
  const isAdmin = backofficeUser?.role === 'admin';
  const [domains, setDomains] = useState<DomainRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newDomain, setNewDomain] = useState("");

  async function load() {
    setLoading(true);
    // ✨ [ZERO-TRUST]: Leitura via RPC
    const { data, error } = await supabase.rpc('get_backoffice_domains');

    if (error) {
      console.error("Erro Supabase:", error);
      toast.error(`Erro: ${error.message}`);
    } else {
      setDomains((data as DomainRow[]) || []);
    }
    setLoading(false);
  }

  async function handleAdd() {
    if (!newDomain) return;
    
    // ✨ [ZERO-TRUST]: Criação via RPC
    const { error } = await supabase.rpc('create_backoffice_domain', {
      p_domain: newDomain.toLowerCase().trim()
    });

    if (error) {
      toast.error("Erro ao adicionar: " + error.message);
    } else {
      toast.success("Domínio adicionado!");
      setNewDomain("");
      setDialogOpen(false);
      load();
    }
  }

  async function toggleStatus(d: DomainRow) {
    // ✨ [ZERO-TRUST]: Atualização via RPC
    const { error } = await supabase.rpc('toggle_backoffice_domain', {
      p_id: d.id,
      p_active: !d.is_active
    });
      
    if (error) {
      toast.error("Erro ao atualizar status: " + error.message);
    } else {
      toast.success(`Domínio ${!d.is_active ? 'ativado' : 'inativado'} com sucesso.`);
      load();
    }
  }

  useEffect(() => { load(); }, []);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="page-header-title">Domínios permitidos</h1>
          <p className="text-sm text-neutral-600">Gerencie quais domínios de e-mail podem acessar o backoffice.</p>
        </div>
        <div className="flex items-center gap-2">
          {isAdmin && (
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm" className="rounded-none border-neutral-200 text-neutral-900 shadow-xs text-xs hover:bg-primary hover:text-primary-foreground hover:border-primary">
                  <Plus className="mr-2 h-4 w-4" /> Adicionar domínio
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-md rounded-none sm:rounded-none bg-white border-neutral-200 shadow-lg">
                <DialogHeader>
                  <DialogTitle className="text-neutral-900 text-base">Adicionar novo domínio</DialogTitle>
                </DialogHeader>
                <div className="space-y-2 pt-2 text-xs">
                  <Label className="text-neutral-700 text-xs">Domínio</Label>
                  <Input 
                    placeholder="exemplo.com" 
                    value={newDomain} 
                    onChange={e => setNewDomain(e.target.value)} 
                    className="rounded-none border-neutral-200 focus-visible:ring-1 focus-visible:ring-neutral-900 focus-visible:border-neutral-900 text-neutral-900 placeholder:text-neutral-400 text-xs"
                  />
                </div>
                <DialogFooter>
                  <Button className="cta-gradient border-0 rounded-none text-white font-medium text-xs" onClick={handleAdd}>
                    Confirmar
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}
          <Button size="sm" className="cta-gradient border-0 rounded-none text-white text-xs" onClick={load} disabled={loading}>
            <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Atualizar
          </Button>
        </div>
      </div>

      <div className="overflow-hidden rounded-none border border-neutral-200 bg-white shadow-xs">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-neutral-200 bg-neutral-100 text-left text-[10px] font-semibold uppercase tracking-wider text-neutral-600">
              <th className="px-3 py-2.5">Domínio</th>
              <th className="px-3 py-2.5">Status</th>
              <th className="px-3 py-2.5">Adicionado em</th>
              <th className="w-32 px-3 py-2.5 text-right">Ações</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={4} className="p-10 text-center"><Loader2 className="animate-spin mx-auto text-neutral-900 h-5 w-5"/></td></tr>
            ) : domains.length === 0 ? (
              <tr><td colSpan={4} className="p-10 text-center text-neutral-500 text-xs">Nenhum domínio encontrado.</td></tr>
            ) : (
              domains.map((d) => (
                <tr key={d.id} className="border-b border-neutral-100 hover:bg-neutral-50 transition-colors">
                  <td className="px-3 py-2.5 font-medium text-neutral-900">{d.domain}</td>
                  <td className="px-3 py-2.5">
                    <span className={`inline-flex items-center gap-1.5 rounded-none px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${d.is_active ? "bg-success/10 text-success" : "bg-muted text-muted-foreground"}`}>
                      {d.is_active ? <UserCheck className="h-3 w-3" /> : <UserX className="h-3 w-3" />}
                      {d.is_active ? "Ativo" : "Inativo"}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-neutral-400">{new Date(d.created_at).toLocaleDateString("pt-BR")}</td>
                  <td className="px-3 py-2.5 text-right">
                    {isAdmin && (
                      <Button variant="ghost" size="sm" className="h-7 text-xs px-2 rounded-none hover:bg-neutral-100 text-neutral-900 font-medium" onClick={() => toggleStatus(d)}>
                        {d.is_active ? (
                          <>
                            <ToggleLeft className="mr-1 h-4 w-4 text-destructive" /> Inativar
                          </>
                        ) : (
                          <>
                            <ToggleRight className="mr-1 h-4 w-4 text-success" /> Ativar
                          </>
                        )}
                      </Button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}