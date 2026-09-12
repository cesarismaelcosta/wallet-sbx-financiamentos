/**
 * @fileoverview Componente: PanelProduct (Shared Renderer para Backoffice)
 * @module features/financial-hub/components/shared/renderes
 * @path src/features/financial-hub/components/shared/renderes/PanelProduct.tsx
 * 
 * =========================================================================
 * 🤖 PADRÃO GEMINI PRO ARQUITETURA: ZERO-RADIUS & COMPACT SCALE
 * =========================================================================
 * @description Renderizador compartilhado da oferta (Headline, Benefits, Partner)
 * para exibição em modais de auditoria no Backoffice.
 * 
 * [ATUALIZAÇÃO DE DESIGN SYSTEM]:
 * 1. Escala Compacta: Utiliza `text-lg`, `text-xs` e `text-[10px]` para 
 *    caber perfeitamente em sidebars, modais e live previews.
 * 2. Paridade Tipográfica: Mantém a semântica da jornada (font-semibold, .serif).
 * 3. Zero-Radius & Neutral Purity: Cantos retos e tons estritamente neutros.
 * =========================================================================
 */

import React from "react";
import { Layers, CheckCircle2 } from "lucide-react";
import { ICON_MAP } from "@/features/financial-hub/components/shared/icons-map";

export function PanelProduct({ config }: { config: any }) {
  const panel = config?.offer_panel || config;
  if (!panel?.headline?.parts || !panel?.description?.parts) return null;

  // =========================================================================
  // PARSER DINÂMICO DE TEXTO (COM PESOS E FONTES DA JORNADA, MAS ESCALA MENOR)
  // =========================================================================
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
        return "font-semibold text-neutral-900";
      case "bold":
        return "font-semibold text-neutral-900";
      default:
        return "text-neutral-600";
    }
  };

  return (
    <div className="rounded-none border border-neutral-200 bg-white p-4 space-y-4 break-inside-avoid shadow-sm">
      <h4 className="text-[11px] font-bold uppercase tracking-wider text-neutral-900 flex items-center gap-1.5 mb-3 border-b border-neutral-100 pb-2">
        <Layers size={14} /> Painel de Proposta (Offer Panel)
      </h4>
      
      <div className="space-y-4">
        {/* 1. HEADLINE E DESCRIÇÃO (ESCALA COMPACTA) */}
        <div className="space-y-1.5">
          <h2 className="text-lg sm:text-xl font-semibold leading-tight tracking-tight text-neutral-900">
            {panel.headline.parts.map((part: any, i: number) => (
              <span key={i} className={getHeadlineStyle(part.type)}>
                {part.text}
              </span>
            ))}
          </h2>
          <p className="text-xs text-neutral-600 leading-relaxed">
            {panel.description.parts.map((part: any, i: number) => (
              <span key={i} className={getDescriptionStyle(part.type)}>
                {part.text}
              </span>
            ))}
          </p>
        </div>

        {/* 2. LISTA DE BENEFÍCIOS (ÍCONES MENORES E TEXTO 10PX/12PX) */}
        {panel.benefits && Array.isArray(panel.benefits) && (
          <ul className="flex flex-col gap-2.5 pt-1">
            {panel.benefits.map((b: any, i: number) => {
              const IconComponent = ICON_MAP[b.icon] || ICON_MAP[b.icon?.toLowerCase()] || CheckCircle2;
              return (
                <li key={i} className="flex items-start gap-2.5">
                  <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-none border border-neutral-200 bg-neutral-100 text-neutral-700">
                    <IconComponent className="h-3 w-3" />
                  </span>
                  <div className="space-y-0.5">
                    <p className="text-xs font-medium text-neutral-900 leading-tight">{b.title}</p>
                    <p className="text-[10px] text-neutral-500 leading-tight">{b.description}</p>
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        {/* 3. SELO REGULATÓRIO DO PARCEIRO */}
        {panel.partner?.name && (
          <div className="mt-4 rounded-none border border-neutral-200 bg-neutral-50 p-3 flex flex-col items-start gap-0.5 overflow-hidden w-full shadow-xs">
            <span className="text-[10px] uppercase tracking-wider text-neutral-500 font-mono">
              {panel.partner.label}
            </span>
            <strong className="text-[11px] sm:text-xs font-medium text-neutral-900 truncate w-full block">
              {panel.partner.name}
            </strong>
          </div>
        )}
      </div>
    </div>
  );
}