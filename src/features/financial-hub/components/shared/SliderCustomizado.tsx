/**
 * @fileoverview Componente: SliderCustomizado
 * * PROPÓSITO:
 * Slider de alta performance para formulários de simulação.
 * * FIX:
 * Implementação de 'onValueCommit' para prevenir Race Conditions (o slider voltar
 * ao início durante o arrasto). A atualização do estado global agora ocorre
 * apenas após a finalização do movimento (soltar o clique).
 * * VISUAL (padrão design system):
 * Thumb circular com borda em gradiente accent e trilho preenchido com o
 * gradiente accent, alinhado ao slider de referência do design system
 * (sbx-design-system-9f1c03/components/ui/slider.tsx). O valor bruto (usado
 * apenas no controle de percentual, ex: "Entrada") aparece como um badge
 * flutuante em gradiente azul acima do manípulo, só enquanto o usuário está
 * arrastando o slider — some ao soltar.
 */

import { useState } from "react";
import * as SliderPrimitive from "@radix-ui/react-slider";

export const SliderCustomizado = ({ 
  value, 
  onValueChange, 
  onValueCommit, // Novo evento para persistência final
  min, 
  max, 
  step, 
  isCurrency = false,
  disabled = false,
  active = false, // Controle externo: força a exibição do badge (ex: input em foco)
}: any) => {
  
  // SEGURANÇA: Garantimos que o valor seja tratado como 0 se for undefined/null
  const safeValue = value ?? 0;
  const [isDragging, setIsDragging] = useState(false);

  const displayValue = isCurrency
    ? safeValue.toLocaleString("pt-BR", { maximumFractionDigits: 0 })
    : `${Math.round(safeValue)}%`;

  // Badge de valor: só faz sentido no controle percentual (Entrada) e só
  // enquanto o slider está sendo arrastado OU o controle externo (ex: input
  // de texto da Entrada em foco/edição) pede para aparecer.
  const showBadge = !isCurrency;
  const showBadgeNow = isDragging || active;

  return (
    <SliderPrimitive.Root
      className="relative flex w-full touch-none select-none items-center h-6"
      value={[safeValue]}
      disabled={disabled}
      onPointerDown={() => setIsDragging(true)}
      onPointerUp={() => setIsDragging(false)}
      onPointerCancel={() => setIsDragging(false)}
      // Visual: Atualiza o estado local do componente pai de forma fluida
      onValueChange={(v) => onValueChange?.(v[0])}
      // Dados: Atualiza o estado global (Provider) apenas ao soltar o clique
      onValueCommit={(v) => {
        onValueCommit?.(v[0]);
        setIsDragging(false);
      }}
      min={min || 0}
      max={max || 100}
      step={step}
    >
      <SliderPrimitive.Track className="relative h-2 w-full grow overflow-hidden rounded-full bg-secondary">
        <SliderPrimitive.Range className="absolute h-full fill-gradient" />
      </SliderPrimitive.Track>
      <SliderPrimitive.Thumb
        className="relative block h-5 w-5 rounded-full border-2 border-transparent border-gradient bg-background shadow-sm ring-offset-background transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 active:scale-110 disabled:pointer-events-none disabled:opacity-50"
      >
        {showBadge && (
          <span
            className={`pointer-events-none absolute top-full mt-2 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full fill-gradient px-2 py-0.5 text-[10px] font-bold shadow-sm transition-opacity duration-150 ${
              showBadgeNow ? "opacity-100" : "opacity-0"
            }`}
          >
            {displayValue}
          </span>
        )}
      </SliderPrimitive.Thumb>
    </SliderPrimitive.Root>
  );
};
