/**
 * @fileoverview Componente: SiteHeader
 * * PROPÓSITO:
 * Header fixo (sticky) para jornadas de crédito. Implementa navegação 
 * via âncoras (scroll manual) para contornar bloqueios do Router e garantir 
 * que o utilizador permaneça na rota correta.
 * * INTEGRAÇÃO:
 * - Utiliza `scrollIntoView` para navegação suave dentro da mesma página.
 * * INTERDEPENDÊNCIAS:
 * - `WalletLogo`: Componente de branding corporativo.
 */

import { WalletLogo } from "@/components/brand/WalletLogo";
import { useNavigate } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";

const links = [
  { href: "simular", label: "Simular" },
  { href: "como-funciona", label: "Como funciona" },
  { href: "duvidas", label: "Dúvidas" },
];

export function SiteHeader() {
  const navigate = useNavigate();

  /**
   * handleScroll
   * Impede a navegação padrão do Router e força o scroll suave até o elemento com o ID alvo.
   * @param e - Evento de clique do mouse.
   * @param id - O ID do elemento HTML de destino (ex: 'simular', 'duvidas').
   */
  const handleScroll = (e: React.MouseEvent<HTMLAnchorElement>, id: string) => {
    e.preventDefault();
    const element = document.getElementById(id);
    if (element) {
      // scrollIntoView garante que o elemento alvo seja trazido para a visão
      element.scrollIntoView({ behavior: "smooth", block: "start" });
    } else {
      console.warn(`[SiteHeader] Elemento com id="${id}" não encontrado no DOM.`);
    }
  };

  return (
    <header className="sticky top-0 z-50 border-b bg-background/80 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4">
        
        {/* Lado Esquerdo: Botão Voltar + Divisor + Logo */}
        <div className="flex items-center gap-4">
          <button 
            onClick={() => navigate({ to: "/" })} 
            className="flex items-center gap-2 text-sm font-bold text-muted-foreground hover:text-primary transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-ring rounded-sm"
            aria-label="Voltar para a Home"
          >
            <ArrowLeft size={16} />
            <span className="hidden sm:inline">Voltar</span>
          </button>
          
          <div className="h-6 w-px bg-slate-200" />
          
          {/* Logo - Ajuste responsivo: esconde tagline no mobile para poupar espaço */}
          <div className="hidden sm:block">
            <WalletLogo size="md" withTagline />
          </div>
          <div className="block sm:hidden">
            <WalletLogo size="sm" />
          </div>
        </div>

        {/* Navegação Manual (Âncoras) */}
        <nav className="hidden md:flex gap-6">
          {links.map((link) => (
            <a
              key={link.href}
              href={`#${link.href}`}
              onClick={(e) => handleScroll(e, link.href)}
              className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors cursor-pointer focus:outline-none focus-visible:ring-1 focus-visible:ring-ring rounded-sm px-1 -ml-1"
            >
              {link.label}
            </a>
          ))}
        </nav>
      </div>
    </header>
  );
}