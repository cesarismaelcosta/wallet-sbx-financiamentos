/**
 * @fileoverview Painel de parceiros (Step 1 - Seguros Auto).
 * Cores: Primary #B300FF | Fonte: Inter (font-sans)
 * 
 * @author César Ismael Pereira da Costa
 * @author Gemini Pro
 */

import { useWizard } from "@/features/financial-hub/components/shared/WizardProvider";
import { ButtonWhatsApp } from "@/features/financial-hub/components/layout/ButtonWhatsApp";
import { useNavigation, NAVIGATION_INTENTS } from "@/features/financial-hub/core/hooks/useNavigation";
import { useSafeCall } from "@/features/financial-hub/core/hooks/useSafeCall";
import { DynamicConsents } from "@/features/financial-hub/components/layout/DynamicConsents";
import { useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export function Step1PartnersPanel() {
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

  const { state } = useWizard<any>();
  const config = state.data?.integration_details;

  const { consent_configs } = state.data || {};
  const [acceptedConsents, setacceptedConsents] = useState<Record<string, boolean>>({});

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
  
  const handleProceed = async () => {
    try {
      await execute(() => handleRedirect(NAVIGATION_INTENTS.REDIRECT_PARTNER_PAGE, config?.urlRedirect, consents));
    } catch (err: any) {
      window.dispatchEvent(new CustomEvent('app-error', { detail: err }));
    }
  };

  return (
    // Removi as classes de box aqui: bg-white border border-slate-100 rounded-3xl p-8
    <div className="font-sans max-w-xl mx-auto lg:mx-0 w-full">
      {/* Cabeçalho do Card de Seguros */}
      <div className="flex items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-3">
          <div className="shrink-0 w-16 h-16 overflow-hidden flex items-center justify-center">
            <img
              src="/assets/home/seguros.webp"
              alt="Segurança"
              className="w-full h-full object-contain"
              onError={(e) => {
                (e.currentTarget as HTMLElement).style.display = 'none';
              }}
            />
          </div>
          <div>
            {/* Oculto no mobile (hidden), visível de sm para cima (sm:block) */}
            <h2 className="hidden sm:block text-xs font-bold uppercase tracking-widest text-slate-400 leading-tight">
              Seguradoras
            </h2>
          </div>
        </div>

        <div className="bg-[var(--brand-primary)]/10 text-[var(--brand-primary)] px-3 py-1.5 rounded-full text-xs font-bold whitespace-nowrap shrink-0">
          Cotação gratuita
        </div>
      </div>
      
      {/* Grid de Seguradoras */}
      <div className="grid grid-cols-3 gap-3 mb-8">
        {insurers.map((insurer) => (
          <div 
            key={insurer.name} 
            className="h-16 w-full border border-slate-100 rounded-xl flex items-center justify-center bg-white p-3 hover:border-[#B300FF] transition-all shadow-sm"
          >
          <img 
              src={insurer.logo} 
              alt={`Logo ${insurer.name}`} 
              className="max-h-[80%] max-w-[90%] object-contain grayscale-[70%] hover:grayscale-0 transition-all duration-300" 
            />
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-y-2">
        <div
          className={`mb-1 transition-opacity duration-200 ${loading || navLoading ? "pointer-events-none opacity-50" : "opacity-100"}`}
        >
          <DynamicConsents configs={consent_configs} value={acceptedConsents} onChange={setacceptedConsents} />
        </div>

        <Button
          type="button"
          disabled={loading || navLoading || !areConsentsValid}
          onClick={handleProceed}
          className="w-full h-14 bg-[#B300FF] hover:bg-[#9900D9] text-white font-bold rounded-xl transition-all shadow-lg shadow-[#B300FF]/20 disabled:opacity-50 disabled:bg-slate-300 disabled:shadow-none disabled:!cursor-wait flex items-center justify-center gap-2"
        >
          {loading || navLoading ? (
            <span className="flex items-center justify-center gap-2 animate-pulse">
              <Loader2 className="h-5 w-5 animate-spin text-white" />
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