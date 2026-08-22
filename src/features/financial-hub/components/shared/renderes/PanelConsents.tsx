/**
 * @fileoverview Painel de Configurações de Consentimento (Layout de Tela)
 * @path src/features/financial-hub/components/shared/renderes/PanelConsents.tsx
 *
 * ============================================================================
 * 🤖 GEMINI ARCHITECTURE SPECIFICATION: RESILIENT RENDERING & UI SHIELDING
 * ============================================================================
 * Renderizador responsável por exibir as caixas de aceite (checkboxes) que 
 * foram apresentadas ao usuário na interface durante a jornada.
 *
 * [ARQUITETURA DE DADOS E PERFORMANCE]:
 * 1. {Safe Array Normalization}: Garante que o componente nunca tente iterar 
 *    sobre objetos vazios, nulos ou indefinidos vindos de fallbacks de layout,
 *    evitando o crash letal "configs is not iterable".
 * 2. {Flat Extraction}: Valida a tipagem da propriedade `links` interna para
 *    prevenir falhas na renderização do texto legal (`template_text`).
 * ============================================================================
 *
 * @author César Ismael Pereira da Costa
 * @author Gemini Pro
 */

import { CheckSquare } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

// Helper de segurança para garantir que o payload seja sempre um Array iterável
const safeArray = (data: any) => {
  if (!data) return [];
  return Array.isArray(data) ? data : [data];
};

export function PanelConsents({ configs }: { configs: any[] }) {
  // Verificação dupla: se não for array ou estiver vazio, aborta imediatamente
  if (!Array.isArray(configs) || configs.length === 0) return null;

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-4 break-inside-avoid">
      <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-2">
        <CheckSquare className="h-3.5 w-3.5 text-primary" /> Regras de Aceite (Tela)
      </h4>
      <div className="bg-white rounded-xl border border-border shadow-sm divide-y divide-slate-100">
        {configs.map((config: any, index: number) => {
          // Garante que links internos também sejam arrays iteráveis
          const links = safeArray(config.links);
          
          return (
            <div key={index} className="p-4 space-y-3 break-inside-avoid">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-slate-700 uppercase tracking-wide">
                  {config.id || "Termo N/A"}
                </span>
                <span className="text-[10px] font-medium text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full border border-slate-200">
                  {config.required ? "Obrigatório" : "Opcional"}
                </span>
              </div>
              <div className="text-[11px] text-muted-foreground leading-relaxed bg-slate-50/50 p-3 rounded-lg border border-slate-100">
                {config.template_text ? (
                  config.template_text.split(/(\{.*?\})/g).map((part: string, i: number) => {
                    if (part.startsWith("{") && part.endsWith("}")) {
                      const cleanText = part.replace(/[{}]/g, "");
                      
                      // Agora podemos usar .find() com segurança porque links é garantidamente um array
                      const linkConfig = links.find((l: any) => l.text === cleanText);
                      
                      if (!linkConfig) {
                        return (
                          <span key={i} className="underline font-semibold inline mx-0.5 text-primary">
                            {cleanText}
                          </span>
                        );
                      }

                      if (linkConfig.type === "web" || linkConfig.url) {
                        return (
                          <a key={i} href={linkConfig.url} target="_blank" rel="noopener noreferrer" className="underline font-semibold inline mx-0.5 text-primary">
                            {cleanText}
                          </a>
                        );
                      }

                      if (linkConfig.type === "tooltip" || linkConfig.tooltip_text) {
                        return (
                          <Popover key={i}>
                            <PopoverTrigger asChild>
                              <span className="underline font-semibold cursor-pointer border-b border-dashed inline mx-0.5 text-primary border-primary">
                                {cleanText}
                              </span>
                            </PopoverTrigger>
                            <PopoverContent side="bottom" align="start" className="max-w-xs p-3 bg-white text-slate-700 text-[11px] rounded-xl border border-slate-200 shadow-xl leading-relaxed z-[100]">
                              <p>{linkConfig.tooltip_text}</p>
                            </PopoverContent>
                          </Popover>
                        );
                      }
                    }
                    return <span key={i}>{part}</span>;
                  })
                ) : (
                  "Nenhum texto de aceite configurado."
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}