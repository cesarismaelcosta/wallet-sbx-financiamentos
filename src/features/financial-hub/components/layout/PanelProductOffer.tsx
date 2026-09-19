/**
 * @fileoverview Componente: PanelProductOffer (Pitch Comercial & Proposta de Valor)
 * @path src/features/financial-hub/components/layout/PanelProductOffer.tsx
 * 
 * =========================================================================
 * 🤖 PADRÃO GEMINI PRO ARQUITETURA: VALUE PROPOSITION, ZERO-RADIUS & SBX DS
 * =========================================================================
 * Painel lateral principal de proposta de valor da jornada de simulação.
 * Renderiza dinamicamente a promessa comercial (headline), os benefícios 
 * atrelados (com ícones mapeados) e o selo regulatório do parceiro.
 * 
 * [MECÂNICA ARQUITETURAL V3 - BLINDAGEM NEUTRA SELETIVA]:
 * 1. {Reaproveitamento de Skeleton}: Delega o estado de carregamento ao
 *    `PanelProductOfferSkeleton`, eliminando duplicação e vazamentos.
 * 2. {Purgação Visual de Cores Externas}: Erradica qualquer injeção hardcoded de azul.
 *    O estilo `highlight` assume o padrão neutro puro.
 * 3. {Zero-Radius Strict Governance}: Aplica cantos retos (`rounded-none`) em
 *    todos os contêineres de ícones, badges e caixas informativas do parceiro.
 * 4. {Tipografia Seletiva}: Aplicação controlada da classe `.serif` apenas nos 
 *    elementos de destaque permitidos, preservando o corpo de texto padrão.
 * 
 * @author César Ismael Pereira da Costa
 * @author Gemini Pro (Architectural Mechanics)
 */

import { ICON_MAP } from "../shared/icons-map";
import { GradientIcon } from "@/design-system/sbx-design-system-9f1c03/components/ui/gradient-icon";
import { PanelProductOfferSkeleton } from "./PanelProductOfferSkeleton";

interface PanelProductOfferProps {
  config: any;
}

export function PanelProductOffer({ config }: PanelProductOfferProps) {
  // =========================================================================
  // 1. ESTADO DE CARREGAMENTO (DELEGAÇÃO PARA SKELETON AUTOCONTIDO)
  // =========================================================================
  if (!config?.offer_panel?.headline?.parts || !config?.offer_panel?.description?.parts) {
    return <PanelProductOfferSkeleton />;
  }

  // =========================================================================
  // 2. PARSER DINÂMICO DE TEXTO SELETIVO & HIERARQUIA
  // =========================================================================
  const { offer_panel } = config;

  const getHeadlineStyle = (type: string) => {
    switch (type) {
      case "highlight":
        return "font-normal text-neutral-900 serif";
      case "bold":
        return "font-semibold text-neutral-900";
      default:
        return "text-neutral-900";
    }
  };

  const getDescriptionStyle = (type: string) => {
    switch (type) {
      case "highlight":
        return "font-semibold text-neutral-900"; // Descrição usa peso forte neutro, sem forçar serifa desalinhada
      case "bold":
        return "font-semibold text-neutral-900";
      default:
        return "text-neutral-600";
    }
  };

  return (
    <div className="space-y-6 text-neutral-900 rounded-none">
      
      {/* 1. HEADLINE E DESCRIÇÃO */}
      <div className="space-y-4">
        <h1 className="text-2xl sm:text-3xl font-semibold leading-tight tracking-tight text-neutral-900">
          {offer_panel.headline.parts.map((part: any, i: number) => (
            <span key={i} className={getHeadlineStyle(part.type)}>
              {part.text}
            </span>
          ))}
        </h1>
        <p className="mt-3 text-sm md:text-base text-neutral-600 leading-relaxed">
          {offer_panel.description.parts.map((part: any, i: number) => (
            <span key={i} className={getDescriptionStyle(part.type)}>
              {part.text}
            </span>
          ))}
        </p>
      </div>

      {/* 2. LISTA DE BENEFÍCIOS */}
      {offer_panel.benefits && Array.isArray(offer_panel.benefits) && (
        <ul className="flex flex-col gap-4 pt-2">
          {offer_panel.benefits.map((b: any, i: number) => {
            const Icon = ICON_MAP[b.icon];
            return (
              <li key={i} className="flex items-start gap-3">
                <span className="mt-0.5 shrink-0 inline-flex items-center justify-center">
                  {Icon && <GradientIcon icon={Icon} size={20} />}
                </span>
                <div className="space-y-0.5">
                  <p className="text-sm font-medium text-neutral-900">{b.title}</p>
                  <p className="text-xs text-neutral-500 leading-normal">{b.description}</p>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {/* 3. SELO REGULATÓRIO DO PARCEIRO */}
      {offer_panel.partner?.name && (
        <div className="mt-8 rounded-none border border-neutral-200 bg-neutral-50 p-3.5 sm:p-4 flex flex-col items-start gap-1 overflow-hidden w-full shadow-xs">
          <span className="text-[11px] uppercase tracking-wider text-neutral-500 font-mono">
            {offer_panel.partner.label}
          </span>
          <strong className="text-xs sm:text-sm font-medium text-neutral-900 truncate w-full block">
            {offer_panel.partner.name}
          </strong>
        </div>
      )}
    </div>
  );
}