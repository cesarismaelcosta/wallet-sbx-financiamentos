/**
 * @fileoverview StepLayout - Container Estável de Etapas
 * * * RESPONSABILIDADE:
 * 1. Estabilizar a altura mínima (min-h-[500px]) para o Passo 1.
 * 2. Aplicar a moldura visual (background, shadow, border-radius).
 * 3. [ESTRATÉGIA] Altura variável: cresce naturalmente no Passo 2.
 */

import React from "react";

interface StepLayoutProps {
  children: React.ReactNode;
}

export function StepLayout({ children }: StepLayoutProps) {
  return (
    /* - min-h-[500px]: Mantém um tamanho decente no Passo 1.
       - h-auto: Permite que cresça para acomodar o Passo 2.
       - overflow-hidden: Mantém as bordas arredondadas.
    */
    <div className="w-full lg:col-span-2 bg-white min-h-[500px] h-auto overflow-hidden flex flex-col">
       {children}
    </div>
  );
}