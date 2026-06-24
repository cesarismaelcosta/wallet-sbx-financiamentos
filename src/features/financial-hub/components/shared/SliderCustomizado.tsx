/**
 * @fileoverview Componente: SliderCustomizado
 * * PROPÓSITO:
 * Slider de alta performance para formulários de simulação.
 * * FIX:
 * Implementação de 'onValueCommit' para prevenir Race Conditions (o slider voltar
 * ao início durante o arrasto). A atualização do estado global agora ocorre
 * apenas após a finalização do movimento (soltar o clique).
 */

import * as SliderPrimitive from "@radix-ui/react-slider";

export const SliderCustomizado = ({ 
  value, 
  onValueChange, 
  onValueCommit, // Novo evento para persistência final
  min, 
  max, 
  step, 
  isCurrency = false 
}: any) => {
  
  // SEGURANÇA: Garantimos que o valor seja tratado como 0 se for undefined/null
  const safeValue = value ?? 0;
  
  const displayValue = isCurrency
    ? safeValue.toLocaleString("pt-BR", { maximumFractionDigits: 0 })
    : `${Math.round(safeValue)}%`;

  return (
    <SliderPrimitive.Root
      className="relative flex w-full touch-none select-none items-center h-6"
      value={[safeValue]}
      // Visual: Atualiza o estado local do componente pai de forma fluida
      onValueChange={(v) => onValueChange?.(v[0])}
      // Dados: Atualiza o estado global (Provider) apenas ao soltar o clique
      onValueCommit={(v) => onValueCommit?.(v[0])}
      min={min || 0}
      max={max || 100}
      step={step}
    >
      <SliderPrimitive.Track className="relative h-2 w-full grow overflow-hidden rounded-full bg-slate-200">
        <SliderPrimitive.Range className="absolute h-full bg-primary" />
      </SliderPrimitive.Track>
      <SliderPrimitive.Thumb className="block h-7 w-20 rounded-lg bg-white shadow-sm border border-primary focus:outline-none transition-transform active:scale-110">
        <div className="flex h-full w-full items-center justify-center text-[10px] font-bold text-primary">
          {displayValue}
        </div>
      </SliderPrimitive.Thumb>
    </SliderPrimitive.Root>
  );
};