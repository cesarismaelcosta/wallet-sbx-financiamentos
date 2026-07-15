/**
 * @fileoverview Passo 1: Elegibilidade (Jornada Auto Equity)
 * * PROPÓSITO:
 * Realiza a triagem inicial do cliente. Valida CPF, e-mail e celular, 
 * gerencia o aceite dos termos (LGPD) e consulta a elegibilidade no gateway.
 * * LÓGICA DE NEGÓCIO:
 * - Aprovado: status_id === 1 (Avança para o próximo passo)
 * - Negado: status_id === 2 (Bloqueia o fluxo e exibe mensagem de erro)
 * - Erro técnico: success === false (Exibe erro de sistema)
 */

import { useState, useEffect, useMemo } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, AlertCircle, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { eligibilitySchema, type EligibilityData } from "../schemas";
import { useWizard } from "@/features/financial-hub/components/shared/WizardProvider"; 
import { DynamicConsents } from "@/features/financial-hub/components/layout/DynamicConsents";
import { callSimulation } from "@/features/financial-hub/core/services/gateway";
import { useSafeCall } from "@/features/financial-hub/core/hooks/useSafeCall";

export function Step1Eligibility() {
  // Acesso ao estado global do Wizard para navegação e dados
  const { state, next, update } = useWizard<any>();
  const { execute } = useSafeCall();

  const entity = state.data; 
  const consentConfigs = state.data?.consent_configs || [];
  
  // Estado local para controle da UI
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [acceptedConsents, setAcceptedConsents] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(false);

  // Funções para formatar os dados ao carregar a tela
  const formatCpf = (value: string) => {
    return value
      .replace(/\D/g, '')
      .replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
  };

  const formatPhone = (value: string) => {
    const clean = value.replace(/\D/g, ''); 
    // Padrão solicitado: (55) 21 888888888
    // Regex: 2 dígitos, 2 dígitos, resto
    return clean.replace(/(\d{2})(\d{2})(\d+)/, '($1) $2 $3');
  };

  // Inicialização do formulário
  const form = useForm<EligibilityData>({
    resolver: zodResolver(eligibilitySchema),
    defaultValues: { fullName: "", cpf: "", birthDate: "", phone: "", email: "" },
  });

  // Preenchimento automático dos dados recebidos do orquestrador
  useEffect(() => {
    if (entity) {
      const cpfFormatado = (entity.document || "").replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
      const phoneFormatado = (entity.phone || "").replace(/(\d{2})(\d{2})(\d+)/, '($1) $2 $3');

      // Usa setValue para injetar o valor diretamente no campo
      form.setValue("fullName", entity.name || "", { shouldValidate: true });
      form.setValue("cpf", cpfFormatado, { shouldValidate: true });
      form.setValue("phone", phoneFormatado, { shouldValidate: true });
      form.setValue("birthDate", entity.birth_date || "", { shouldValidate: true });
      form.setValue("email", entity.email || "", { shouldValidate: true });
    }
  }, [entity, form]);

  // Validação de obrigatoriedade dos consentimentos (LGPD)
  const areConsentsValid = useMemo(() => {
    const configs = state.data?.consent_configs || [];
    return configs
      .filter((opt: any) => opt.is_required)
      .every((opt: any) => acceptedConsents[opt.id] === true);
  }, [state.data?.consent_configs, acceptedConsents]);

  /**
   * Dispara a consulta de elegibilidade
   */
  const onSubmit = async (data: EligibilityData) => {
    setLoading(true);
    setErrorMsg(null);

    try {
      // Monta payload unificando dados do form e consentimentos
      const payload = {
        ...state.data,
        consents: state.data.consent_configs
          ?.filter((c: any) => acceptedConsents[c.id])
          .map((c: any) => ({
            consent_id: c.id,
            accepted: true,
            accepted_at: new Date().toISOString(),
            legal_text_snapshot: { template_text: c.template_text, links: c.links }
          }))
      };

      // Chamada via Gateway centralizado e captura do resultado
      const result = await execute(() => callSimulation(payload, 'CHECK_ELIGIBILITY'));
      const statusId = result.consults?.[0]?.status_id;

      // Validação do retorno do backend
      if (!result.success) {
        setErrorMsg("Erro técnico na consulta. Tente novamente.");
      } else if (statusId === 1) {
        // SUCCESSO: 1 é aprovado
        update({ 
          meta: { ...state.meta, blocked: undefined },
          data: { ...state.data, eligibility: data, simulationResult: result, simulation_id: result.simulation_id, simulation_update_id: result.simulation__update_id } 
        });
        next();
      } else if (statusId === 2) {
        // NEGADO: 2 é reprovado
        setErrorMsg("Não encontramos ofertas disponíveis para este perfil.");
      } else {
        setErrorMsg("Status de retorno inválido.");
      }
    } catch (error) {
      console.error("[Elegibilidade Error]:", error);
      
      // DISPARA O EVENTO GLOBAL PARA O LAYOUT OUVIR
      // O layout vai mostrar o ErrorCountdown automaticamente
      window.dispatchEvent(new CustomEvent('app-error', { detail: error }));
    } finally {
      setLoading(false);
    }
  };

  // Renderização de Estado de Erro
  if (errorMsg) {
    return (
      <div className="flex flex-col items-center justify-center text-center animate-in fade-in zoom-in duration-300">
        <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-amber-100 text-amber-600">
          <AlertCircle className="h-10 w-10" />
        </div>
        <h2 className="text-2xl font-semibold text-foreground">Não encontramos oferta</h2>
        <p className="mt-3 max-w-sm text-sm text-muted-foreground">{errorMsg}</p>
        <div className="mt-8">
          <Button variant="ghost" onClick={() => setErrorMsg(null)}>
            <ArrowLeft className="h-4 w-4 mr-2" /> Voltar
          </Button>
        </div>
      </div>
    );
  }
  
  // Renderização do Formulário Principal
  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-6"> 
      {/* Exibição dos dados do cliente (Read-only) */}
      <div className="flex flex-col gap-4 rounded-lg border border-border bg-muted/10 p-4">
        <div>
          <p className="text-xs text-muted-foreground">Nome completo</p>
          <p className="text-sm font-medium text-foreground">{form.watch("fullName") || "Carregando..."}</p>
        </div>
        
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <p className="text-xs text-muted-foreground">CPF</p>
            {/* Agora lê o valor processado do formulário */}
            <p className="text-sm font-medium text-foreground">{form.watch("cpf") || entity?.document}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Data de nascimento</p>
            <p className="text-sm font-medium text-foreground">{form.watch("birthDate") || entity?.birth_date}</p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <p className="text-xs text-muted-foreground">Celular</p>
            {/* Agora lê o valor processado do formulário */}
            <p className="text-sm font-medium text-foreground">{form.watch("phone") || entity?.phone}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">E-mail</p>
            <p className="text-sm font-medium text-foreground">{form.watch("email") || entity?.email}</p>
          </div>
        </div>
      </div>

      {/* Consentimentos dinâmicos */}
      <div className={`transition-opacity duration-200 ${loading ? "pointer-events-none opacity-50" : "opacity-100"}`}>
        <DynamicConsents 
          configs={consentConfigs} 
          value={acceptedConsents} 
          onChange={setAcceptedConsents} 
        />
      </div>      

      {/* Botão de Submissão */}
      <Button 
        type="submit" 
        size="lg" 
        className="h-12 w-full rounded-xl bg-[var(--brand-primary)] hover:bg-[var(--brand-primary)]/90"
        disabled={loading || !areConsentsValid}
      >
        {loading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Consultando...</> : "Continuar"}
      </Button>
    </form>
  );
}