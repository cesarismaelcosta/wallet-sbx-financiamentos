/**
 * @fileoverview Componente: WizardEngine
 * @path src/features/financial-hub/components/shared/WizardEngine.tsx
 * * @description 
 * Orquestrador central de jornadas. Responsável por decidir a renderização
 * do cabeçalho de progresso e a injeção do componente de passo ativo.
 * * @responsibilities
 * - Validação segura de metadados do manifesto.
 * - Sincronização entre o passo atual do estado e o componente definido no manifesto.
 * - Renderização condicional do WizardHeader.
 * - Na troca de passo: rola até o topo do wizard e foca o primeiro campo do novo passo.
 */

import { useEffect, useRef } from "react";
import { useWizard } from "./WizardProvider";
import { WizardHeader } from "./WizardHeader";
import type { WizardManifest } from "./manifest.types";

// Campos que recebem o foco. Botões só contam dentro de grids (ex.: Sim/Não), para não focar
// Voltar/Continuar/Enviar.
const FIELD_SELECTOR = [
  "input:not([type=hidden]):not([disabled])",
  "textarea:not([disabled])",
  "select:not([disabled])",
  "[role=combobox]:not([disabled])",
  "[role=radio]:not([disabled])",
  "[role=checkbox]:not([disabled])",
  "[role=switch]:not([disabled])",
  ".grid button:not([disabled])",
].join(",");

interface WizardEngineProps {
  manifest: WizardManifest;
}

export function WizardEngine({ manifest }: WizardEngineProps) {
  const { state } = useWizard();
  
  // O passo atual é derivado do estado global (WizardProvider).
  // Fallback para 1 caso o estado ainda não esteja definido.
  const currentStep = state.meta?.step || 1;

  // Extração segura das configurações do manifesto.
  // Evita 'Cannot read properties of undefined' caso o manifesto esteja incompleto.
  const meta = manifest?.meta || {};
  const stepsInfo = meta?.steps || {};
  
  // Localiza o componente de UI correspondente ao passo atual no manifesto.
  const ActiveComponent = manifest?.steps?.[currentStep];

  const topRef = useRef<HTMLDivElement>(null);
  const stepRef = useRef<HTMLDivElement>(null);
  const firstRender = useRef(true);

  useEffect(() => {
    // Na abertura da página não rola nem puxa o foco
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    const id = requestAnimationFrame(() => {
      topRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      const first = Array.from(stepRef.current?.querySelectorAll<HTMLElement>(FIELD_SELECTOR) ?? []).find(
        (el) => el.offsetParent !== null,
      );
      first?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(id);
  }, [currentStep]);

  return (
    <>
      {/* Âncora do topo do wizard (rolagem na troca de passo) */}
      <div ref={topRef} aria-hidden className="scroll-mt-24" />

      {/* Renderização condicional do WizardHeader:
        Só ocorre se o manifesto autorizar explicitamente via 'meta.showProgress'.
      */}
      {meta?.showProgress && (
        <WizardHeader 
          currentStep={currentStep}
          stepsInfo={stepsInfo}
        />
      )}
      
      {/* Injeção dinâmica do componente de passo.
        A verificação (ActiveComponent && ...) garante que o React não tente
        renderizar um componente inexistente.
      */}
      {ActiveComponent ? (
        <div ref={stepRef} className="contents">
          <ActiveComponent />
        </div>
      ) : (
        <div className="p-4 text-destructive">
          Erro: Componente do passo {currentStep} não encontrado no manifesto.
        </div>
      )}
    </>
  );
}