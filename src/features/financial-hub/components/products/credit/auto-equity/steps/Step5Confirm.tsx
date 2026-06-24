/**
 * @fileoverview Passo 5: Confirmação e Resultado
 * * PROPÓSITO: 
 * Exibe o feedback final do processamento da proposta (sucesso, negação ou erro).
 * * INTEGRAÇÃO: 
 * - Utiliza o contexto `useWizard` para ler o estado da simulação e executar a reinicialização.
 */

import { useState, useEffect } from "react";
import { CheckCircle2, Loader2, XCircle, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useWizard } from "@/features/financial-hub/components/shared/WizardProvider";
import { ButtonWhatsApp } from "@/features/financial-hub/components/layout/ButtonWhatsApp";

export function Step5Confirm() {
  const { state, update, goTo } = useWizard<any>();
  
  // Estados locais de UI
  const [status, setStatus] = useState<'loading' | 'success' | 'denied' | 'error'>('loading');

  useEffect(() => {
    const result = state.data?.simulationResult;
    if (!result) return; // Aguarda o dado chegar

    // 1. Primeiro checamos se a API falhou tecnicamente
    if (!result.success) {
      setStatus('error');
      return;
    }

    // 2. Agora checamos o status de negócio
    if (result.status_id === 1) {
      setStatus('success'); // Aprovado
    } else if (result.status_id === 2) {
      setStatus('denied'); // Negado
    } else {
      setStatus('error'); // Status desconhecido
    }
  }, [state.data]);

  const handleRestart = () => {
    // 1. Limpa apenas os dados de simulação, preservando o contexto da visita
    update({
      data: {
        ...state.data,
        simulationResult: null,
        simulation_id: null,
      }
    });

    // 2. Usa a função que já existe no seu Provider
    goTo(1); 
  };

  return (
    // Layout Compacto: py-6 reduz o espaço vertical excessivo
    <div className="flex flex-col items-center justify-center py-6 text-center animate-in fade-in zoom-in duration-300">
      
      {/* 1. ESTADO DE CARREGAMENTO */}
      {status === 'loading' && (
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-10 w-10 animate-spin text-[var(--brand-primary)]" />
          <h2 className="text-lg font-semibold text-foreground">Analisando proposta...</h2>
        </div>
      )}

      {/* 2. ESTADO DE RESULTADO */}
      {status !== 'loading' && (
        <div className="flex flex-col items-center">
          {/* Ajuste de escala do ícone e margem para reduzir altura */}
          <div className={`mb-4 flex h-16 w-16 items-center justify-center rounded-full ${
              status === 'success' ? 'bg-emerald-100 text-emerald-600' : 
              status === 'denied' ? 'bg-amber-100 text-amber-600' : 
              'bg-destructive/10 text-destructive'
          }`}>
            {status === 'success' && <CheckCircle2 className="h-8 w-8" />}
            {status === 'denied' && <XCircle className="h-8 w-8" />}
            {status === 'error' && <AlertCircle className="h-8 w-8" />}
          </div>

          <h2 className="text-xl font-semibold text-foreground">
            {status === 'success' && "Proposta enviada!"}
            {status === 'denied' && "Proposta não aprovada"}
            {status === 'error' && "Ops, algo deu errado"}
          </h2>

          <p className="mt-1 max-w-sm text-sm text-muted-foreground">
            {status === 'success' && <>Recebemos sua proposta. Entraremos em contato pelo e-mail <strong>{state.data?.eligibility?.email}</strong>.</>}
            {status === 'denied' && "Infelizmente, não foi possível prosseguir neste momento."}
            {status === 'error' && "Houve um problema na comunicação. Por favor, tente novamente."}
          </p>

          {/* Container de Protocolo compacto */}
          {status === 'success' && state.data?.proposalId && (
            <div className="mt-4 rounded-lg border border-border bg-muted/40 px-4 py-2 text-sm">
              Protocolo: <strong className="text-foreground">{state.data.proposalId}</strong>
            </div>
          )}

          {/* Botão de ação com margem otimizada */}
          <div className="mt-6 flex flex-col gap-3 w-full sm:w-auto">
            <Button 
              size="lg" 
              onClick={handleRestart} 
              className="!bg-[var(--brand-primary)] hover:!bg-[var(--brand-primary)]/90 rounded-xl px-8 focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)] focus-visible:ring-offset-2"
            >
              {status === 'success' ? "Voltar ao início" : "Tentar novamente"}
            </Button>

            {/* Botão de contato só aparece se houver whatsappContact definido em integration_details */}
            <ButtonWhatsApp 
                productName="Auto Equity"
                variant="button"
                config={state.data?.integration_details} 
                data={state.data} 
            />
          </div>
        </div>
      )}
    </div>
  );
}