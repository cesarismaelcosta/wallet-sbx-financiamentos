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
 * 3. Layout Adaptativo: Suporta barra de navegação lateral persistente em desktop 
 *    e gaveta lateral deslizante (*Sheet*) para dispositivos móveis.
 * ============================================================================
 * 
 * @author César Ismael Pereira da Costa
 * @author Gemini Pro
 */

import { createLazyFileRoute, Link, Outlet, useLocation, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
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
} from "lucide-react";
import { WalletLogo } from "@/components/brand/WalletLogo";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { useAuth } from "@/integrations/auth/AuthContext";
import { logLoginHistoryEvent } from "@/lib/login-history";

/**
 * [REGISTRO DA ROTA TANSTACK ROUTER]
 */
export const Route = createLazyFileRoute("/backoffice")({
  component: BackofficeLayout,
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
  // 1. TODOS OS HOOKS DEVEM FICAR NO TOPO, SEM NENHUM RETORNO ANTES DELES
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { authLoading, authorizationLoading, backofficeUser, isBackofficeAllowed, signOut, session } = useAuth();
  
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [isMounted, setIsMounted] = useState(false);

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

  // 2. VARIÁVEIS DERIVADAS APÓS TODOS OS HOOKS
  const isAdmin = backofficeUser?.role?.toLowerCase() === "admin";
  const hasInitialized = typeof window !== "undefined" && sessionStorage.getItem("sb_backoffice_initialized") === "true";

  // 3. AGORA SIM, PODEMOS DAR OS RETORNOS CONDICIONAIS (POIS TODOS OS HOOKS JÁ RODARAM)
  
  // Loader de carregamento com Spinner Roxo
  if (!isMounted || authLoading || authorizationLoading || (!hasInitialized && !backofficeUser && !pathname.includes("/backoffice/login"))) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-white font-['Plus_Jakarta_Sans']">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mb-4"></div>
        <p className="text-slate-500 font-medium text-sm">
          Carregando informações...
        </p>
      </div> 
    );
  }

  // Bypass para a página de login
  if (pathname.includes("/backoffice/login")) {
    return <Outlet />;
  }

  // Se a checagem terminou e o usuário não tem permissão
  if (!authLoading && !authorizationLoading && (!backofficeUser || !isBackofficeAllowed)) {
    return null; 
  }

  // Tratamento seguro para iniciais do avatar do usuário logado
  const initials = (backofficeUser?.name || "??")
    .split(" ")
    .map((p: string) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();

  /**
   * Helper de renderização de links da barra lateral
   */
  const renderNavItem = (item: { to: string; label: string; icon: any }) => {
    const active = pathname === item.to;
    const Icon = item.icon;
    return (
      <Link
        key={item.to}
        to={item.to as any}
        onClick={() => setMobileMenuOpen(false)}
        className={`group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
          active ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-accent/60 hover:text-foreground"
        }`}
      >
        <Icon className={`h-4 w-4 ${active ? "text-primary" : ""}`} />
        {item.label}
      </Link>
    );
  };

  /**
   * Template unificado do conteúdo da barra lateral (Sidebar / Drawer Mobile)
   */
  const sidebarContent = (
    <div className="flex h-full flex-col bg-card">
      <div className="flex h-16 items-center border-b border-border px-5">
        <WalletLogo size="sm" withTagline />
      </div>

      <nav className="flex-1 space-y-6 p-3 overflow-y-auto">
        <div>
          <p className="px-3 pb-2 pt-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Operação
          </p>
          {OPERACAO_NAV.map(renderNavItem)}
        </div>

        {/* Exibe Segurança apenas se for Administrador */}
        {isAdmin && (
          <div>
            <p className="px-3 pb-2 pt-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              Segurança
            </p>
            {SEGURANCA_NAV.map(renderNavItem)}
          </div>
        )}

        {/* Exibe Configuração apenas se for Administrador */}
        {isAdmin && (
          <div>
            <p className="px-3 pb-2 pt-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              Configuração
            </p>
            {CONFIG_NAV.map(renderNavItem)}
          </div>
        )}
      </nav>

      {/* Perfil e Rodapé da Sidebar */}
      <div className="border-t border-border p-3">
        {backofficeUser ? (
          <div className="mt-2 flex items-center gap-3 rounded-lg bg-accent/40 px-3 py-2.5">
            {backofficeUser?.avatar ? (
              <img
                src={backofficeUser.avatar}
                alt={backofficeUser?.name || "Usuário"}
                className="h-8 w-8 rounded-full object-cover"
              />
            ) : (
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[image:var(--gradient-primary)] text-xs font-bold text-primary-foreground">
                {initials || "?"}
              </div>
            )}
            <div className="min-w-0 flex-1 leading-tight">
              <div className="truncate text-sm font-semibold">{backofficeUser?.name}</div>
              <div className="truncate text-[11px] text-muted-foreground">{backofficeUser?.email}</div>
            </div>
            <button
              onClick={() => signOut()}
              className="rounded-lg p-1 text-muted-foreground transition-colors hover:bg-background hover:text-foreground"
              title="Encerrar sessão"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );

  return (
    <div className="flex h-dvh overflow-hidden bg-background">
      {/* Sidebar Desktop */}
      <aside className="hidden h-screen w-64 shrink-0 flex-col border-r border-border bg-card lg:flex">
        {sidebarContent}
      </aside>

      {/* Sidebar Mobile (Gaveta Radix Sheet) */}
      <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
        <SheetContent side="left" className="p-0 w-64">
          {sidebarContent}
        </SheetContent>
      </Sheet>

      {/* Área Principal de Conteúdo */}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        {/* Cabeçalho Mobile */}
        <header className="flex h-16 shrink-0 items-center justify-between gap-3 border-b border-border bg-card px-4 lg:hidden">
          <WalletLogo size="sm" withTagline />
          <Button
            variant="ghost"
            size="icon"
            className="rounded-lg"
            onClick={() => setMobileMenuOpen(true)}
          >
            <Menu className="h-5 w-5" />
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