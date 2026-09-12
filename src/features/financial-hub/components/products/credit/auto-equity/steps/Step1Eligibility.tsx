/**
 * @fileoverview Passo 1: Elegibilidade (Jornada Auto Equity)
 * @path src/features/financial-hub/components/products/credit/auto-equity/steps/Step1Eligibility.tsx
 * 
 * =========================================================================
 * 🤖 PADRÃO GEMINI PRO: ZERO-RADIUS GOVERNANCE & ARCHITECTURAL MECHANICS
 * =========================================================================
 * [MECÂNICA ARQUITETURAL]:
 * - Engine: Renderizado pela WizardEngine.
 * - Estado: Consome WizardProvider.
 * - Transportador: callSimulation (centralizado em lib/api/gateway.ts).
 * 
 * O payload de rede foi purificado. O uso do `...state.data` foi abolido para
 * evitar o envio de lixo de UI (estado interno, objetos aninhados) para a 
 * camada de rede. O componente monta um payload estritamente "Thin", extraindo 
 * os cursores temporais (`visit_id`, `visit_update_id`) da URL e enviando 
 * APENAS os IDs identificadores, paridade de steps e consents exigidos pelo Gateway.
 *
 * @author César Ismael Pereira da Costa
 * @author Gemini Pro (Architectural Mechanics)
 */

import { useState, useEffect, useRef, useMemo } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, AlertCircle, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { eligibilitySchema, type EligibilityData } from "../schemas";
import { useWizard } from "@/features/financial-hub/components/shared/WizardProvider"; 
import { DynamicConsents } from "@/features/financial-hub/components/layout/DynamicConsents";
import { callSimulation } from "@/features/financial-hub/core/services/gateway";
import { setFastPathState } from "@/features/financial-hub/core/services/fastPathCache";
import { useSafeCall } from "@/features/financial-hub/core/hooks/useSafeCall";

// =========================================================================
// 🤖 [UTILITY ARCHITECTURE]: Formatação Segura de Data de Nascimento (UTC)
// =========================================================================
const formatBirthDateBR = (dateStr?: string) => {
  if (!dateStr) return "";
  try {
    const dateObj = new Date(dateStr);
    
    if (isNaN(dateObj.getTime())) return dateStr;

    return new Intl.DateTimeFormat("pt-BR", {
      timeZone: "UTC",
      day: "2-digit",
      month: "2-digit",
      year: "numeric"
    }).format(dateObj);
  } catch (error) {
    return dateStr;
  }
};

export function Step1Eligibility() {
  // =========================================================================
  // 🤖 [LOCAL STATE ARCHITECTURE]: Gerenciamento de Formulário e UI
  // =========================================================================
  const { state, next, update } = useWizard<any>();
  const { execute } = useSafeCall();

  const entity = state.data; 
  const consentConfigs = state.data?.consent_configs || [];
  
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [acceptedConsents, setAcceptedConsents] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(false);

  // Inicialização do formulário
  const form = useForm<EligibilityData>({
    resolver: zodResolver(eligibilitySchema),
    defaultValues: { fullName: "", cpf: "", birthDate: "", phone: "", email: "" },
  });

  const initializedEntityRef = useRef<string | null>(null);

  useEffect(() => {
    const currentEntityId = entity?.document || entity?.id;
    
    if (currentEntityId && initializedEntityRef.current !== currentEntityId) {
      initializedEntityRef.current = currentEntityId;
      const cpfFormatado = (entity.document || "").replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
      const phoneFormatado = (entity.phone || "").replace(/(\d{2})(\d{2})(\d+)/, '($1) $2 $3');
      const birthDateFormatted = formatBirthDateBR(entity.birth_date);

      form.setValue("fullName", entity.name || "", { shouldValidate: true });
      form.setValue("cpf", cpfFormatado, { shouldValidate: true });
      form.setValue("phone", phoneFormatado, { shouldValidate: true });
      form.setValue("birthDate", birthDateFormatted, { shouldValidate: true });
      form.setValue("email", entity.email || "", { shouldValidate: true });
    }
  }, [entity, form]);

  // =========================================================================
  // 🤖 [COMPLIANCE ARCHITECTURE]: Validação Otimizada de Consentimentos
  // =========================================================================
  const areConsentsValid = useMemo(() => {
    const configs = state.data?.consent_configs || [];
    return configs
      .filter((opt: any) => opt.is_required)
      .every((opt: any) => acceptedConsents[opt.id] === true);
  }, [state.data?.consent_configs, acceptedConsents]);

  // =========================================================================
  // 🤖 [ZERO-TRUST HANDLER ARCHITECTURE]: Execução de Rede e Thin Payload
  // =========================================================================
  const onSubmit = async (data: EligibilityData) => {
    setLoading(true);
    setErrorMsg(null);

    try {
      const urlParams = new URLSearchParams(window.location.search);
      const urlVisitId = urlParams.get("visit_id");
      const urlVisitUpdateId = urlParams.get("visit_update_id");

      const payload = {
        action: "SIMULATE",
        visit_id: urlVisitId || state.data.visit_id,
        visit_update_id: urlVisitUpdateId || state.data.visit_update_id,
        product_id: state.data.product_id,
        partner_id: state.data.partner_id,
        step: "CHECK_ELIGIBILITY",
        consents: state.data.consent_configs
          ?.filter((c: any) => acceptedConsents[c.id])
          .map((c: any) => ({
            consent_id: c.id,
            acceptedConsents: true,
            acceptedConsents_at: new Date().toISOString(),
            legal_text_snapshot: { template_text: c.template_text, links: c.links }
          }))
      };

      const result = await execute(() => callSimulation(payload, 'CHECK_ELIGIBILITY'));
      const statusId = result.consults?.[0]?.status_id;

      if (result.state) {
        setFastPathState(result.state);
      }

      if (!result.success) {
        setErrorMsg("Erro técnico na consulta. Tente novamente.");
      } else if (statusId === 1) {
        update({ 
          meta: { ...state.meta, blocked: undefined },
          data: { 
            ...state.data, 
            eligibility: data, 
            simulationResult: result, 
            simulation_id: result.simulation_id, 
            simulation_update_id: result.simulation_update_id || result.simulation__update_id,
            ...(result.state && {
              offer: result.state.offer,
              rules: result.state.rules,
              entity: result.state.entity,
            })
          } 
        });
        next();
      } else if (statusId === 2) {
        setErrorMsg("Não encontramos ofertas disponíveis para este perfil.");
      } else {
        setErrorMsg("Status de retorno inválido.");
      }
    } catch (error) {
      console.error("[Elegibilidade Error]:", error);
      window.dispatchEvent(new CustomEvent('app-error', { detail: error }));
    } finally {
      setLoading(false);
    }
  };

  // =========================================================================
  // 🤖 [GUARD RAIL ARCHITECTURE]: Renderização de Estado de Erro
  // =========================================================================
  if (errorMsg) {
    return (
      <div className="flex flex-col items-center justify-center text-center animate-in fade-in zoom-in duration-300">
        <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-none bg-surface-alt border border-neutral-200 text-neutral-900">
          <AlertCircle className="h-10 w-10" />
        </div>
        <h2 className="text-2xl font-bold text-neutral-900 tracking-tight">Não encontramos oferta</h2>
        <p className="mt-3 max-w-sm text-sm text-neutral-600 leading-relaxed">{errorMsg}</p>
        <div className="mt-8">
          <Button variant="ghost" onClick={() => setErrorMsg(null)} className="rounded-none text-neutral-900 hover:bg-neutral-100">
            <ArrowLeft className="h-4 w-4 mr-2" /> Voltar
          </Button>
        </div>
      </div>
    );
  }
  
  // =========================================================================
  // 🤖 [FORM ARCHITECTURE]: Renderização do Formulário Principal
  // =========================================================================
  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-6"> 
      {/* Exibição dos dados do cliente (Read-only) com Zero-Radius e Neutral Purity */}
      <div className="flex flex-col gap-4 rounded-none border border-neutral-200 bg-surface-alt p-4 sm:p-6 shadow-xs">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-neutral-500">Nome completo</p>
          <p className="text-sm font-semibold text-neutral-900 mt-0.5">{form.watch("fullName") || "Carregando..."}</p>
        </div>
        
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-neutral-500">CPF</p>
            <p className="text-sm font-semibold text-neutral-900 mt-0.5">{form.watch("cpf") || entity?.document}</p>
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-neutral-500">Data de nascimento</p>
            <p className="text-sm font-semibold text-neutral-900 mt-0.5">{form.watch("birthDate") || formatBirthDateBR(entity?.birth_date)}</p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-neutral-500">Celular</p>
            <p className="text-sm font-semibold text-neutral-900 mt-0.5">{form.watch("phone") || entity?.phone}</p>
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-neutral-500">E-mail</p>
            <p className="text-sm font-semibold text-neutral-900 mt-0.5">{form.watch("email") || entity?.email}</p>
          </div>
        </div>
      </div>

      {/* =========================================================================
       * 🤖 [CONSENTS ARCHITECTURE]: Módulo Dinâmico de Termos Legais
       * ========================================================================= */}
      <div className={`transition-opacity duration-200 ${loading ? "pointer-events-none opacity-50" : "opacity-100"}`}>
        <DynamicConsents 
          configs={consentConfigs} 
          value={acceptedConsents} 
          onChange={setAcceptedConsents} 
        />
      </div>      

      {/* =========================================================================
       * 🤖 [ACTION ARCHITECTURE]: Botão de Submissão com Estados de Loading (Neutral Purity)
       * ========================================================================= */}
      <Button 
        type="submit" 
        size="lg" 
        className="h-12 w-full rounded-none bg-neutral-900 hover:bg-neutral-800 text-white font-bold shadow-xs transition-all active:scale-[0.98] disabled:bg-neutral-100 disabled:text-neutral-400 disabled:shadow-none"
        disabled={loading || !areConsentsValid}
      >
        {loading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Consultando...</> : "Continuar"}
      </Button>
    </form>
  );
}