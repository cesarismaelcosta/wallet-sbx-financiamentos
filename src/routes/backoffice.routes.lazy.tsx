/**
 * ============================================================================
 * @fileoverview Consulta e Gestão de Rotas / Orchestrator (Backoffice)
 * @module Backoffice/OrchestratorConfigs
 * @route /backoffice/routes
 *
 * @description
 * Este módulo atua como o painel central de governança e inspeção das rotas e
 * configurações do Orchestrator. Ele realiza a listagem e edição de JSONs vitais.
 *
 * NOVO: Inclui um Editor Híbrido (Split-Screen) com Live Preview em tempo real
 * usando os Painéis Compartilhados (Shared Renderers) para consistência visual.
 *
 * [ENTERPRISE ZERO-TRUST - OBFUSCATION V3]:
 * - (LEITURA): A orquestração exigia 4 requisições separadas que travavam o client
 *   e expunham os dicionários. Tudo foi envelopado na RPC `get_backoffice_orchestrator_data`.
 * - (ESCRITA): Inserções e Atualizações (Upserts) são roteadas para a RPC 
 *   `save_backoffice_orchestrator_config`, blindando as regras de parsing.
 * ============================================================================
 * 
 * @author César Ismael Pereira da Costa
 * @author Gemini Pro
 */

import { createLazyFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState, useRef } from "react";
import {
  Loader2, RefreshCw, Search, Layers, FileText, HelpCircle, X,
  Code2, SlidersHorizontal, Filter, ChevronDown, Plus, Edit, Save, LayoutTemplate,
  Settings2, Copy, Printer,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandGroup, CommandItem, CommandList } from "@/components/ui/command";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

import { supabase } from "@/integrations/supabase/client";
import { ICON_MAP } from "@/features/financial-hub/components/shared/icons-map";

// ✨ [REUSO ARQUITETURAL]: Importação dos Painéis Compartilhados em vez de recriar no arquivo
import { PanelProduct } from "@/features/financial-hub/components/shared/renderes/PanelProduct";
import { PanelConsents } from "@/features/financial-hub/components/shared/renderes/PanelConsents";
import { PanelFAQ } from "@/features/financial-hub/components/shared/renderes/PanelFAQ";
import { PanelFooter } from "@/features/financial-hub/components/shared/renderes/PanelFooter";

export const Route = createLazyFileRoute("/backoffice/routes")({
  component: OrchestratorConfigsBackofficePage,
});

type OrchestratorRow = {
  id?: string | number;
  lookup_id: string;
  config_type: string;
  entity_type: string;
  page_url: string;
  integration_method: string;
  partner_id?: string | number | null;
  is_active?: boolean;
  is_integrated?: boolean;
  page_configs?: any;
  integration_details?: any;
  rules?: any;
  consent_configs?: any[];
  page_faqs?: any[];
  created_at?: string;
};

// =========================================================================
// [SUB-COMPONENTES DE CONSTRUTORES/BUILDERS]
// =========================================================================

function PaymentFactorsBuilder({ factors = {}, onChange }: { factors: Record<string, number>; onChange: (f: Record<string, number>) => void; }) {
  const [entries, setEntries] = useState<Array<{ term: string; factor: any }>>(() => Object.entries(factors || {}).map(([term, factor]) => ({ term, factor })));

  useEffect(() => {
    const currentEntriesObj = Object.entries(factors || {});
    if (currentEntriesObj.length !== entries.length) {
      setEntries(currentEntriesObj.map(([term, factor]) => ({ term, factor })));
    }
  }, [factors]);

  const triggerChange = (newEntries: Array<{ term: string; factor: any }>) => {
    setEntries(newEntries);
    const newObj: Record<string, number> = {};
    newEntries.forEach((item) => {
      if (item.term !== undefined && item.term !== "") newObj[item.term] = Number(item.factor) || 0;
    });
    onChange(newObj);
  };

  const updateEntry = (index: number, field: "term" | "factor", value: string) => {
    const newEntries = [...entries];
    newEntries[index][field] = value;
    triggerChange(newEntries);
  };

  const removeEntry = (index: number) => {
    const newEntries = entries.filter((_, i) => i !== index);
    triggerChange(newEntries);
  };

  const addEntry = () => setEntries([...entries, { term: "", factor: "" }]);

  return (
    <div className="space-y-2 pt-2 border-t border-neutral-200">
      <div className="flex justify-between items-center">
        <label className="text-[10px] font-medium text-neutral-400 uppercase">Fatores de Pagamento por Prazo</label>
        <button type="button" onClick={addEntry} className="text-[10px] font-medium text-neutral-900 hover:underline flex items-center">
          <Plus size={12} className="mr-0.5" /> Adicionar Fator
        </button>
      </div>

      {entries.length === 0 ? (
        <p className="text-[10px] text-neutral-400 italic">Nenhum fator customizado configurado.</p>
      ) : (
        <div className="space-y-2 bg-neutral-50 p-2.5 rounded-none border border-neutral-200">
          {entries.map((entry, idx) => (
            <div key={idx} className="flex items-center gap-2">
              <div className="w-1/3"><Input placeholder="Prazo" value={entry.term} onChange={(e) => updateEntry(idx, "term", e.target.value)} className="h-8 text-xs font-mono bg-white rounded-none border-neutral-200 focus-visible:ring-1 focus-visible:ring-neutral-900 focus-visible:border-neutral-900" /></div>
              <div className="flex-1"><Input type="number" step="0.00000001" placeholder="Fator" value={entry.factor} onChange={(e) => updateEntry(idx, "factor", e.target.value)} className="h-8 text-xs font-mono bg-white rounded-none border-neutral-200 focus-visible:ring-1 focus-visible:ring-neutral-900 focus-visible:border-neutral-900" /></div>
              <button type="button" onClick={() => removeEntry(idx)} className="text-neutral-400 hover:text-red-600 transition-colors p-1" title="Remover"><X size={14} /></button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ConsentItemBuilder({ consent, onUpdate, onRemove }: { consent: any; onUpdate: (c: any) => void; onRemove: () => void; }) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleTextChange = (newText: string) => {
    const matches = newText.match(/\{([^}]+)\}/g) || [];
    const currentTags = matches.map((m) => m.replace(/[{}]/g, ""));
    const existingLinks = consent.links || [];
    const newLinks = currentTags.map((tag) => existingLinks.find((l: any) => l.text === tag) || { text: tag, type: "web", url: "", tooltip_text: "" });
    onUpdate({ ...consent, template_text: newText, links: newLinks });
  };

  const handleInsertTag = () => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const text = consent.template_text || "";
    if (start === end) { alert("Selecione uma palavra."); return; }
    const selectedText = text.substring(start, end);
    if (selectedText.includes("{") || selectedText.includes("}")) return;
    handleTextChange(text.substring(0, start) + `{${selectedText}}` + text.substring(end));
    setTimeout(() => textarea.focus(), 0);
  };

  const updateLinkConfig = (index: number, updates: any) => {
    const newLinks = [...(consent.links || [])];
    newLinks[index] = { ...newLinks[index], ...updates };
    onUpdate({ ...consent, links: newLinks });
  };

  return (
    <div className="bg-white border border-neutral-200 rounded-none p-4 shadow-sm relative group">
      <button onClick={onRemove} className="absolute top-3 right-3 text-neutral-300 hover:text-red-600 opacity-0 group-hover:opacity-100 transition-opacity" title="Remover Termo"><X size={16} /></button>
      <div className="grid gap-4">
        <div className="flex gap-4 items-end">
          <div className="flex-1 space-y-1.5">
            <label className="text-[10px] font-medium text-neutral-400 uppercase">ID do Termo</label>
            <Input value={consent.id} onChange={(e) => onUpdate({ ...consent, id: e.target.value })} className="h-8 text-xs font-mono bg-neutral-50 rounded-none border-neutral-200 focus-visible:ring-1 focus-visible:ring-neutral-900 focus-visible:border-neutral-900" />
          </div>
          <div className="flex items-center gap-2 mb-1.5">
            <Switch checked={consent.is_required} onCheckedChange={(v) => onUpdate({ ...consent, is_required: v })} />
            <span className="text-[10px] font-medium text-neutral-400 uppercase">Obrigatório?</span>
          </div>
        </div>

        <div className="space-y-1.5">
          <div className="flex justify-between items-center">
            <label className="text-[10px] font-medium text-neutral-400 uppercase">Texto do Termo</label>
            <button onClick={handleInsertTag} className="text-[10px] font-medium text-white bg-neutral-900 px-2 py-1 rounded-none hover:bg-neutral-800 flex items-center shadow-xs" type="button">🔗 Criar Link</button>
          </div>
          <textarea ref={textareaRef} value={consent.template_text || ""} onChange={(e) => handleTextChange(e.target.value)} className="w-full h-16 border border-neutral-200 rounded-none p-2 text-xs outline-none focus:border-neutral-900 focus:ring-1 focus:ring-neutral-900 resize-none" placeholder="Ex: Concordo com a Política." />
        </div>

        {consent.links && consent.links.length > 0 && (
          <div className="bg-neutral-50 rounded-none p-3 border border-neutral-200 space-y-2 mt-1">
            <h5 className="text-[10px] font-medium text-neutral-400 uppercase mb-2">Configuração dos Links</h5>
            {consent.links.map((link: any, idx: number) => (
              <div key={idx} className="flex flex-col gap-2.5 bg-white p-3 rounded-none border border-neutral-200 shadow-sm">
                <div className="flex items-start justify-between gap-3 w-full">
                  <div className="flex-1">
                    <span className="text-[9px] font-medium text-neutral-400 block uppercase mb-0.5">Texto Destacado</span>
                    <span className="text-xs font-medium text-neutral-900 leading-snug block">{link.text}</span>
                  </div>
                  <div className="w-[120px]">
                    <Select value={link.type} onValueChange={(v) => updateLinkConfig(idx, { type: v })}>
                      <SelectTrigger className="h-8 text-[11px] bg-neutral-50 rounded-none border-neutral-200"><SelectValue /></SelectTrigger>
                      <SelectContent className="rounded-none border-neutral-200">
                        <SelectItem value="web" className="rounded-none cursor-pointer">Link Web</SelectItem>
                        <SelectItem value="tooltip" className="rounded-none cursor-pointer">Tooltip</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="w-full">
                  {link.type === "web" ? (
                    <Input type="url" placeholder="https://..." value={link.url || ""} onChange={(e) => updateLinkConfig(idx, { url: e.target.value })} className="h-8 text-xs w-full bg-neutral-50 rounded-none border-neutral-200 focus-visible:ring-1 focus-visible:ring-neutral-900 focus-visible:border-neutral-900" />
                  ) : (
                    <textarea placeholder="Balão de ajuda..." value={link.tooltip_text || ""} onChange={(e) => updateLinkConfig(idx, { tooltip_text: e.target.value })} className="w-full min-h-[70px] border border-neutral-200 rounded-none p-2.5 text-xs outline-none focus:border-neutral-900 focus:ring-1 focus:ring-neutral-900 resize-y bg-neutral-50" />
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function TextPartsBuilder({ label, parts = [], onChange }: { label: string; parts: any[]; onChange: (p: any[]) => void; }) {
  return (
    <div className="space-y-1.5">
      <label className="text-[10px] font-medium text-neutral-400 uppercase">{label}</label>
      <div className="space-y-2 bg-neutral-50 p-2.5 border border-neutral-200 rounded-none">
        {parts.map((part, idx) => (
          <div key={idx} className="flex gap-2 items-center">
            <Input value={part.text} onChange={(e) => { const n = [...parts]; n[idx].text = e.target.value; onChange(n); }} className="h-8 text-xs flex-1 bg-white rounded-none border-neutral-200 focus-visible:ring-1 focus-visible:ring-neutral-900 focus-visible:border-neutral-900" placeholder="Digite..." />
            <Select value={part.type || "normal"} onValueChange={(v) => { const n = [...parts]; n[idx].type = v; onChange(n); }}>
              <SelectTrigger className="h-8 w-28 text-[11px] bg-white rounded-none border-neutral-200"><SelectValue /></SelectTrigger>
              <SelectContent className="rounded-none border-neutral-200">
                <SelectItem value="normal" className="rounded-none cursor-pointer">Normal</SelectItem>
                <SelectItem value="bold" className="rounded-none cursor-pointer">Negrito</SelectItem>
                <SelectItem value="highlight" className="rounded-none cursor-pointer">Destaque Cor</SelectItem>
              </SelectContent>
            </Select>
            <button onClick={() => onChange(parts.filter((_, i) => i !== idx))} className="text-neutral-400 hover:text-red-600"><X size={14} /></button>
          </div>
        ))}
        <Button type="button" onClick={() => onChange([...parts, { text: "", type: "normal" }])} variant="ghost" size="sm" className="h-8 text-[10px] font-medium text-neutral-900 w-full mt-1 border border-dashed border-neutral-300 hover:bg-neutral-100 rounded-none">
          <Plus size={12} className="mr-1" /> Adicionar Pedaço de Texto
        </Button>
      </div>
    </div>
  );
}

function BenefitsBuilder({ benefits = [], onChange }: { benefits: any[]; onChange: (b: any[]) => void }) {
  const iconOptions = Object.keys(ICON_MAP);
  return (
    <div className="space-y-3">
      {benefits.map((ben, idx) => (
        <div key={idx} className="bg-neutral-50 p-3 rounded-none border border-neutral-200 relative group space-y-3">
          <button onClick={() => onChange(benefits.filter((_, i) => i !== idx))} className="absolute top-2 right-2 text-neutral-300 hover:text-red-600 opacity-0 group-hover:opacity-100"><X size={14} /></button>
          <div className="flex gap-3">
            <div className="w-1/3 space-y-1">
              <label className="text-[9px] font-medium text-neutral-400 uppercase">Ícone</label>
              <Select value={ben.icon} onValueChange={(v) => { const n = [...benefits]; n[idx].icon = v; onChange(n); }}>
                <SelectTrigger className="h-8 text-[11px] bg-white rounded-none border-neutral-200"><SelectValue placeholder="Escolha..." /></SelectTrigger>
                <SelectContent className="max-h-60 rounded-none border-neutral-200">
                  {iconOptions.map((iconKey) => {
                    const IconComponent = ICON_MAP[iconKey];
                    return (
                      <SelectItem key={iconKey} value={iconKey} className="rounded-none cursor-pointer">
                        <div className="flex items-center gap-2">{IconComponent && <IconComponent className="w-3.5 h-3.5 text-neutral-900" />}<span>{iconKey}</span></div>
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>
            <div className="w-2/3 space-y-1">
              <label className="text-[9px] font-medium text-neutral-400 uppercase">Título</label>
              <Input value={ben.title} onChange={(e) => { const n = [...benefits]; n[idx].title = e.target.value; onChange(n); }} className="h-8 text-xs bg-white rounded-none border-neutral-200 focus-visible:ring-1 focus-visible:ring-neutral-900 focus-visible:border-neutral-900" placeholder="Ex: Até 48 meses" />
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-[9px] font-medium text-neutral-400 uppercase">Descrição</label>
            <Input value={ben.description} onChange={(e) => { const n = [...benefits]; n[idx].description = e.target.value; onChange(n); }} className="h-8 text-xs bg-white rounded-none border-neutral-200 focus-visible:ring-1 focus-visible:ring-neutral-900 focus-visible:border-neutral-900" placeholder="Ex: Escolha a parcela" />
          </div>
        </div>
      ))}
      <Button type="button" onClick={() => onChange([...benefits, { icon: "Check", title: "", description: "" }])} variant="outline" size="sm" className="h-8 text-[10px] font-medium w-full border-dashed rounded-none border-neutral-300 text-neutral-900 hover:bg-neutral-100">
        <Plus size={12} className="mr-1" /> Adicionar Benefício
      </Button>
    </div>
  );
}

function FooterBuilder({ footer = {}, onChange }: { footer: any; onChange: (f: any) => void }) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleTextChange = (newText: string) => {
    const matches = newText.match(/\{([^}]+)\}/g) || [];
    const currentTags = matches.map((m) => m.replace(/[{}]/g, ""));
    const existingLinks = footer.links || [];
    const newLinks = currentTags.map((tag) => existingLinks.find((l: any) => l.text === tag) || { text: tag, url: "" });
    onChange({ ...footer, template_text: newText, links: newLinks });
  };

  const handleInsertTag = () => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const text = footer.template_text || "";
    if (start === end) { alert("Selecione uma palavra."); return; }
    const selectedText = text.substring(start, end);
    if (selectedText.includes("{") || selectedText.includes("}")) return;
    handleTextChange(text.substring(0, start) + `{${selectedText}}` + text.substring(end));
    setTimeout(() => textarea.focus(), 0);
  };

  return (
    <div className="space-y-3">
      <div className="flex justify-between items-center">
        <label className="text-[10px] font-medium text-neutral-400 uppercase">Texto do Rodapé</label>
        <button onClick={handleInsertTag} className="text-[10px] font-medium text-white bg-neutral-900 px-2 py-1 rounded-none hover:bg-neutral-800 flex items-center shadow-xs" type="button">🔗 Criar Link</button>
      </div>
      <textarea ref={textareaRef} value={footer.template_text || ""} onChange={(e) => handleTextChange(e.target.value)} className="w-full h-24 border border-neutral-200 rounded-none p-2.5 text-xs outline-none focus:border-neutral-900 focus:ring-1 focus:ring-neutral-900 resize-y bg-white" placeholder="© 2026 Wallet sbX." />
      {footer.links && footer.links.length > 0 && (
        <div className="bg-neutral-50 rounded-none p-3 border border-neutral-200 space-y-2 mt-2">
          <h5 className="text-[10px] font-medium text-neutral-400 uppercase mb-2">URLs Mapeadas</h5>
          {footer.links.map((link: any, idx: number) => (
            <div key={idx} className="flex flex-col gap-2.5 bg-white p-3 rounded-none border border-neutral-200 shadow-sm">
              <div className="w-full">
                <span className="text-[9px] font-medium text-neutral-400 block uppercase mb-0.5">Texto Destacado</span>
                <span className="text-xs font-medium text-neutral-900 leading-snug block">{link.text}</span>
              </div>
              <div className="w-full">
                <Input type="url" placeholder="https://..." value={link.url || ""} onChange={(e) => { const newLinks = [...(footer.links || [])]; newLinks[idx].url = e.target.value; onChange({ ...footer, links: newLinks }); }} className="h-8 text-xs w-full bg-neutral-50 rounded-none border-neutral-200 focus-visible:ring-1 focus-visible:ring-neutral-900 focus-visible:border-neutral-900" />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// =========================================================================
// [COMPONENTE DE EDITOR]: OrchestratorConfigEditor (Split-Screen)
// =========================================================================
function OrchestratorConfigEditor({
  initialData = null,
  partnersList = [],
  productsList = [],
  categoriesList = [],
  onClose,
  onSave,
}: {
  initialData?: OrchestratorRow | null;
  partnersList: { id: string | number; name: string }[];
  productsList: { id: string | number; name: string }[];
  categoriesList: { id: string | number; name: string }[];
  onClose: () => void;
  onSave: (data: OrchestratorRow) => Promise<void>;
}) {
  const [isSaving, setIsSaving] = useState(false);

  const [formData, setFormData] = useState({
    config_type: initialData?.config_type || "PRODUCT",
    lookup_id: initialData?.lookup_id || "",
    entity_type: initialData?.entity_type || "PF+PJ",
    page_url: initialData?.page_url || "http://localhost:8080/financiamentos/veiculos",
    integration_method: initialData?.integration_method || "API",
    partner_id: initialData?.partner_id ? String(initialData.partner_id) : "none",
    is_active: initialData?.is_active ?? true,
    is_integrated: initialData?.is_integrated ?? true,
  });

  const [jsonEditors, setJsonEditors] = useState({
    integration_details: initialData?.integration_details && Object.keys(initialData.integration_details).length > 0 ? JSON.stringify(initialData.integration_details, null, 2) : "{\n  \n}",
    rules: initialData?.rules && Object.keys(initialData.rules).length > 0 ? JSON.stringify(initialData.rules, null, 2) : "{\n  \n}",
    page_configs: initialData?.page_configs && Object.keys(initialData.page_configs).length > 0 ? JSON.stringify(initialData.page_configs, null, 2) : "{\n  \n}",
    consent_configs: initialData?.consent_configs && initialData.consent_configs.length > 0 ? JSON.stringify(initialData.consent_configs, null, 2) : "[\n  \n]",
    page_faqs: initialData?.page_faqs && initialData.page_faqs.length > 0 ? JSON.stringify(initialData.page_faqs, null, 2) : "[\n  \n]",
  });

  const [parsedPreview, setParsedPreview] = useState<any>({
    page_configs: initialData?.page_configs || null,
    consent_configs: initialData?.consent_configs || null,
    page_faqs: initialData?.page_faqs || null,
    rules: initialData?.rules || {},
    integration_details: initialData?.integration_details || {},
  });

  const [jsonErrors, setJsonErrors] = useState<Record<string, string | null>>({});

  const handleJsonChange = (field: keyof typeof jsonEditors, value: string) => {
    setJsonEditors((prev) => ({ ...prev, [field]: value }));
    if (!value.trim() || value === "{}" || value === "[]") {
      setJsonErrors((prev) => ({ ...prev, [field]: null }));
      setParsedPreview((prev: any) => ({ ...prev, [field]: null }));
      return;
    }
    try {
      const parsed = JSON.parse(value);
      setJsonErrors((prev) => ({ ...prev, [field]: null }));
      if (["page_configs", "consent_configs", "page_faqs", "rules", "integration_details"].includes(field)) {
        setParsedPreview((prev: any) => ({ ...prev, [field]: parsed }));
      }
    } catch (e: any) {
      setJsonErrors((prev) => ({ ...prev, [field]: `JSON Inválido: ${e.message}` }));
    }
  };

  const handleSaveClick = async () => {
    const hasErrors = Object.values(jsonErrors).some((err) => err !== null);
    if (hasErrors) { alert("Corrija os erros de JSON antes de salvar."); return; }
    if (!formData.lookup_id) { alert("O campo Lookup ID é obrigatório."); return; }
    if (!formData.partner_id || formData.partner_id === "none") { alert("O campo Vincular Parceiro Oficial é obrigatório."); return; }

    const integrationDetailsToSave = parsedPreview.integration_details || JSON.parse(jsonEditors.integration_details || "{}");
    if (formData.integration_method === "EMAIL" && !integrationDetailsToSave.email) {
      alert("O campo E-mail de Destino é obrigatório quando o método for E-mail.");
      return;
    }

    try {
      setIsSaving(true);
      const payload: OrchestratorRow = {
        ...(initialData?.id ? { id: initialData.id } : {}),
        config_type: formData.config_type,
        lookup_id: formData.lookup_id,
        entity_type: formData.entity_type,
        page_url: formData.page_url,
        integration_method: formData.integration_method,
        partner_id: Number(formData.partner_id),
        is_active: formData.is_active,
        is_integrated: formData.is_integrated,
        integration_details: integrationDetailsToSave,
        rules: parsedPreview.rules || JSON.parse(jsonEditors.rules || "{}"),
        page_configs: parsedPreview.page_configs || JSON.parse(jsonEditors.page_configs || "{}"),
        consent_configs: parsedPreview.consent_configs || JSON.parse(jsonEditors.consent_configs || "[]"),
        page_faqs: parsedPreview.page_faqs || JSON.parse(jsonEditors.page_faqs || "[]"),
      };
      await onSave(payload);
    } catch (e: any) { alert(`Erro ao salvar: ${e.message}`); } 
    finally { setIsSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 bg-neutral-100 flex flex-col animate-in fade-in duration-200">
      <header className="flex items-center justify-between px-6 py-4 bg-white border-b border-neutral-200 shadow-sm shrink-0">
        <div>
          <h2 className="text-base font-semibold text-neutral-900 flex items-center gap-2">
            {initialData?.id ? <><Edit size={16} className="text-neutral-700" /> Editando Rota #{initialData.id}</> : <><Plus size={16} className="text-neutral-700" /> Nova Rota</>}
          </h2>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={onClose} disabled={isSaving} className="rounded-none border-neutral-200 text-neutral-900 hover:bg-neutral-100 shadow-xs text-xs">Cancelar</Button>
          <Button size="sm" onClick={handleSaveClick} disabled={isSaving} className="rounded-none bg-neutral-900 hover:bg-neutral-800 text-white font-medium shadow-xs text-xs">
            {isSaving ? <RefreshCw className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Save className="w-3.5 h-3.5 mr-1.5" />} Salvar Rota
          </Button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        <div className="w-[60%] flex flex-col bg-white border-r border-neutral-200 overflow-hidden shadow-sm z-10">
          <Tabs defaultValue="general" className="flex-1 flex flex-col h-full">
            <TabsList className="w-full justify-start rounded-none border-b border-neutral-200 bg-transparent p-0 h-11 shrink-0">
              <TabsTrigger value="general" className="data-[state=active]:border-b-2 data-[state=active]:border-neutral-900 rounded-none h-full px-5 text-neutral-500 data-[state=active]:text-neutral-900 font-medium text-xs"><Settings2 className="w-3.5 h-3.5 mr-1.5" /> Geral</TabsTrigger>
              <TabsTrigger value="rules" className="data-[state=active]:border-b-2 data-[state=active]:border-neutral-900 rounded-none h-full px-5 text-neutral-500 data-[state=active]:text-neutral-900 font-medium text-xs"><Code2 className="w-3.5 h-3.5 mr-1.5" /> Regras & Integração</TabsTrigger>
              <TabsTrigger value="visual" className="data-[state=active]:border-b-2 data-[state=active]:border-neutral-900 rounded-none h-full px-5 text-neutral-500 data-[state=active]:text-neutral-900 font-medium text-xs"><LayoutTemplate className="w-3.5 h-3.5 mr-1.5" /> Oferta & Rodapé</TabsTrigger>
              <TabsTrigger value="legal" className="data-[state=active]:border-b-2 data-[state=active]:border-neutral-900 rounded-none h-full px-5 text-neutral-500 data-[state=active]:text-neutral-900 font-medium text-xs"><FileText className="w-3.5 h-3.5 mr-1.5" /> LGPD & FAQs</TabsTrigger>
            </TabsList>

            <div className="flex-1 overflow-y-auto p-6">
              <TabsContent value="general" className="space-y-5 mt-0">
                <div className="grid grid-cols-2 gap-5">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-medium text-neutral-400 uppercase">Tipo</label>
                    <Select value={formData.config_type} onValueChange={(v) => setFormData({ ...formData, config_type: v })}>
                      <SelectTrigger className="h-10 rounded-none border-neutral-200 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent className="rounded-none border-neutral-200 text-xs">
                        <SelectItem value="EVENT" className="rounded-none cursor-pointer">Evento (EVENT)</SelectItem>
                        <SelectItem value="SELLER" className="rounded-none cursor-pointer">Seller (SELLER)</SelectItem>
                        <SelectItem value="PRODUCT" className="rounded-none cursor-pointer">Produto (PRODUCT)</SelectItem>
                        <SelectItem value="SUBCATEGORY" className="rounded-none cursor-pointer">Subcategoria (SUBCATEGORY)</SelectItem>
                        <SelectItem value="CATEGORY" className="rounded-none cursor-pointer">Categoria (CATEGORY)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-medium text-neutral-400 uppercase">Lookup ID <span className="text-red-600">*</span></label>
                    {formData.config_type === "PRODUCT" ? (
                      <Select value={String(formData.lookup_id || "")} onValueChange={(v) => setFormData({ ...formData, lookup_id: v })}>
                        <SelectTrigger className="h-10 rounded-none border-neutral-200 text-xs"><SelectValue placeholder="Selecione o produto..." /></SelectTrigger>
                        <SelectContent className="max-h-60 rounded-none border-neutral-200 text-xs">
                          {productsList.map((p) => <SelectItem key={p.id} value={String(p.id)} className="rounded-none cursor-pointer">{p.name} <span className="text-neutral-400 font-mono text-[10px]">(ID: {p.id})</span></SelectItem>)}
                        </SelectContent>
                      </Select>
                    ) : formData.config_type === "CATEGORY" ? (
                      <Select value={String(formData.lookup_id || "")} onValueChange={(v) => setFormData({ ...formData, lookup_id: v })}>
                        <SelectTrigger className="h-10 rounded-none border-neutral-200 text-xs"><SelectValue placeholder="Selecione a categoria..." /></SelectTrigger>
                        <SelectContent className="max-h-60 rounded-none border-neutral-200 text-xs">
                          {categoriesList.map((c) => <SelectItem key={c.id} value={String(c.id)} className="rounded-none cursor-pointer">{c.name} <span className="text-neutral-400 font-mono text-[10px]">(ID: {c.id})</span></SelectItem>)}
                        </SelectContent>
                      </Select>
                    ) : formData.config_type === "SELLER" ? (
                      <Select value={String(formData.lookup_id || "")} onValueChange={(v) => setFormData({ ...formData, lookup_id: v })}>
                        <SelectTrigger className="h-10 rounded-none border-neutral-200 text-xs"><SelectValue placeholder="Selecione o parceiro..." /></SelectTrigger>
                        <SelectContent className="max-h-60 rounded-none border-neutral-200 text-xs">
                          {partnersList.map((pt) => <SelectItem key={pt.id} value={String(pt.id)} className="rounded-none cursor-pointer">{pt.name} <span className="text-neutral-400 font-mono text-[10px]">(ID: {pt.id})</span></SelectItem>)}
                        </SelectContent>
                      </Select>
                    ) : (
                      <Input value={formData.lookup_id} onChange={(e) => setFormData({ ...formData, lookup_id: e.target.value })} className="h-10 rounded-none font-mono text-xs border-neutral-200 focus-visible:ring-1 focus-visible:ring-neutral-900 focus-visible:border-neutral-900" placeholder="Ex: ID ou código..." />
                    )}
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-medium text-neutral-400 uppercase">Público</label>
                    <Select value={formData.entity_type} onValueChange={(v) => setFormData({ ...formData, entity_type: v })}>
                      <SelectTrigger className="h-10 rounded-none border-neutral-200 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent className="rounded-none border-neutral-200 text-xs">
                        <SelectItem value="PF" className="rounded-none cursor-pointer">Pessoa Física</SelectItem>
                        <SelectItem value="PJ" className="rounded-none cursor-pointer">Pessoa Jurídica</SelectItem>
                        <SelectItem value="PF+PJ" className="rounded-none cursor-pointer">Ambos (PF+PJ)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-medium text-neutral-400 uppercase">Integração</label>
                    <Select value={formData.integration_method} onValueChange={(v) => setFormData({ ...formData, integration_method: v })}>
                      <SelectTrigger className="h-10 rounded-none border-neutral-200 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent className="rounded-none border-neutral-200 text-xs">
                        <SelectItem value="API" className="rounded-none cursor-pointer">API</SelectItem>
                        <SelectItem value="EMAIL" className="rounded-none cursor-pointer">E-mail</SelectItem>
                        <SelectItem value="FILE" className="rounded-none cursor-pointer">Arquivo</SelectItem>
                        <SelectItem value="MANUAL" className="rounded-none cursor-pointer">Manual</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5 col-span-2">
                    <label className="text-[10px] font-medium text-neutral-400 uppercase">URL de Destino</label>
                    <Input value={formData.page_url} onChange={(e) => setFormData({ ...formData, page_url: e.target.value })} className="h-10 rounded-none font-mono text-xs border-neutral-200 focus-visible:ring-1 focus-visible:ring-neutral-900 focus-visible:border-neutral-900" />
                  </div>
                  <div className="space-y-1.5 col-span-2">
                    <label className="text-[10px] font-medium text-neutral-400 uppercase flex items-center gap-1.5">Vincular Parceiro <span className="text-red-600">*</span></label>
                    <Select value={String(formData.partner_id || "")} onValueChange={(v) => setFormData({ ...formData, partner_id: v })}>
                      <SelectTrigger className="h-10 rounded-none border-neutral-200 text-xs"><SelectValue placeholder="Selecione um parceiro..." /></SelectTrigger>
                      <SelectContent className="max-h-60 rounded-none border-neutral-200 text-xs">
                        {partnersList.map((p) => <SelectItem key={p.id} value={String(p.id)} className="rounded-none cursor-pointer">{p.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="col-span-2 grid grid-cols-2 gap-4 pt-2">
                    <div className="p-3.5 bg-neutral-50 border border-neutral-200 rounded-none flex items-center justify-between">
                      <div><h4 className="font-medium text-xs text-neutral-900">Status Ativo</h4></div>
                      <Switch checked={formData.is_active} onCheckedChange={(v) => setFormData({ ...formData, is_active: v })} />
                    </div>
                    <div className="p-3.5 bg-neutral-50 border border-neutral-200 rounded-none flex items-center justify-between">
                      <div><h4 className="font-medium text-xs text-neutral-900">É Integrada?</h4></div>
                      <Switch checked={formData.is_integrated} onCheckedChange={(v) => setFormData({ ...formData, is_integrated: v })} />
                    </div>
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="rules" className="space-y-5 mt-0 pb-8">
                {(() => {
                  const rules = parsedPreview.rules || {};
                  const integration = parsedPreview.integration_details || {};
                  const updateRules = (newRules: any) => { setParsedPreview({ ...parsedPreview, rules: newRules }); setJsonEditors({ ...jsonEditors, rules: JSON.stringify(newRules, null, 2) }); };
                  const updateIntegration = (newInt: any) => { setParsedPreview({ ...parsedPreview, integration_details: newInt }); setJsonEditors({ ...jsonEditors, integration_details: JSON.stringify(newInt, null, 2) }); };

                  return (
                    <div className="space-y-5">
                      <div className="bg-white p-4 rounded-none border border-neutral-200 shadow-sm space-y-3">
                        <h4 className="text-[10px] font-medium uppercase text-neutral-400 border-b border-neutral-100 pb-2">1. Credenciais & Canais</h4>
                        <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-1"><label className="text-[10px] font-medium text-neutral-400 uppercase">CNPJ da Loja</label><Input value={integration.cnpjLoja || ""} onChange={(e) => updateIntegration({ ...integration, cnpjLoja: e.target.value })} className="h-8 text-xs font-mono rounded-none border-neutral-200 focus-visible:ring-1 focus-visible:ring-neutral-900 focus-visible:border-neutral-900" /></div>
                          <div className="space-y-1"><label className="text-[10px] font-medium text-neutral-400 uppercase">URL do WhatsApp</label><Input value={integration.urlWhatsApp || ""} onChange={(e) => updateIntegration({ ...integration, urlWhatsApp: e.target.value })} className="h-8 text-xs font-mono rounded-none border-neutral-200 focus-visible:ring-1 focus-visible:ring-neutral-900 focus-visible:border-neutral-900" /></div>
                        </div>
                        {formData.integration_method === "EMAIL" && (
                          <div className="space-y-1"><label className="text-[10px] font-medium text-neutral-400 uppercase flex items-center gap-1.5">E-mail de Destino <span className="text-red-600">*</span></label><Input type="email" value={integration.email || ""} onChange={(e) => updateIntegration({ ...integration, email: e.target.value })} className="h-8 text-xs font-mono border-neutral-200 bg-neutral-50 rounded-none focus-visible:ring-1 focus-visible:ring-neutral-900 focus-visible:border-neutral-900" /></div>
                        )}
                      </div>
                      <div className="bg-white p-4 rounded-none border border-neutral-200 shadow-sm space-y-3">
                        <h4 className="text-[10px] font-medium uppercase text-neutral-400 border-b border-neutral-100 pb-2">2. Regras de Parcelamento</h4>
                        <div className="space-y-1"><label className="text-[10px] font-medium text-neutral-400 uppercase">Opções de Parcelas</label><Input value={Array.isArray(rules.installment_options) ? rules.installment_options.join(", ") : ""} onChange={(e) => { const parsedArray = e.target.value.split(",").map((n) => Number(n.trim())).filter((n) => !isNaN(n) && n > 0); updateRules({ ...rules, installment_options: parsedArray }); }} className="h-8 text-xs font-mono rounded-none border-neutral-200 focus-visible:ring-1 focus-visible:ring-neutral-900 focus-visible:border-neutral-900" /></div>
                        <PaymentFactorsBuilder factors={rules.payment_factors || {}} onChange={(newFactors) => updateRules({ ...rules, payment_factors: newFactors })} />
                        <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-1"><label className="text-[10px] font-medium text-neutral-400 uppercase">Parcela Padrão</label><Input type="number" value={rules.default_installments ?? ""} onChange={(e) => updateRules({ ...rules, default_installments: Number(e.target.value) })} className="h-8 text-xs rounded-none border-neutral-200 focus-visible:ring-1 focus-visible:ring-neutral-900 focus-visible:border-neutral-900" /></div>
                          <div className="space-y-1"><label className="text-[10px] font-medium text-neutral-400 uppercase">Máx Financiado</label><Input type="number" value={rules.max_financed_amount ?? ""} onChange={(e) => updateRules({ ...rules, max_financed_amount: e.target.value ? Number(e.target.value) : undefined })} className="h-8 text-xs rounded-none border-neutral-200 focus-visible:ring-1 focus-visible:ring-neutral-900 focus-visible:border-neutral-900" /></div>
                        </div>
                        <div className="grid grid-cols-3 gap-2 pt-1">
                          <div className="space-y-1"><label className="text-[10px] font-medium text-neutral-400 uppercase">Min Entrada (%)</label><Input type="number" value={rules.min_down_payment_percentage ?? 0} onChange={(e) => updateRules({ ...rules, min_down_payment_percentage: Number(e.target.value) })} className="h-8 text-xs rounded-none border-neutral-200 focus-visible:ring-1 focus-visible:ring-neutral-900 focus-visible:border-neutral-900" /></div>
                          <div className="space-y-1"><label className="text-[10px] font-medium text-neutral-400 uppercase">Max Entrada (%)</label><Input type="number" value={rules.max_down_payment_percentage ?? 80} onChange={(e) => updateRules({ ...rules, max_down_payment_percentage: Number(e.target.value) })} className="h-8 text-xs rounded-none border-neutral-200 focus-visible:ring-1 focus-visible:ring-neutral-900 focus-visible:border-neutral-900" /></div>
                          <div className="space-y-1"><label className="text-[10px] font-medium text-neutral-400 uppercase">Cap Máximo (%)</label><Input type="number" value={rules.max_offer_cap_percent ?? 50} onChange={(e) => updateRules({ ...rules, max_offer_cap_percent: Number(e.target.value) })} className="h-8 text-xs rounded-none border-neutral-200 focus-visible:ring-1 focus-visible:ring-neutral-900 focus-visible:border-neutral-900" /></div>
                        </div>
                      </div>
                    </div>
                  );
                })()}
              </TabsContent>

              <TabsContent value="visual" className="space-y-5 mt-0 pb-8 min-h-[500px]">
                {(() => {
                  const config = parsedPreview.page_configs || {};
                  const offer = config.offer_panel || { partner: {}, headline: { parts: [] }, description: { parts: [] }, benefits: [] };
                  const footer = config.footer || { template_text: "", links: [] };
                  const updateConfig = (newConfig: any) => { setParsedPreview({ ...parsedPreview, page_configs: newConfig }); setJsonEditors({ ...jsonEditors, page_configs: JSON.stringify(newConfig, null, 2) }); };

                  return (
                    <div className="space-y-5">
                      <div className="bg-white p-4 rounded-none border border-neutral-200 shadow-sm space-y-3">
                        <h4 className="text-[10px] font-medium uppercase text-neutral-400 border-b border-neutral-100 pb-2">1. Oferta Principal</h4>
                        <TextPartsBuilder label="Título (Headline)" parts={offer.headline?.parts || []} onChange={(newParts) => updateConfig({ ...config, offer_panel: { ...offer, headline: { parts: newParts } } })} />
                        <TextPartsBuilder label="Subtítulo (Description)" parts={offer.description?.parts || []} onChange={(newParts) => updateConfig({ ...config, offer_panel: { ...offer, description: { parts: newParts } } })} />
                      </div>
                      <div className="bg-white p-4 rounded-none border border-neutral-200 shadow-sm space-y-3">
                        <h4 className="text-[10px] font-medium uppercase text-neutral-400 border-b border-neutral-100 pb-2">2. Benefícios</h4>
                        <BenefitsBuilder benefits={offer.benefits || []} onChange={(newBenefits) => updateConfig({ ...config, offer_panel: { ...offer, benefits: newBenefits } })} />
                      </div>
                      <div className="bg-white p-4 rounded-none border border-neutral-200 shadow-sm space-y-3">
                        <h4 className="text-[10px] font-medium uppercase text-neutral-400 border-b border-neutral-100 pb-2">3. Rodapé e Legal (Footer)</h4>
                        <FooterBuilder footer={footer} onChange={(newFooter) => updateConfig({ ...config, footer: newFooter })} />
                      </div>
                    </div>
                  );
                })()}
              </TabsContent>

              <TabsContent value="legal" className="space-y-6 mt-0 pb-8 flex flex-col">
                <div className="flex flex-col space-y-2">
                  <div className="flex justify-between items-center bg-neutral-50 p-2.5 rounded-none border border-neutral-200">
                    <h3 className="font-medium text-neutral-900 uppercase text-xs">Consentimentos (LGPD)</h3>
                    <Button onClick={() => { const current = parsedPreview.consent_configs || []; const updated = [...current, { id: `consent_${Date.now()}`, template_text: "", is_required: true, position: current.length + 1, links: [] }]; setParsedPreview({ ...parsedPreview, consent_configs: updated }); setJsonEditors({ ...jsonEditors, consent_configs: JSON.stringify(updated, null, 2) }); }} size="sm" className="bg-neutral-900 hover:bg-neutral-800 text-white text-[11px] h-7 rounded-none font-medium"><Plus size={12} className="mr-1" /> Add Termo</Button>
                  </div>
                  <div className="space-y-3">
                    {!parsedPreview.consent_configs || parsedPreview.consent_configs.length === 0 ? (
                      <div className="text-center p-5 border border-dashed border-neutral-200 rounded-none text-neutral-400 text-xs bg-neutral-50/50">Nenhum termo configurado.</div>
                    ) : (
                      parsedPreview.consent_configs.map((consent: any, index: number) => (
                        <ConsentItemBuilder key={index} consent={consent} onUpdate={(updatedConsent) => { const updatedList = [...parsedPreview.consent_configs]; updatedList[index] = updatedConsent; setParsedPreview({ ...parsedPreview, consent_configs: updatedList }); setJsonEditors({ ...jsonEditors, consent_configs: JSON.stringify(updatedList, null, 2) }); }} onRemove={() => { const updatedList = parsedPreview.consent_configs.filter((_: any, i: number) => i !== index); setParsedPreview({ ...parsedPreview, consent_configs: updatedList }); setJsonEditors({ ...jsonEditors, consent_configs: JSON.stringify(updatedList, null, 2) }); }} />
                      ))
                    )}
                  </div>
                </div>

                <div className="flex flex-col space-y-2 border-t border-neutral-200 pt-5">
                  <div className="flex justify-between items-center bg-neutral-50 p-2.5 rounded-none border border-neutral-200">
                    <h3 className="font-medium text-neutral-900 uppercase text-xs">Dúvidas Frequentes (FAQs)</h3>
                    <Button onClick={() => { const current = parsedPreview.page_faqs || []; const updated = [...current, { question: "", answer: "", position: current.length + 1, bullets: [] }]; setParsedPreview({ ...parsedPreview, page_faqs: updated }); setJsonEditors({ ...jsonEditors, page_faqs: JSON.stringify(updated, null, 2) }); }} size="sm" className="bg-neutral-900 hover:bg-neutral-800 text-white text-[11px] h-7 rounded-none font-medium"><Plus size={12} className="mr-1" /> Add FAQ</Button>
                  </div>
                  <div className="space-y-3">
                    {!parsedPreview.page_faqs || parsedPreview.page_faqs.length === 0 ? (
                      <div className="text-center p-5 border border-dashed border-neutral-200 rounded-none text-neutral-400 text-xs bg-neutral-50/50">Nenhuma FAQ configurada.</div>
                    ) : (
                      parsedPreview.page_faqs.map((faq: any, index: number) => (
                        <div key={index} className="bg-white border border-neutral-200 rounded-none p-3.5 shadow-sm relative group">
                          <button onClick={() => { const updated = parsedPreview.page_faqs.filter((_: any, i: number) => i !== index); setParsedPreview({ ...parsedPreview, page_faqs: updated }); setJsonEditors({ ...jsonEditors, page_faqs: JSON.stringify(updated, null, 2) }); }} className="absolute top-3 right-3 text-neutral-300 hover:text-red-600 opacity-0 group-hover:opacity-100"><X size={14} /></button>
                          <div className="grid gap-3 pr-5">
                            <Input value={faq.question} onChange={(e) => { const updated = [...parsedPreview.page_faqs]; updated[index].question = e.target.value; setParsedPreview({ ...parsedPreview, page_faqs: updated }); setJsonEditors({ ...jsonEditors, page_faqs: JSON.stringify(updated, null, 2) }); }} className="h-8 text-xs font-medium rounded-none border-neutral-200 focus-visible:ring-1 focus-visible:ring-neutral-900 focus-visible:border-neutral-900" placeholder="Pergunta..." />
                            <textarea value={faq.answer} onChange={(e) => { const updated = [...parsedPreview.page_faqs]; updated[index].answer = e.target.value; setParsedPreview({ ...parsedPreview, page_faqs: updated }); setJsonEditors({ ...jsonEditors, page_faqs: JSON.stringify(updated, null, 2) }); }} className="w-full h-14 border border-neutral-200 rounded-none p-2 text-xs outline-none focus:border-neutral-900 focus:ring-1 focus:ring-neutral-900 resize-none bg-neutral-50" placeholder="Resposta..." />
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </TabsContent>
            </div>
          </Tabs>
        </div>

        <div className="w-[40%] bg-neutral-50 overflow-y-auto relative flex flex-col">
          <div className="sticky top-0 px-6 pt-5 pb-3 z-20 bg-neutral-50 border-b border-neutral-200 shadow-xs shrink-0 flex items-center justify-between">
            <h3 className="font-semibold text-xs uppercase text-neutral-900 flex items-center gap-2"><span className="relative flex h-2 w-2"><span className="animate-ping absolute inline-flex h-full w-full rounded-none bg-neutral-900 opacity-75"></span><span className="relative inline-flex rounded-none h-2 w-2 bg-neutral-900"></span></span> Live Preview</h3>
          </div>
          
          <div className="p-6 space-y-6 pb-20 max-w-xl mx-auto w-full">
            {parsedPreview.page_configs && Object.keys(parsedPreview.page_configs).length > 0 ? (
              <div className="bg-white p-5 rounded-none shadow-sm border border-neutral-200">
                <PanelProduct config={parsedPreview.page_configs} />
              </div>
            ) : (<div className="text-center p-5 border border-dashed border-neutral-200 rounded-none text-neutral-400 text-xs">Page Configs vazio.</div>)}
            
            {parsedPreview.consent_configs && parsedPreview.consent_configs.length > 0 && (
              <div className="bg-white p-4 rounded-none shadow-sm border border-neutral-200">
                <PanelConsents configs={parsedPreview.consent_configs} />
              </div>
            )}
            
            {parsedPreview.page_faqs && parsedPreview.page_faqs.length > 0 && (
              <div className="bg-white p-4 rounded-none shadow-sm border border-neutral-200">
                <PanelFAQ faqs={parsedPreview.page_faqs} isPrint={false} />
              </div>
            )}
            
            {parsedPreview.page_configs?.footer && (
              <div className="pt-2">
                <PanelFooter footer={parsedPreview.page_configs.footer} />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// =========================================================================
// [COMPONENTE PRINCIPAL]: OrchestratorConfigsBackofficePage
// =========================================================================
function OrchestratorConfigsBackofficePage() {
  const [rows, setRows] = useState<OrchestratorRow[]>([]);
  const [productsMap, setProductsMap] = useState<Record<string, string>>({});
  const [categoriesMap, setCategoriesMap] = useState<Record<string, string>>({});
  const [partnersMap, setPartnersMap] = useState<Record<string, { name: string; logo_url: string }>>({});

  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"active" | "inactive" | "all">("active");

  const [isRouteDrawerOpen, setIsRouteDrawerOpen] = useState(false);
  const [activeConfig, setActiveConfig] = useState<OrchestratorRow | null>(null);

  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [editingConfig, setEditingConfig] = useState<OrchestratorRow | null>(null);

  const printRef = useRef<HTMLDivElement>(null);

  async function load() {
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc('get_backoffice_orchestrator_data');
      if (error) throw error;

      if (data) {
        setRows((data.configs as OrchestratorRow[]) || []);
        
        const pMap: Record<string, string> = {};
        (data.products || []).forEach((p: any) => pMap[String(p.id)] = p.name);
        setProductsMap(pMap);

        const cMap: Record<string, string> = {};
        (data.categories || []).forEach((c: any) => cMap[String(c.id)] = c.name);
        setCategoriesMap(cMap);

        const ptMap: Record<string, { name: string; logo_url: string }> = {};
        (data.partners || []).forEach((pt: any) => ptMap[String(pt.id)] = { name: pt.name, logo_url: pt.logo_url });
        setPartnersMap(ptMap);
      }
    } catch (err) {
      console.error("Erro crítico ao carregar dados do orchestrator:", err);
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  const handleDuplicateRoute = (config: OrchestratorRow) => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { id, created_at, ...rest } = config;
    setEditingConfig(rest);
    setIsRouteDrawerOpen(false); 
    setIsEditorOpen(true);
  };

  const handleSaveRoute = async (payload: OrchestratorRow) => {
    try {
      const { error } = await supabase.rpc('save_backoffice_orchestrator_config', {
        p_payload: payload
      });
      if (error) throw error;

      setIsEditorOpen(false);
      load();
    } catch (err: any) {
      console.error("Erro de BD ao salvar a rota:", err);
      throw new Error(err.message || "Erro desconhecido ao comunicar com o banco de dados.");
    }
  };

  const getProductOrCategoryName = (r: OrchestratorRow) => {
    if (r.config_type === "PRODUCT" && productsMap[r.lookup_id]) return productsMap[r.lookup_id];
    if (r.config_type === "CATEGORY" && categoriesMap[r.lookup_id]) return categoriesMap[r.lookup_id];
    if (r.config_type === "SELLER" && partnersMap[r.lookup_id]) return partnersMap[r.lookup_id].name;
    if (r.config_type === "EVENT") return `Evento: ${r.lookup_id}`;
    return r.lookup_id ? `ID #${r.lookup_id}` : "—";
  };

  const getPartnerInfo = (r: OrchestratorRow) => {
    const partnerId = r.partner_id || r.integration_details?.partner_id || r.page_configs?.offer_panel?.partner?.id;
    if (partnerId && partnersMap[String(partnerId)]) return partnersMap[String(partnerId)];
    return null;
  };

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return rows
      .filter((r) => {
        const isActive = r.is_active !== false;
        if (statusFilter === "active" && !isActive) return false;
        if (statusFilter === "inactive" && isActive) return false;
        if (!query) return true;
        const prodName = getProductOrCategoryName(r).toLowerCase();
        return (
          (String(r.id) ?? "").toLowerCase().includes(query) ||
          (r.lookup_id ?? "").toLowerCase().includes(query) ||
          (r.page_url ?? "").toLowerCase().includes(query) ||
          (r.config_type ?? "").toLowerCase().includes(query) ||
          (r.entity_type ?? "").toLowerCase().includes(query) ||
          prodName.includes(query)
        );
      })
      .sort((a, b) => {
        const idA = Number(a.id) || 0;
        const idB = Number(b.id) || 0;
        return idA - idB;
      });
  }, [rows, search, statusFilter, productsMap, categoriesMap]);

  const partnersList = useMemo(() => Object.entries(partnersMap).map(([id, p]) => ({ id, name: p.name })), [partnersMap]);
  const productsList = useMemo(() => Object.entries(productsMap).map(([id, name]) => ({ id, name })), [productsMap]);
  const categoriesList = useMemo(() => Object.entries(categoriesMap).map(([id, name]) => ({ id, name })), [categoriesMap]);

  const handlePrintSheet = () => {
    if (!printRef.current) return;
    const iframe = document.createElement("iframe");
    iframe.style.position = "fixed"; iframe.style.right = "0"; iframe.style.bottom = "0"; iframe.style.width = "0"; iframe.style.height = "0"; iframe.style.border = "0";
    document.body.appendChild(iframe);
    const iframeDoc = iframe.contentWindow?.document;
    if (!iframeDoc) return;
    const headHTML = document.head.innerHTML;
    const reportHTML = printRef.current.innerHTML;
    iframeDoc.open();
    iframeDoc.write(`<!DOCTYPE html><html lang="pt-BR"><head>${headHTML}<style>@page { margin: 15mm; } body { background-color: white !important; color: #0f172a !important; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }</style></head><body>${reportHTML}</body></html>`);
    iframeDoc.close();
    setTimeout(() => { if (iframe.contentWindow) { iframe.contentWindow.focus(); iframe.contentWindow.print(); } setTimeout(() => { document.body.removeChild(iframe); }, 1000); }, 500);
  };

  return (
    <div className="space-y-6 font-sans">
      <style>{`@media print { body > *:not(#root) { display: none !important; } #main-app-content { display: none !important; } html, body, #root { background: white !important; height: auto !important; min-height: 100% !important; overflow: visible !important; position: static !important; } }`}</style>

      <div id="main-app-content" className="space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-neutral-950">Consulta de Rotas</h1>
            <p className="text-sm text-neutral-600">Gerenciamento e inspeção ordenada das configurações de rotas.</p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={load} className="rounded-none border-neutral-200 bg-white text-neutral-900 hover:bg-neutral-100 shadow-xs text-xs" disabled={loading}>
              <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Atualizar
            </Button>
            <Button size="sm" onClick={() => { setEditingConfig(null); setIsEditorOpen(true); }} className="rounded-none bg-neutral-900 hover:bg-neutral-800 text-white font-medium shadow-xs text-xs hidden sm:flex">
              <Plus className="mr-2 h-4 w-4" /> Nova Rota
            </Button>
          </div>
        </div>

        <div className="rounded-none border border-neutral-200 bg-white overflow-hidden shadow-xs">
          <div className="flex flex-col lg:flex-row lg:items-center gap-4 border-b border-neutral-200 p-4 bg-neutral-50/50">
            <div className="relative w-full lg:flex-1 lg:max-w-md">
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por ID, URL, Produto..." className="h-11 w-full rounded-none bg-white border-neutral-200 pl-5 pr-12 text-[13px] text-neutral-900 placeholder:text-neutral-500 focus-visible:ring-1 focus-visible:ring-neutral-900 focus-visible:border-neutral-900 shadow-none" />
              <Search className="absolute right-4 top-1/2 -translate-y-1/2 h-[18px] w-[18px] text-neutral-400" />
            </div>
            <div className="flex items-center gap-2 lg:ml-auto">
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="h-10 rounded-none gap-2 bg-white text-neutral-900 border-neutral-200 hover:bg-neutral-50 transition-colors shadow-xs text-xs">
                    <Filter className="h-3.5 w-3.5 shrink-0 text-neutral-400" />
                    <span className="truncate">Status: {statusFilter === "active" ? "Ativas" : statusFilter === "inactive" ? "Inativas" : "Todas"}</span>
                    <ChevronDown className="h-3 w-3 shrink-0 text-neutral-400" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="p-0 w-48 bg-white border-neutral-200 rounded-none shadow-xs z-50" align="start">
                  <Command className="bg-transparent">
                    <CommandList className="text-xs">
                      <CommandGroup>
                        <CommandItem onSelect={() => setStatusFilter("active")} className="cursor-pointer rounded-none text-neutral-900 hover:bg-neutral-100 aria-selected:bg-neutral-100">Apenas Ativas</CommandItem>
                        <CommandItem onSelect={() => setStatusFilter("inactive")} className="cursor-pointer rounded-none text-neutral-900 hover:bg-neutral-100 aria-selected:bg-neutral-100">Apenas Inativas</CommandItem>
                        <CommandItem onSelect={() => setStatusFilter("all")} className="cursor-pointer rounded-none text-neutral-900 hover:bg-neutral-100 aria-selected:bg-neutral-100">Todas</CommandItem>
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>
          </div>

          <div className="w-full overflow-x-auto">
            <table className="w-full text-xs table-fixed">
              <thead>
                <tr className="border-b border-neutral-200 bg-neutral-100 text-left text-[10px] font-semibold uppercase tracking-wider text-neutral-600">
                  <th className="px-3 py-2.5 w-[70px]">ID</th>
                  <th className="px-3 py-2.5 w-[240px]">Regra</th>
                  <th className="px-3 py-2.5 w-[140px]">Parceiro</th>
                  <th className="px-3 py-2.5 w-[280px]">URL da Página</th>
                  <th className="px-3 py-2.5 w-[200px] text-right hidden sm:table-cell">Ações</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={5} className="p-10 text-center text-neutral-500"><div className="flex items-center justify-center gap-2"><Loader2 className="h-4 w-4 animate-spin text-neutral-900" /> Carregando informações...</div></td></tr>
                ) : filtered.length === 0 ? (
                  <tr><td colSpan={5} className="p-10 text-center text-neutral-500 font-medium">Nenhuma rota encontrada.</td></tr>
                ) : (
                  filtered.map((r) => {
                    const prodName = getProductOrCategoryName(r);
                    const partner = getPartnerInfo(r);
                    return (
                      <tr key={r.id} className="border-b border-neutral-100 hover:bg-neutral-50 transition-colors group cursor-pointer" onClick={() => { setActiveConfig(r); setIsRouteDrawerOpen(true); }}>
                        <td className="px-3 py-2.5 font-mono text-xs font-medium text-neutral-900">{r.id || "—"}</td>
                        <td className="px-3 py-2.5">
                          <div className="flex items-center gap-1.5"><span className="inline-flex items-center rounded-none border border-neutral-200 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider bg-neutral-100 text-neutral-700">{r.config_type || "—"}</span><span className="text-[10px] font-medium text-neutral-400">({r.entity_type || "N/A"})</span></div>
                          <div className="text-xs font-medium text-neutral-900 mt-1 truncate" title={prodName}>{prodName}</div>
                        </td>
                        <td className="px-3 py-2.5">
                          <div className="flex items-center gap-1.5 truncate">
                            {/* LOGO DO PARCEIRO = rounded-[6px] - EXCEÇÃO DA REGRA GERAL */}
                            <div className="flex h-9 w-9 items-center justify-center bg-transparent shrink-0 rounded-[6px] overflow-hidden border border-neutral-200" title={partner?.name}>
                              {partner?.logo_url ? <img src={partner.logo_url} className="h-full w-full object-cover rounded-[6px]" alt={partner.name} /> : <span className="flex items-center justify-center h-full w-full text-[10px] font-bold uppercase text-neutral-900 bg-neutral-100 rounded-[6px]">{partner?.name ? partner.name.slice(0, 3) : "—"}</span>}
                            </div>
                            <span className="text-xs font-medium text-neutral-900 truncate" title={partner?.name}>{partner?.name || "N/A"}</span>
                          </div>
                        </td>
                        <td className="px-3 py-2.5 font-mono text-[11px] text-neutral-400 truncate" title={r.page_url}>{r.page_url || "—"}</td>
                        <td className="px-3 py-2.5 text-right hidden sm:table-cell">
                          <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); setActiveConfig(r); setIsRouteDrawerOpen(true); }} className="rounded-none text-neutral-600 hover:text-neutral-900 hover:bg-neutral-100 px-2 h-8 text-[11px] font-medium"><Search className="w-3 h-3 mr-1 text-neutral-400" /> Insp.</Button>
                            <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); handleDuplicateRoute(r); }} className="rounded-none text-neutral-700 hover:text-neutral-900 hover:bg-neutral-100 px-2 h-8 text-[11px] font-medium"><Copy className="w-3 h-3 mr-1 text-neutral-400" /> Duplicar</Button>
                            <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); setEditingConfig(r); setIsEditorOpen(true); }} className="rounded-none text-neutral-700 hover:text-neutral-900 hover:bg-neutral-100 px-2 h-8 text-[11px] font-medium"><Edit className="w-3 h-3 mr-1 text-neutral-400" /> Edit</Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {isRouteDrawerOpen && activeConfig && (
          <div className="fixed inset-0 z-50 flex justify-end bg-black/40 backdrop-blur-xs transition-all">
            <div className="w-full sm:max-w-xl bg-white h-full shadow-2xl flex flex-col overflow-hidden animate-in slide-in-from-right duration-300">
              <div className="flex items-center justify-between p-4 border-b border-neutral-200 bg-white shrink-0">
                <div className="flex items-center gap-2 truncate pr-2">
                  <span className="w-2.5 h-2.5 rounded-none bg-neutral-900 shrink-0" />
                  <h3 className="text-xs sm:text-sm font-semibold uppercase text-neutral-900 truncate">Consulta de Rota: ID #{activeConfig.id} - {getProductOrCategoryName(activeConfig)}</h3>
                </div>
                <button onClick={() => setIsRouteDrawerOpen(false)} className="p-1 rounded-none text-neutral-400 hover:text-neutral-900 hover:bg-neutral-100 cursor-pointer shrink-0"><X size={18} /></button>
              </div>

              <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5">
                <div className="space-y-5">
                  <div className="bg-neutral-50 p-3.5 rounded-none border border-neutral-200 text-[10px] sm:text-xs space-y-1 font-mono text-neutral-800">
                    <p><span className="text-neutral-400 font-normal">ID Config:</span> {activeConfig.id} <span className="text-neutral-300">|</span> <span className="text-neutral-400 font-normal">Lookup ID:</span> {activeConfig.lookup_id}</p>
                    <p><span className="text-neutral-400 font-normal">Tipo:</span> {activeConfig.config_type} ({activeConfig.entity_type})</p>
                    <p><span className="text-neutral-400 font-normal">Método:</span> {activeConfig.integration_method || "—"}</p>
                    <p className="break-words pt-1 border-t border-neutral-200 mt-1.5"><span className="text-neutral-400 font-normal">URL:</span> {activeConfig.page_url}</p>
                  </div>

                  {activeConfig.page_configs?.offer_panel && (
                    <div className="bg-white p-4 rounded-none border border-neutral-200 shadow-sm break-inside-avoid space-y-3">
                      <h4 className="text-[11px] font-semibold uppercase tracking-wider text-neutral-900 flex items-center gap-1.5 border-b border-neutral-100 pb-2"><Layers size={14} className="text-neutral-700" /> Offer Panel</h4>
                      <PanelProduct config={activeConfig.page_configs} />
                    </div>
                  )}

                  <div className="flex flex-col gap-3">
                    {activeConfig.integration_details && Object.keys(activeConfig.integration_details).length > 0 && (
                      <div className="bg-neutral-50 p-3.5 rounded-none border border-neutral-200 text-xs overflow-hidden"><h4 className="font-medium text-neutral-900 mb-2 uppercase text-[10px] tracking-wide flex items-center gap-1.5"><Code2 size={12} className="text-neutral-500" /> Integration Details</h4><pre className="font-mono text-[9px] text-neutral-600 whitespace-pre-wrap break-all overflow-x-auto bg-white p-2.5 rounded-none border border-neutral-200">{JSON.stringify(activeConfig.integration_details, null, 2)}</pre></div>
                    )}
                    {activeConfig.rules && Object.keys(activeConfig.rules).length > 0 && (
                      <div className="bg-neutral-50 p-3.5 rounded-none border border-neutral-200 text-xs overflow-hidden"><h4 className="font-medium text-neutral-900 mb-2 uppercase text-[10px] tracking-wide flex items-center gap-1.5"><SlidersHorizontal size={12} className="text-neutral-500" /> Rules</h4><pre className="font-mono text-[9px] text-neutral-600 whitespace-pre-wrap break-all overflow-x-auto bg-white p-2.5 rounded-none border border-neutral-200">{JSON.stringify(activeConfig.rules, null, 2)}</pre></div>
                    )}
                  </div>

                  {activeConfig.consent_configs && activeConfig.consent_configs.length > 0 && (
                    <div className="bg-white p-4 rounded-none border border-neutral-200 shadow-sm break-inside-avoid space-y-3">
                      <h4 className="text-[11px] font-semibold uppercase tracking-wider text-neutral-900 flex items-center gap-1.5 border-b border-neutral-100 pb-2"><FileText size={14} className="text-neutral-700" /> Consentimentos</h4>
                      <PanelConsents configs={activeConfig.consent_configs} />
                    </div>
                  )}

                  {activeConfig.page_faqs && activeConfig.page_faqs.length > 0 && (
                    <div className="bg-white p-4 rounded-none border border-neutral-200 shadow-sm break-inside-avoid space-y-3">
                      <h4 className="text-[11px] font-semibold uppercase tracking-wider text-neutral-900 flex items-center gap-1.5 border-b border-neutral-100 pb-2"><HelpCircle size={14} className="text-neutral-700" /> FAQs</h4>
                      <PanelFAQ faqs={activeConfig.page_faqs} isPrint={false} />
                    </div>
                  )}

                  {activeConfig.page_configs?.footer && (
                    <div className="pt-1">
                      <PanelFooter footer={activeConfig.page_configs.footer} />
                    </div>
                  )}
                </div>
              </div>

              <div className="p-3 sm:p-4 border-t border-neutral-200 bg-white flex flex-col gap-2 shrink-0 shadow-lg w-full">
                <div className="flex items-center gap-2 w-full">
                  <Button variant="outline" size="sm" onClick={() => handleDuplicateRoute(activeConfig)} className="hidden sm:flex flex-1 rounded-none text-xs gap-1.5 border-neutral-200 text-neutral-900 hover:bg-neutral-100 h-9 font-medium px-2"><Copy className="h-3.5 w-3.5 shrink-0 text-neutral-400" /> Duplicar</Button>
                  <Button variant="outline" size="sm" onClick={handlePrintSheet} className="flex-1 rounded-none text-xs gap-1.5 border-neutral-200 text-neutral-900 hover:bg-neutral-100 h-9 font-medium px-2"><Printer className="h-3.5 w-3.5 shrink-0 text-neutral-400" /> Imprimir</Button>
                </div>
                <Button size="sm" onClick={() => setIsRouteDrawerOpen(false)} className="w-full rounded-none text-xs bg-neutral-900 hover:bg-neutral-800 text-white h-9 font-medium">Fechar</Button>
              </div>
            </div>
          </div>
        )}

        {isEditorOpen && (
          <OrchestratorConfigEditor initialData={editingConfig} partnersList={partnersList} productsList={productsList} categoriesList={categoriesList} onClose={() => setIsEditorOpen(false)} onSave={handleSaveRoute} />
        )}
      </div>

      <div style={{ display: "none" }}>
        <div ref={printRef} className="w-full text-neutral-900 bg-white p-8">
          {activeConfig && (() => {
            const r = activeConfig;
            const prodName = getProductOrCategoryName(r);
            return (
              <div className="space-y-6">
                <div className="flex items-center justify-between border-b border-neutral-200 pb-4 mb-4">
                  <div>
                    <div className="flex items-center gap-2 mb-1"><span className="text-xs font-semibold text-neutral-900 uppercase">Consulta de Rota</span><span className={`px-2.5 py-0.5 text-xs font-semibold rounded-none border border-neutral-300 bg-neutral-50 uppercase`}>{r.is_active ? "Ativa" : "Inativa"}</span></div>
                    <h1 className="text-2xl font-bold text-neutral-950">{prodName}</h1>
                  </div>
                  <div className="text-right text-xs text-neutral-500 font-mono">ID: {r.id}<br />Lookup ID: {r.lookup_id}</div>
                </div>

                <div className="bg-neutral-50 p-4 rounded-none border border-neutral-200 text-xs space-y-1 font-mono text-neutral-700">
                  <p><b>Tipo:</b> {r.config_type} ({r.entity_type})</p><p><b>URL:</b> {r.page_url}</p><p><b>Método:</b> {r.integration_method || "—"}</p>
                </div>

                {r.page_configs?.offer_panel && (
                  <div className="bg-white p-4 rounded-none border border-neutral-200 shadow-sm break-inside-avoid">
                    <h4 className="text-[11px] font-semibold uppercase tracking-wider text-neutral-900 flex items-center gap-1.5 mb-3 border-b border-neutral-100 pb-2"><Layers size={14} /> Offer Panel</h4>
                    <PanelProduct config={r.page_configs} />
                  </div>
                )}
                {r.integration_details && Object.keys(r.integration_details).length > 0 && (
                  <div className="bg-neutral-50 p-4 rounded-none border border-neutral-200 text-xs overflow-hidden break-inside-avoid"><h4 className="font-medium text-neutral-900 mb-2 uppercase text-[10px] tracking-wide flex items-center gap-1.5"><Code2 size={12} /> Integration Details</h4><pre className="font-mono text-[9px] text-neutral-600 whitespace-pre-wrap break-all bg-white p-2.5 rounded-none border border-neutral-200">{JSON.stringify(r.integration_details, null, 2)}</pre></div>
                )}
                {r.rules && Object.keys(r.rules).length > 0 && (
                  <div className="bg-neutral-50 p-4 rounded-none border border-neutral-200 text-xs overflow-hidden break-inside-avoid"><h4 className="font-medium text-neutral-900 mb-2 uppercase text-[10px] tracking-wide flex items-center gap-1.5"><SlidersHorizontal size={12} /> Rules</h4><pre className="font-mono text-[9px] text-neutral-600 whitespace-pre-wrap break-all bg-white p-2.5 rounded-none border border-neutral-200">{JSON.stringify(r.rules, null, 2)}</pre></div>
                )}
                {r.consent_configs && r.consent_configs.length > 0 && (
                  <div className="bg-white p-4 rounded-none border border-neutral-200 shadow-sm break-inside-avoid">
                    <h4 className="text-[11px] font-semibold uppercase tracking-wider text-neutral-900 flex items-center gap-1.5 mb-3 border-b border-neutral-100 pb-2"><FileText size={14} /> Consentimentos</h4>
                    <PanelConsents configs={r.consent_configs} />
                  </div>
                )}
                {r.page_faqs && r.page_faqs.length > 0 && (
                  <div className="bg-white p-4 rounded-none border border-neutral-200 shadow-sm break-inside-avoid">
                    <h4 className="text-[11px] font-semibold uppercase tracking-wider text-neutral-900 flex items-center gap-1.5 mb-3 border-b border-neutral-100 pb-2"><HelpCircle size={14} /> FAQs</h4>
                    <PanelFAQ faqs={r.page_faqs} isPrint={true} />
                  </div>
                )}
                {r.page_configs?.footer && (
                  <div className="pt-2 break-inside-avoid">
                    <PanelFooter footer={r.page_configs.footer} />
                  </div>
                )}
              </div>
            );
          })()}
        </div>
      </div>
    </div>
  );
}