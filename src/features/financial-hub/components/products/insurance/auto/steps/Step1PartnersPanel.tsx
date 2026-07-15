/**
 * @fileoverview Painel de parceiros.
 * Cores: Primary #B300FF | Fonte: Inter (font-sans)
 */

import { useWizard } from "@/features/financial-hub/components/shared/WizardProvider";
import { ButtonWhatsApp } from "@/features/financial-hub/components/layout/ButtonWhatsApp";

// Importe a config ou de onde venham os seus URLs
import { useNavigation, NAVIGATION_INTENTS } from "@/features/financial-hub/core/hooks/useNavigation";
import { useSafeCall } from "@/features/financial-hub/core/hooks/useSafeCall";
import { DynamicConsents } from "@/features/financial-hub/components/layout/DynamicConsents";
import { useMemo, useState } from "react";

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

  // Acessa a configuração da integração
  const { state } = useWizard<any>();
  const config = state.data?.integration_details;

  // Consentimentos dinâmicos
  const { rules, consent_configs, offer } = state.data;
  const [acceptedConsents, setacceptedConsents] = useState<Record<string, boolean>>({});

  const areConsentsValid = useMemo(() => {
    const configs = state.data?.consent_configs || [];
    return configs
      .filter((opt: any) => opt.is_required)
      .every((opt: any) => acceptedConsents[opt.id] === true);
  }, [state.data?.consent_configs, acceptedConsents]);

  const consents = state.data.consent_configs
    ?.filter((c: any) => acceptedConsents[c.id])
    .map((c: any) => ({
      consent_id: c.id,
      acceptedConsents: true,
      acceptedConsents_at: new Date().toISOString(),
      legal_text_snapshot: { template_text: c.template_text, links: c.links }
    }))

  // 2. A CHAMADA DO HOOK ACONTECE AQUI, NO TOPO DA FUNÇÃO
  // É aqui que a "mágica" é inicializada e conectada ao seu componente
  const { handleRedirect, loading: navLoading } = useNavigation();

  // Inicialize o hook aqui
  const { execute } = useSafeCall();
  
  // Cria o handler seguro que trata integração com financial-gateway (session, etc)
  const handleProceed = async () => {
    await execute(() => handleRedirect(NAVIGATION_INTENTS.REDIRECT_PARTNER_PAGE, config?.urlRedirect, consents));
  };

  return (
    <div className="bg-white border border-slate-100 rounded-3xl p-8 font-sans">
      {/* Cabeçalho do Card de Seguros */}
      <div className="flex items-center justify-between gap-2 mb-6">
        
        {/* Título */}
        <h2 className="text-[10px] sm:text-xs font-bold uppercase tracking-widest text-slate-400 leading-tight w-1/2">
          Seguradoras
        </h2>
        
        {/* Tag Promocional Blindada */}
        <div className="bg-[var(--brand-primary)]/10 text-[var(--brand-primary)] px-2.5 py-1 sm:px-3 sm:py-1.5 rounded-full text-[10px] sm:text-xs font-bold whitespace-nowrap shrink-0">
          Cotação gratuita
        </div>

      </div>
      
      {/* Grid de Seguradoras - Visual Vivo */}
      <div className="grid grid-cols-3 gap-3 mb-8">
        {insurers.map((insurer) => (
          <div 
            key={insurer.name} 
            className="h-16 w-full border border-slate-100 rounded-xl flex items-center justify-center bg-white p-3 hover:border-[#B300FF] transition-all"
          >
          <img 
              src={insurer.logo} 
              alt={`Logo ${insurer.name}`} 
              // O grayscale-[50%] acalma o visual, hover:grayscale-0 traz a marca à vida
              className="max-h-[80%] max-w-[90%] object-contain grayscale-[70%] hover:grayscale-0 transition-all duration-300" 
            />
          </div>
        ))}
      </div>

    <div className="flex flex-col gap-y-2"> 
  
        {/* Container do Consentimento - Protegido durante loading */}
        <div className={`mb-1 transition-opacity duration-200 ${loading ? "pointer-events-none opacity-50" : "opacity-100"}`}>
          <DynamicConsents 
            configs={consent_configs} 
            value={acceptedConsents} 
            onChange={setacceptedConsents} 
          />
        </div>
        
        {/* Botão Principal */}
        <button 
          disabled={loading || !areConsentsValid || navLoading} // Use navLoading ou loading conforme sua preferência
          onClick={handleProceed} // <- Chamada protegida pelo 'execute'
          className="w-full bg-[#B300FF] hover:bg-[#9900D9] text-white font-bold py-4 rounded-xl transition-all shadow-lg shadow-[#B300FF]/20 disabled:opacity-50 disabled:bg-slate-300 disabled:shadow-none"
        >
          Continuar cotação
        </button>
        
        {/* Botão de contato só aparece se houver whatsappContact definido em integration_details */}
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