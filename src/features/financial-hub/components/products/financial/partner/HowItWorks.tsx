/**
 * @fileoverview Componente: HowItWorks (Jornada Simulação)
 * @path src/components/simulacao/HowItWorks.tsx
 * * ÁRVORE DE DEPENDÊNCIAS:
 * --------------------------------------------------------------------------------
 * src/components/simulacao/
 * └── HowItWorks.tsx                 # [AQUI] Componente de Marketing
 * --------------------------------------------------------------------------------
 * * PROPÓSITO:
 * Exibir os passos da jornada de simulação.
 * * INTEGRAÇÃO:
 * - Renderizado no `simulacao.tsx` (Entry Point da rota).
 * * RESPONSABILIDADE:
 * 1. Renderizar os steps da jornada de forma modular e visualmente consistente.
 */

import { Sparkles, MessageCircle, ShieldCheck } from "lucide-react";

export function HowItWorks() {
  const steps = [
    { 
      t: "Simule", 
      d: "Escolha a entrada e o prazo ideais para o seu momento no nosso simulador inteligente.", 
      i: <Sparkles className="h-7 w-7" />, 
    },
    { 
      t: "Negocie", 
      d: "Entramos em contato com você para seguir com a análise de crédito", 
      i: <MessageCircle className="h-7 w-7" />, 
    },
    { 
      t: "Pague", 
      d: "Após a confirmação da sua proposta, nossa equipe apoia você em toda a formalização.", 
      i: <ShieldCheck className="h-7 w-7" />, 
    },
  ];

  return (
    <section id="como-funciona" className="py-16 bg-background border-t">
      <div className="mx-auto max-w-7xl px-4 grid md:grid-cols-3 gap-6">
        {steps.map((s, i) => (
          <div key={i} className="p-8 border rounded-3xl bg-white shadow-sm">
            <div className="mb-4 text-primary">{s.i}</div>
            <h3 className="font-bold text-lg">{s.t}</h3>
            <p className="text-sm text-slate-500">{s.d}</p>
          </div>
        ))}
      </div>
    </section>
  );
}