/**
 * @fileoverview Painel de Configurações de Consentimento (Shared Renderer Backoffice)
 * @path src/features/financial-hub/components/shared/renderes/PanelConsents.tsx
 *
 * ============================================================================
 * 🤖 GEMINI ARCHITECTURE SPECIFICATION: ZERO-RADIUS & NEUTRAL PURITY
 * ============================================================================
 * Renderizador responsável por exibir as regras de aceite (checkboxes) que 
 * foram apresentadas ao usuário na interface durante a jornada.
 *
 * [ATUALIZAÇÃO DE DESIGN SYSTEM]:
 * 1. Zero-Radius: Substituição de `rounded-xl`, `rounded-full` e `rounded-lg`
 *    por `rounded-none` em todos os wrappers, badges e modais internos.
 * 2. Neutral Purity: Extirpação completa das classes `text-primary`. Adoção 
 *    estrita das paletas `neutral-900` para títulos/links e `neutral-500` 
 *    para backgrounds de contraste e descrições.
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
    <div className="rounded-none border border-neutral-200 bg-white p-4 space-y-4 break-inside-avoid shadow-sm">
      <h4 className="text-[11px] font-bold uppercase tracking-wider text-neutral-900 flex items-center gap-1.5 border-b border-neutral-100 pb-2">
        <CheckSquare className="h-3.5 w-3.5" /> Regras de Aceite (Tela)
      </h4>
      <div className="bg-white rounded-none border border-neutral-200 shadow-xs divide-y divide-neutral-100">
        {configs.map((config: any, index: number) => {
          // Garante que links internos também sejam arrays iteráveis
          const links = safeArray(config.links);
          
          return (
            <div key={index} className="p-4 space-y-3 break-inside-avoid hover:bg-neutral-50 transition-colors">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-neutral-900 uppercase tracking-wide">
                  {config.id || "Termo N/A"}
                </span>
                <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-500 bg-neutral-100 px-2 py-0.5 rounded-none border border-neutral-200">
                  {config.is_required || config.required ? "Obrigatório" : "Opcional"}
                </span>
              </div>
              <div className="text-[11px] text-neutral-600 leading-relaxed bg-white p-3 rounded-none border border-neutral-200">
                {config.template_text ? (
                  config.template_text.split(/(\{.*?\})/g).map((part: string, i: number) => {
                    if (part.startsWith("{") && part.endsWith("}")) {
                      const cleanText = part.replace(/[{}]/g, "");
                      
                      // Agora podemos usar .find() com segurança porque links é garantidamente um array
                      const linkConfig = links.find((l: any) => l.text === cleanText);
                      
                      if (!linkConfig) {
                        return (
                          <span key={i} className="underline font-bold inline mx-0.5 text-neutral-900">
                            {cleanText}
                          </span>
                        );
                      }

                      if (linkConfig.type === "web" || linkConfig.url) {
                        return (
                          <a key={i} href={linkConfig.url} target="_blank" rel="noopener noreferrer" className="underline font-bold inline mx-0.5 text-neutral-900 hover:text-neutral-600 transition-colors">
                            {cleanText}
                          </a>
                        );
                      }

                      if (linkConfig.type === "tooltip" || linkConfig.tooltip_text) {
                        return (
                          <Popover key={i}>
                            <PopoverTrigger asChild>
                              <span className="underline font-bold cursor-pointer border-b border-dashed inline mx-0.5 text-neutral-900 border-neutral-900 hover:text-neutral-600">
                                {cleanText}
                              </span>
                            </PopoverTrigger>
                            <PopoverContent side="bottom" align="start" className="max-w-xs p-3 bg-white text-neutral-700 text-[11px] rounded-none border border-neutral-200 shadow-xl leading-relaxed z-[100]">
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