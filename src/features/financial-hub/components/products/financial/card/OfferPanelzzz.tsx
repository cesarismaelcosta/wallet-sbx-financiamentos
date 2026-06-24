/**
 * @fileoverview Componente: OfferPanel (Painel Informativo)
 * 
 * Exibe as vantagens competitivas da jornada de forma dinâmica.
 * * INTEGRAÇÃO:
 * - Injetado na coluna lateral para conversão.
 */

import { 
  Percent, Clock, ShieldCheck, Wallet, ShoppingBag, Package, CreditCard, Unlock, Banknote,
  Zap, Star, Gift, TrendingUp, Landmark, FileCheck, BadgePercent 
} from "lucide-react";
import { useWizard } from "@/features/financial-hub/components/shared/WizardProvider";
import { PageConfig } from "./card.types";


/**
 * Mapa de Ícones (Lookup Table)
 * Traduz strings recebidas do JSON (ex: "Percent") para componentes React.
 */
const ICON_MAP: Record<string, any> = {
  // Ícones Originais
  Percent: Percent,         // Taxas, juros, descontos percentuais
  Clock: Clock,             // Tempo, prazo, aprovação rápida
  ShieldCheck: ShieldCheck, // Segurança, garantia, proteção de dados
  Wallet: Wallet,           // Pagamentos, carteira, saldo
  ShoppingBag: ShoppingBag, // Compras, varejo, consumo
  Package: Package,         // Entrega, bens tangíveis, logística
  CreditCard: CreditCard,   // Meios de pagamento, crédito
  Unlock: Unlock,           // Liberdade, acesso, flexibilidade
  Banknote: Banknote,       // Liquidez, empréstimo, dinheiro vivo
  Zap: Zap,                 // Agilidade, imediato, aprovação "vapt-vupt"
  Star: Star,               // Destaque, plano premium, oferta favorita
  Gift: Gift,               // Bônus, cashback, recompensas
  TrendingUp: TrendingUp,   // Crescimento, melhoria de taxas, performance
  Landmark: Landmark,       // Institucional, bancos, formalização oficial
  FileCheck: FileCheck,     // Contratos, documentos, formalização concluída
  BadgePercent: BadgePercent // Promoções exclusivas, ofertas especiais de campanha
};

export function OfferPanel() {
  const { state } = useWizard<any>();
  const config = state.data?.page_configs as PageConfig;

  if (!config) return null;

  const getTextStyle = (type: string) => {
    switch (type) {
      case "highlight": return "text-[var(--brand-primary)]";
      case "bold": return "font-bold text-foreground";
      default: return "text-foreground"; 
    }
  };

  return (
    <div className="p-8 space-y-6">
      <div className="space-y-4">
        {/* Headline Dinâmica */}
        <h1 className="text-3xl font-semibold leading-tight text-foreground sm:text-4xl">
          {config.offer_panel.headline.parts.map((part, i) => (
            <span key={i} className={getTextStyle(part.type)}>{part.text}</span>
          ))}
        </h1>

        {/* Descrição Dinâmica */}
        <p className="mt-4 text-base text-muted-foreground">
          {config.offer_panel.description.parts.map((part, i) => (
            <span key={i} className={getTextStyle(part.type)}>{part.text}</span>
          ))}
        </p>
      </div>

      {/* Lista de Benefícios Dinâmica */}
      <ul className="flex flex-col gap-4">
        {config.offer_panel.benefits.map((b, i) => {
          const Icon = ICON_MAP[b.icon];
          return (
            <li key={i} className="flex items-start gap-3">
              <span className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--brand-primary)]/10 text-[var(--brand-primary)]">
                {Icon && <Icon className="h-4 w-4" />}
              </span>
              <div>
                <p className="text-sm font-medium text-foreground">{b.title}</p>
                <p className="text-xs text-muted-foreground">{b.description}</p>
              </div>
            </li>
          );
        })}
      </ul>
      
      {/* Rodapé do Parceiro */}
      {config.offer_panel.partner && (config.offer_panel.partner.label || config.offer_panel.partner.name) && (
        <div className="mt-8 rounded-xl border border-border bg-muted/40 p-4 text-xs text-muted-foreground">
          {config.offer_panel.partner.label}{" "}
          <strong className="text-foreground">{config.offer_panel.partner.name}</strong>.
        </div>
      )}

    </div>
  );
}