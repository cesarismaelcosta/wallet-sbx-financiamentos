/**
 * @fileoverview Layout Raiz do Backoffice (Orquestração, Navegação e Auth Guard)
 * @path src/routes/backoffice.lazy.tsx
 * @description Layout principal de controle de acesso, estruturação visual e 
 * roteamento aninhado para o painel administrativo do ecossistema sbX.
 * 
 * ============================================================================
 * [DIRETRIZES DE ARQUITETURA E SEGURANÇA]:
 * 1. Auth Guard Integrado: Intercepta o ciclo de vida para validar tokens e 
 *    permissões administrativas estritas antes de renderizar sub-rotas (`Outlet`).
 * 2. Blindagem contra Loops: Previne redirecionamentos cíclicos caso a rota 
 *    ativa seja a página de autenticação (`/backoffice/login`).
 * 3. Scope Isolation: O `AuthProvider` agora está injetado DIRETAMENTE no topo 
 *    desta rota, não poluindo mais o `__root.tsx`.
 * ============================================================================
 * 
 * @author César Ismael Pereira da Costa
 * @author Gemini Pro
 */

import { createLazyFileRoute, Link, Outlet, useLocation, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import {
  FileBarChart2,
  LayoutDashboard,
  ListChecks,
  LogOut,
  Search,
  ShieldCheck,
  Users,
  Globe,
  Layers,
  TriangleAlert,
  Menu,
  type LucideIcon,
} from "lucide-react";
import { WalletLogo } from "@/components/brand/WalletLogo";
import { Button } from "@/components/ui/button";
import { GradientIcon } from "@/design-system/sbx-design-system-9f1c03/components/ui/gradient-icon";
import { ThemeToggle } from "@/design-system/sbx-design-system-9f1c03/components/ThemeToggle";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { AuthProvider, useAuth } from "@/integrations/auth/AuthContext";
import { logLoginHistoryEvent } from "@/lib/login-history";

/**
 * ============================================================================
 * [COMPONENTE GUARDIÃO: Auth Provider Wrapper]
 * ============================================================================
 * Este Wrapper injeta o contexto de Auth EXCLUSIVAMENTE para a árvore do Backoffice.
 * Impede que a Wallet de clientes carregue essa lógica.
 */
function BackofficeGuard() {
  return (
    <AuthProvider>
      <BackofficeLayout />
    </AuthProvider>
  );
}

/**
 * [REGISTRO DA ROTA TANSTACK ROUTER]
 */
export const Route = createLazyFileRoute("/backoffice")({
  component: BackofficeGuard,
});

/**
 * ============================================================================
 * [MAPEAMENTO DE NAVEGAÇÃO DO BACKOFFICE]
 * ============================================================================
 */
const OPERACAO_NAV = [
  { to: "/backoffice", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { to: "/backoffice/simulations", label: "Simulações", icon: ListChecks },
  { to: "/backoffice/consults", label: "Consultas", icon: Search },
  { to: "/backoffice/reports", label: "Relatórios", icon: FileBarChart2 },
];

const SEGURANCA_NAV = [
  { to: "/backoffice/audit", label: "Auditoria", icon: ShieldCheck },
  { to: "/backoffice/users", label: "Usuários", icon: Users },
];

const CONFIG_NAV = [
  { to: "/backoffice/alerts", label: "Alertas", icon: TriangleAlert },
  { to: "/backoffice/domains", label: "Domínios", icon: Globe },
  { to: "/backoffice/routes", label: "Rotas", icon: Layers },
];

/**
 * ============================================================================
 * [COMPONENTE PRINCIPAL: BackofficeLayout]
 * ============================================================================
 */
function BackofficeLayout() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { authLoading, authorizationLoading, backofficeUser, isBackofficeAllowed, signOut, session } = useAuth();
  
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [isMounted, setIsMounted] = useState(false);
  const lastLoggedPageViewRef = useRef<string | null>(null);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {
    document.body.classList.add("backoffice-shell");
    return () => {
      document.body.classList.remove("backoffice-shell");
    };
  }, []);

  useEffect(() => {
    if (pathname.includes("/backoffice/login")) return;
    if (authLoading || authorizationLoading) return;

    if (!backofficeUser || !isBackofficeAllowed) {
      if (session?.access_token && backofficeUser) {
        void logLoginHistoryEvent(
          {
            email: backofficeUser?.email ?? "",
            event: "blocked",
            success: false,
            failureReason: "route_access_denied",
          },
          session.access_token,
        ).catch((err) => console.error("blocked route logging failed:", err));
      }
      navigate({ to: "/backoffice/login" });
    }
  }, [authLoading, authorizationLoading, backofficeUser, isBackofficeAllowed, navigate, session?.access_token, pathname]);

  useEffect(() => {
    if (backofficeUser && isBackofficeAllowed) {
      sessionStorage.setItem("sb_backoffice_initialized", "true");
    }
  }, [backofficeUser, isBackofficeAllowed]);

  // =========================================================================
  // 🧭 AUDITORIA DE NAVEGAÇÃO: registra um evento "page_view" a cada troca de
  // rota dentro do backoffice (além dos eventos de login/refresh/logout que o
  // AuthContext já cobre). A RPC `log_access_event` já aceitava "page_view"
  // na allowlist — só faltava o frontend chamar com esse tipo de evento.
  // =========================================================================
  useEffect(() => {
    if (pathname.includes("/backoffice/login")) return;
    if (!backofficeUser || !isBackofficeAllowed) return;
    if (!session?.access_token) return;
    if (lastLoggedPageViewRef.current === pathname) return;

    lastLoggedPageViewRef.current = pathname;

    void logLoginHistoryEvent(
      {
        email: backofficeUser?.email ?? "",
        event: "page_view",
        success: true,
      },
      session.access_token,
    ).catch((err) => console.error("page_view logging failed:", err));
  }, [pathname, backofficeUser, isBackofficeAllowed, session?.access_token]);

  const isAdmin = backofficeUser?.role?.toLowerCase() === "admin";
  const hasInitialized = typeof window !== "undefined" && sessionStorage.getItem("sb_backoffice_initialized") === "true";

  if (!isMounted || authLoading || authorizationLoading || (!hasInitialized && !backofficeUser && !pathname.includes("/backoffice/login"))) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-background font-['Plus_Jakarta_Sans']">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-foreground mb-4"></div>
        <p className="text-muted-foreground font-medium text-sm">
          Carregando informações...
        </p>
      </div> 
    );
  }

  if (pathname.includes("/backoffice/login")) {
    return <Outlet />;
  }

  if (!authLoading && !authorizationLoading && (!backofficeUser || !isBackofficeAllowed)) {
    return null; 
  }

  const nameParts = (backofficeUser?.name || "??").trim().split(" ").filter(Boolean);
  const initials = nameParts.length > 1
    ? `${nameParts[0][0]}${nameParts[nameParts.length - 1][0]}`.toUpperCase()
    : (nameParts[0]?.[0] || "?").toUpperCase();

  const renderNavItem = (item: { to: string; label: string; icon: LucideIcon }) => {
    const active = pathname === item.to;
    const Icon = item.icon;
    return (
      <Link
        key={item.to}
        to={item.to as any}
        onClick={() => setMobileMenuOpen(false)}
        className={`group flex items-center gap-2.5 rounded-none px-3 py-0.5 text-[13px] transition-colors ${
          active 
            ? "bg-sidebar-accent text-sidebar-foreground font-semibold border-r-2 border-brand-accent" 
            : "text-muted-foreground font-normal hover:bg-sidebar-accent hover:text-sidebar-foreground"
        }`}
      >
        {active ? (
          <GradientIcon icon={Icon} size={14} />
        ) : (
          <Icon className="h-3.5 w-3.5 text-[#a7b5db]" />
        )}
        {item.label}
      </Link>
    );
  };

  const sidebarContent = (
    <div className="flex h-full flex-col bg-sidebar">
      <div className="flex h-16 items-center border-b border-sidebar-border px-5">
        <WalletLogo size="sm" withTagline followTheme />
      </div>

      <nav className="flex-1 space-y-2 p-3 overflow-y-auto">
        <div>
          <p className="px-3 pb-1 pt-2 text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
            Operação
          </p>
          {OPERACAO_NAV.map(renderNavItem)}
        </div>

        {isAdmin && (
          <div>
            <p className="px-3 pb-1 pt-2 text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
              Segurança
            </p>
            {SEGURANCA_NAV.map(renderNavItem)}
          </div>
        )}

        {isAdmin && (
          <div>
            <p className="px-3 pb-1 pt-2 text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
              Configuração
            </p>
            {CONFIG_NAV.map(renderNavItem)}
          </div>
        )}
      </nav>

      <div className="border-t border-sidebar-border p-3">
        {backofficeUser ? (
          <div className="flex items-center gap-3 px-2 py-1.5">
            {backofficeUser?.avatar ? (
              <img
                src={backofficeUser.avatar}
                alt={backofficeUser?.name || "Usuário"}
                className="h-8 w-8 rounded-full object-cover shrink-0 border border-sidebar-border"
              />
            ) : (
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-sidebar-accent border border-sidebar-border text-xs font-medium text-sidebar-foreground">
                {initials || "?"}
              </div>
            )}
            <div className="min-w-0 flex-1 leading-tight">
              <div className="truncate text-xs font-medium text-sidebar-foreground">{backofficeUser?.name}</div>
              <div className="truncate text-[11px] text-muted-foreground">{backofficeUser?.email}</div>
            </div>
            <div className="flex items-center gap-0.5 border-l border-sidebar-border pl-2 ml-1 shrink-0">
              <ThemeToggle />
              <button
                onClick={() => signOut()}
                className="rounded-none p-1.5 text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground cursor-pointer"
                title="Encerrar sessão"
              >
                <LogOut className="h-4 w-4" />
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );

  return (
    <div className="flex h-dvh overflow-hidden bg-background">
      {/* Sidebar Desktop */}
      <aside className="hidden h-screen w-64 shrink-0 flex-col border-r border-sidebar-border bg-sidebar lg:flex">
        {sidebarContent}
      </aside>

      {/* Sidebar Mobile (Gaveta Radix Sheet) */}
      <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
        <SheetContent side="left" className="p-0 w-64 rounded-none border-r border-sidebar-border">
          {sidebarContent}
        </SheetContent>
      </Sheet>

      {/* Área Principal de Conteúdo */}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        {/* Cabeçalho Mobile */}
        <header className="flex h-16 shrink-0 items-center justify-between gap-3 border-b border-sidebar-border bg-sidebar px-4 lg:hidden">
          <WalletLogo size="sm" withTagline followTheme />
          <Button
            variant="ghost"
            size="icon"
            className="rounded-none border border-sidebar-border hover:bg-sidebar-accent"
            onClick={() => setMobileMenuOpen(true)}
          >
            <GradientIcon icon={Menu} size={20} />
          </Button>
        </header>

        {/* Viewport dinâmico para sub-rotas */}
        <main className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}