/**
 * @fileoverview Passo 5: Confirmação e Resultado (Auto-Equity)
 * @path src/features/financial-hub/components/products/credit/auto-equity/steps/Step5Confirm.tsx
 * * PROPÓSITO:
 * Exibe o feedback final do processamento da proposta (sucesso, negação ou erro).
 * * INTEGRAÇÃO:
 * - Utiliza o contexto `useWizard` para ler o estado da simulação e executar a reinicialização.
 */

import { useState, useEffect } from "react";
import { Loader2, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useWizard } from "@/features/financial-hub/components/shared/WizardProvider";
import { ButtonWhatsApp } from "@/features/financial-hub/components/layout/ButtonWhatsApp";

export function Step5Confirm() {
  const { state, update, goTo } = useWizard<any>();

  // Estados locais de UI
  const [status, setStatus] = useState<"loading" | "success" | "denied" | "error">("loading");

  useEffect(() => {
    const result = state.data?.simulationResult;
    if (!result) return; // Aguarda o dado chegar

    // 1. Primeiro checamos se a API falhou tecnicamente
    if (!result.success) {
      setStatus("error");
      return;
    }

    // 2. Agora checamos o status de negócio
    if (result.status_id === 1) {
      setStatus("success"); // Aprovado
    } else if (result.status_id === 2) {
      setStatus("denied"); // Negado
    } else {
      setStatus("error"); // Status desconhecido
    }
  }, [state.data]);

  const handleRestart = () => {
    // 1. Limpa apenas os dados de simulação, preservando o contexto da visita
    update({
      data: {
        ...state.data,
        simulationResult: null,
        simulation_id: null,
      },
    });

    // 2. Usa a função que já existe no seu Provider
    goTo(1);
  };

  return (
    // Layout Compacto: py-4 reduz o espaço vertical excessivo
    <div className="flex flex-col items-center justify-center py-4 text-center animate-in fade-in zoom-in duration-300 w-full max-w-lg mx-auto">
      {/* 1. ESTADO DE CARREGAMENTO */}
      {status === "loading" && (
        <div className="flex flex-col items-center gap-3 py-12">
          <Loader2 className="h-10 w-10 animate-spin text-[var(--brand-primary)]" />
          <h2 className="text-lg font-semibold text-foreground">Analisando proposta...</h2>
        </div>
      )}

      {/* 2. ESTADO DE RESULTADO */}
      {status !== "loading" && (
        <div className="flex flex-col items-center w-full space-y-6">
          {/* Sucesso / Aprovado */}
          {status === "success" && (
            <>
              <div className="w-36 h-36 flex items-center justify-center mb-2">
                <img
                  src="/assets/home/carhomeequity.webp"
                  alt="Proposta enviada"
                  className="w-full h-full object-contain"
                />
              </div>

              <div className="space-y-2 max-w-sm mx-auto">
                <h2 className="text-xl font-bold text-slate-900 tracking-tight">Proposta enviada!</h2>
                <p className="text-sm text-slate-500 leading-relaxed">
                  Recebemos sua proposta. Entraremos em contato pelo e-mail{" "}
                  <strong>{state.data?.eligibility?.email}</strong>.
                </p>
              </div>

              {/* Protocolo */}
              {state.data?.proposalId && (
                <div className="rounded-lg border border-border bg-muted/40 px-4 py-2 text-sm">
                  Protocolo: <strong className="text-foreground">{state.data.proposalId}</strong>
                </div>
              )}
            </>
          )}

          {/* Negado */}
          {status === "denied" && (
            <>
              <div className="w-36 h-36 flex items-center justify-center mb-2">
                <img
                  src="/assets/home/financiamentocreditonegada.webp"
                  alt="Proposta não aprovada"
                  className="w-full h-full object-contain"
                />
              </div>

              <div className="space-y-2 max-w-xs mx-auto">
                <h3 className="text-xl font-bold text-slate-900 tracking-tight">Proposta não aprovada</h3>
                <p className="text-sm text-slate-500 leading-relaxed">
                  Infelizmente, não foi possível prosseguir neste momento com os dados informados.
                </p>
              </div>
            </>
          )}

          {/* Erro */}
          {status === "error" && (
            <>
              <div className="w-36 h-36 flex items-center justify-center mb-2">
                <img
                  src="/assets/home/financiamentoveiculosnegada.png"
                  alt="Erro na comunicação"
                  className="w-full h-full object-contain"
                />
              </div>

              <div className="space-y-2 max-w-xs mx-auto">
                <h3 className="text-xl font-bold text-slate-900 tracking-tight">Ops, algo deu errado</h3>
                <p className="text-sm text-slate-500 leading-relaxed">
                  Houve um problema na comunicação. Por favor, tente novamente.
                </p>
              </div>
            </>
          )}

          {/* Botões: Layout Horizontal Padronizado (igual a Veículos) */}
          <div className="flex flex-col-reverse sm:flex-row items-center justify-between gap-4 pt-6 w-full border-t border-slate-100">
            {/* Botão Voltar / Recomeçar */}
            <Button
              variant="ghost"
              onClick={handleRestart}
              className="w-full sm:w-auto text-[var(--brand-primary)] hover:bg-[var(--brand-primary)]/10 hover:text-[var(--brand-primary)] transition-all focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)] focus-visible:ring-offset-2"
            >
              <ArrowLeft className="mr-2 h-4 w-4" />
              {status === "success" ? "Voltar ao início" : "Tentar novamente"}
            </Button>

            {/* Botão WhatsApp */}
            <div className="w-full sm:w-auto flex-1 flex justify-end">
              <ButtonWhatsApp
                productName="Auto Equity"
                variant="button"
                config={state.data?.integration_details}
                data={state.data}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
