/**
 * @fileoverview Painel de parceiros (Step 1 - Seguros Auto).
 * @path src/features/financial-hub/components/products/seguros/steps/Step1PartnersPanel.tsx
 * 
 * =========================================================================
 * 🤖 PADRÃO GEMINI PRO: ZERO-RADIUS GOVERNANCE & ARCHITECTURAL MECHANICS
 * =========================================================================
 * [MECÂNICA ARQUITETURAL]:
 * - Engine: Consome WizardProvider para gerenciamento de estado.
 * - Navegação: Integração direta com `useNavigation` para intents de redirecionamento de parceiros.
 * - Conformidade: Validação estrita de consentimentos (LGPD) e envio síncrono de dados validados.
 * - Zero-Radius & Neutral Purity: Governança estrita de design system SBX.
 *
 * @author César Ismael Pereira da Costa
 * @author Gemini Pro (Architectural Mechanics)
 */

import { useWizard } from "@/features/financial-hub/components/shared/WizardProvider";
import { ButtonWhatsApp } from "@/features/financial-hub/components/layout/ButtonWhatsApp";
import { useNavigation, NAVIGATION_INTENTS } from "@/features/financial-hub/core/hooks/useNavigation";
import { useSafeCall } from "@/features/financial-hub/core/hooks/useSafeCall";
import { DynamicConsents } from "@/features/financial-hub/components/layout/DynamicConsents";
import { useMemo, useState, useEffect } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export function Step1PartnersPanel() {

  // =========================================================================
  // 🤖 [BFCACHE SHIELD]: Proteção contra congelamento do botão (Back/Forward)
  // =========================================================================
  useEffect(() => {
    const handlePageShow = (event: PageTransitionEvent) => {
      if (event.persisted) {
        window.location.reload();
      }
    };

    window.addEventListener("pageshow", handlePageShow);
    return () => window.removeEventListener("pageshow", handlePageShow);
  }, []);
  
  // =========================================================================
  // 🤖 [INSURERS DATA ARCHITECTURE]: Mapeamento de Seguradoras Parceiras
  // =========================================================================
  const insurers = [
    { name: "Porto", logo: "/assets/insurers/porto_seguro_logo_700_158.png" },
    { name: "HDI", logo: "/assets/insurers/HDI_Seguros_Logo_700_461.png" },
    { name: "Allianz", logo: "/assets/insurers/allianz_sigorta_logo_700_181.png" },
    { name: "Bradesco", logo: "/assets/insurers/bradesco_seguros_logo_700_269.png" },
    { name: "Tokio Marine", logo: "/assets/insurers/tokio_marine_logo_700_184.png" },
    { name: "Mapfre", logo: "/assets/insurers/mapfre_logo_700_120.png" },
    { name: "Suhai", logo: "/assets/insurers/suhai_logo_700_329.png" },
    { name: "Sompo", logo: "/assets/insurers/sompo_logo_700_152.png" },
    { name: "Azul", logo: "/assets/insurers/azul_seguros_logo_700_429.png" },
  ];

  // =========================================================================
  // 🤖 [LOCAL STATE ARCHITECTURE]: Gerenciamento de Wizard e Consentimentos
  // =========================================================================
  const { state } = useWizard<any>();
  const config = state.data?.integration_details;

  const { consent_configs } = state.data || {};
  const [acceptedConsents, setacceptedConsents] = useState<Record<string, boolean>>({});

  // =========================================================================
  // 🤖 [COMPLIANCE ARCHITECTURE]: Validação Otimizada de Consentimentos LGPD
  // =========================================================================
  const areConsentsValid = useMemo(() => {
    const configs = consent_configs || [];
    return configs
      .filter((opt: any) => opt.is_required)
      .every((opt: any) => acceptedConsents[opt.id] === true);
  }, [consent_configs, acceptedConsents]);

  const consents = consent_configs
    ?.filter((c: any) => acceptedConsents[c.id])
    .map((c: any) => ({
      consent_id: c.id,
      acceptedConsents: true,
      acceptedConsents_at: new Date().toISOString(),
      legal_text_snapshot: { template_text: c.template_text, links: c.links }
    }));

  const { handleRedirect, loading: navLoading } = useNavigation();
  const { execute, loading } = useSafeCall();
  
  // =========================================================================
  // 🤖 [ZERO-TRUST HANDLER ARCHITECTURE]: Execução Segura de Redirecionamento
  // =========================================================================
  const handleProceed = async () => {
    try {
      await execute(() => handleRedirect(NAVIGATION_INTENTS.REDIRECT_PARTNER_PAGE, config?.urlRedirect, consents));
    } catch (err: any) {
      window.dispatchEvent(new CustomEvent('app-error', { detail: err }));
    }
  };

  return (
    <div className="font-sans max-w-xl mx-auto lg:mx-0 w-full space-y-6">
      
      {/* =========================================================================
       * 🤖 [PROGRESSIVE DISCLOSURE ARCHITECTURE]: Cabeçalho do Card de Seguros
       * ========================================================================= */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="shrink-0 w-16 h-16 overflow-hidden flex items-center justify-center">
            <img
              src="/assets/home/seguros.webp"
              alt="Segurança"
              className="w-full h-full object-contain relative"
              onError={(e) => {
                (e.currentTarget as HTMLElement).style.display = 'none';
              }}
            />
          </div>
          <div>
            <h2 className="hidden sm:block text-xs font-bold uppercase tracking-widest text-neutral-400 leading-tight">
              Seguradoras
            </h2>
          </div>
        </div>

        <div className="bg-brand-accent text-brand-accent-foreground px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider whitespace-nowrap shrink-0">
          Cotação gratuita
        </div>
      </div>
      
      {/* =========================================================================
       * 🤖 [GRID ARCHITECTURE]: Exibição Dinâmica do Grid de Seguradoras
       * ========================================================================= */}
      <div className="grid grid-cols-3 gap-3">
        {insurers.map((insurer) => (
          <div 
            key={insurer.name} 
            className="h-16 w-full border border-neutral-200 rounded-none flex items-center justify-center bg-white p-3 hover:border-neutral-900 transition-all shadow-xs"
          >
            <img 
              src={insurer.logo} 
              alt={`Logo ${insurer.name}`} 
              className="max-h-[80%] max-w-[90%] object-contain grayscale hover:grayscale-0 transition-all duration-300" 
            />
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-y-4 pt-2">
        {/* =========================================================================
         * 🤖 [CONSENTS ARCHITECTURE]: Módulo Dinâmico de Termos Legais
         * ========================================================================= */}
        <div
          className={`transition-opacity duration-200 ${loading || navLoading ? "pointer-events-none opacity-50" : "opacity-100"}`}
        >
          <DynamicConsents configs={consent_configs} value={acceptedConsents} onChange={setacceptedConsents} />
        </div>

        {/* =========================================================================
         * 🤖 [ACTION ARCHITECTURE]: Botão de Direcionamento com Estados de Loading
         * ========================================================================= */}
        <Button
          type="button"
          disabled={loading || navLoading || !areConsentsValid}
          onClick={handleProceed}
          className="w-full h-12 bg-neutral-900 hover:bg-neutral-800 text-white font-bold rounded-none transition-all shadow-xs disabled:opacity-50 disabled:bg-neutral-100 disabled:text-neutral-400 disabled:shadow-none disabled:!cursor-wait flex items-center justify-center gap-2"
        >
          {loading || navLoading ? (
            <span className="flex items-center justify-center gap-2 animate-pulse">
              <Loader2 className="h-4 w-4 animate-spin text-white" />
              Processando...
            </span>
          ) : (
            "Continuar cotação"
          )}
        </Button>

        <ButtonWhatsApp
          productName="Seguros Auto"
          variant="card"
          config={state.data?.integration_details}
          data={state.data}
          consents={consents}
          areConsentsValid={areConsentsValid}
        />
      </div>
    </div>
  );
}