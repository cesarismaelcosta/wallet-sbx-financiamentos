/**
 * PÁGINA DE SIMULAÇÃO DE FINANCIAMENTO - VEÍCULOS (HEAVY & LIGHT)
 * @author Engenharia Wallet sbX / Cesar Ismael
 * @version 2.0.4 - 2026
 * * ARQUITETURA DE DADOS:
 * - Hidratação Bilateral: Consome snapshot do Supabase Orchestrator via visit_id.
 * - Motor Financeiro: Cálculos reativos via useMemo (Sistema Price).
 * - Safety Guards: Teto dinâmico baseado em FIPE ou margem de 20%.
 */

import { createFileRoute, useSearch } from "@tanstack/react-router";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import React, { useMemo, useState, useEffect } from "react";
import { Car, MessageCircle, ShieldCheck, ThumbsUp, Sparkles, Calculator, Hourglass } from "lucide-react";
import { WalletLogo } from "@/components/brand/WalletLogo";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import * as SliderPrimitive from "@radix-ui/react-slider";

interface LegalLink {
  text: string;
  type: "web" | "tooltip";
  url?: string;
  tooltip_text?: string;
}

interface ConsentConfig {
  id: string;
  position: number;
  is_required: boolean;
  effective_date: string;
  template_text: string;
  links: LegalLink[];
  default_state: boolean;
}

interface SimulationData {
  visit_id: string;
  product_id: number;
  partner_id: number;
  entity: {
    entity_id: number;
    document: string;
    name: string;
    phone: string;
    email: string;
    birth_date: string;
    gender: string;
  };
  manager: { manager_name: string };
  seller: { seller_id: number; legal_name: string; trade_name: string; economic_group: string };
  event: { event_id: number; event_description: string; event_start_date: string; event_end_date: string };
  offer: {
    offer_id: number;
    offer_description: string;
    offer_value: number;
    category_id: number;
    category_name: string;
    vehicle_details?: { fipe_value: number; manufacture_year: number; model_year: number; fipe_code?: string };
  };
  // Novos barramentos dinâmicos vindos do Orchestrator
  rules?: {
    min_down_payment_percentage: number;
    max_down_payment_percentage: number;
    max_financed_amount: number;
    installment_options: number[];
    default_installments: number;
    allow_custom_value?: boolean;
  };
  consent_configs?: ConsentConfig[]; // Mapeamento direto da tabela
  page_configs?: {
    primary_color?: string;
    box_radius?: string;
    box_bg?: string;
    gradient_primary?: string;
    background_image?: string;
    partner?: {
      label?: string;
      name?: string;
    };
  };
  page_faqs?: Array<{ position: number; question: string; answer: string }>;
  is_integrated?: boolean; // Indica se esta simulação veio de um parceiro integrado ou não
  integration_method?: string; // 'API', 'EMAIL', 'FILE', 'MANUAL'
  integration_details?: Record<string, any>;
}

/**
 * FORMATAÇÃO MONETÁRIA (BRL)
 */
const BRL = (n: number) =>
  (n || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

/**
 * AMORTIZAÇÃO FRANCESA (SISTEMA PRICE)
 */
function calcParcela(valorFinanciado: number, taxaMensal: number, meses: number) {
  if (taxaMensal === 0 || meses === 0) return valorFinanciado / (meses || 1);
  const i = taxaMensal;
  return (valorFinanciado * i) / (1 - Math.pow(1 + i, -meses));
}

/**
 * COMPONENTE SLIDER COM LABEL DINÂMICA NO THUMB
 */
const SliderCustomizado = ({ value, onValueChange, min, max, step, isCurrency = false }: any) => {
  // Arredonda apenas para mostrar ao usuário
  const displayValue = isCurrency
    ? value.toLocaleString("pt-BR", { maximumFractionDigits: 0 })
    : `${Math.round(value)}%`;

  return (
    <SliderPrimitive.Root
      className="relative flex w-full touch-none select-none items-center h-6"
      value={[value || 0]}
      onValueChange={(v) => onValueChange(v[0])}
      min={min || 0}
      max={max || 100}
      step={step}
    >
      <SliderPrimitive.Track className="relative h-2 w-full grow overflow-hidden rounded-full bg-slate-200">
        <SliderPrimitive.Range className="absolute h-full bg-primary" />
      </SliderPrimitive.Track>
      <SliderPrimitive.Thumb className="block h-7 w-20 rounded-lg bg-white shadow-sm border border-primary focus:outline-none transition-transform active:scale-110">
        <div className="flex h-full w-full items-center justify-center text-[10px] font-bold text-primary">
          {displayValue}
        </div>
      </SliderPrimitive.Thumb>
    </SliderPrimitive.Root>
  );
};

export const Route = createFileRoute("/financiamentos/simulacao")({
  component: SimulacaoPage,
});

function SimulacaoPage() {
  // 1. Roteador (sempre o primeiro pino)
  const search = useSearch({ strict: false });

  // 2. Estados de Hidratação e Dados
  const [mounted, setMounted] = useState(false);
  const [simData, setSimData] = useState<SimulationData | null>(null);

  // 3. Estados da UI (Unificados)
  const [valorLote, setvalorLote] = useState(0);
  const [valorEntrada, setValorEntrada] = useState(0);
  const [parcelas, setParcelas] = useState(0);
  const [taxa, setTaxa] = useState(0.0);
  const [loading, setLoading] = useState(false);
  const [valorParcelaFinal, setValorParcelaFinal] = useState<number | null>(null);
  const [formularioAlterado, setFormularioAlterado] = useState(true); // Controla o bloqueio do botão e reset do card

  /**
   * PASSO 2: CONFIGURAÇÃO VISUAL DINÂMICA (UI Branding)
   * Extrai as cores do parceiro para variáveis CSS seguras.
   */
  const brandStyles = useMemo(() => {
    // 1. Configuração padrão de segurança (Fallback)
    const fallback = {
      primary_color: "#B300FF",
      box_radius: "rounded-3xl",
      box_bg: "bg-white/80",
      background_image: "https://d335luupugsy2.cloudfront.net/cms/files/310479/1730141440/$464p11t5fmb",
    };

    // Garante que config sempre seja pelo menos o objeto de fallback
    const config = simData?.page_configs || fallback;
    const primary = config.primary_color ?? fallback.primary_color;
    const bgImage = config.background_image || fallback.background_image;

    return {
      "--primary": primary,
      "--primary-foreground": "#FFFFFF",
      "--gradient-primary": `linear-gradient(135deg, ${primary} 0%, ${adjustColor(primary, -20)} 100%)`,
      "--radius-config": config.box_radius === "rounded-3xl" ? "1.5rem" : "0.75rem",
      "--dynamic-bg-image": `url('${bgImage}')`,

      // 2. SEGURANÇA MÁXIMA: Acessa com ?. direto do objeto que vem do banco
      // Se 'partner', 'label' ou 'name' não existirem, o valor vira null automaticamente sem quebrar a página
      partnerLabel: simData?.page_configs?.partner?.label || null,
      partnerName: simData?.page_configs?.partner?.name || null,
    } as React.CSSProperties & { partnerLabel: string | null; partnerName: string | null };
  }, [simData]);

  // Função auxiliar simples para escurecer a cor do gradiente dinamicamente
  function adjustColor(color: string, amount: number) {
    return (
      "#" +
      color
        .replace(/^#/, "")
        .replace(/../g, (color) =>
          ("0" + Math.min(255, Math.max(0, parseInt(color, 16) + amount)).toString(16)).slice(-2),
        )
    );
  }

  /**
   * PASSO 3: GESTÃO DE OPT-INS LEGAIS
   * Substitui o estado 'accepted' fixo por um rastreador de IDs.
   */
  const [acceptedConsents, setacceptedConsents] = useState<Record<string, boolean>>({});

  // Validação em tempo real: verifica se TODOS os 'is_required' da tabela foram marcados
  const canSimulate = useMemo(() => {
    if (!simData?.consent_configs) return false;
    return simData.consent_configs.filter((opt) => opt.is_required).every((opt) => !!acceptedConsents[opt.id]);
  }, [simData, acceptedConsents]);

  // 4. Lógica Reativa (Motor de Regras)
  const rules = useMemo(() => {
    return {
      min_down_payment_percentage: simData?.rules?.min_down_payment_percentage,
      max_down_payment_percentage: simData?.rules?.max_down_payment_percentage,
      installment_options: simData?.rules?.installment_options,
      default_installments: simData?.rules?.default_installments,
      max_financed_amount: simData?.rules?.max_financed_amount,
      // AQUI: Captura o sinal do Orchestrator. Se não vier nada, o padrão é true.
      allow_custom_value: simData?.rules?.allow_custom_value ?? true,
    };
  }, [simData]);

  // 1. No topo da função SimulacaoPage, adicione o estado para o valor efetivamente financiado
  const [financiadoReal, setFinanciadoReal] = useState(0);

  const handleValorChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const valorTotalDigitado = Number(e.target.value.replace(/\D/g, "")) / 100;
    const teto = simData?.rules?.max_financed_amount;

    // 1. Atualiza o valor do veículo
    setvalorLote(valorTotalDigitado);

    // 2. Calcula o financiamento com o VALOR de entrada nominal
    const valorFinanciadoComEntradaAtual = valorTotalDigitado - valorEntrada;

    // 3. LÓGICA DE TETO: Se ultrapassar, a entrada absorve o excedente
    if (valorFinanciadoComEntradaAtual > teto) {
      const entradaNecessaria = valorTotalDigitado - teto;
      setValorEntrada(entradaNecessaria);
    }

    handleModificacaoFormulario(); // Reset do fluxo
  };

  /**
   * CÁLCULOS FINANCEIROS REATIVOS
   */
  // 1. A entrada agora apenas reflete o estado nominal
  const entrada = useMemo(() => valorEntrada, [valorEntrada]);

  // 2. O percentual é calculado SÓ para o Slider saber onde se posicionar
  const percEntradaParaSlider = useMemo(() => {
    if (!valorLote || valorLote === 0) return 0;
    return (valorEntrada / valorLote) * 100;
  }, [valorEntrada, valorLote]);

  // 3. O financiado continua dependendo da entrada (que agora é exata)
  const financiado = useMemo(() => {
    const base = valorLote - entrada;
    const teto = simData?.rules?.max_financed_amount;
    return teto && base > teto ? teto : base;
  }, [valorLote, entrada, simData]);

  const valorParcela = useMemo(
    () => (mounted ? calcParcela(financiado, taxa, parcelas) : 0),
    [financiado, parcelas, mounted, taxa],
  );
  const totalPago = valorParcela * parcelas + entrada;

  /**
   * BLOCO DE HIDRATAÇÃO BILATERAL (Mirroring Strategy)
   * Sincroniza o estado da página consumindo o payload espelhado do Orquestrador.
   */
  useEffect(() => {
    setMounted(true);
    const visitId = search.visit_id;

    async function hidratarPagina() {
      if (!visitId) return;

      try {
        const response = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/orchestrator?visit_id=${visitId}`,
          {
            method: "GET",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
            },
          },
        );

        if (!response.ok) throw new Error("Falha ao recuperar dados da visita.");

        // Recebemos o payload exatamente na estrutura SimulationData
        const payload = await response.json();

        if (payload && payload.entity) {
          setSimData(payload);

          // LOG DE SINAL PURO: Veja exatamente o que o JSON contém
          console.log("[ORCHESTRATOR RAW]:", payload.rules);

          const valorInicial = payload.offer?.offer_value || 0;
          const percInicial = payload.rules?.min_down_payment_percentage || 0;

          setvalorLote(valorInicial);
          setValorEntrada((valorInicial * percInicial) / 100); // Converte para valor nominal no boot

          // Captura direta sem conversão arriscada primeiro
          const sinalParcela = payload.rules?.default_installments;

          if (sinalParcela !== undefined && sinalParcela !== null) {
            setParcelas(Number(sinalParcela));
            console.log("[SINAL]: Atuador de parcelas travado em:", sinalParcela);
          } else {
            console.error("[ERRO DE SINAL]: O campo default_installments veio VAZIO do Orchestrator.");
          }

          if (payload.taxa) setTaxa(payload.taxa);
        }
      } catch (e) {
        console.error("[Hidratação Error]:", e);
      }
    }

    hidratarPagina();
  }, [search.visit_id]);

  /**
   * SENSOR DE TETO DINÂMICO
   * Não interfere na hidratação. Apenas vigia os Sliders em tempo real.
   */
  useEffect(() => {
    const tetoProduto = simData?.rules?.max_financed_amount;
    if (!tetoProduto) return;

    // USE O NOVO NOME AQUI:
    const valorFinanciadoAtual = valorLote - valorEntrada;

    if (valorFinanciadoAtual > tetoProduto) {
      const entradaNecessaria = valorLote - tetoProduto;
      // Atualiza o valor nominal
      setValorEntrada(entradaNecessaria);
    }
  }, [valorLote, valorEntrada, simData]); // Dependência atualizada

  /**
   * HANDLER DE SIMULAÇÃO - INTEGRAÇÃO COM GATEWAY FINANCEIRO
   * @description Dispara o workflow de normalização, persistência (Triple-Write)
   * e consulta ao motor de crédito da Fandi via Edge Function.
   */

  const handleSimular = async () => {
    // Safety guard: Impede disparo sem aceite de termos ou dados de origem
    if (!canSimulate || !simData) return;
    setLoading(true);

    // Consentimentos
    // Mapeia o objeto de estados { [id]: true } para o array de auditoria
    // Mapeamento atualizado para incluir o texto legal dinâmico
    const consents = simData.consent_configs
      ?.filter((consent) => !!acceptedConsents[consent.id])
      .map((consent) => ({
        consent_id: consent.id,
        accepted: true,
        accepted_at: new Date().toISOString(),
        legal_text_snapshot: {
          template_text: consent.template_text,
          links: consent.links,
        },
      }));

    try {
      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/financial-gateway`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({
          visit_id: (search as any).visit_id,
          product_id: simData.product_id,
          partner_id: simData.partner_id,

          entity: simData.entity,
          manager: simData.manager,
          seller: simData.seller,
          event: simData.event,
          offer: simData.offer,
          // Configurações
          page_configs: simData.page_configs,
          page_faqs: simData.page_faqs,
          consent_configs: simData.consent_configs,
          rules: simData.rules,
          is_integrated: simData.is_integrated, // Indicamos que esta simulação veio de um parceiro integrado ou não
          integration_method: simData.integration_method, // Enviamos a forma de integração para o Orchestrator (neste caso, 'API' porque é a própria página que está disparando)
          integration_details: simData.integration_details,
          // Simulação na página
          simulation_details: {
            requested_value: valorLote,
            installments: parcelas, // PADRÃO DE MERCADO
            down_payment_amount: entrada, // 60k no seu exemplo
            down_payment_percentage: percEntradaParaSlider,
            cet_rate: taxa,
          },
          consents: consents,
        }),
      });

      // 1. LEITURA ÚNICA: Guardamos o objeto na variável 'result'
      const result = await response.json();
      console.log("[Gateway] Payload recebido:", result);

      if (!response.ok) throw new Error("Erro na comunicação com o Gateway.");

      // 2. ATUALIZAÇÃO DA URL (Sempre que houver simulation_id)
      if (result.simulation_id) {
        const newParams = new URLSearchParams(window.location.search);
        newParams.set("simulation_id", result.simulation_id);
        window.history.pushState({}, "", `${window.location.pathname}?${newParams.toString()}`);
      }

      // 3. LÓGICA DE EXIBIÇÃO (Marketplace/Opção B)
      if (result.status_id === 1) {
        // Buscamos a oferta eleita dentro do array 'consults'
        const consults = result.consults || [];
        const mainConsult = consults.find((c: any) => c.is_selected) || consults[0];

        if (mainConsult) {
          // 1. Atualizamos apenas as condições de crédito devolvidas pelo parceiro
          if (mainConsult.cet_rate) setTaxa(mainConsult.cet_rate);
          if (mainConsult.installments) setParcelas(mainConsult.installments);

          // 2. HIDRATAÇÃO DO QUADRO ROXO (Valor da Parcela)
          setValorParcelaFinal(mainConsult.installment_value || null);

          console.log("[Gateway]: Sucesso! Banco:", mainConsult.financial_institution_name);
        } else {
          setValorParcelaFinal(0);
        }
      } else {
        console.warn("[Gateway]: Negado ou Erro. Status:", result.status_id);
        setValorParcelaFinal(0);
      }
      setFormularioAlterado(false); // Trava o botão após o término da simulação
    } catch (error) {
      console.error("[Gateway Critical]: Falha no disparo da simulação.", error);
    } finally {
      setLoading(false);
    }
  };

  // Função para resetar o box e reativar o botão ao menor sinal de mudança
  const handleModificacaoFormulario = () => {
    if (!formularioAlterado) {
      setFormularioAlterado(true);
      setValorParcelaFinal(null); // Volta o card da direita para o Estado 0 (Aguardando Simulação)
    }
  };

  /**
   * LÓGICA DE TETO DINÂMICO DO SLIDER
   */
  const lanceInicial = simData?.offer.offer_value || 80000;
  const valorMaximo = useMemo(() => {
    const fipe = simData?.offer?.vehicle_details?.fipe_value;
    if (fipe && fipe > 0) return fipe;
    return lanceInicial * 1.2;
  }, [simData, lanceInicial]);

  const faqs = [
    {
      q: "Todos os veículos podem ser financiados?",
      a: "Apenas veículos que exibem o selo de financiamento e o botão 'Simular Financiamento' estão disponíveis para essa modalidade de pagamento.",
    },
    {
      q: "O que significa esta pré-aprovação?",
      a: "Esta é a primeira etapa do seu financiamento. Ela traz uma indicação de preço baseada em opções de crédito das nossas instituições financeiras parceiras. Se você gostou da proposta, basta entrar em contato com um de nossos especialistas pelo link do WhatsApp disponível na página para dar prosseguimento. O processo é simples, totalmente online e não gera nenhum custo.",
    },
    {
      q: "Preciso dar uma entrada para o financiamento?",
      a: "A entrada é uma excelente estratégia: ela ajuda na aprovação do crédito e reduz o valor das parcelas. Recomendamos dar a maior entrada que puder, garantindo que você tenha crédito suficiente para lances competitivos. Lembre-se que, além da entrada, você precisará pagar antecipadamente as comissões e outros custos da negociação.",
    },
    {
      q: "Como ajustar as parcelas?",
      a: "Você pode simular prazos entre 12 e 60x para veículos leves ou entre 12 e 48x para caminhões. Nossa dica é escolher a parcela que cabe no seu bolso, lembrando que prazos menores reduzem os juros totais. Fique tranquilo: você não precisa decidir agora. Nossos especialistas o orientarão durante todo o processo e você poderá negociar as melhores condições até a assinatura do contrato.",
    },
    {
      q: "Quem financia as minhas compras?",
      a: "Nosso trabalho é facilitar o seu acesso às melhores opções de financiamento do mercado. A nossa parceira, a MeResolve, é correspondente bancária das principais instituições financeiras do país. Ela analisa o seu perfil e traz as melhores condições e resultados para você.",
    },
    {
      q: "Como é definido o banco do financiamento?",
      a: "Nossa equipe seleciona, junto aos nossos parceiros, a instituição financeira que apresenta as condições mais atrativas para o seu perfil e para as características do veículo escolhido.",
    },
    {
      q: "Por que preciso aceitar as condições de outra empresa?",
      a: "Como precisamos compartilhar os seus dados com o nosso parceiro (a MeResolve) para viabilizar a análise, é necessário que você concorde com os termos e condições antes de prosseguir com a simulação. Isso garante total transparência e segurança no tratamento das suas informações.",
    },
    {
      q: "Como utilizar o financiamento na minha compra?",
      a: "Após a arrematação, nossa equipe de especialistas entrará em contato via WhatsApp para orientá-lo em todas as etapas, desde o envio de documentos até a formalização.",
    },
    {
      q: "Posso financiar através do meu CNPJ?",
      a: "Sim. Tanto Pessoas Físicas quanto Jurídicas podem financiar. Apenas certifique-se de que o financiamento esteja vinculado ao mesmo CPF ou CNPJ do arrematante.",
    },
    {
      q: "Como me prevenir contra golpes?",
      a: "O contato oficial da nossa equipe é pelo número +55 11 3164 4402. Não solicitamos pagamentos via WhatsApp e não enviamos boletos por e-mail. Na dúvida, sempre fale conosco pelos canais oficiais.",
    },
  ];

  if (!mounted) return null;

  return (
    <div
      className="min-h-screen bg-background text-foreground"
      style={brandStyles} // Injeção das variáveis CSS dinâmicas
    >
      <header className="sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
          <WalletLogo size="md" withTagline />
          <nav className="hidden items-center gap-8 md:flex">
            <a href="#simulador" className="text-sm font-medium text-muted-foreground hover:text-foreground">
              Simular
            </a>
            <a href="#como-funciona" className="text-sm font-medium text-muted-foreground hover:text-foreground">
              Como funciona
            </a>
            <a href="#faq" className="text-sm font-medium text-muted-foreground hover:text-foreground">
              Dúvidas
            </a>
          </nav>
        </div>
      </header>

      {/* Adicionado o scroll-mt-24 para dar o respiro correto quando a página rolar */}
      <section id="simulador" className="relative py-8 overflow-hidden scroll-mt-24">
        {/* 1. Foto de Fundo */}
        <div
          className="absolute inset-0 z-0 bg-cover bg-center bg-fixed"
          style={{
            backgroundImage: "var(--dynamic-bg-image)",
          }}
        />

        {/* 2. Camada de ambiente sutil */}
        <div className="absolute inset-0 z-0 bg-black/5" />

        <div className="mx-auto max-w-5xl px-4 relative z-10">
          {/* BOX 1: Banner do Veículo - Branco Sólido */}
          {simData && (
            <div className="mb-6 p-4 rounded-2xl bg-white border border-slate-100 flex items-center text-sm font-semibold text-black shadow-sm gap-4">
              <span className="text-left">{simData.offer.offer_description}</span>
            </div>
          )}

          {/* Grid Principal do Simulador */}
          <div className="grid lg:grid-cols-5 gap-6">
            {/* ========================================================================= */}
            {/* BOX 2: Card da Esquerda - Formulário Principal                            */}
            {/* ========================================================================= */}
            <div className="lg:col-span-3 rounded-3xl border border-slate-100 bg-white p-6 shadow-md space-y-5 text-black flex flex-col justify-between">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5 block">
                    Valor do lance ou proposta
                  </Label>

                  <Input
                    type="text"
                    value={BRL(valorLote)}
                    disabled={rules.allow_custom_value === false}
                    onChange={handleValorChange}
                    className={`
                      mt-1 h-10 rounded-xl bg-slate-50 text-black border-slate-200 shadow-sm font-semibold
                      !outline-none !ring-0 !ring-offset-0 
                      focus:!border-[color:var(--primary)] 
                      ${rules.allow_custom_value === false ? "cursor-not-allowed opacity-80" : ""}
                    `}
                  />

                  {rules.allow_custom_value !== false && (
                    <div className="mt-2 px-[10%]">
                      <SliderCustomizado
                        value={valorLote}
                        onValueChange={(v: number) => {
                          // Garante que o valor vindo do slider seja um número inteiro redondo
                          const valorLimpo = Math.round(v / 100) * 100;
                          setvalorLote(valorLimpo);
                          handleModificacaoFormulario();
                        }}
                        min={simData?.offer.offer_value || 0}
                        max={valorMaximo}
                        step={100}
                        isCurrency={true}
                      />
                    </div>
                  )}
                </div>
                <div>
                  <Label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5 block">
                    Entrada
                  </Label>
                  <Input
                    type="text"
                    value={BRL(entrada)}
                    onChange={(e) => {
                      const val = Number(e.target.value.replace(/\D/g, "")) / 100;
                      setValorEntrada(val);
                      handleModificacaoFormulario();
                    }}
                    className={`
                      mt-1 h-10 rounded-xl bg-slate-50 text-black border-slate-200 shadow-sm font-semibold
                      !outline-none !ring-0 !ring-offset-0 
                      focus:!border-[color:var(--primary)] 
                    `}
                  />
                  <div className="mt-2 px-[10%]">
                    <SliderCustomizado
                      value={percEntradaParaSlider}
                      onValueChange={(v: number) => {
                        // 1. Descobre o valor em dinheiro puro que a posição do slider representa (sem capar os decimais da porcentagem)
                        const novoValorEntrada = (valorLote * v) / 100;

                        // 2. Passa o rolo compressor na moeda: força o valor nominal a encaixar em notas de R$ 100 cravadas
                        const entradaLimpaNotaCem = Math.round(novoValorEntrada / 100) * 100;

                        setValorEntrada(entradaLimpaNotaCem);
                        handleModificacaoFormulario();
                      }}
                      min={rules.min_down_payment_percentage}
                      max={rules.max_down_payment_percentage}
                      step={1} // 👈 Dá sensibilidade fina para o slider achar múltiplos exatos de R$ 100
                      isCurrency={false}
                    />
                  </div>
                </div>
              </div>

              <div>
                <Label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2 block">
                  Parcelas
                </Label>
                <RadioGroup
                  value={parcelas > 0 ? String(parcelas) : ""}
                  onValueChange={(v) => {
                    if (v) {
                      setParcelas(Number(v));
                      handleModificacaoFormulario(); // Reset do fluxo
                    }
                  }}
                  className="flex justify-between gap-1"
                >
                  {(rules.installment_options || []).map((p) => (
                    <div key={p} className="flex-1">
                      <RadioGroupItem value={String(p)} id={`p-${p}`} className="peer sr-only" />
                      <Label
                        htmlFor={`p-${p}`}
                        className="flex items-center justify-center p-2 border border-slate-200 rounded-xl cursor-pointer bg-slate-50 hover:bg-slate-100 peer-data-[state=checked]:border-primary peer-data-[state=checked]:bg-white peer-data-[state=checked]:text-black transition-all shadow-sm"
                      >
                        <span className="font-bold text-xs text-black">{p}x</span>
                      </Label>
                    </div>
                  ))}
                </RadioGroup>
              </div>

              {/* Consentimentos dinâmicos com suporte a múltiplos links, Tooltips e ordenação */}
              {simData?.consent_configs && simData.consent_configs.length > 0 && (
                <div className="border-t border-slate-100 pt-4 space-y-3">
                  {[...simData.consent_configs]
                    .sort((a, b) => a.position - b.position)
                    .map((opt) => (
                      <div key={opt.id} className="flex gap-2 items-start group">
                        <div className="flex items-center h-4 mt-0.5">
                          <Checkbox
                            id={opt.id}
                            checked={!!acceptedConsents[opt.id]}
                            onCheckedChange={() =>
                              setacceptedConsents((prev) => ({
                                ...prev,
                                [opt.id]: !prev[opt.id],
                              }))
                            }
                            className="h-3.5 w-3.5 border-slate-300 data-[state=checked]:bg-primary data-[state=checked]:border-primary"
                          />
                        </div>
                        <label
                          htmlFor={opt.id}
                          className="text-xs text-slate-900 font-medium leading-4 cursor-pointer select-none flex-1"
                        >
                          {opt.template_text ? (
                            opt.template_text.split(/(\{.*?\})/g).map((part, i) => {
                              if (part.startsWith("{") && part.endsWith("}")) {
                                const cleanText = part.replace(/[{}]/g, "");
                                const linkConfig = opt.links?.find((l: any) => l.text === cleanText);

                                if (linkConfig) {
                                  // CASO 1: Link tradicional para Web
                                  if (linkConfig.type === "web") {
                                    return (
                                      <a
                                        key={i}
                                        href={linkConfig.url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="underline font-bold hover:opacity-80 text-primary inline"
                                        style={{ color: "var(--primary)" }}
                                        onClick={(e) => e.stopPropagation()}
                                      >
                                        {cleanText}
                                      </a>
                                    );
                                  }

                                  // ==========================================
                                  // CASO 2: Elemento interativo do tipo Tooltip
                                  // FONTE INTER, BORDA E BRANDING DINÂMICO
                                  // ==========================================
                                  if (linkConfig.type === "tooltip") {
                                    return (
                                      <TooltipProvider key={i}>
                                        <Tooltip delayDuration={200}>
                                          <TooltipTrigger asChild>
                                            {/* Gatilho visual: o texto clicável */}
                                            <span
                                              className="underline font-medium cursor-help border-b border-dashed inline mx-0.5 hover:opacity-80 select-all font-inter" // Adicionado 'font-inter'
                                              style={{ color: "var(--primary)", borderColor: "var(--primary)" }}
                                              onClick={(e) => e.stopPropagation()}
                                            >
                                              {cleanText}
                                            </span>
                                          </TooltipTrigger>

                                          {/* O Portal do Radix para garantir o posicionamento por cima de tudo */}
                                          <TooltipPrimitive.Portal>
                                            <TooltipContent
                                              side="bottom"
                                              align="start"
                                              sideOffset={6}
                                              // Removeu-se o border-l-4. Adicionada a classe 'font-inter' e 'border-slate-200' para uma borda fina e cinza idêntica aos inputs.
                                              className="max-w-xs p-3 bg-white text-slate-700 text-[11px] rounded-xl border border-slate-200 shadow-lg leading-relaxed z-[100] font-inter animate-in fade-in-0 zoom-in-95"
                                            >
                                              {/* Removido o 'font-medium' para que a fonte Inter fique totalmente regular (sem negrito) */}
                                              <p className="font-normal">{linkConfig.tooltip_text}</p>
                                            </TooltipContent>
                                          </TooltipPrimitive.Portal>
                                        </Tooltip>
                                      </TooltipProvider>
                                    );
                                  }
                                }
                              }

                              // Texto comum fora de chaves
                              return <span key={i}>{part}</span>;
                            })
                          ) : (
                            /* Fallback retrocompatível para o modelo antigo */
                            <>
                              {(opt as any).prefix}
                              <a
                                href={(opt as any).url}
                                target="_blank"
                                className="underline ml-0.5 mr-0.5 font-bold hover:opacity-80"
                                style={{ color: "var(--primary)" }}
                              >
                                {(opt as any).link_text}
                              </a>
                              {(opt as any).suffix}
                            </>
                          )}
                        </label>
                      </div>
                    ))}
                </div>
              )}

              {/* Ajustado de h-10 para h-12 para nivelar as bases dos botões */}
              <div className="pt-2">
                <Button
                  size="lg"
                  disabled={!canSimulate || loading || !formularioAlterado}
                  onClick={handleSimular}
                  className="w-full h-12 rounded-xl font-bold text-white shadow-sm"
                  style={{ backgroundColor: "var(--primary)" }}
                >
                  {loading ? (
                    <span className="flex items-center gap-2">
                      <span className="animate-pulse">CONSULTANDO CONDIÇÕES...</span>
                    </span>
                  ) : (
                    "SIMULAR FINANCIAMENTO"
                  )}
                </Button>
              </div>
            </div>

            {/* =========================================================================
                BOX 3: SIMULADOR DE CONDIÇÕES COMERCIAIS (MANTENDO O PADRÃO DE VEICULOS)
               ========================================================================= */}
            <div
              style={{ background: "var(--gradient-primary)" }}
              className="lg:col-span-2 flex flex-col justify-between p-0 rounded-[var(--radius-config)] shadow-2xl overflow-hidden relative border border-white/10"
            >
              <div
                className="absolute inset-0 bg-cover bg-center opacity-10 mix-blend-overlay pointer-events-none"
                style={{ backgroundImage: "var(--dynamic-bg-image)" }}
              />

              {/* CONTROLE DE ESTADOS DE RENDERIZAÇÃO */}
              {valorParcelaFinal === null ? (
                /* ======================================================================= */
                /* ESTADO 0: AGUARDANDO SIMULAÇÃO DE CONDIÇÕES                             */
                /* ======================================================================= */
                <div className="flex flex-col items-start justify-between pl-0 pr-0 flex-grow h-full pt-8 pb-8 w-full text-left relative z-10">
                  {/* Mola superior externa: Mantém o topo roxo simétrico */}
                  <div className="flex-grow" />

                  {/* CONTAINER BRANCO DE CONTEÚDO INTEGRADO */}
                  <div className="w-full bg-white flex flex-col items-start pt-8 pb-8 border-y border-slate-100 flex-shrink-0">
                    {/* Bloco Superior: Títulos (pl-10 pr-6 para alinhamento e mb-10 para controlar o espaço abaixo) */}
                    <div className="flex flex-row items-start gap-3 w-full flex-shrink-0 pl-10 pr-6 mb-10">
                      <div
                        className="h-5 w-5 animate-spin rounded-full border-2 mt-1 flex-shrink-0"
                        style={{
                          borderColor: "rgba(var(--primary-rgb, 179, 0, 255), 0.15)",
                          borderTopColor: "var(--primary)",
                        }}
                      />
                      <div className="space-y-1">
                        <h3 className="text-xl font-bold text-slate-900 tracking-tight leading-tight">
                          Consulte agora
                        </h3>
                        <p className="text-base font-semibold tracking-wide" style={{ color: "var(--primary)" }}>
                          nossas condições comerciais.
                        </p>
                      </div>
                    </div>

                    {/* Bloco Central: Valores (pl-10 pr-6 mantendo a proximidade calibrada pelo mb-10 acima) */}
                    <div className="w-full flex flex-col items-start pl-10 pr-6">
                      <div className="text-left space-y-1">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">
                          Valor de Referência
                        </span>
                        <div className="text-3xl font-black text-slate-900 tracking-tight flex items-baseline gap-1">
                          <span className="text-base font-bold text-slate-400">R$</span>
                          <span>
                            {typeof valorLote !== "undefined" && typeof entrada !== "undefined"
                              ? (Number(valorLote) - Number(entrada)).toLocaleString("pt-BR", {
                                  minimumFractionDigits: 2,
                                  maximumFractionDigits: 2,
                                })
                              : "--,--"}
                          </span>
                        </div>
                        <div className="text-xs font-bold text-slate-500 mt-1">
                          em{" "}
                          <span className="text-sm font-black" style={{ color: "var(--primary)" }}>
                            {parcelas || "48"}X
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Mola inferior externa: Garante o respiro roxo perfeito antes do status */}
                  <div className="flex-grow" />

                  <div className="w-full text-left pt-4 flex-shrink-0 pl-10 pr-6 select-none relative h-[20px]">
                    {brandStyles.partnerName && (
                      <div className="absolute bottom-0 left-10 right-6 text-left">
                        <p className="text-[9px] uppercase tracking-widest text-white/60 font-semibold leading-none">
                          {brandStyles.partnerLabel}
                        </p>
                        <p className="text-[11px] font-black text-white mt-0.5 uppercase leading-tight tracking-wide whitespace-nowrap">
                          {brandStyles.partnerName}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              ) : valorParcelaFinal === 0 ? (
                /* ======================================================================= */
                /* ESTADO 1: FALHA TÉCNICA / PRAZO INDISPONÍVEL                            */
                /* ======================================================================= */
                <div className="flex flex-col items-center justify-between pl-0 pr-0 flex-grow h-full pt-8 pb-8 w-full text-center relative z-10">
                  <div className="flex-grow" />
                  <div className="w-full bg-white flex flex-col items-center justify-center pt-8 pb-8 border-y border-slate-100 flex-shrink-0 space-y-4 pl-10 pr-10">
                    <div className="bg-amber-50 p-2.5 rounded-full flex-shrink-0 mx-auto">
                      <Hourglass className="h-6 w-6 text-amber-600" />
                    </div>
                    <div className="space-y-2">
                      <h3 className="text-xl font-bold text-slate-900 tracking-tight leading-tight">
                        Condição Indisponível
                      </h3>
                      <p className="text-xs text-slate-500 leading-relaxed max-w-xs mx-auto">
                        O prazo ou os fatores selecionados não puderam ser calculados para esta tabela. Por favor,
                        selecione outra quantidade de parcelas ou fale com o suporte técnico.
                      </p>
                    </div>
                  </div>
                  <div className="flex-grow" />
                  <div className="w-full text-center pt-4 flex-shrink-0 pl-10 pr-10">
                    <p className="text-[10px] uppercase tracking-wider font-bold text-white">
                      Erro de processamento técnico
                    </p>
                  </div>
                </div>
              ) : (
                /* ======================================================================= */
                /* ESTADO 2: PROPOSTA ENCONTRADA - IDENTIDADE VISUAL EXATA DE VEICULOS.TSX */
                /* ======================================================================= */
                <div className="absolute inset-0 bg-white z-20 rounded-3xl flex flex-col items-start justify-between pl-10 pr-6 pt-8 pb-8 w-full text-left animate-in fade-in duration-200">
                  <div className="flex flex-row items-start gap-3 w-full flex-shrink-0">
                    <div className="mt-1 flex-shrink-0">
                      <ThumbsUp className="h-5 w-5" style={{ color: "var(--primary)" }} />
                    </div>
                    <div className="space-y-1">
                      <h3 className="text-lg font-bold text-slate-900 tracking-tight leading-tight uppercase">
                        SIMULAÇÃO DE PARCELA!
                      </h3>
                      <p className="text-xs font-medium text-slate-500">Esses são nossos valores de referência.</p>
                    </div>
                  </div>

                  <div className="w-full flex flex-col items-start justify-center flex-grow py-6">
                    <div className="text-left space-y-1">
                      <span className="text-[10px] font-black text-slate-900 uppercase tracking-widest block mb-1">
                        SUA OFERTA*
                      </span>
                      <div className="text-slate-900 tracking-tight flex items-baseline gap-1.5 flex-wrap">
                        <span className="text-xl font-black" style={{ color: "var(--primary)" }}>
                          {parcelas}x
                        </span>
                        <span className="text-base font-bold text-slate-400">R$</span>
                        <span className="text-3xl font-black text-slate-900">
                          {BRL(valorParcelaFinal).replace("R$", "").trim()}
                        </span>
                        <span className="text-slate-400 text-[11px] font-medium">/mês</span>
                      </div>
                      <div className="pt-3 text-xs text-slate-500 font-medium font-sans w-full">
                        Taxa de juros de{" "}
                        <span className="font-bold text-slate-900">
                          {taxa !== undefined && taxa !== null ? `${Number(taxa).toFixed(2)}%` : "0,00%"}
                        </span>{" "}
                        ao mês.
                      </div>
                    </div>
                  </div>

                  <div className="w-full space-y-4 pt-4 border-t border-slate-100 flex-shrink-0 mt-auto">
                    <p className="text-[10px] text-slate-600 font-medium leading-relaxed">
                      *As condições apresentadas são uma referência de taxas praticadas e não garantem aprovação do
                      crédito. Fale com nossos especialistas para prosseguir.
                    </p>
                    <button
                      type="button"
                      className="w-full h-12 font-bold text-xs bg-white border-2 rounded-xl flex items-center justify-center gap-2 transition-all shadow-sm hover:bg-black/[0.02] active:scale-[0.99]"
                      style={{
                        borderColor: "var(--primary)",
                        color: "var(--primary)",
                      }}
                      onClick={() => {
                        const nomeCliente = simData?.entity?.name || "";
                        const entradaFormatada = BRL(entrada);
                        const financiadoFormatado = BRL(financiado);
                        const descricaoLote = simData?.offer?.offer_description || "";
                        const idLote = simData?.offer?.offer_id || "";
                        const valorLote = BRL(simData?.offer?.offer_value || 0);
                        const nomeEvento = simData?.event?.event_description || "";
                        const encerramento = simData?.event?.event_end_date
                          ? new Date(simData.event.event_end_date).toLocaleString("pt-BR")
                          : "";

                        const msg = `Olá! Meu nome é ${nomeCliente}. Realizei a simulação de condições comerciais para PJ com entrada de ${entradaFormatada} e valor financiado de ${financiadoFormatado} para o lote "${descricaoLote}" (Lote ${idLote} / Valor: ${valorLote}) do evento "${nomeEvento}". Gostaria de enviar a documentação para a análise da mesa técnica. Como procedemos?`;

                        window.open(`https://wa.me/551131644402?text=${encodeURIComponent(msg)}`, "_blank");
                      }}
                    >
                      <MessageCircle className="h-4 w-4 flex-shrink-0" style={{ stroke: "var(--primary)" }} />
                      <span style={{ color: "var(--primary)" }}>FALAR COM ESPECIALISTA</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      <section
        id="como-funciona"
        className="py-16 sm:py-20 border-t relative overflow-hidden"
        style={{
          backgroundColor: "var(--primary)",
          backgroundImage: "linear-gradient(to bottom, rgba(255, 255, 255, 0.97), rgba(255, 255, 255, 0.97))",
        }}
      >
        <div className="mx-auto max-w-7xl px-4 sm:px-6 relative z-10">
          <h2 className="text-center text-3xl font-bold mb-12 text-slate-800 tracking-tight">
            Em <span style={{ color: "var(--primary)" }}>3 passos</span> você compra na{" "}
            <span style={{ color: "var(--primary)" }} className="font-black">
              Superbid
            </span>{" "}
            com seu financiamento.
          </h2>
          <div className="grid gap-6 md:grid-cols-3">
            {[
              {
                t: "Conheça suas condições",
                d: "Escolha a entrada e o prazo ideais para o seu momento no nosso simulador e tenha uma referência de nossas condições comerciais.",
                i: <Sparkles className="h-7 w-7" />,
              },
              {
                t: "Negocie e aprove seu financiamento",
                d: "Você pode falar com um especialista no WhatsApp ou aguardar nosso contato para seguir com a análise do financiamento e negociar as condições comerciais.",
                i: <MessageCircle className="h-7 w-7" />,
              },
              {
                t: "Pague com seu crédito aprovado",
                d: "Após a confirmação da sua compra, nossa equipe apoia você em toda a formalização.",
                i: <ShieldCheck className="h-7 w-7" />,
              },
            ].map((s, i) => {
              const radiusClass = simData?.page_configs?.box_radius === "rounded-xl" ? "rounded-xl" : "rounded-3xl";

              return (
                <div
                  key={i}
                  className={`bg-white p-8 shadow-sm transition-all hover:shadow-md border ${radiusClass}`}
                  style={{
                    borderColor: "rgba(var(--primary-rgb, 0, 0, 0), 0.2)",
                    borderWidth: "1px",
                    borderStyle: "solid",
                  }}
                >
                  <div className="mb-5" style={{ color: "var(--primary)" }}>
                    {s.i}
                  </div>

                  <h3 className="font-bold text-lg text-slate-800 mb-2">{s.t}</h3>
                  <p className="text-sm text-slate-500 leading-relaxed">{s.d}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <section id="faq" className="py-20 relative overflow-hidden bg-slate-50">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 relative z-10">
          <h2 className="text-center text-3xl font-bold mb-16 text-foreground/90">Dúvidas Frequentes</h2>
          <div className="grid md:grid-cols-2 gap-x-12 gap-y-4">
            {/* Coluna 1: Metade superior das perguntas */}
            <div className="space-y-4">
              <Accordion type="single" collapsible className="w-full">
                {(simData?.page_faqs || [])
                  .slice(0, Math.ceil((simData?.page_faqs?.length || 0) / 2))
                  .map((item, i) => (
                    <AccordionItem key={i} value={`item-${i}`} className="border rounded-xl px-4 bg-white/60 shadow-sm">
                      <AccordionTrigger className="text-left font-semibold text-foreground/90 hover:text-primary transition-colors">
                        {item.question}
                      </AccordionTrigger>
                      <AccordionContent className="text-muted-foreground leading-relaxed">
                        {item.answer}
                      </AccordionContent>
                    </AccordionItem>
                  ))}
              </Accordion>
            </div>

            {/* Coluna 2: Metade inferior das perguntas */}
            <div className="space-y-4">
              <Accordion type="single" collapsible className="w-full">
                {(simData?.page_faqs || []).slice(Math.ceil((simData?.page_faqs?.length || 0) / 2)).map((item, i) => (
                  <AccordionItem
                    key={i + 100}
                    value={`item-${i + 100}`}
                    className="border rounded-xl px-4 bg-white/60 shadow-sm"
                  >
                    <AccordionTrigger className="text-left font-semibold text-foreground/90 hover:text-primary transition-colors">
                      {item.question}
                    </AccordionTrigger>
                    <AccordionContent className="text-muted-foreground leading-relaxed">{item.answer}</AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            </div>
          </div>
        </div>
      </section>

      <footer className="border-t py-10 text-center text-xs text-muted-foreground">
        © {new Date().getFullYear()} SBX Crédito · Simulações meramente ilustrativas.
      </footer>
    </div>
  );
}
