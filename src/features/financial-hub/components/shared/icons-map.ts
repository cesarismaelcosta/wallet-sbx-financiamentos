/**
 * @fileoverview Mapa de Ícones do Sistema
 * @path src/features/financial-hub/components/shared/icons-map.ts
 * * @description Dicionário de tradução entre strings de configuração (JSON) e ícones Lucide React.
 * * @responsibilities
 * - Centralizar a lista de ícones permitidos no sistema.
 * - Evitar duplicação de imports de ícones em cada página.
 * * @dependencies
 * - lucide-react
 */

import { 
  Percent, Clock, ShieldCheck, Wallet, ShoppingBag, Package, CreditCard, Unlock, 
  Banknote, Zap, Star, Gift, TrendingUp, Landmark, FileCheck, BadgePercent, 
  Users, Monitor 
} from "lucide-react";

/**
 * Mapeamento centralizado de ícones.
 * O JSON do backend envia a string, este objeto resolve o componente.
 */
export const ICON_MAP: Record<string, any> = {
  Percent: Percent,             // Taxas, juros, descontos
  Clock: Clock,                 // Prazos, tempo de aprovação
  ShieldCheck: ShieldCheck,     // Segurança, privacidade, garantia
  Wallet: Wallet,               // Pagamentos, saldo, conta
  ShoppingBag: ShoppingBag,     // Varejo, consumo, compras
  Package: Package,             // Logística, entrega de bens
  CreditCard: CreditCard,       // Meios de pagamento, crédito
  Unlock: Unlock,               // Acesso, flexibilidade, desbloqueio
  Banknote: Banknote,           // Liquidez, dinheiro vivo, empréstimos
  Zap: Zap,                     // Agilidade, rapidez, "vapt-vupt"
  Star: Star,                   // Destaque, plano premium, favorito
  Gift: Gift,                   // Bônus, cashback, recompensas
  TrendingUp: TrendingUp,       // Performance, crescimento de taxas
  Landmark: Landmark,           // Institucional, bancos, oficial
  FileCheck: FileCheck,         // Formalização, contratos, documentos
  BadgePercent: BadgePercent,   // Promoções exclusivas, campanhas
  Users: Users,                 // Suporte humano, equipe
  Monitor: Monitor              // Monitoramento, atendimento 24/7
};