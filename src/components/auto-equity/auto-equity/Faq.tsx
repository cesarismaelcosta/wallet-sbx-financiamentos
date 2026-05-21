import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

const faqs = [
  {
    q: "Posso continuar usando meu carro?",
    a: "Sim. O veículo fica apenas como garantia (alienação fiduciária). Você continua usando normalmente durante todo o contrato.",
  },
  {
    q: "Quais veículos são aceitos?",
    a: "Carros de passeio com até 20 anos, em nome do solicitante ou do cônjuge, quitados e com documentação em dia.",
  },
  {
    q: "Qual a taxa e o prazo máximo?",
    a: "Taxas a partir de 1,89% ao mês, com prazos de 12 a 60 meses. As condições finais dependem da análise do seu perfil.",
  },
  {
    q: "Em quanto tempo o crédito cai na conta?",
    a: "Após a aprovação e a assinatura do contrato, o valor costuma ser liberado em até 5 dias úteis.",
  },
  {
    q: "O carro precisa estar quitado?",
    a: "Sim. O veículo dado em garantia precisa estar totalmente quitado e sem restrições.",
  },
  {
    q: "Posso quitar antecipadamente?",
    a: "Sim, a qualquer momento e com desconto proporcional dos juros futuros, conforme regulamentação do Bacen.",
  },
  {
    q: "Quem é a instituição financeira?",
    a: "Operamos em parceria com a Creditas e instituições financeiras autorizadas pelo Banco Central.",
  },
  {
    q: "É seguro compartilhar meus dados?",
    a: "Sim. Seguimos a LGPD e usamos seus dados apenas para análise de crédito e formalização da proposta.",
  },
];

export function Faq() {
  return (
    <section id="duvidas" className="scroll-mt-24 bg-muted/30 py-16 sm:py-20">
      <div className="mx-auto max-w-3xl px-4">
        <div className="mb-10 text-center">
          <p className="text-xs font-semibold uppercase tracking-wider text-primary">Dúvidas</p>
          <h2 className="mt-2 text-3xl font-semibold text-foreground sm:text-4xl">
            Perguntas frequentes
          </h2>
        </div>

        <Accordion type="single" collapsible className="space-y-2">
          {faqs.map((f, i) => (
            <AccordionItem
              key={f.q}
              value={`item-${i}`}
              className="overflow-hidden rounded-xl border border-border bg-card px-4"
            >
              <AccordionTrigger className="text-left text-sm font-medium text-foreground hover:no-underline">
                {f.q}
              </AccordionTrigger>
              <AccordionContent className="text-sm text-muted-foreground">{f.a}</AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>
    </section>
  );
}
