/**
 * @fileoverview Theme Provider Guard (Compatível com SSR / Node runtime)
 * @path src/components/ThemeProvider.tsx
 * 
 * =========================================================================
 * 🤖 PADRÃO GEMINI PRO ARQUITETURA: ISOMORPHIC STORAGE & SSR RESILIENCE
 * =========================================================================
 * Protege a inicialização de tema contra falhas de hydration e ausência
 * de APIs de browser (localStorage/window) durante streaming SSR do TanStack.
 */

import { createContext, useContext, useEffect, useState } from "react";

type Theme = "dark" | "light" | "system";

type ThemeProviderProps = {
  children: React.ReactNode;
  defaultTheme?: Theme;
  storageKey?: string;
};

type ThemeProviderState = {
  theme: Theme;
  setTheme: (theme: Theme) => void;
};

const initialState: ThemeProviderState = {
  theme: "system",
  setTheme: () => null,
};

const ThemeProviderContext = createContext<ThemeProviderState>(initialState);

export function ThemeProvider({
  children,
  defaultTheme = "dark",
  storageKey = "sbx-theme",
  ...props
}: ThemeProviderProps) {
  // Inicialização segura para SSR: não toca em localStorage se estiver no servidor
  const [theme, setTheme] = useState<Theme>(() => {
    if (typeof window !== "undefined" && typeof localStorage !== "undefined") {
      try {
        return (localStorage.getItem(storageKey) as Theme) || defaultTheme;
      } catch {
        return defaultTheme;
      }
    }
    return defaultTheme;
  });

  useEffect(() => {
    const root = window.document.documentElement;

    root.classList.remove("light", "dark");

    if (theme === "system") {
      const systemTheme = window.matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light";

      root.classList.add(systemTheme);
      return;
    }

    root.classList.add(theme);
  }, [theme]);

  const value = {
    theme,
    setTheme: (newTheme: Theme) => {
      if (typeof window !== "undefined" && typeof localStorage !== "undefined") {
        try {
          localStorage.setItem(storageKey, newTheme);
        } catch (e) {
          console.error("Falha ao salvar tema no localStorage", e);
        }
      }
      setTheme(newTheme);
    },
  };

  return (
    <ThemeProviderContext.Provider {...props} value={value}>
      {children}
    </ThemeProviderContext.Provider>
  );
}

export const useTheme = () => {
  const context = useContext(ThemeProviderContext);

  if (context === undefined) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }

  return context;
};