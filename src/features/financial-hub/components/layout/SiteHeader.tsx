/**
 * @fileoverview Componente: SiteHeader
 * * PROPÓSITO:
 * Header fixo para jornadas de crédito, padronizado com o mesmo design system 
 * da home do sbxpay (altura, efeito glass, alinhamento e cores).
 * * INTEGRAÇÃO:
 * - Utiliza `scrollIntoView` para navegação suave dentro da mesma página.
 */

import { WalletLogo } from "@/components/brand/WalletLogo";
import { useProductConsult } from "@/features/financial-hub/core/contexts/FinancialHubContext";

const links = [
  { href: "simular", label: "Simular" },
  { href: "como-funciona", label: "Como funciona" },
  { href: "duvidas", label: "Dúvidas" },
];

export function SiteHeader() {
  const context = useProductConsult();

  const handleScroll = (e: React.MouseEvent<HTMLAnchorElement>, id: string) => {
    e.preventDefault();
    const element = document.getElementById(id);
    if (element) {
      element.scrollIntoView({ behavior: "smooth", block: "start" });
    } else {
      console.warn(`[SiteHeader] Elemento com id="${id}" não encontrado no DOM.`);
    }
  };

  return (
    <>
      <style>{`
        .glass { background: rgba(255, 255, 255, 0.85); backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px); }
      `}</style>

      {/* HEADER PADRONIZADO (Exatamente igual ao layout da Home sbXPAY) */}
      <header className="fixed top-0 left-0 w-full z-50 glass border-b border-gray-100 py-3 transition-all duration-300 shadow-xs">
        <div className="max-w-7xl mx-auto px-6 flex items-center justify-between">
          
          {/* Lado Esquerdo: Logo alinhada perfeitamente */}
          <div className="flex items-center">
            <a href="#" className="flex items-center outline-none border-none focus:outline-none focus:ring-0">
              <div className="hidden sm:block">
                <WalletLogo size="md" withTagline />
              </div>
              <div className="block sm:hidden">
                <WalletLogo size="sm" />
              </div>
            </a>
          </div>

          {/* Lado Direito: Navegação de âncoras limpa e fluida */}
          <div className="flex items-center gap-6">
            <nav className="hidden md:flex items-center space-x-1 text-[13px] font-semibold text-slate-600">
              {links.map((link) => (
                <a
                  key={link.href}
                  href={`#${link.href}`}
                  onClick={(e) => handleScroll(e, link.href)}
                  className="px-4 py-2 rounded-xl outline-none hover:bg-purple-50 hover:text-purple-600 focus:bg-purple-50 focus:text-purple-600 transition-all"
                >
                  {link.label}
                </a>
              ))}
            </nav>
          </div>

        </div>
      </header>
    </>
  );
}