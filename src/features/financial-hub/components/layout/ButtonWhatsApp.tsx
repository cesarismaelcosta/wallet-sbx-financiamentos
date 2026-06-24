/**
 * @fileoverview Componente: ButtonWhatsApp
 * Centraliza a lógica de montagem de mensagem, validação de consentimento e disparo de ação.
 */

import { MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatDocument, BRL } from "../shared/formatters";
import { useNavigation, NAVIGATION_INTENTS } from "../../core/hooks/useNavigation";

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

  const docInfo = data?.entity?.name ? ` (${data.entity.name} | ${formatDocument(data.entity.document || "")})` : "";

  const buildMsg = () => {
    // 1. Prioridade: Simulação
    if (data?.offer?.offer_value) {
      const financiado = (data.offer.offer_value || 0) - (data.valorEntrada || 0);

      // Lógica ajustada:
      const entradaValue = data.valorEntrada || 0;
      const entradaStr = entradaValue > 0 ? `com entrada de ${BRL(entradaValue)}` : "sem entrada";

      return `Olá! Fiz uma simulação ${entradaStr} e valor financiado de ${BRL(financiado)} do lote "${data.offer.offer_description || ""}" (Lote ${data.offer.offer_id}/ Valor Atual ${BRL(data.offer.offer_value || 0)}) do evento "${data.event?.event_description || ""}" (Encerramento ${data.event?.event_end_date ? new Date(data.event.event_end_date).toLocaleString("pt-BR") : ""}). Gostaria de seguir com minha aprovação. Pode me ajudar?${docInfo}`;
    }

    // 2. Se foi enviado nome do produto
    if (productName) {
      return `Olá! Estou na Superbid e gostaria de mais informações sobre ${productName}.${docInfo}`;
    }

    // 3. Fallback: Mensagem genérica
    return `Olá! Estou na Superbid e gostaria de mais informações.${docInfo}`;
  };

  const msg = buildMsg();
  const numericContact = contact.replace(new RegExp("[^0-9]", "g"), "");
  const url = contact.startsWith("http")
    ? `${contact}?text=${encodeURIComponent(msg)}`
    : `https://wa.me/${numericContact}?text=${encodeURIComponent(msg)}`;

  const isDisabled = disabled || areConsentsValid === false;

  const handleClick = () => {
    // Validação de compliance
    if (isDisabled) return;

    // Se houver onAction (override), usa ele. Caso contrário, usa o padrão do sistema.
    if (onAction) {
      onAction(url, consents || []);
    } else {
      handleRedirect(NAVIGATION_INTENTS.REDIRECT_PARTNER_WHATSAPP, url, consents || []);
    }
  };

  if (variant === "card") {
    return (
      <button
        disabled={isDisabled}
        onClick={handleClick}
        className="w-full flex items-center gap-3 p-3 bg-slate-50 rounded-xl hover:bg-slate-100 transition-all active:scale-[0.98] cursor-pointer text-left border border-[var(--brand-primary)] disabled:pointer-events-none disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <div className="w-10 h-10 rounded-full bg-[#F5E6FF] flex items-center justify-center text-xl shrink-0">💬</div>
        <div className="text-xs">
          <p className="font-bold text-slate-900">Continuar pelo WhatsApp</p>
          <p className="text-slate-500">Falar agora</p>
        </div>
      </button>
    );
  }

  return (
    <Button
      disabled={isDisabled}
      className="flex-1 h-12 rounded-xl font-bold border-2 shadow-sm transition-all duration-200 hover:bg-[var(--brand-primary)] hover:text-white active:scale-95 focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)] focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 disabled:cursor-not-allowed"
      style={{ borderColor: "var(--brand-primary)", color: "var(--brand-primary)", backgroundColor: "transparent" }}
      onClick={handleClick}
    >
      <MessageCircle className="h-4 w-4 mr-2" /> Continuar pelo WhatsApp
    </Button>
  );
}
