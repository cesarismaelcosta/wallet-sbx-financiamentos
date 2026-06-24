/**
 * @fileoverview Componente: WizardProvider
 * @path src/features/financial-hub/components/shared/WizardProvider.tsx
 * * @description Provedor de contexto global com a API completa de motor de jornada (Engine).
 * * @responsibilities
 * - Centraliza o estado da navegação (step atual, meta-estados).
 * - Centraliza os dados injetados (manifesto, page_configs, formData).
 * - Provê funções de controle de fluxo (next, back, goTo, updateData).
 * * @dependencies
 * - react
 */

import React, { createContext, useContext, useState, ReactNode } from "react";

// 1. Tipagens do Estado
export interface WizardState<T = any> {
  isReady?: boolean;
  meta: {
    step: number;
    [key: string]: any;
  };
  data: {
    page_configs?: any;
    [key: string]: any;
  } & T;
}

// 2. Tipagens do Contrato (API exposta pelo hook)
export interface WizardContextValue<T = any> {
  state: WizardState<T>;
  update: (patch: Partial<WizardState<T>>) => void;
  updateData: (dataPatch: Partial<WizardState<T>["data"]>) => void;
  goTo: (step: number) => void;
  next: () => void;
  back: () => void;
  reset: (initialData?: any) => void;
}

const WizardContext = createContext<WizardContextValue | undefined>(undefined);

// 3. Provedor
export function WizardProvider({ children, initialData = {} }: { children: ReactNode; initialData?: any }) {
  const [state, setState] = useState<WizardState>({
    isReady: false,
    meta: { step: 1 },
    data: { page_configs: {}, ...initialData },
  });

  // Atualiza partes mescladas do estado completo
  const update: WizardContextValue["update"] = (patch) => {
    setState((s) => ({
      ...s,
      ...patch,
      meta: { ...s.meta, ...(patch.meta || {}) },
      data: { ...s.data, ...(patch.data || {}) },
    }));
  };

  // Restauração da função exata que o Injetor (e seus forms) esperam usar
  const updateData: WizardContextValue["updateData"] = (dataPatch) => {
    setState((s) => ({ ...s, data: { ...s.data, ...dataPatch } }));
  };

  const goTo: WizardContextValue["goTo"] = (step) =>
    setState((s) => ({ ...s, meta: { ...s.meta, step } }));

  const next: WizardContextValue["next"] = () =>
    setState((s) => ({ ...s, meta: { ...s.meta, step: s.meta.step + 1 } }));

  const back: WizardContextValue["back"] = () =>
    setState((s) => ({ ...s, meta: { ...s.meta, step: Math.max(1, s.meta.step - 1) } }));

  const reset: WizardContextValue["reset"] = (initial = {}) =>
    setState({ isReady: false, meta: { step: 1 }, data: { page_configs: {}, ...initial } });

  return (
    <WizardContext.Provider value={{ state, update, updateData, goTo, next, back, reset }}>
      {children}
    </WizardContext.Provider>
  );
}

// 4. Hook de Consumo Seguro
export const useWizard = <T = any>() => {
  const context = useContext(WizardContext);
  if (!context) {
    throw new Error("useWizard deve ser utilizado dentro de um WizardProvider");
  }
  return context as WizardContextValue<T>;
};