/**
 * @fileoverview Componente: ButtonWhatsApp (Disparador Transacional WhatsApp)
 * @module features/financial-hub/components/shared
 * @path src/features/financial-hub/components/shared/ButtonWhatsApp.tsx
 * 
 * =========================================================================
 * 🤖 PADRÃO GEMINI PRO ARQUITETURA: COMPLIANCE, MESSAGING & NEUTRAL PURITY
 * =========================================================================
 * @description Centraliza a lógica de montagem da mensagem transacional, validação
 * do gate de consentimento regulatório (LGPD) e disparo de navegação externa (WhatsApp API).
 * Implementa renderização em escala de cinzas neutras institucionais autocontidas.
 * 
 * [MECÂNICA ARQUITETURAL V3 - BLINDAGEM NEUTRA AUTOCONTIDA & SBX DESIGN SYSTEM]:
 * 1. {Bypass de Tokens Globais Contaminados}: Substitui tokens suscetíveis a
 *    tingimento (`bg-card`, `bg-muted`, `border-border`, `text-foreground`) por classes
 *    neutras puras (`bg-white`, `bg-neutral-100`, `border-neutral-200`, `text-neutral-900`),
 *    imunizando o componente contra variáveis herdadas do tema base intocável.
 * 2. {Zero-Radius Strict Governance}: Aplica cantos retos estritos (`rounded-none`)
 *    tanto no contêiner card quanto no componente `Button`, neutralizando qualquer
 *    arredondamento herdado da biblioteca base.
 * 3. {Inversão Institucional de Alto Contraste}: Variante de botão padronizada
 *    em `border-2 border-neutral-900 text-neutral-900 hover:bg-neutral-900 hover:text-white`.
 * 4. {Compliance & LGPD Gatekeeper}: Bloqueia interações deterministamente caso
 *    o status de consentimento (`areConsentsValid`) seja false ou a flag `disabled` esteja ativa.
 * 5. {Anti-Crash Payload Engine}: Sanitização e interpolação de dados cadastrais
 *    e de lote com formatação segura de moeda e documento.
 * 
 * @author César Ismael Pereira da Costa
 * @author Gemini Pro (Architectural Mechanics)
 * @version 9.3.0 (Clean Icon & Neutral Purity)
 */

import React from "react";
import { MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatDocument, BRL } from "../shared/formatters";
import { useNavigation, NAVIGATION_INTENTS } from "../../core/hooks/useNavigation";

// =========================================================================
// [CONTRATOS E INTERFACES TIPADAS]
// =========================================================================
interface ButtonWhatsAppProps {
  variant?: "button" | "card";
  config: any;
  data?: any;
  productName?: string;
  consents?: any[];
  areConsentsValid?: boolean;
  onAction?: (url: string, consents: any) => void;
  disabled?: boolean;
}

// =========================================================================
// [COMPONENTE PRINCIPAL: BUTTON WHATSAPP]
// =========================================================================
export function ButtonWhatsApp({
  variant = "button",
  config,
  data,
  productName,
  consents,
  areConsentsValid,
  onAction,
  disabled,
}: ButtonWhatsAppProps) {
  const { handleRedirect } = useNavigation();
  const contact = config?.urlWhatsApp || config?.whatsapp_number;

  if (!contact) return null;

  const docInfo = data?.entity?.name
    ? ` (${data.entity.name} | ${formatDocument(data.entity.document || "")})`
    : "";

  const buildMsg = () => {
    // 1. Prioridade: Simulação ativa com oferta de leilão
    if (data?.offer?.offer_value) {
      const financiado = (data.offer.offer_value || 0) - (data.valorEntrada || 0);
      const entradaValue = data.valorEntrada || 0;
      const entradaStr = entradaValue > 0 ? `com entrada de ${BRL(entradaValue)}` : "sem entrada";

      return `Olá! Fiz uma simulação ${entradaStr} e valor financiado de ${BRL(financiado)} do lote "${
        data.offer.offer_description || ""
      }" (Lote ${data.offer.offer_id}/ Valor Atual ${BRL(data.offer.offer_value || 0)}) do evento "${
        data.event?.event_description || ""
      }" (Encerramento ${
        data.event?.event_end_date ? new Date(data.event.event_end_date).toLocaleString("pt-BR") : ""
      }). Gostaria de seguir com minha aprovação. Pode me ajudar?${docInfo}`;
    }

    // 2. Produto nominal específico informado
    if (productName) {
      return `Olá! Estou na Superbid e gostaria de mais informações sobre ${productName}.${docInfo}`;
    }

    // 3. Fallback: Mensagem institucional genérica
    return `Olá! Estou na Superbid e gostaria de mais informações.${docInfo}`;
  };

  const msg = buildMsg();
  const numericContact = contact.replace(new RegExp("[^0-9]", "g"), "");
  const url = contact.startsWith("http")
    ? `${contact}?text=${encodeURIComponent(msg)}`
    : `https://wa.me/${numericContact}?text=${encodeURIComponent(msg)}`;

  const isDisabled = disabled || areConsentsValid === false;

  const handleClick = () => {
    if (isDisabled) return;

    if (onAction) {
      onAction(url, consents || []);
    } else {
      handleRedirect(NAVIGATION_INTENTS.REDIRECT_PARTNER_WHATSAPP, url, consents || []);
    }
  };

  // =========================================================================
  // 1. VARIANTE: CARD DE CONTATO RÁPIDO (Ícone limpo e solto, sem caixa de fundo)
  // =========================================================================
  if (variant === "card") {
    return (
      <button
        type="button"
        disabled={isDisabled}
        onClick={handleClick}
        className="w-full flex items-center gap-3 p-3.5 bg-white hover:bg-neutral-100 border border-neutral-200 rounded-none transition-colors text-left cursor-pointer disabled:pointer-events-none disabled:opacity-50 disabled:cursor-not-allowed shadow-xs"
      >
        <MessageCircle className="w-5 h-5 text-neutral-900 shrink-0" strokeWidth={1.5} />
        <div className="text-xs">
          <p className="font-semibold text-neutral-900">Continuar pelo WhatsApp</p>
          <p className="text-neutral-500 text-[11px]">Falar agora com um especialista</p>
        </div>
      </button>
    );
  }

  // =========================================================================
  // 2. VARIANTE: BOTÃO INSTITUCIONAL (INVERSÃO NO HOVER)
  // =========================================================================
  return (
    <Button
      type="button"
      disabled={isDisabled}
      variant="outline"
      onClick={handleClick}
      className="flex-1 h-12 border-2 border-neutral-900 text-neutral-900 hover:bg-neutral-900 hover:text-white rounded-none font-medium tracking-wide transition-colors duration-150 shadow-none disabled:pointer-events-none disabled:opacity-50"
    >
      <MessageCircle className="h-4 w-4 mr-2" />
      Continuar pelo WhatsApp
    </Button>
  );
}