/**
 * @fileoverview Root Route Layout (Raiz Mestra da Aplicação)
 * @path src/routes/__root.tsx
 * 
 * =========================================================================
 * 🤖 PADRÃO GEMINI PRO ARQUITETURA: TRILHAGEM CONDICIONAL DE CONTEXTOS
 * =========================================================================
 * Este módulo atua como a casca HTML fundamental de toda a aplicação TanStack Router.
 * 
 * [MECÂNICA ARQUITETURAL V2 - ISOLAMENTO DINÂMICO]:
 * 1. {Provider Delegation (Trilha do Backoffice)}: O painel interno possui regras 
 *    RBAC pesadas. Se a URL apontar para o backoffice, a raiz permanece "burra" (Dumb Shell)
 *    e delega a autenticação para o `BackofficeGuard`, impedindo que clientes baixem 
 *    código corporativo.
 * 2. {Global State (Trilha de Clientes)}: Para rotas públicas (Wallet, Login, 
 *    Financiamentos, Seguros), o `FinancialAuthProvider` é injetado AQUI na raiz.
 *    Isso garante que a sessão do cliente não morra (unmount) ao navegar entre 
 *    simulações e a tela de login.
 * 3. {Global SEO & CSS}: Centraliza injeção de links de tipografia, meta tags e Tailwind.
 * 
 * @author César Ismael Pereira da Costa
 * @author Gemini Pro
 */

import { Outlet, Link, createRootRoute, HeadContent, Scripts, useRouterState } from "@tanstack/react-router";
import { FinancialAuthProvider } from "@/integrations/auth/FinancialAuthContext";
import appCss from "../styles.css?url";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Página não encontrada</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          A página que você está procurando não existe, foi movida ou a sessão expirou.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Voltar ao Início
          </Link>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Wallet sbX — Financiamentos e Seguros" },
      { name: "description", content: "Simule 100% online, sem compromisso, financiamentos, linhas de crédito com garantia e seguros. Condições exclusivas para clientes da Superbid." },
      { property: "og:title", content: "Wallet sbX — Financiamentos e Seguros" },
      { property: "og:description", content: "Simule sem compromisso e negocie as melhores condições com um especialista." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [
      { rel: "icon", href: "data:," },
      { rel: "stylesheet", href: appCss },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@500;600;700;800&family=Inter:wght@400;500;600;700&display=swap",
      },
    ],
  }),
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
});

function RootComponent() {
  // O Router State observa a URL em tempo real para tomar decisões de arquitetura
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const isBackoffice = pathname.startsWith('/backoffice');

  return (
    <html lang="pt-BR">
      <head>
        <HeadContent />
      </head>
      <body>
        {isBackoffice ? (
          // =====================================================================
          // 🛑 TRILHA BACKOFFICE (Zero Provider Injection)
          // =====================================================================
          // A raiz não faz nada. O BackofficeGuard (em backoffice.lazy.tsx) 
          // assumirá a responsabilidade de injetar a segurança corporativa.
          <>
            <Outlet />
            <Scripts />
          </>
        ) : (
          // =====================================================================
          // 🟢 TRILHA CLIENTES (Financial Auth Injection)
          // =====================================================================
          // Protege rotas como /sbxpay, /financiamentos, /seguros e /accounts/signin.
          // Envelopar aqui previne a destruição da sessão durante transições de URL.
          <FinancialAuthProvider>
            <Outlet />
            <Scripts />
          </FinancialAuthProvider>
        )}
      </body>
    </html>
  );
}