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
 */

import { useWizard } from "./WizardProvider";
import { WizardHeader } from "./WizardHeader";

interface WizardEngineProps {
  manifest: any;
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

  return (
    <>
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
        <ActiveComponent />
      ) : (
        <div className="p-4 text-red-500">
          Erro: Componente do passo {currentStep} não encontrado no manifesto.
        </div>
      )}
    </>
  );
}