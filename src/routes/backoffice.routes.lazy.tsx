/**
 * ============================================================================
 * @fileoverview Consulta e Gestão de Rotas / Orchestrator (Backoffice)
 * @module Backoffice/OrchestratorConfigs
 * @route /backoffice/orchestrator-configs
 * 
 * @description
 * Este módulo atua como o painel central de governança e inspeção das rotas e 
 * configurações do Orchestrator. Ele realiza a listagem direta de registros na tabela
 * `orchestrator_configs`, cruzando informações relacionais com as tabelas de domínio
 * (`product_types`, `category_types` e `partners`). Inclui suporte a ordenação por ID,
 * filtragem dinâmica por status (Ativas/Inativas) e inspeção aprofundada via painel 
 * lateral (Sheet/Drawer) estruturado com blocos visuais de propostas, regras, FAQs e LGPD.
 * 
 * NOVO: Inclui um Editor Híbrido (Split-Screen) com Live Preview em tempo real 
 * para criação e edição fluida de JSONs complexos.
 * 
 * @architecture
 * - Data Fetching: Consultas relacionais diretas via PostgREST (Supabase Client).
 * - State Management: Hooks reativos do React (useState, useEffect, useMemo).
 * - Design System: Componentes padronizados do Tailwind CSS e Shadcn/UI.
 * ============================================================================
 */

import { createLazyFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState, useRef } from "react";
import { 
  RefreshCw, 
  Search, 
  Layers, 
  FileText, 
  HelpCircle, 
  X,
  CheckCircle2,
  Code2,
  SlidersHorizontal,
  Filter,
  ChevronDown,
  Plus,
  Edit,
  Save,
  LayoutTemplate,
  Settings2,
  AlertTriangle
} from "lucide-react";

// Componentes da Interface (Design System Shadcn/UI)
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandGroup, CommandItem, CommandList } from "@/components/ui/command";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Checkbox } from "@/components/ui/checkbox";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

// Camada de Persistência (BaaS) e Dicionários Gráficos
import { supabase } from "@/integrations/supabase/client";
import { ICON_MAP } from "@/features/financial-hub/components/shared/icons-map";

// ============================================================================
// [REGISTRO DA ROTA TANSTACK ROUTER]
// ============================================================================
export const Route = createLazyFileRoute("/backoffice/routes")({
  component: OrchestratorConfigsBackofficePage,
});

/**
 * @type {OrchestratorRow}
 * @description Tipagem estrita mapeando a estrutura de colunas da tabela de rotas.
 */
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

/**
 * =========================================================================
 * [SUB-COMPONENTES DA ROTA]: Renderizadores de UI do Orchestrator
 * =========================================================================
 */

function FAQSection({ items }: { items?: any[] }) {
  if (!items || items.length === 0) return null;
  const sortedItems = [...items].sort((a, b) => (a.position || 0) - (b.position || 0));

  return (
    <section className="py-1 overflow-hidden bg-white">
      <div className="max-w-full">
        {/* REMOVIDO: md:grid-cols-2. AGORA É UMA COLUNA SÓ PARA SIMULAR MOBILE */}
        <div className="grid grid-cols-1 gap-y-2">
          <Accordion type="single" collapsible className="w-full space-y-2">
            {sortedItems.map((item, i) => (
              <AccordionItem 
                key={i} 
                value={`faq-item-${i}`} 
                className="border border-border rounded-xl px-3 bg-white shadow-sm transition-all"
              >
                <AccordionTrigger className="text-left font-semibold text-xs text-foreground/90 py-2.5">
                  {item.question}
                </AccordionTrigger>
                {/* ... resto do conteúdo do accordion ... */}
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </div>
    </section>
  );
}

function FooterRender({ config }: { config?: any }) {
  if (!config?.template_text) return null;
  const { template_text, links = [] } = config;

  const renderText = () => {
    const parts = template_text.split(/\{([^}]+)\}/g);
    return parts.map((part: string, index: number) => {
      const linkMatch = links.find((l: any) => l.text === part);
      if (linkMatch) {
        return (
          <a
            key={index}
            href={linkMatch.url}
            target="_blank"
            rel="noopener noreferrer"
            className="underline font-medium text-slate-500 hover:text-slate-800 transition-colors"
          >
            {part}
          </a>
        );
      }
      return <span key={index}>{part}</span>;
    });
  };

  return (
    <div className="space-y-2">
      <h4 className="text-[11px] font-bold uppercase text-purple-600 flex items-center gap-1.5">
        <FileText size={14} /> Rodapé Legal (Footer)
      </h4>
      <footer className="py-3 px-3 text-center text-[10px] text-muted-foreground bg-slate-50 border rounded-xl">
        <p className="leading-relaxed text-justify sm:text-center text-slate-400">
          {renderText()}
        </p>
      </footer>
    </div>
  );
}

function OfferPanelRender({ config }: { config: any }) {
  const panel = config?.offer_panel || config;
  if (!panel?.headline?.parts || !panel?.description?.parts) return null;
  
  const brandColor = config?.theme?.primary_color || "var(--brand-primary)";

  const getTextStyle = (type: string) => {
    switch (type) {
      case "highlight": return "text-[#B300FF]";
      case "bold": return "font-bold text-foreground";
      default: return "text-foreground";
    }
  };

  return (
    <div className="space-y-3" style={{ '--brand-primary': brandColor } as React.CSSProperties}>
      <div className="space-y-1.5">
        <h2 className="text-base font-semibold leading-tight text-foreground sm:text-lg">
          {panel.headline.parts.map((part: any, i: number) => (
            <span key={i} className={getTextStyle(part.type)}>{part.text}</span>
          ))}
        </h2>
        <p className="text-xs text-muted-foreground leading-relaxed">
          {panel.description.parts.map((part: any, i: number) => (
            <span key={i} className={getTextStyle(part.type)}>{part.text}</span>
          ))}
        </p>
      </div>

      {panel.benefits && Array.isArray(panel.benefits) && (
        <ul className="grid grid-cols-1 gap-2 pt-1">
          {panel.benefits.map((b: any, i: number) => {
            const IconComponent = ICON_MAP[b.icon] || ICON_MAP[b.icon?.toLowerCase()] || CheckCircle2;
            return (
              <li key={i} className="flex items-start gap-2 text-xs">
                <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-lg bg-[#B300FF]/10 text-[#B300FF]">
                  <IconComponent className="h-3.5 w-3.5" />
                </span>
                <div>
                  <p className="font-medium text-foreground text-xs">{b.title}</p>
                  <p className="text-[10px] text-muted-foreground">{b.description}</p>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {panel.partner?.name && (
        <div className="rounded-xl border border-border bg-muted/40 p-2.5 text-[11px] text-muted-foreground">
          {panel.partner.label}{" "}
          <strong className="text-foreground">{panel.partner.name}</strong>.
        </div>
      )}
    </div>
  );
}

function DynamicConsentsStatic({ configs }: { configs: any[] }) {
  if (!configs || configs.length === 0) return null;

  return (
    <TooltipProvider delayDuration={200}>
      <div className="flex flex-col rounded-lg border border-border bg-muted/10 p-3 space-y-2.5">
        {[...configs]
          .sort((a, b) => a.position - b.position)
          .map((opt) => (
            <div key={opt.id} className="flex gap-2 items-start py-0.5 text-xs">
              <div className="flex items-center mt-0.5">
                <Checkbox disabled checked={false} className="h-4 w-4 shrink-0 rounded-[4px] border-slate-400" />
              </div>
              <label className="text-[11px] text-muted-foreground leading-snug flex-1">
                {opt.template_text ? (
                  opt.template_text.split(/(\{.*?\})/g).map((part: string, i: number) => {
                    if (part.startsWith("{") && part.endsWith("}")) {
                      const cleanText = part.replace(/[{}]/g, "");
                      const linkConfig = opt.links?.find((l: any) => l.text === cleanText);
                      if (!linkConfig) return <span key={i} className="font-bold text-foreground">{cleanText}</span>;
                      return (
                        <span key={i} className="underline font-bold inline mx-0.5" style={{ color: "var(--brand-primary)" }}>
                          {cleanText}
                        </span>
                      );
                    }
                    return <span key={i}>{part}</span>;
                  })
                ) : null}
              </label>
            </div>
          ))}
      </div>
    </TooltipProvider>
  );
}

/**
 * =========================================================================
 * [SUB-COMPONENTE DE CONSTRUTOR]: ConsentItemBuilder
 * =========================================================================
 * @description 
 * Encapsula a lógica de edição individual de um termo de consentimento (LGPD).
 * Este componente foi extraído para garantir que a manipulação de texto via 
 * Expressão Regular (Regex) e o controle de foco do cursor no campo textarea 
 * ocorram de forma isolada e performática, sem renderizar a página inteira 
 * a cada keystroke.
 * 
 * @features
 * - Sincronização Bidirecional: Sincroniza o texto digitado com a lista de tags configuráveis dinamicamente.
 * - Inserção Dinâmica: Envolve o texto selecionado (API nativa de selectionStart/End) com chaves {}.
 * - Gestão de Estado Elevada (Lifting State Up): Comunica alterações ao componente pai (OrchestratorConfigEditor) 
 *   através dos callbacks `onUpdate` e `onRemove` para compor o JSON final do Live Preview de forma reativa.
 */
function ConsentItemBuilder({ 
  consent, 
  onUpdate, 
  onRemove 
}: { 
  consent: any, 
  onUpdate: (c: any) => void, 
  onRemove: () => void 
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  /**
   * Monitora alterações na string do Textarea e sincroniza as {tags} encontradas
   * com o array de configurações de links.
   * 
   * @param {string} newText - O texto atualizado proveniente do evento onChange.
   */
  const handleTextChange = (newText: string) => {
    // Regex Pattern: Captura qualquer conteúdo entre chaves { }, não guloso (lazy).
    const matches = newText.match(/\{([^}]+)\}/g) || [];
    // Higieniza o array resultante, removendo os caracteres de chaves para cruzar com o banco.
    const currentTags = matches.map((m) => m.replace(/[{}]/g, ""));

    // Recupera a lista de links legada do estado atual
    const existingLinks = consent.links || [];
    
    // Mapeia e constrói o novo array de links
    // Se a tag já estava configurada (comparando texto com texto), preserva suas propriedades (URL/Tooltip).
    // Caso contrário, injeta o boilerplate padrão para uma nova configuração de link Web.
    const newLinks = currentTags.map((tag) => {
      const found = existingLinks.find((l: any) => l.text === tag);
      return found || { text: tag, type: "web", url: "", tooltip_text: "" };
    });

    // Propaga o objeto consent atualizado para o estado global do painel
    onUpdate({ ...consent, template_text: newText, links: newLinks });
  };

  /**
   * Transforma a seleção atual de texto (highlight via mouse) em um {link}.
   * Utiliza as APIs nativas do HTMLTextAreaElement para injetar os caracteres no DOM.
   */
  const handleInsertTag = () => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const text = consent.template_text || "";

    // Fail-fast: Se o cursor apenas estiver piscando sem nada selecionado.
    if (start === end) {
      alert("Por favor, selecione uma palavra no texto primeiro para criar o link.");
      return;
    }

    const selectedText = text.substring(start, end);
    
    // Prevenção de quebra de sintaxe (Ex: aninhar chaves {{texto}})
    if (selectedText.includes("{") || selectedText.includes("}")) return;

    // Constrói a nova string injetando as chaves ao redor da substring capturada
    const newText = text.substring(0, start) + `{${selectedText}}` + text.substring(end);
    
    // Aciona a mesma lógica do onChange para que o Regex atue no novo texto
    handleTextChange(newText);
    
    // Macro-task fallback: Devolve o foco ao Textarea após a renderização do React ter 
    // liberado o Call Stack, garantindo que o usuário não perca o contexto da digitação.
    setTimeout(() => { textarea.focus(); }, 0);
  };

  /**
   * Atualiza propriedades pontuais (como a URL ou o tipo) de um item específico no array de links.
   * Utiliza desestruturação para garantir imutabilidade do objeto principal.
   * 
   * @param {number} index - O índice do link no array atual.
   * @param {any} updates - O objeto parcial contendo as chaves a serem atualizadas.
   */
  const updateLinkConfig = (index: number, updates: any) => {
    const newLinks = [...(consent.links || [])];
    newLinks[index] = { ...newLinks[index], ...updates };
    onUpdate({ ...consent, links: newLinks });
  };

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm relative group">
      {/* Botão de Remoção Contextual (Aparece no Hover da Div Pai) */}
      <button 
        onClick={onRemove}
        className="absolute top-3 right-3 text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
        title="Remover Termo"
      >
        <X size={16} />
      </button>
      
      <div className="grid gap-4">
        {/* CABEÇALHO DO ITEM (ID Funcional e Switch de Obrigatoriedade) */}
        <div className="flex gap-4 items-end">
          <div className="flex-1 space-y-1.5">
            <label className="text-[10px] font-bold text-slate-500 uppercase">ID do Termo</label>
            <Input 
              value={consent.id} 
              onChange={(e) => onUpdate({ ...consent, id: e.target.value })} 
              className="h-8 text-xs font-mono bg-slate-50" 
            />
          </div>
          <div className="flex items-center gap-2 mb-1.5">
            <Switch 
              checked={consent.is_required} 
              onCheckedChange={(v) => onUpdate({ ...consent, is_required: v })} 
            />
            <span className="text-[10px] font-medium text-slate-500">Obrigatório?</span>
          </div>
        </div>

        {/* ÁREA DE TEXTO PRINCIPAL COM BOTÃO DE AÇÃO RÁPIDA (WYSIWYG Híbrido) */}
        <div className="space-y-1.5">
          <div className="flex justify-between items-center">
            <label className="text-[10px] font-bold text-slate-500 uppercase">Texto do Termo</label>
            <button
              onClick={handleInsertTag}
              className="text-[10px] font-bold text-[#B300FF] bg-[#B300FF]/10 px-2 py-1 rounded hover:bg-[#B300FF]/20 transition-colors flex items-center"
              type="button"
            >
              🔗 Criar Link (Selecione o texto)
            </button>
          </div>
          <textarea 
            ref={textareaRef}
            value={consent.template_text || ""} 
            onChange={(e) => handleTextChange(e.target.value)} 
            className="w-full h-16 border border-slate-200 rounded-lg p-2 text-xs outline-none focus:border-[#B300FF] resize-none"
            placeholder="Ex: Concordo com a Política de Privacidade."
          />
        </div>

        {/* ÁREA DINÂMICA DE RENDERIZAÇÃO DE LINKS: 
            Só é injetada no DOM se o motor Regex identificar Tags ativas no texto principal */}
        {consent.links && consent.links.length > 0 && (
          <div className="bg-slate-50 rounded-lg p-3 border border-slate-100 space-y-2 mt-1">
            <h5 className="text-[10px] font-bold text-slate-500 uppercase mb-2">Configuração dos Links</h5>
            {consent.links.map((link: any, idx: number) => (
              /* Layout ajustado para flex-col (empilhado em duas linhas) */
              <div key={idx} className="flex flex-col gap-2.5 bg-white p-3 rounded-lg border border-slate-200 shadow-sm">
                
                {/* LINHA SUPERIOR: Visualização da Tag e Seletor de Tipo */}
                <div className="flex items-start justify-between gap-3 w-full">
                  <div className="flex-1">
                    <span className="text-[9px] text-slate-400 block uppercase mb-0.5">Texto Destacado</span>
                    <span className="text-xs font-bold text-slate-800 leading-snug block">{link.text}</span>
                  </div>
                  
                  <div className="w-[120px]">
                    <Select 
                      value={link.type} 
                      onValueChange={(v) => updateLinkConfig(idx, { type: v })}
                    >
                      <SelectTrigger className="h-8 text-[11px] bg-slate-50"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="web">Link Web</SelectItem>
                        <SelectItem value="tooltip">Tooltip</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* LINHA INFERIOR: Input Condicional (Ocupando 100% da largura) */}
                <div className="w-full">
                  {link.type === "web" ? (
                    <Input
                      type="url"
                      placeholder="https://exemplo.com/url"
                      value={link.url || ""}
                      onChange={(e) => updateLinkConfig(idx, { url: e.target.value })}
                      className="h-8 text-xs w-full bg-slate-50"
                    />
                  ) : (
                    <textarea
                      placeholder="Digite o texto detalhado do balão de ajuda..."
                      value={link.tooltip_text || ""}
                      onChange={(e) => updateLinkConfig(idx, { tooltip_text: e.target.value })}
                      className="w-full min-h-[70px] border border-slate-200 rounded-md p-2.5 text-xs outline-none focus:border-[#B300FF] resize-y leading-relaxed text-slate-700 bg-slate-50"
                    />
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

/**
 * =========================================================================
 * [SUB-COMPONENTES DE UI BUILDER]: Para a Aba "Oferta & Rodapé"
 * =========================================================================
 * Estes componentes abstraem a manipulação de arrays aninhados do objeto page_configs,
 * como as partes de texto (para pintar palavras específicas), os benefícios e o rodapé.
 */

function TextPartsBuilder({ label, parts = [], onChange }: { label: string, parts: any[], onChange: (p: any[]) => void }) {
  return (
    <div className="space-y-1.5">
      <label className="text-[10px] font-bold text-slate-500 uppercase">{label}</label>
      <div className="space-y-2 bg-slate-50/50 p-2.5 border rounded-lg">
        {parts.map((part, idx) => (
          <div key={idx} className="flex gap-2 items-center">
            <Input 
              value={part.text} 
              onChange={(e) => { const newParts = [...parts]; newParts[idx].text = e.target.value; onChange(newParts); }} 
              className="h-8 text-xs flex-1 bg-white" 
              placeholder="Digite o pedaço do texto..." 
            />
            <Select 
              value={part.type || "normal"} 
              onValueChange={(v) => { const newParts = [...parts]; newParts[idx].type = v; onChange(newParts); }}
            >
              <SelectTrigger className="h-8 w-28 text-[11px] bg-white"><SelectValue/></SelectTrigger>
              <SelectContent>
                <SelectItem value="normal">Normal</SelectItem>
                <SelectItem value="bold">Negrito</SelectItem>
                <SelectItem value="highlight">Destaque Cor</SelectItem>
              </SelectContent>
            </Select>
            <button onClick={() => onChange(parts.filter((_, i) => i !== idx))} className="text-slate-300 hover:text-red-500 transition-colors"><X size={14}/></button>
          </div>
        ))}
        {parts.length === 0 && <p className="text-[10px] text-slate-400 italic text-center py-1">Nenhum texto configurado.</p>}
        <Button 
          type="button"
          onClick={() => onChange([...parts, {text: "", type: "normal"}])} 
          variant="ghost" 
          size="sm" 
          className="h-7 text-[10px] text-[#B300FF] w-full mt-1 border border-dashed border-[#B300FF]/40 hover:bg-[#B300FF]/10"
        >
          <Plus size={12} className="mr-1"/> Adicionar Pedaço de Texto
        </Button>
      </div>
    </div>
  );
}

function BenefitsBuilder({ benefits = [], onChange }: { benefits: any[], onChange: (b: any[]) => void }) {
  // Busca dinamicamente todas as chaves mapeadas no seu dicionário oficial
  const iconOptions = Object.keys(ICON_MAP);
  
  return (
    <div className="space-y-3">
      {benefits.map((ben, idx) => (
        <div key={idx} className="bg-slate-50 p-3 rounded-lg border border-slate-200 relative group space-y-3">
          <button 
            onClick={() => onChange(benefits.filter((_, i) => i !== idx))}
            className="absolute top-2 right-2 text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
            title="Remover Benefício"
          ><X size={14}/></button>
          
          <div className="flex gap-3">
            <div className="w-1/3 space-y-1">
              <label className="text-[9px] font-bold text-slate-500 uppercase">Ícone</label>
              <Select value={ben.icon} onValueChange={(v) => { const n = [...benefits]; n[idx].icon = v; onChange(n); }}>
                <SelectTrigger className="h-8 text-[11px] bg-white">
                  <SelectValue placeholder="Escolha..." />
                </SelectTrigger>
                <SelectContent className="max-h-60">
                  {iconOptions.map(iconKey => {
                    // Instancia o componente do ícone para mostrá-lo na lista
                    const IconComponent = ICON_MAP[iconKey]; 
                    return (
                      <SelectItem key={iconKey} value={iconKey}>
                        <div className="flex items-center gap-2">
                          {IconComponent && <IconComponent className="w-3.5 h-3.5 text-[#B300FF]" />}
                          <span>{iconKey}</span>
                        </div>
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>
            <div className="w-2/3 space-y-1">
              <label className="text-[9px] font-bold text-slate-500 uppercase">Título</label>
              <Input 
                value={ben.title} 
                onChange={(e) => { const n = [...benefits]; n[idx].title = e.target.value; onChange(n); }} 
                className="h-8 text-xs bg-white" 
                placeholder="Ex: Até 48 meses"
              />
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-[9px] font-bold text-slate-500 uppercase">Descrição</label>
            <Input 
              value={ben.description} 
              onChange={(e) => { const n = [...benefits]; n[idx].description = e.target.value; onChange(n); }} 
              className="h-8 text-xs bg-white" 
              placeholder="Ex: Escolha a parcela que cabe no seu bolso"
            />
          </div>
        </div>
      ))}
      <Button 
        type="button"
        onClick={() => onChange([...benefits, {icon: "Check", title: "", description: ""}])} 
        variant="outline" 
        size="sm" 
        className="h-8 text-[10px] w-full border-dashed"
      >
        <Plus size={12} className="mr-1"/> Adicionar Benefício
      </Button>
    </div>
  );
}

/**
 * Construtor Híbrido para o Rodapé (Footer).
 * Utiliza a mesma lógica de seleção de texto (WYSIWYG) dos Consentimentos (LGPD),
 * mas otimizado apenas para Links Web (sem suporte a Tooltips).
 */
function FooterBuilder({ footer = {}, onChange }: { footer: any, onChange: (f: any) => void }) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // 1. Sincroniza as chaves {} digitadas com os campos de URL embaixo
  const handleTextChange = (newText: string) => {
    const matches = newText.match(/\{([^}]+)\}/g) || [];
    const currentTags = matches.map((m) => m.replace(/[{}]/g, ""));

    const existingLinks = footer.links || [];
    const newLinks = currentTags.map((tag) => {
      const found = existingLinks.find((l: any) => l.text === tag);
      return found || { text: tag, url: "" }; // Rodapé usa apenas URL
    });

    onChange({ ...footer, template_text: newText, links: newLinks });
  };

  // 2. Ação do botão: Envolve o texto selecionado com {}
  const handleInsertTag = () => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const text = footer.template_text || "";

    if (start === end) {
      alert("Por favor, selecione uma palavra no texto primeiro para criar o link.");
      return;
    }

    const selectedText = text.substring(start, end);
    if (selectedText.includes("{") || selectedText.includes("}")) return;

    const newText = text.substring(0, start) + `{${selectedText}}` + text.substring(end);
    
    handleTextChange(newText);
    setTimeout(() => { textarea.focus(); }, 0);
  };

  // 3. Atualiza a URL digitada no campo dinâmico
  const updateLinkConfig = (index: number, urlValue: string) => {
    const newLinks = [...(footer.links || [])];
    newLinks[index].url = urlValue;
    onChange({ ...footer, links: newLinks });
  };

  return (
    <div className="space-y-3">
      {/* HEADER DA CAIXA DE TEXTO COM BOTÃO */}
      <div className="flex justify-between items-center">
        <label className="text-[10px] font-bold text-slate-500 uppercase">Texto do Rodapé</label>
        <button
          onClick={handleInsertTag}
          className="text-[10px] font-bold text-[#B300FF] bg-[#B300FF]/10 px-2 py-1 rounded hover:bg-[#B300FF]/20 transition-colors flex items-center"
          type="button"
        >
          🔗 Criar Link (Selecione o texto)
        </button>
      </div>
      
      {/* ÁREA DE TEXTO PRINCIPAL */}
      <textarea 
        ref={textareaRef}
        value={footer.template_text || ""} 
        onChange={(e) => handleTextChange(e.target.value)} 
        className="w-full h-24 border border-slate-200 rounded-lg p-2.5 text-xs outline-none focus:border-[#B300FF] resize-y leading-relaxed text-slate-600 bg-white"
        placeholder="© 2026 Wallet sbX. Autorizado por {Nome da Empresa}."
      />

{/* ÁREA DINÂMICA DE LINKS (Aparece ao detectar chaves) */}
      {footer.links && footer.links.length > 0 && (
        <div className="bg-slate-50 rounded-lg p-3 border border-slate-100 space-y-2 mt-2">
          <h5 className="text-[10px] font-bold text-slate-500 uppercase mb-2">URLs Mapeadas no Texto</h5>
          {footer.links.map((link: any, idx: number) => (
            /* Layout ajustado para flex-col (empilhado em duas linhas) */
            <div key={idx} className="flex flex-col gap-2.5 bg-white p-3 rounded-lg border border-slate-200 shadow-sm">
              <div className="w-full">
                <span className="text-[9px] text-slate-400 block uppercase mb-0.5">Texto Destacado</span>
                <span className="text-xs font-bold text-slate-800 leading-snug block">{link.text}</span>
              </div>
              <div className="w-full">
                <Input
                  type="url"
                  placeholder="https://exemplo.com/url"
                  value={link.url || ""}
                  onChange={(e) => updateLinkConfig(idx, e.target.value)}
                  className="h-8 text-xs w-full bg-slate-50"
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * =========================================================================
 * [COMPONENTE DE EDITOR]: OrchestratorConfigEditor (Split-Screen)
 * =========================================================================
 * @description Interface híbrida para edição de dados relacionais e JSONs complexos.
 * Apresenta Live Preview à direita validando a configuração visual e de regras na hora.
 */
function OrchestratorConfigEditor({ 
  initialData = null, 
  partnersList = [],
  onClose, 
  onSave 
}: { 
  initialData?: OrchestratorRow | null, 
  partnersList: { id: string | number, name: string }[],
  onClose: () => void,
  onSave: (data: OrchestratorRow) => Promise<void>
}) {
  const [isSaving, setIsSaving] = useState(false);

  // 1. Estados fixos
  const [formData, setFormData] = useState({
    config_type: initialData?.config_type || "PRODUCT",
    lookup_id: initialData?.lookup_id || "",
    entity_type: initialData?.entity_type || "PF+PJ",
    page_url: initialData?.page_url || "http://localhost:8080/financiamentos/",
    integration_method: initialData?.integration_method || "API",
    partner_id: initialData?.partner_id ? String(initialData.partner_id) : "none",
    is_active: initialData?.is_active ?? true,
    is_integrated: initialData?.is_integrated ?? true,
  });

  // 2. Estados em String para o Editor JSON
  const [jsonEditors, setJsonEditors] = useState({
    integration_details: initialData?.integration_details && Object.keys(initialData.integration_details).length > 0 
      ? JSON.stringify(initialData.integration_details, null, 2) : "{\n  \n}",
    rules: initialData?.rules && Object.keys(initialData.rules).length > 0 
      ? JSON.stringify(initialData.rules, null, 2) : "{\n  \n}",
    page_configs: initialData?.page_configs && Object.keys(initialData.page_configs).length > 0 
      ? JSON.stringify(initialData.page_configs, null, 2) : "{\n  \n}",
    consent_configs: initialData?.consent_configs && initialData.consent_configs.length > 0 
      ? JSON.stringify(initialData.consent_configs, null, 2) : "[\n  \n]",
    page_faqs: initialData?.page_faqs && initialData.page_faqs.length > 0 
      ? JSON.stringify(initialData.page_faqs, null, 2) : "[\n  \n]",
  });

  // 3. Estados de Preview Parseeados
  const [parsedPreview, setParsedPreview] = useState<any>({
    page_configs: initialData?.page_configs || null,
    consent_configs: initialData?.consent_configs || null,
    page_faqs: initialData?.page_faqs || null,
  });

  const [jsonErrors, setJsonErrors] = useState<Record<string, string | null>>({});

  // Atualiza e Tenta Parsear o JSON para Live Preview
  const handleJsonChange = (field: keyof typeof jsonEditors, value: string) => {
    setJsonEditors(prev => ({ ...prev, [field]: value }));
    
    if (!value.trim() || value === "{}" || value === "[]") {
      setJsonErrors(prev => ({ ...prev, [field]: null }));
      setParsedPreview(prev => ({ ...prev, [field]: null }));
      return;
    }

    try {
      const parsed = JSON.parse(value);
      setJsonErrors(prev => ({ ...prev, [field]: null }));
      
      // Live update the visual components
      if (['page_configs', 'consent_configs', 'page_faqs'].includes(field)) {
        setParsedPreview(prev => ({ ...prev, [field]: parsed }));
      }
    } catch (e: any) {
      setJsonErrors(prev => ({ ...prev, [field]: `JSON Inválido: ${e.message}` }));
    }
  };

  const handleSaveClick = async () => {
    const hasErrors = Object.values(jsonErrors).some(err => err !== null);
    if (hasErrors) {
      alert("Corrija os erros de JSON antes de salvar.");
      return;
    }

    if (!formData.lookup_id) {
      alert("O campo Lookup ID é obrigatório.");
      return;
    }

    try {
      setIsSaving(true);
      const payload: OrchestratorRow = {
        ...(initialData?.id ? { id: initialData.id } : {}), // Preserva ID se for edição
        config_type: formData.config_type,
        lookup_id: formData.lookup_id,
        entity_type: formData.entity_type,
        page_url: formData.page_url,
        integration_method: formData.integration_method,
        partner_id: formData.partner_id !== "none" ? Number(formData.partner_id) : null,
        is_active: formData.is_active,
        is_integrated: formData.is_integrated,
        integration_details: JSON.parse(jsonEditors.integration_details || "{}"),
        rules: JSON.parse(jsonEditors.rules || "{}"),
        page_configs: JSON.parse(jsonEditors.page_configs || "{}"),
        consent_configs: JSON.parse(jsonEditors.consent_configs || "[]"),
        page_faqs: JSON.parse(jsonEditors.page_faqs || "[]"),
      };

      await onSave(payload);
    } catch (e: any) {
      alert(`Erro ao salvar: ${e.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-100 flex flex-col animate-in fade-in duration-200">
      
      {/* HEADER DO EDITOR */}
      <header className="flex items-center justify-between px-6 py-4 bg-white border-b shadow-sm shrink-0">
        <div>
          <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
            {initialData ? <><Edit size={18} className="text-[#B300FF]"/> Editando Rota #{initialData.id}</> : <><Plus size={18} className="text-[#B300FF]"/> Nova Configuração de Rota</>}
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">Configure parâmetros, integrações e o visual da oferta.</p>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="outline" onClick={onClose} disabled={isSaving}>Cancelar</Button>
          <Button onClick={handleSaveClick} disabled={isSaving} className="bg-[#B300FF] hover:bg-[#9f00e6]">
            {isSaving ? <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />} 
            Salvar Rota
          </Button>
        </div>
      </header>

      {/* ÁREA DE SPLIT-SCREEN */}
      <div className="flex flex-1 overflow-hidden">
        
        {/* LADO ESQUERDO: CONFIGURAÇÃO (60%) */}
        <div className="w-[60%] flex flex-col bg-white border-r overflow-hidden shadow-[4px_0_24px_-12px_rgba(0,0,0,0.1)] z-10">
          <Tabs defaultValue="general" className="flex-1 flex flex-col h-full">
            <TabsList className="w-full justify-start rounded-none border-b bg-transparent p-0 h-12 shrink-0">
              <TabsTrigger value="general" className="data-[state=active]:border-b-2 data-[state=active]:border-[#B300FF] rounded-none h-full px-6">
                <Settings2 className="w-4 h-4 mr-2" /> Geral
              </TabsTrigger>
              <TabsTrigger value="rules" className="data-[state=active]:border-b-2 data-[state=active]:border-[#B300FF] rounded-none h-full px-6">
                <Code2 className="w-4 h-4 mr-2" /> Regras & Integração
              </TabsTrigger>
              <TabsTrigger value="visual" className="data-[state=active]:border-b-2 data-[state=active]:border-[#B300FF] rounded-none h-full px-6">
                <LayoutTemplate className="w-4 h-4 mr-2" /> Oferta & Rodapé
              </TabsTrigger>
              <TabsTrigger value="legal" className="data-[state=active]:border-b-2 data-[state=active]:border-[#B300FF] rounded-none h-full px-6">
                <FileText className="w-4 h-4 mr-2" /> Consentimentos & FAQs
              </TabsTrigger>
            </TabsList>

            <div className="flex-1 overflow-y-auto p-6">
              
              {/* TAB 1: GERAL (Campos Fixos) */}
              <TabsContent value="general" className="space-y-6 mt-0">
                <div className="grid grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-slate-600 uppercase">Tipo de Configuração</label>
                    <Select value={formData.config_type} onValueChange={(v) => setFormData({...formData, config_type: v})}>
                      <SelectTrigger className="h-11 rounded-xl"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="PRODUCT">Produto (PRODUCT)</SelectItem>
                        <SelectItem value="CATEGORY">Categoria (CATEGORY)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-bold text-slate-600 uppercase flex items-center gap-1.5">
                      Lookup ID <span className="text-red-500">*</span>
                    </label>
                    <Input value={formData.lookup_id} onChange={(e) => setFormData({...formData, lookup_id: e.target.value})} placeholder="Ex: 8, 11..." className="h-11 rounded-xl" />
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-bold text-slate-600 uppercase">Público (Entity Type)</label>
                    <Select value={formData.entity_type} onValueChange={(v) => setFormData({...formData, entity_type: v})}>
                      <SelectTrigger className="h-11 rounded-xl"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="PF">Pessoa Física (PF)</SelectItem>
                        <SelectItem value="PJ">Pessoa Jurídica (PJ)</SelectItem>
                        <SelectItem value="PF+PJ">Ambos (PF+PJ)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-bold text-slate-600 uppercase">Método de Integração</label>
                    <Select value={formData.integration_method} onValueChange={(v) => setFormData({...formData, integration_method: v})}>
                      <SelectTrigger className="h-11 rounded-xl"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="API">API Gateway</SelectItem>
                        <SelectItem value="WEBHOOK">Webhook Direto</SelectItem>
                        <SelectItem value="FORM">Formulário Externo</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2 col-span-2">
                    <label className="text-xs font-bold text-slate-600 uppercase">URL de Destino (Front-end ou Parceiro)</label>
                    <Input value={formData.page_url} onChange={(e) => setFormData({...formData, page_url: e.target.value})} className="h-11 rounded-xl font-mono text-sm" />
                  </div>

                  <div className="space-y-2 col-span-2">
                    <label className="text-xs font-bold text-slate-600 uppercase">Vincular Parceiro Oficial</label>
                    <Select value={formData.partner_id} onValueChange={(v) => setFormData({...formData, partner_id: v})}>
                      <SelectTrigger className="h-11 rounded-xl"><SelectValue placeholder="Selecione um parceiro (opcional)"/></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Nenhum / Não Aplicável</SelectItem>
                        {partnersList.map(p => (
                          <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  
                  <div className="col-span-2 grid grid-cols-2 gap-4 pt-4">
                    <div className="p-4 bg-slate-50 border rounded-xl flex items-center justify-between">
                      <div>
                        <h4 className="font-bold text-sm text-slate-800">Status Ativo</h4>
                        <p className="text-[11px] text-muted-foreground">Define se a rota está online</p>
                      </div>
                      <Switch checked={formData.is_active} onCheckedChange={(v) => setFormData({...formData, is_active: v})} />
                    </div>

                    <div className="p-4 bg-slate-50 border rounded-xl flex items-center justify-between">
                      <div>
                        <h4 className="font-bold text-sm text-slate-800">É Integrada?</h4>
                        <p className="text-[11px] text-muted-foreground">Exige orquestração sistêmica</p>
                      </div>
                      <Switch checked={formData.is_integrated} onCheckedChange={(v) => setFormData({...formData, is_integrated: v})} />
                    </div>
                  </div>
                </div>
              </TabsContent>

              {/* TAB 2: REGRAS E INTEGRAÇÃO (JSON Editor) */}
              <TabsContent value="rules" className="space-y-6 mt-0 flex flex-col h-full pb-8">
                <div className="flex-1 flex flex-col space-y-2 min-h-[250px]">
                  <label className="text-xs font-bold text-slate-600 uppercase">Rules & Installments (Regras de Negócio)</label>
                  <textarea 
                    className="flex-1 w-full bg-slate-900 text-green-400 font-mono text-xs p-4 rounded-xl outline-none focus:ring-2 focus:ring-[#B300FF]"
                    value={jsonEditors.rules}
                    onChange={(e) => handleJsonChange('rules', e.target.value)}
                    spellCheck={false}
                  />
                   {jsonErrors.rules && <p className="text-xs text-red-500 font-bold flex items-center"><AlertTriangle className="w-3 h-3 mr-1"/>{jsonErrors.rules}</p>}
                </div>

                <div className="flex-1 flex flex-col space-y-2 min-h-[250px]">
                  <label className="text-xs font-bold text-slate-600 uppercase">Integration Details (Credenciais / Webhooks)</label>
                  <textarea 
                    className="flex-1 w-full bg-slate-900 text-green-400 font-mono text-xs p-4 rounded-xl outline-none focus:ring-2 focus:ring-[#B300FF]"
                    value={jsonEditors.integration_details}
                    onChange={(e) => handleJsonChange('integration_details', e.target.value)}
                    spellCheck={false}
                  />
                  {jsonErrors.integration_details && <p className="text-xs text-red-500 font-bold flex items-center"><AlertTriangle className="w-3 h-3 mr-1"/>{jsonErrors.integration_details}</p>}
                </div>
              </TabsContent>

              {/* TAB 3: VISUAL DA PÁGINA (Interface 100% Visual sem JSON) */}
              <TabsContent value="visual" className="h-full flex flex-col mt-0 pb-8 min-h-[500px] space-y-6">
                 
                 <div className="flex justify-between items-center bg-purple-50 p-3 rounded-xl border border-purple-100">
                    <div>
                      <h3 className="font-bold text-slate-800 uppercase text-xs flex items-center gap-2">
                        <LayoutTemplate size={14} className="text-[#B300FF]" /> Identidade Visual & Painel
                      </h3>
                      <p className="text-[10px] text-muted-foreground mt-0.5">Construa o visual da página da rota de forma totalmente no-code.</p>
                    </div>
                 </div>

                 {/* FUNÇÃO AUXILIAR PARA ATUALIZAÇÃO REATIVA DO PAGE_CONFIGS */}
                 {(() => {
                   // Extrai a configuração atual garantindo fallbacks seguros caso seja um JSON vazio ou novo
                   const config = parsedPreview.page_configs || {};
                   const theme = config.theme || { box_bg: "bg-white/80", box_radius: "rounded-3xl", primary_color: "#B300FF" };
                   const offer = config.offer_panel || { partner: {}, headline: { parts: [] }, description: { parts: [] }, benefits: [] };
                   const footer = config.footer || { template_text: "", links: [] };

                   // Atualizador mestre de estado
                   const updateConfig = (newConfig: any) => {
                     setParsedPreview({ ...parsedPreview, page_configs: newConfig });
                     setJsonEditors({ ...jsonEditors, page_configs: JSON.stringify(newConfig, null, 2) });
                   };

                   return (
                     <div className="space-y-6">
                      {/* 1. SEÇÃO DE CORES E TEMA */}
                        <div className="bg-white p-5 rounded-xl border shadow-sm space-y-4">
                          <h4 className="text-[11px] font-bold uppercase text-slate-800 border-b pb-2">1. Cores e Estilo do Box</h4>
                          <div className="grid grid-cols-3 gap-4">
                            
                            {/* Cor Principal (Mantém o color picker que já está legal) */}
                            <div className="space-y-1.5">
                              <label className="text-[10px] font-bold text-slate-500 uppercase">Cor Principal</label>
                              <div className="flex gap-2 items-center">
                                <input 
                                  type="color" 
                                  value={theme.primary_color || "#B300FF"} 
                                  onChange={(e) => updateConfig({ ...config, theme: { ...theme, primary_color: e.target.value } })}
                                  className="w-8 h-8 rounded cursor-pointer border-0 p-0"
                                />
                                <Input 
                                  value={theme.primary_color || ""} 
                                  onChange={(e) => updateConfig({ ...config, theme: { ...theme, primary_color: e.target.value } })}
                                  className="h-8 text-xs font-mono uppercase" 
                                />
                              </div>
                            </div>

                            {/* Fundo do Box (Transformado em Select amigável) */}
                            <div className="space-y-1.5">
                              <label className="text-[10px] font-bold text-slate-500 uppercase">Fundo do Box</label>
                              <Select 
                                value={theme.box_bg || "bg-white/80"} 
                                onValueChange={(v) => updateConfig({ ...config, theme: { ...theme, box_bg: v } })}
                              >
                                <SelectTrigger className="h-8 text-xs bg-white"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="bg-white">Branco Sólido</SelectItem>
                                  <SelectItem value="bg-white/80">Branco Translúcido (Glass)</SelectItem>
                                  <SelectItem value="bg-slate-50">Cinza Suave</SelectItem>
                                  <SelectItem value="bg-slate-900">Escuro (Dark)</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>

                            {/* Raio da Borda (Transformado em Select amigável) */}
                            <div className="space-y-1.5">
                              <label className="text-[10px] font-bold text-slate-500 uppercase">Raio da Borda</label>
                              <Select 
                                value={theme.box_radius || "rounded-3xl"} 
                                onValueChange={(v) => updateConfig({ ...config, theme: { ...theme, box_radius: v } })}
                              >
                                <SelectTrigger className="h-8 text-xs bg-white"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="rounded-none">Reto (Sem borda)</SelectItem>
                                  <SelectItem value="rounded-xl">Médio (Padrão)</SelectItem>
                                  <SelectItem value="rounded-3xl">Grande (Arredondado)</SelectItem>
                                  <SelectItem value="rounded-full">Total (Pílula)</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>

                          </div>
                        </div>

                        {/* 2. SEÇÃO DE CABEÇALHO E PARCEIRO */}
                        <div className="bg-white p-5 rounded-xl border shadow-sm space-y-4">
                          <h4 className="text-[11px] font-bold uppercase text-slate-800 border-b pb-2">2. Oferta Principal (Textos)</h4>
                          
                          <div className="grid grid-cols-2 gap-4 pb-2">
                            <div className="space-y-1.5">
                              <label className="text-[10px] font-bold text-slate-500 uppercase">Rótulo do Parceiro</label>
                              <Input 
                                value={offer.partner?.label || ""} 
                                onChange={(e) => updateConfig({ ...config, offer_panel: { ...offer, partner: { ...offer.partner, label: e.target.value } } })}
                                className="h-8 text-xs" placeholder="Ex: Parceria com:" 
                              />
                            </div>
                            <div className="space-y-1.5">
                              <label className="text-[10px] font-bold text-slate-500 uppercase">Nome do Parceiro</label>
                              <Input 
                                value={offer.partner?.name || ""} 
                                onChange={(e) => updateConfig({ ...config, offer_panel: { ...offer, partner: { ...offer.partner, name: e.target.value } } })}
                                className="h-8 text-xs text-slate-700" placeholder="Ex: MERESOLVE" 
                              />
                            </div>
                          </div>

                          <TextPartsBuilder 
                            label="Título Principal (Headline)" 
                            parts={offer.headline?.parts || []} 
                            onChange={(newParts) => updateConfig({ ...config, offer_panel: { ...offer, headline: { parts: newParts } } })} 
                          />
                          
                          <TextPartsBuilder 
                            label="Subtítulo (Description)" 
                            parts={offer.description?.parts || []} 
                            onChange={(newParts) => updateConfig({ ...config, offer_panel: { ...offer, description: { parts: newParts } } })} 
                          />
                        </div>

                        {/* 3. SEÇÃO DE BENEFÍCIOS */}
                        <div className="bg-white p-5 rounded-xl border shadow-sm space-y-4">
                          <h4 className="text-[11px] font-bold uppercase text-slate-800 border-b pb-2">3. Benefícios da Solução</h4>
                          <BenefitsBuilder 
                            benefits={offer.benefits || []} 
                            onChange={(newBenefits) => updateConfig({ ...config, offer_panel: { ...offer, benefits: newBenefits } })}
                          />
                        </div>

                        {/* 4. SEÇÃO DO RODAPÉ (FOOTER) */}
                        <div className="bg-white p-5 rounded-xl border shadow-sm space-y-4">
                          <h4 className="text-[11px] font-bold uppercase text-slate-800 border-b pb-2">4. Rodapé e Legal (Footer)</h4>
                          
                          {/* 
                            * Invocação do novo FooterBuilder. Toda a complexidade de Regex e controle 
                            * do textarea foi abstraída. Passamos o objeto inteiro e recebemos ele pronto.
                            */}
                          <FooterBuilder 
                            footer={footer} 
                            onChange={(newFooter) => updateConfig({ ...config, footer: newFooter })}
                          />
                        </div>

                     </div>
                   );
                 })()}
              </TabsContent>

              {/* TAB 4: LGPD E FAQS (CONSTRUTOR VISUAL) */}
              <TabsContent value="legal" className="space-y-8 mt-0 flex flex-col h-full pb-8">
                
                {/* --- CONSTRUTOR VISUAL DE CONSENTIMENTOS (LGPD) --- */}
                <div className="flex flex-col space-y-3">
                  <div className="flex justify-between items-center bg-purple-50 p-3 rounded-xl border border-purple-100">
                    <div>
                      <h3 className="font-bold text-slate-800 uppercase text-xs flex items-center gap-2">
                        <FileText size={14} className="text-[#B300FF]" /> Consentimentos (LGPD)
                      </h3>
                      <p className="text-[10px] text-muted-foreground mt-0.5">Adicione os termos que o usuário precisa aceitar.</p>
                    </div>
                    <Button 
                      onClick={() => {
                        const current = parsedPreview.consent_configs || [];
                        const newItem = { 
                          id: `consent_${Date.now()}`, 
                          template_text: "", 
                          is_required: true, 
                          position: current.length + 1, 
                          links: [] 
                        };
                        const updated = [...current, newItem];
                        setParsedPreview({ ...parsedPreview, consent_configs: updated });
                        setJsonEditors({ ...jsonEditors, consent_configs: JSON.stringify(updated, null, 2) });
                      }}
                      size="sm" 
                      className="bg-[#B300FF] hover:bg-[#9f00e6] text-white text-[11px] h-8 rounded-lg"
                    >
                      <Plus size={14} className="mr-1"/> Adicionar Termo
                    </Button>
                  </div>

                  <div className="space-y-3">
                    {(!parsedPreview.consent_configs || parsedPreview.consent_configs.length === 0) ? (
                      <div className="text-center p-6 border-2 border-dashed border-slate-200 rounded-xl text-slate-400 text-xs font-medium">
                        Nenhum termo de consentimento configurado.
                      </div>
                    ) : (
                      /* 
                       * Renderização otimizada dos termos de consentimento utilizando o 
                       * componente recém integrado ConsentItemBuilder. Ele abstrai a complexidade 
                       * da edição em linha (Regex, seleção de texto) e devolve para o estado global
                       * um JSON limpo e formatado.
                       */
                      parsedPreview.consent_configs.map((consent: any, index: number) => (
                        <ConsentItemBuilder
                          key={index}
                          consent={consent}
                          onUpdate={(updatedConsent) => {
                            // Cria uma cópia rasa e iterativa para não ferir o ciclo de imutabilidade do React
                            const updatedList = [...parsedPreview.consent_configs];
                            updatedList[index] = updatedConsent;
                            
                            // 1. Atualiza a árvore visual (Preview) à direita da tela.
                            setParsedPreview({ ...parsedPreview, consent_configs: updatedList });
                            // 2. Reflete as alterações como Payload serializado no editor subjacente (JSON).
                            setJsonEditors({ ...jsonEditors, consent_configs: JSON.stringify(updatedList, null, 2) });
                          }}
                          onRemove={() => {
                            // Extrai o item alvo da coleção mantendo a pureza funcional da operação.
                            const updatedList = parsedPreview.consent_configs.filter((_: any, i: number) => i !== index);
                            
                            setParsedPreview({ ...parsedPreview, consent_configs: updatedList });
                            setJsonEditors({ ...jsonEditors, consent_configs: JSON.stringify(updatedList, null, 2) });
                          }}
                        />
                      ))
                    )}
                  </div>
                </div>

                {/* --- CONSTRUTOR VISUAL DE FAQS --- */}
                <div className="flex flex-col space-y-3 border-t pt-6">
                  <div className="flex justify-between items-center bg-purple-50 p-3 rounded-xl border border-purple-100">
                    <div>
                      <h3 className="font-bold text-slate-800 uppercase text-xs flex items-center gap-2">
                        <HelpCircle size={14} className="text-[#B300FF]" /> Dúvidas Frequentes (FAQs)
                      </h3>
                      <p className="text-[10px] text-muted-foreground mt-0.5">Gerencie as perguntas que aparecem no rodapé.</p>
                    </div>
                    <Button 
                      onClick={() => {
                        const current = parsedPreview.page_faqs || [];
                        const newItem = { question: "", answer: "", position: current.length + 1, bullets: [] };
                        const updated = [...current, newItem];
                        setParsedPreview({ ...parsedPreview, page_faqs: updated });
                        setJsonEditors({ ...jsonEditors, page_faqs: JSON.stringify(updated, null, 2) });
                      }}
                      size="sm" 
                      className="bg-[#B300FF] hover:bg-[#9f00e6] text-white text-[11px] h-8 rounded-lg"
                    >
                      <Plus size={14} className="mr-1"/> Adicionar FAQ
                    </Button>
                  </div>

                  <div className="space-y-4">
                    {(!parsedPreview.page_faqs || parsedPreview.page_faqs.length === 0) ? (
                      <div className="text-center p-6 border-2 border-dashed border-slate-200 rounded-xl text-slate-400 text-xs font-medium">
                        Nenhuma FAQ configurada.
                      </div>
                    ) : (
                      parsedPreview.page_faqs.map((faq: any, index: number) => (
                        <div key={index} className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm relative group">
                          <button 
                            onClick={() => {
                              const updated = parsedPreview.page_faqs.filter((_: any, i: number) => i !== index);
                              setParsedPreview({ ...parsedPreview, page_faqs: updated });
                              setJsonEditors({ ...jsonEditors, page_faqs: JSON.stringify(updated, null, 2) });
                            }}
                            className="absolute top-3 right-3 text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                            title="Remover FAQ"
                          >
                            <X size={16} />
                          </button>

                          <div className="grid gap-4 pr-6">
                            <div className="space-y-1.5">
                              <label className="text-[10px] font-bold text-slate-500 uppercase">Pergunta</label>
                              <Input 
                                value={faq.question} 
                                onChange={(e) => {
                                  const updated = [...parsedPreview.page_faqs];
                                  updated[index].question = e.target.value;
                                  setParsedPreview({ ...parsedPreview, page_faqs: updated });
                                  setJsonEditors({ ...jsonEditors, page_faqs: JSON.stringify(updated, null, 2) });
                                }} 
                                className="h-8 text-xs font-semibold" 
                                placeholder="Digite a pergunta..."
                              />
                            </div>
                            <div className="space-y-1.5">
                              <label className="text-[10px] font-bold text-slate-500 uppercase">Resposta (Texto Principal)</label>
                              <textarea 
                                value={faq.answer} 
                                onChange={(e) => {
                                  const updated = [...parsedPreview.page_faqs];
                                  updated[index].answer = e.target.value;
                                  setParsedPreview({ ...parsedPreview, page_faqs: updated });
                                  setJsonEditors({ ...jsonEditors, page_faqs: JSON.stringify(updated, null, 2) });
                                }} 
                                className="w-full h-16 border border-slate-200 rounded-lg p-2 text-xs outline-none focus:border-[#B300FF] resize-none leading-relaxed"
                                placeholder="Digite a resposta detalhada..."
                              />
                            </div>

                            {/* NOVO: GESTÃO DE BULLETS (Tópicos) */}
                            <div className="bg-slate-50 p-3 rounded-lg border border-slate-100 space-y-3">
                              <div className="flex justify-between items-center">
                                <label className="text-[10px] font-bold text-slate-500 uppercase">Tópicos (Bullets)</label>
                                <button
                                  type="button"
                                  onClick={() => {
                                    const updated = [...parsedPreview.page_faqs];
                                    if (!updated[index].bullets) updated[index].bullets = [];
                                    updated[index].bullets.push("");
                                    setParsedPreview({ ...parsedPreview, page_faqs: updated });
                                    setJsonEditors({ ...jsonEditors, page_faqs: JSON.stringify(updated, null, 2) });
                                  }}
                                  className="text-[10px] font-bold text-[#B300FF] hover:underline flex items-center"
                                >
                                  <Plus size={12} className="mr-0.5" /> Add Tópico
                                </button>
                              </div>

                              <div className="space-y-2">
                                {(!faq.bullets || faq.bullets.length === 0) ? (
                                  <p className="text-[10px] text-slate-400 italic">Nenhum tópico adicionado.</p>
                                ) : (
                                  faq.bullets.map((bullet: string, bulletIndex: number) => (
                                    <div key={bulletIndex} className="flex items-start gap-2">
                                      <span className="text-slate-400 mt-2">•</span>
                                      <textarea 
                                        value={bullet}
                                        onChange={(e) => {
                                          const updated = [...parsedPreview.page_faqs];
                                          updated[index].bullets[bulletIndex] = e.target.value;
                                          setParsedPreview({ ...parsedPreview, page_faqs: updated });
                                          setJsonEditors({ ...jsonEditors, page_faqs: JSON.stringify(updated, null, 2) });
                                        }}
                                        /* Mudamos h-10 para h-16, p-1.5 para p-2 e leading-tight para leading-relaxed */
                                        className="flex-1 h-16 border border-slate-200 rounded-md p-2 text-[11px] outline-none focus:border-[#B300FF] resize-none leading-relaxed text-slate-700"
                                        placeholder="Digite o item da lista..."
                                      />
                                      <button
                                        type="button"
                                        onClick={() => {
                                          const updated = [...parsedPreview.page_faqs];
                                          updated[index].bullets = updated[index].bullets.filter((_: any, i: number) => i !== bulletIndex);
                                          setParsedPreview({ ...parsedPreview, page_faqs: updated });
                                          setJsonEditors({ ...jsonEditors, page_faqs: JSON.stringify(updated, null, 2) });
                                        }}
                                        className="mt-2 text-slate-300 hover:text-red-500"
                                        title="Remover Tópico"
                                      >
                                        <X size={14} />
                                      </button>
                                    </div>
                                  ))
                                )}
                              </div>
                            </div>
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

        {/* LADO DIREITO: LIVE PREVIEW (40%) */}
        <div className="w-[40%] bg-slate-50 p-6 overflow-y-auto relative">
          
          {/* CABEÇALHO DO PREVIEW (AJUSTADO EDGE-TO-EDGE) */}
          <div className="sticky top-[-24px] -mx-6 px-6 pt-6 pb-4 mb-6 z-10 bg-slate-50/95 backdrop-blur border-b border-slate-200">
            <h3 className="font-black text-sm uppercase text-slate-800 flex items-center gap-2">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#B300FF] opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-[#B300FF]"></span>
              </span>
              Live Preview
            </h3>
            <p className="text-xs text-slate-500 mt-1">O layout abaixo reflete o JSON em tempo real.</p>
          </div>

          {/* CONTAINER CENTRALIZADO (SIMULA LARGURA DE UM CELULAR) */}
          <div className="w-full max-w-xl mx-auto space-y-6 pb-20">
            
            {/* 1. Preview do Painel de Oferta */}
            {parsedPreview.page_configs && Object.keys(parsedPreview.page_configs).length > 0 ? (
               <div className="bg-white p-5 rounded-2xl shadow-lg border border-slate-100">
                  <OfferPanelRender config={parsedPreview.page_configs} />
               </div>
            ) : (
              <div className="text-center p-6 border-2 border-dashed border-slate-200 rounded-2xl text-slate-400 text-xs font-medium italic">
                Painel Visual (Page Configs) não definido ou JSON inválido.
              </div>
            )}

            {/* 2. Preview de Consentimentos */}
            {parsedPreview.consent_configs && parsedPreview.consent_configs.length > 0 && (
              <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-200">
                 <DynamicConsentsStatic configs={parsedPreview.consent_configs} />
              </div>
            )}

            {/* 3. Preview de FAQs */}
            {parsedPreview.page_faqs && parsedPreview.page_faqs.length > 0 && (
              <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-200">
                 <FAQSection items={parsedPreview.page_faqs} />
              </div>
            )}

             {/* 4. Preview do Footer */}
             {parsedPreview.page_configs?.footer && (
               <div className="pt-4">
                  <FooterRender config={parsedPreview.page_configs.footer} />
               </div>
            )}
          </div>

        </div>
      </div>
    </div>
  );
}


/**
 * =========================================================================
 * [COMPONENTE PRINCIPAL]: OrchestratorConfigsBackofficePage
 * =========================================================================
 */
function OrchestratorConfigsBackofficePage() {
  // --- ESTADOS CORE DA TELA ---
  const [rows, setRows] = useState<OrchestratorRow[]>([]);
  const [productsMap, setProductsMap] = useState<Record<string, string>>({});
  const [categoriesMap, setCategoriesMap] = useState<Record<string, string>>({});
  const [partnersMap, setPartnersMap] = useState<Record<string, { name: string; logo_url: string }>>({});
  
  // --- ESTADOS DE CONTROLE E FILTRAGEM ---
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"active" | "inactive" | "all">("active");

  // --- ESTADOS DO PAINEL LATERAL (INSPEÇÃO) E EDITOR ---
  const [isRouteDrawerOpen, setIsRouteDrawerOpen] = useState(false);
  const [activeConfig, setActiveConfig] = useState<OrchestratorRow | null>(null);

  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [editingConfig, setEditingConfig] = useState<OrchestratorRow | null>(null);

  /**
   * @async
   * @function load
   * @description Pipeline assíncrono para busca simultânea de rotas, produtos, 
   * categorias oficiais e parceiros no Supabase.
   */
  async function load() {
    setLoading(true);
    try {
      // 1. Busca dados da tabela principal de configurações de rotas
      const { data: configData, error: configError } = await supabase
        .from("orchestrator_configs")
        .select("*");

      if (configError) throw configError;
      setRows((configData as OrchestratorRow[]) || []);

      // 2. Mapeia tipos de produtos por ID
      const { data: prodData } = await supabase.from("product_types").select("id, name");
      if (prodData) {
        const pMap: Record<string, string> = {};
        prodData.forEach(p => { pMap[String(p.id)] = p.name; });
        setProductsMap(pMap);
      }

      // 3. Mapeia categorias oficiais (tabela category_types) por ID
      const { data: catData } = await supabase.from("category_types").select("id, name");
      if (catData) {
        const cMap: Record<string, string> = {};
        catData.forEach(c => { cMap[String(c.id)] = c.name; });
        setCategoriesMap(cMap);
      }

      // 4. Mapeia parceiros ativos (nome e logotipos)
      const { data: partData } = await supabase.from("partners").select("id, name, logo_url");
      if (partData) {
        const ptMap: Record<string, { name: string; logo_url: string }> = {};
        partData.forEach(pt => { ptMap[String(pt.id)] = { name: pt.name, logo_url: pt.logo_url }; });
        setPartnersMap(ptMap);
      }

    } catch (err) {
      console.error("Erro crítico ao carregar dados do orchestrator:", err);
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  // Aciona o carregamento inicial ao montar o componente
  useEffect(() => {
    load();
  }, []);

  /**
   * @function handleSaveRoute
   * @description Salva os dados gerados pelo Editor Híbrido no Supabase (Insert ou Update)
   */
  const handleSaveRoute = async (payload: OrchestratorRow) => {
    try {
      if (payload.id) {
        // Editando rota existente
        const { error } = await supabase.from("orchestrator_configs").update(payload).eq("id", payload.id);
        if (error) throw error;
      } else {
        // Criando nova rota
        const { error } = await supabase.from("orchestrator_configs").insert([payload]);
        if (error) throw error;
      }
      
      setIsEditorOpen(false);
      load(); // Recarrega a tabela para exibir os dados atualizados
    } catch (err: any) {
      console.error("Erro de BD ao salvar a rota:", err);
      throw new Error(err.message || "Erro desconhecido ao comunicar com o banco de dados.");
    }
  };

  /**
   * @function getProductOrCategoryName
   */
  const getProductOrCategoryName = (r: OrchestratorRow) => {
    if (r.config_type === "PRODUCT" && productsMap[r.lookup_id]) {
      return productsMap[r.lookup_id];
    }
    if (r.config_type === "CATEGORY" && categoriesMap[r.lookup_id]) {
      return categoriesMap[r.lookup_id];
    }
    return r.lookup_id ? `ID #${r.lookup_id}` : "—";
  };

  /**
   * @function getPartnerInfo
   */
  const getPartnerInfo = (r: OrchestratorRow) => {
    const partnerId = r.partner_id || r.integration_details?.partner_id || r.page_configs?.offer_panel?.partner?.id;
    if (partnerId && partnersMap[String(partnerId)]) {
      return partnersMap[String(partnerId)];
    }
    return null;
  };

  /**
   * @constant filtered
   */
  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    
    return rows.filter((r) => {
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
    }).sort((a, b) => {
      const idA = Number(a.id) || 0;
      const idB = Number(b.id) || 0;
      return idA - idB;
    });
  }, [rows, search, statusFilter, productsMap, categoriesMap]);

  // Deriva array de parceiros pro Select do Editor
  const partnersList = useMemo(() => {
    return Object.entries(partnersMap).map(([id, p]) => ({ id, name: p.name }));
  }, [partnersMap]);

  return (
    <div className="space-y-6 font-sans">
      
      {/* HEADER DA TELA E CONTROLES */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Consulta de Rotas & Orchestrator</h1>
          <p className="text-sm text-muted-foreground">
            Gerenciamento e inspeção ordenada das configurações de rotas do sistema.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={load} className="rounded-xl bg-white" disabled={loading}>
            <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Atualizar
          </Button>
          <Button 
            onClick={() => { setEditingConfig(null); setIsEditorOpen(true); }} 
            className="rounded-xl bg-[#B300FF] hover:bg-[#9f00e6]"
          >
            <Plus className="mr-2 h-4 w-4" /> Nova Rota
          </Button>
        </div>
      </div>

      {/* BARRA DE FILTROS E BUSCA */}
      <div className="rounded-2xl border border-border bg-card overflow-hidden shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-3">
          
          <div className="relative flex-1 min-w-[240px] max-w-md">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input 
              value={search} 
              onChange={(e) => setSearch(e.target.value)} 
              placeholder="Buscar por ID, URL, Nome do Produto..." 
              className="h-10 rounded-xl pl-9" 
            />
          </div>

          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="h-10 rounded-xl gap-2 bg-white">
                <Filter className="h-3.5 w-3.5 opacity-70" />
                Status: {statusFilter === "active" ? "Ativas" : statusFilter === "inactive" ? "Inativas" : "Todas"}
                <ChevronDown className="h-3 w-3 opacity-60" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-48 p-0" align="end">
              <Command>
                <CommandList>
                  <CommandGroup>
                    <CommandItem onSelect={() => setStatusFilter("active")} className="cursor-pointer">
                      Apenas Ativas
                    </CommandItem>
                    <CommandItem onSelect={() => setStatusFilter("inactive")} className="cursor-pointer">
                      Apenas Inativas
                    </CommandItem>
                    <CommandItem onSelect={() => setStatusFilter("all")} className="cursor-pointer">
                      Todas
                    </CommandItem>
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>

        </div>

        {/* TABELA DE ROTAS */}
        <div className="w-full overflow-x-auto">
          <table className="w-full text-sm table-fixed">
            <thead>
              <tr className="border-b border-border bg-muted/40 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                <th className="px-3 py-3 w-[80px]">ID</th>
                <th className="px-3 py-3 w-[260px]">Regra</th>
                <th className="px-3 py-3 w-[150px]">Parceiro</th>
                <th className="px-3 py-3 w-[300px]">URL da Página</th>
                <th className="px-3 py-3 w-[180px] text-right">Ações</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={5} className="p-10 text-center text-muted-foreground">
                    Carregando rotas...
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={5} className="p-10 text-center text-muted-foreground">
                    Nenhuma rota encontrada com os filtros selecionados.
                  </td>
                </tr>
              ) : (
                filtered.map((r) => {
                  const prodName = getProductOrCategoryName(r);
                  const partner = getPartnerInfo(r);

                  return (
                    <tr 
                      key={r.id} 
                      className="border-b border-border/60 hover:bg-accent/40 transition-colors group"
                    >
                      <td className="px-3 py-3 font-mono text-sm text-foreground">
                        {r.id || "—"}
                      </td>

                      <td className="px-3 py-3">
                        <div className="flex items-center gap-1.5">
                          <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-semibold bg-[#B300FF]/10 text-[#B300FF]">
                            {r.config_type || "—"}
                          </span>
                          <span className="text-[11px] text-muted-foreground">({r.entity_type || "N/A"})</span>
                        </div>
                        <div className="text-xs text-foreground mt-1 font-normal truncate" title={prodName}>
                          {prodName}
                        </div>
                      </td>

                      <td className="px-3 py-3">
                        <div className="flex items-center gap-1.5 truncate">
                          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-transparent overflow-hidden shrink-0 border bg-white" title={partner?.name}>
                            {partner?.logo_url ? (
                              <img src={partner.logo_url} className="h-full w-full object-cover" alt={partner.name} />
                            ) : (
                              <span className="flex items-center justify-center h-full w-full text-[10px] font-bold uppercase">
                                {partner?.name ? partner.name.slice(0, 3) : "—"}
                              </span>
                            )}
                          </div>
                          <span className="text-xs font-medium text-slate-700 truncate" title={partner?.name}>
                            {partner?.name || "N/A"}
                          </span>
                        </div>
                      </td>

                      <td className="px-3 py-3 font-mono text-xs text-muted-foreground truncate" title={r.page_url}>
                        {r.page_url || "—"}
                      </td>

                      <td className="px-3 py-3 text-right">
                        <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            onClick={() => { setActiveConfig(r); setIsRouteDrawerOpen(true); }}
                            className="rounded-lg text-slate-500 hover:text-slate-900 px-2 h-8 text-[11px]"
                          >
                            <Search className="w-3.5 h-3.5 mr-1" /> Insp.
                          </Button>
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            onClick={() => { setEditingConfig(r); setIsEditorOpen(true); }}
                            className="rounded-lg text-[#B300FF] hover:text-[#9a00db] hover:bg-[#B300FF]/10 px-2 h-8 text-[11px]"
                          >
                            <Edit className="w-3.5 h-3.5 mr-1" /> Edit
                          </Button>
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

      {/* ===================================================================== */}
      {/* 1. PAINEL LATERAL (SHEET / DRAWER) DE INSPEÇÃO RÁPIDA DE DADOS        */}
      {/* ===================================================================== */}
      {isRouteDrawerOpen && activeConfig && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/40 backdrop-blur-xs transition-all">
          <div className="w-full max-w-2xl bg-white h-full shadow-2xl flex flex-col overflow-hidden animate-in slide-in-from-right duration-300">
            
            <div className="flex items-center justify-between p-4 border-b border-gray-200 bg-slate-50 flex-shrink-0">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-[#B300FF]" />
                <h3 className="text-sm font-black uppercase text-slate-800">Consulta de Rota: ID #{activeConfig.id} - {getProductOrCategoryName(activeConfig)}</h3>
              </div>
              <button onClick={() => setIsRouteDrawerOpen(false)} className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200 cursor-pointer">
                <X size={18} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              <div className="space-y-6">
                
                <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 text-xs space-y-1.5 font-mono">
                  <p><b>ID Config:</b> {activeConfig.id} | <b>Lookup ID:</b> {activeConfig.lookup_id}</p>
                  <p><b>Tipo:</b> {activeConfig.config_type} ({activeConfig.entity_type})</p>
                  <p><b>URL:</b> {activeConfig.page_url}</p>
                  <p><b>Método:</b> {activeConfig.integration_method || "—"}</p>
                </div>

                {activeConfig.page_configs?.offer_panel && (
                  <div className="bg-white p-4 rounded-xl border shadow-sm">
                    <h4 className="text-[11px] font-bold uppercase text-purple-600 mb-3 flex items-center gap-1.5">
                      <Layers size={14} /> Offer Panel (Painel de Proposta)
                    </h4>
                    <OfferPanelRender config={activeConfig.page_configs} />
                  </div>
                )}

                <div className="flex flex-col gap-4">
                  {activeConfig.integration_details && Object.keys(activeConfig.integration_details).length > 0 && (
                    <div className="bg-slate-50 p-4 rounded-xl border text-xs overflow-hidden">
                      <h4 className="font-bold text-slate-700 mb-2 uppercase text-[10px] tracking-wide flex items-center gap-1.5">
                        <Code2 size={12} /> Integration Details
                      </h4>
                      <pre className="font-mono text-[9px] text-slate-600 whitespace-pre-wrap break-all overflow-x-auto bg-white p-2.5 rounded border">
                        {JSON.stringify(activeConfig.integration_details, null, 2)}
                      </pre>
                    </div>
                  )}
                  {activeConfig.rules && Object.keys(activeConfig.rules).length > 0 && (
                    <div className="bg-slate-50 p-4 rounded-xl border text-xs overflow-hidden">
                      <h4 className="font-bold text-slate-700 mb-2 uppercase text-[10px] tracking-wide flex items-center gap-1.5">
                        <SlidersHorizontal size={12} /> Rules / Installments
                      </h4>
                      <pre className="font-mono text-[9px] text-slate-600 whitespace-pre-wrap break-all overflow-x-auto bg-white p-2.5 rounded border">
                        {JSON.stringify(activeConfig.rules, null, 2)}
                      </pre>
                    </div>
                  )}
                </div>

                {activeConfig.consent_configs && activeConfig.consent_configs.length > 0 && (
                  <div className="bg-white p-4 rounded-xl border shadow-sm">
                    <h4 className="text-[11px] font-bold uppercase text-purple-600 mb-3 flex items-center gap-1.5">
                      <FileText size={14} /> Consentimentos da Rota (LGPD)
                    </h4>
                    <DynamicConsentsStatic configs={activeConfig.consent_configs} />
                  </div>
                )}

                {activeConfig.page_faqs && activeConfig.page_faqs.length > 0 && (
                  <div className="bg-white p-4 rounded-xl border shadow-sm">
                    <h4 className="text-[11px] font-bold uppercase text-purple-600 mb-1 flex items-center gap-1.5">
                      <HelpCircle size={14} /> FAQ & Perguntas Frequentes
                    </h4>
                    <FAQSection items={activeConfig.page_faqs} />
                  </div>
                )}

                {activeConfig.page_configs?.footer && (
                  <div className="pt-2">
                    <FooterRender config={activeConfig.page_configs.footer} />
                  </div>
                )}

              </div>
            </div>

            <div className="p-4 border-t border-gray-200 bg-slate-50 flex justify-end flex-shrink-0">
              <Button onClick={() => setIsRouteDrawerOpen(false)} className="bg-[#B300FF] hover:bg-[#9f00e6] text-white text-xs rounded-xl px-5">
                Fechar Inspeção
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* 2. EDITOR HÍBRIDO (SPLIT-SCREEN) DE CONFIGURAÇÃO DE ROTAS             */}
      {/* ===================================================================== */}
      {isEditorOpen && (
        <OrchestratorConfigEditor
          initialData={editingConfig}
          partnersList={partnersList}
          onClose={() => setIsEditorOpen(false)}
          onSave={handleSaveRoute}
        />
      )}

    </div>
  );
}