import { createFileRoute, Link, Outlet, useLocation, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import {
  Bell,
  ChevronDown,
  CircleUser,
  FileBarChart2,
  LayoutDashboard,
  LifeBuoy,
  ListChecks,
  Loader2,
  LogOut,
  Search,
  ShieldCheck,
  Users,
  Globe,
} from "lucide-react";
import { WalletLogo } from "@/components/brand/WalletLogo";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/integrations/auth/AuthContext";
import { logLoginHistoryEvent } from "@/lib/login-history";

export const Route = createFileRoute("/backoffice")({
  component: BackofficeLayout,
});

const OPERACAO_NAV = [
  { to: "/backoffice", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { to: "/backoffice/propostas", label: "Simulações", icon: ListChecks },
  { to: "/backoffice/relatorios", label: "Relatórios", icon: FileBarChart2 },
];

const SEGURANCA_NAV = [
  { to: "/backoffice/seguranca", label: "Auditoria", icon: ShieldCheck },
  { to: "/backoffice/usuarios", label: "Usuários", icon: Users },
];

const CONFIG_NAV = [
  { to: "/backoffice/dominios", label: "Domínios", icon: Globe },
];

function BackofficeLayout() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const {
    authLoading,
    authorizationLoading,
    backofficeUser,
    isBackofficeAllowed,
    signOut,
    session,
  } = useAuth();

  useEffect(() => {
    document.body.classList.add("backoffice-shell");
    return () => {
      document.body.classList.remove("backoffice-shell");
    };
  }, []);

  useEffect(() => {
    if (authLoading || authorizationLoading) return;
    if (!backofficeUser) {
      navigate({ to: "/backoffice/login" });
      return;
    }
    if (!isBackofficeAllowed) {
      if (session?.access_token) {
        void logLoginHistoryEvent({
          email: backofficeUser.email,
          event: "blocked",
          success: false,
          failureReason: "route_access_denied",
          accessToken: session.access_token,
        }).catch((err) => console.error("blocked route logging failed:", err));
      }
      navigate({ to: "/backoffice/login" });
    }
  }, [authLoading, authorizationLoading, backofficeUser, isBackofficeAllowed, navigate, session?.access_token]);

  if (authLoading || authorizationLoading || !backofficeUser || !isBackofficeAllowed) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[oklch(0.985_0.008_320)]">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Verificando acesso…
        </div>
      </div>
    );
  }

  const initials = (backofficeUser?.name || "??")
    .split(" ")
    .map((p: string) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();

  const renderNavItem = (item: { to: string; label: string; icon: any }) => {
    // Correção: Marca como ativo apenas se o caminho for exatamente o mesmo
    const active = pathname === item.to;
    const Icon = item.icon;
    return (
      <Link
        key={item.to}
        to={item.to as any}
        className={`group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
          active ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-accent/60 hover:text-foreground"
        }`}
      >
        <Icon className={`h-4 w-4 ${active ? "text-primary" : ""}`} />
        {item.label}
      </Link>
    );
  };

  return (
    <div className="flex h-dvh overflow-hidden bg-background">
      <aside className="hidden h-screen w-64 shrink-0 flex-col border-r border-border bg-card lg:flex">
        <div className="flex h-16 items-center border-b border-border px-5">
          <WalletLogo size="sm" withTagline />
        </div>

        <nav className="flex-1 space-y-6 p-3">
          <div>
            <p className="px-3 pb-2 pt-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Operação</p>
            {OPERACAO_NAV.map(renderNavItem)}
          </div>
          <div>
            <p className="px-3 pb-2 pt-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Segurança</p>
            {SEGURANCA_NAV.map(renderNavItem)}
          </div>
          <div>
            <p className="px-3 pb-2 pt-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Configuração</p>
            {CONFIG_NAV.map(renderNavItem)}
          </div>
        </nav>

        <div className="border-t border-border p-3">
          <Link to="/backoffice" className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-muted-foreground hover:bg-accent/60 hover:text-foreground">
            <LifeBuoy className="h-4 w-4" /> Ajuda & Suporte
          </Link>
          <div className="mt-2 flex items-center gap-3 rounded-lg bg-accent/40 px-3 py-2.5">
            {backofficeUser.avatar ? (
              <img src={backofficeUser.avatar} alt={backofficeUser.name} className="h-8 w-8 rounded-full object-cover" />
            ) : (
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[image:var(--gradient-primary)] text-xs font-bold text-primary-foreground">
                {initials || "?"}
              </div>
            )}
            <div className="min-w-0 flex-1 leading-tight">
              <div className="truncate text-sm font-semibold">{backofficeUser.name}</div>
              <div className="truncate text-[11px] text-muted-foreground">{backofficeUser.email}</div>
            </div>
            <button onClick={() => signOut()} className="rounded-lg p-1 text-muted-foreground transition-colors hover:bg-background hover:text-foreground">
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </aside>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <header className="flex h-16 shrink-0 items-center gap-3 border-b border-border bg-card/80 px-4 backdrop-blur sm:px-6">
          <div className="flex flex-1 items-center gap-2">
            <div className="relative w-full max-w-md">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input placeholder="Buscar propostas, clientes, veículos..." className="h-10 rounded-lg pl-9" />
            </div>
          </div>
          <Button variant="ghost" size="icon" className="rounded-lg"><Bell className="h-4 w-4" /></Button>
          <div className="hidden items-center gap-2 rounded-lg border border-border px-3 py-1.5 sm:flex">
            <CircleUser className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">{backofficeUser?.name?.split(" ")[0] || "Usuário"}</span>
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          </div>
        </header>

        <main className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}