import { NavLink, useLocation } from "react-router-dom";
import { cn } from "../lib/utils";
import { ThemeToggle } from "./ThemeToggle";
import { ScrollArea } from "./ui/scroll-area";
import { GradientIcon } from "./ui/gradient-icon";
import {
  Palette,
  Type,
  Ruler,
  Sparkles,
  LayoutGrid,
  Home,
  Menu,
  X,
  PanelLeftClose,
  PanelLeft,
  FolderOpen,
  BadgeCheck,
  Grid3X3,
  Compass,
} from "lucide-react";
import { useState } from "react";
import { Button } from "./ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "./ui/tooltip";

interface LayoutProps {
  children: React.ReactNode;
}

const navigation = [
  { name: "Overview", href: "/", icon: Home },
  { name: "Brand", href: "/brand", icon: BadgeCheck },
  { name: "Colors", href: "/colors", icon: Palette },
  { name: "Typography", href: "/typography", icon: Type },
  { name: "Spacing", href: "/spacing", icon: Ruler },
  { name: "Effects", href: "/effects", icon: Sparkles },
  { name: "Components", href: "/components", icon: LayoutGrid },
  { name: "Patterns", href: "/patterns", icon: Grid3X3 },
  { name: "Foundations", href: "/foundations", icon: Compass },
  { name: "Assets", href: "/assets", icon: FolderOpen },
];

export function Layout({ children }: LayoutProps) {
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  return (
    <div className="min-h-screen flex w-full bg-background">
      {/* Mobile sidebar backdrop */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-modal-backdrop bg-black/50 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-modal bg-sidebar border-r border-sidebar-border transform transition-all duration-300 lg:translate-x-0 lg:static lg:z-0",
          sidebarOpen ? "translate-x-0" : "-translate-x-full",
          sidebarCollapsed ? "lg:w-16" : "w-64"
        )}
      >
        <div className="flex flex-col h-full">
          {/* Header */}
          {sidebarCollapsed ? (
            /* Estado colapsado - botão de expandir */
            <div className="flex items-center justify-center h-16 border-b border-sidebar-border">
              <button
                onClick={() => setSidebarCollapsed(false)}
                className="hidden lg:flex items-center justify-center w-10 h-10 rounded-lg transition-colors hover:bg-sidebar-accent"
                aria-label="Expandir menu"
              >
                <PanelLeft className="h-5 w-5 text-muted-foreground" />
              </button>
            </div>
          ) : (
            /* Estado expandido - wordmark + botão */
            <div className="flex items-center justify-between h-16 border-b border-sidebar-border px-4">
              <span className="logo-mark text-2xl text-sidebar-foreground">
                <span className="logo-mark-light">DESIGN</span>
                <span className="logo-mark-regular">SYSTEM</span>
              </span>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setSidebarCollapsed(true)}
                  className="hidden lg:flex items-center justify-center h-8 w-8 rounded-md transition-colors hover:bg-sidebar-accent"
                  aria-label="Recolher menu"
                >
                  <PanelLeftClose className="h-5 w-5 text-muted-foreground" />
                </button>

                <Button
                  variant="ghost"
                  size="icon"
                  className="lg:hidden h-8 w-8"
                  onClick={() => setSidebarOpen(false)}
                >
                  <X className="h-5 w-5" />
                </Button>
              </div>
            </div>
          )}

          {/* Navigation */}
          <ScrollArea className="flex-1 py-4">
            <nav className={cn("space-y-1", sidebarCollapsed ? "px-2" : "px-3")}>
              {navigation.map((item) => {
                const isActive = location.pathname === item.href;
                
                const linkContent = (
                  <NavLink
                    key={item.name}
                    to={item.href}
                    onClick={() => setSidebarOpen(false)}
                    className={cn(
                      "flex items-center gap-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
                      sidebarCollapsed ? "justify-center px-2" : "px-3",
                      isActive
                        ? "bg-sidebar-accent text-sidebar-accent-foreground"
                        : "text-sidebar-foreground hover:bg-sidebar-accent/50"
                    )}
                  >
                    {isActive ? (
                      <GradientIcon icon={item.icon} size={20} />
                    ) : (
                      <item.icon className="h-5 w-5 shrink-0" />
                    )}
                    {!sidebarCollapsed && item.name}
                  </NavLink>
                );

                if (sidebarCollapsed) {
                  return (
                    <Tooltip key={item.name}>
                      <TooltipTrigger asChild>
                        {linkContent}
                      </TooltipTrigger>
                      <TooltipContent side="right">
                        {item.name}
                      </TooltipContent>
                    </Tooltip>
                  );
                }

                return linkContent;
              })}
            </nav>
          </ScrollArea>


          {/* Footer */}
          {!sidebarCollapsed && (
            <div className="p-4 border-t border-sidebar-border">
              <p className="text-xs text-muted-foreground text-center">
                SBX Design System v1.0
              </p>
            </div>
          )}
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <header className="sticky top-0 z-sticky h-16 flex items-center justify-between px-4 lg:px-8 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden"
            onClick={() => setSidebarOpen(true)}
          >
            <Menu className="h-5 w-5" />
          </Button>
          <div className="flex-1" />
          <ThemeToggle />
        </header>

        {/* Page content */}
        <main id="main-content" className="flex-1 overflow-auto">
          <div className="container py-8 animate-fade-in">{children}</div>
        </main>
      </div>
    </div>
  );
}
