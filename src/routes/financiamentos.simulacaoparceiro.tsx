import { createFileRoute, useSearch } from "@tanstack/react-router";
import { useMemo, useState, useEffect } from "react";
import { Car, MessageCircle, ShieldCheck, Sparkles } from "lucide-react";
import { WalletLogo } from "@/components/brand/WalletLogo";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import * as SliderPrimitive from "@radix-ui/react-slider";

interface SimulationData {
  entity: { id_entity: number; document_proponent: string; name_proponent: string; phone_proponent: string; email_proponent: string; };
  event: { organizer_name: string; id_event: number; event_description: string; id_seller: number; legal_name: string; economic_group: string; trade_name: string; event_start_date: string; event_end_date: string; };
  offer: { id_offer: number; offer_description: string; offer_value: number; category_name: string; vehicle_details?: { fipe_value: number; year_manufacture: number; year_model: number; }; };
}

export const Route = createFileRoute("/financiamentos/simulacaoparceiro")({
  component: SimulacaoPage,
});

const BRL = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2, maximumFractionDigits: 2 });

function calcParcela(valorFinanciado: number, taxaMensal: number, meses: number) {
  if (taxaMensal === 0) return valorFinanciado / meses;
  const i = taxaMensal;
  return (valorFinanciado * i) / (1 - Math.pow(1 + i, -meses));
}

const SliderCustomizado = ({ value, onValueChange, min, max, step, isCurrency = false }: any) => {
  // Ajuste de formato: para valores > 1000, mostra formato numérico amigável sem R$ e K
  const displayValue = isCurrency 
    ? value.toLocaleString('pt-BR', { maximumFractionDigits: 0 }).replace(/\./g, '.') 
    : `${value}%`;

  return (
    <SliderPrimitive.Root
      className="relative flex w-full touch-none select-none items-center h-6"
      value={[value]}
      onValueChange={(v) => onValueChange(v[0])}
      min={min}
      max={max}
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

function SimulacaoPage() {
  const search = useSearch({ strict: false });
  const [mounted, setMounted] = useState(false);
  const [valorVeiculo, setValorVeiculo] = useState(80000);
  const [percEntrada, setPercEntrada] = useState(20);
  const [parcelas, setParcelas] = useState(48);
  const [accepted, setAccepted] = useState(false);
  const [simData, setSimData] = useState<SimulationData | null>(null);

  useEffect(() => {
    setMounted(true);
    if (search.data) {
      try {
        const data = typeof search.data === 'string' ? JSON.parse(search.data) : search.data;
        setSimData(data);
        setValorVeiculo(data.offer.offer_value);
      } catch (e) { console.error("Erro ao processar handshake:", e); }
    }
  }, [search.data]);

  const entrada = useMemo(() => (valorVeiculo * percEntrada) / 100, [valorVeiculo, percEntrada]);
  const financiado = useMemo(() => valorVeiculo - entrada, [valorVeiculo, entrada]);
  const taxa = 0.0189;
  const valorParcela = useMemo(() => (mounted ? calcParcela(financiado, taxa, parcelas) : 0), [financiado, parcelas, mounted]);
  const totalPago = valorParcela * parcelas + entrada;
  const lanceInicial = simData?.offer.offer_value || 80000;

  const faqs = [
    { q: "Todos os veículos podem ser financiados?", a: "Apenas veículos que exibem o selo de financiamento e o botão 'Simular Financiamento' estão disponíveis para essa modalidade de pagamento." },
    { q: "O que significa esta pré-aprovação?", a: "Esta é a primeira etapa do seu financiamento. Ela traz uma indicação de preço baseada em opções de crédito das nossas instituições financeiras parceiras. Se você gostou da proposta, basta entrar em contato com um de nossos especialistas pelo link do WhatsApp disponível na página para dar prosseguimento. O processo é simples, totalmente online e não gera nenhum custo." },
    { q: "Preciso dar uma entrada para o financiamento?", a: "A entrada é uma excelente estratégia: ela ajuda na aprovação do crédito e reduz o valor das parcelas. Recomendamos dar a maior entrada que puder, garantindo que você tenha crédito suficiente para lances competitivos. Lembre-se que, além da entrada, você precisará pagar antecipadamente as comissões e outros custos da negociação." },
    { q: "Como ajustar as parcelas?", a: "Você pode simular prazos entre 12 e 60x para veículos leves ou entre 12 e 48x para caminhões. Nossa dica é escolher a parcela que cabe no seu bolso, lembrando que prazos menores reduzem os juros totais. Fique tranquilo: você não precisa decidir agora. Nossos especialistas o orientarão durante todo o processo e você poderá negociar as melhores condições até a assinatura do contrato." },
    { q: "Quem financia as minhas compras?", a: "Nosso trabalho é facilitar o seu acesso às melhores opções de financiamento do mercado. A nossa parceira, a MeResolve, é correspondente bancária das principais instituições financeiras do país. Ela analisa o seu perfil e traz as melhores condições e resultados para você." },
    { q: "Como é definido o banco do financiamento?", a: "Nossa equipe seleciona, junto aos nossos parceiros, a instituição financeira que apresenta as condições mais atrativas para o seu perfil e para as características do veículo escolhido." },
    { q: "Por que preciso aceitar as condições de outra empresa?", a: "Como precisamos compartilhar os seus dados com o nosso parceiro (a MeResolve) para viabilizar a análise, é necessário que você concorde com os termos e condições antes de prosseguir com a simulação. Isso garante total transparência e segurança no tratamento das suas informações." },
    { q: "Como utilizar o financiamento na minha compra?", a: "Após a arrematação, nossa equipe de especialistas entrará em contato via WhatsApp para orientá-lo em todas as etapas, desde o envio de documentos até a formalização." },
    { q: "Posso financiar através do meu CNPJ?", a: "Sim. Tanto Pessoas Físicas quanto Jurídicas podem financiar. Apenas certifique-se de que o financiamento esteja vinculado ao mesmo CPF ou CNPJ do arrematante." },
    { q: "Como me prevenir contra golpes?", a: "O contato oficial da nossa equipe é pelo número +55 11 3164 4402. Não solicitamos pagamentos via WhatsApp e não enviamos boletos por e-mail. Na dúvida, sempre fale conosco pelos canais oficiais." },
  ];

  if (!mounted) return null;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
          <WalletLogo size="md" withTagline />
          <nav className="hidden items-center gap-8 md:flex">
            <a href="#simulador" className="text-sm font-medium text-muted-foreground hover:text-foreground">Simular</a>
            <a href="#como-funciona" className="text-sm font-medium text-muted-foreground hover:text-foreground">Como funciona</a>
            <a href="#faq" className="text-sm font-medium text-muted-foreground hover:text-foreground">Dúvidas</a>
          </nav>
          <Button size="sm" className="rounded-full px-5">Entrar</Button>
        </div>
      </header>

      <section id="simulador" className="relative py-8 overflow-hidden">
        <div className="absolute inset-0 z-0 bg-cover bg-center bg-fixed" style={{ backgroundImage: "url('https://d335luupugsy2.cloudfront.net/cms/files/310479/1730141440/$464p11t5fmb')" }} />
        <div className="absolute inset-0 z-0 bg-gradient-to-br from-white/70 to-white/90" />

        <div className="mx-auto max-w-5xl px-4 relative z-10">
          <h1 className="text-2xl font-bold text-center mb-6">Simule seu financiamento <span className="text-primary">sem compromisso</span>.</h1>

          {simData && (
            <div className="mb-6 p-4 rounded-2xl bg-white/60 border border-black/5 backdrop-blur flex justify-between items-center text-sm font-semibold text-black shadow-sm">
              <span>{simData.offer.offer_description}</span>
              <span>Ano: {simData.offer.vehicle_details?.year_manufacture}/{simData.offer.vehicle_details?.year_model}</span>
              {simData.offer.vehicle_details?.fipe_value && <span>FIPE: {BRL(simData.offer.vehicle_details.fipe_value)}</span>}
            </div>
          )}

          <div className="grid lg:grid-cols-5 gap-6">
            <div className="lg:col-span-3 rounded-3xl border border-slate-200 bg-white/80 backdrop-blur-md p-6 shadow-sm space-y-4 text-black">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5 block">Valor do lance ou proposta</Label>
                  <Input type="text" value={BRL(valorVeiculo)} onChange={(e) => setValorVeiculo(Number(e.target.value.replace(/\D/g, '')) / 100)} className="mt-1 h-10 rounded-xl bg-white/50" />
                  <div className="mt-2 px-[10%]">
                    <SliderCustomizado 
                      value={valorVeiculo} 
                      onValueChange={(v: number) => setValorVeiculo(v)} 
                      min={lanceInicial} 
                      max={lanceInicial * 1.2} 
                      step={1000} 
                      isCurrency={true}
                    />
                  </div>
                </div>
                <div>
                  <Label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5 block">Entrada</Label>
                  <Input type="text" value={BRL(entrada)} onChange={(e) => setPercEntrada(Math.min(80, Math.max(20, Math.round(((Number(e.target.value.replace(/\D/g, '')) / 100) / valorVeiculo) * 100))))} className="mt-1 h-10 rounded-xl bg-white/50" />
                  <div className="mt-2">
                    <div className="mt-1 px-[10%]">
                      <SliderCustomizado 
                        value={percEntrada} 
                        onValueChange={(v: number) => setPercEntrada(v)} 
                        min={20} 
                        max={80} 
                        step={1} 
                        isCurrency={false}
                      />
                    </div>
                  </div>
                </div>
              </div>
              
              <div>
                <Label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2 block">Parcelas</Label>
                <RadioGroup value={String(parcelas)} onValueChange={(v) => setParcelas(Number(v))} className="flex justify-between gap-1">
                  {[12, 24, 36, 48, 60].map((p) => (
                    <div key={p} className="flex-1">
                      <RadioGroupItem value={String(p)} id={`p-${p}`} className="peer sr-only" />
                      <Label htmlFor={`p-${p}`} className="flex items-center justify-center p-2 border rounded-lg cursor-pointer hover:bg-black/5 peer-data-[state=checked]:border-primary transition-all">
                        <span className="font-bold text-xs">{p}x</span>
                      </Label>
                    </div>
                  ))}
                </RadioGroup>
              </div>

              <div className="bg-black/5 p-3 rounded-xl border border-black/10 flex gap-2 items-start">
                <Checkbox id="optin" checked={accepted} onCheckedChange={(v) => setAccepted(!!v)} className="mt-1" />
                <label htmlFor="optin" className="text-[10px] text-black/70 leading-tight cursor-pointer">
                  Ao clicar no botão abaixo, você declara que leu e aceitou a <a href="#" className="underline">Política de Privacidade</a> e os <a href="#" className="underline">Termos de Uso do Fandi</a>.
                </label>
              </div>

              <Button size="lg" disabled={!accepted} className="w-full h-10 rounded-xl font-bold bg-primary text-white">SIMULAR FINANCIAMENTO</Button>
            </div>

            <div className="lg:col-span-2 rounded-3xl p-6 text-primary-foreground shadow-lg flex flex-col justify-center" style={{ background: "var(--gradient-primary)" }}>
              <div className="text-xs font-semibold opacity-90"><Car className="inline h-4 w-4 mr-2" /> Sua parcela estimada</div>
              <div className="mt-2 text-4xl font-bold">{BRL(valorParcela)}<span className="text-lg font-medium opacity-80">/mês</span></div>
              <div className="mt-4 space-y-1 bg-white/10 p-4 rounded-xl backdrop-blur text-xs">
                <div className="flex justify-between"><span>Valor financiado</span><span className="font-semibold">{BRL(financiado)}</span></div>
                <div className="flex justify-between"><span>Entrada</span><span className="font-semibold">{BRL(entrada)}</span></div>
                <div className="flex justify-between border-t border-white/20 pt-2"><span>Total a pagar</span><span className="font-bold">{BRL(totalPago)}</span></div>
              </div>
              <Button size="lg" variant="secondary" className="mt-4 w-full h-10 rounded-xl font-bold text-xs">
                <MessageCircle className="mr-2 h-4 w-4" /> Falar com especialista
              </Button>
            </div>
          </div>
        </div>
      </section>

      <section id="como-funciona" className="bg-[image:var(--gradient-soft)] py-16 sm:py-20 border-t">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <h2 className="text-center text-3xl font-bold mb-12">Em 3 passos você compra na Superbid com seu financiamento.</h2>
          <div className="grid gap-5 md:grid-cols-3">
            {[
              { t: "Simule suas condições", d: "Escolha a entrada e o prazo ideais para o seu momento e conheça as condições que conseguimos desenhar para o seu perfil.", i: <Sparkles /> },
              { t: "Negocie e garanta seu crédito", d: "Aprove sua linha de crédito por 30 dias. É o momento ideal para tirar dúvidas, negociar com especialistas e comprovar que você tem as melhores condições.", i: <MessageCircle /> },
              { t: "Pague com seu financiamento", d: "Após o lance vencedor, apoiamos você com a formalização. O processo é 100% digital e nós acompanhamos você de perto em cada etapa, garantindo total segurança até a conclusão junto ao banco.", i: <ShieldCheck /> },
            ].map((s, i) => (
              <div key={i} className="rounded-3xl border bg-card p-7">
                <div className="text-primary mb-4">{s.i}</div>
                <h3 className="font-bold text-lg">{s.t}</h3>
                <p className="text-sm text-muted-foreground mt-2">{s.d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="faq" className="py-20 relative overflow-hidden bg-slate-50">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 relative z-10">
          <h2 className="text-center text-3xl font-bold mb-16 text-foreground/90">Dúvidas Frequentes</h2>
          <div className="grid md:grid-cols-2 gap-x-12 gap-y-4">
            <div className="space-y-4">
              <Accordion type="single" collapsible className="w-full">
                {faqs.slice(0, 5).map((item, i) => (
                  <AccordionItem key={i} value={`item-${i}`} className="border rounded-xl px-4 bg-white/60">
                    <AccordionTrigger className="text-left font-semibold text-foreground/90">{item.q}</AccordionTrigger>
                    <AccordionContent className="text-muted-foreground">{item.a}</AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            </div>
            <div className="space-y-4">
              <Accordion type="single" collapsible className="w-full">
                {faqs.slice(5).map((item, i) => (
                  <AccordionItem key={i + 5} value={`item-${i + 5}`} className="border rounded-xl px-4 bg-white/60">
                    <AccordionTrigger className="text-left font-semibold text-foreground/90">{item.q}</AccordionTrigger>
                    <AccordionContent className="text-muted-foreground">{item.a}</AccordionContent>
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