/**
 * @fileoverview Step "Ofertas disponíveis" das jornadas FlowCredi (Financiamento Imobiliário e Home Equity)
 * @path src/features/financial-hub/components/products/flowcredi/FlowOffersStep.tsx
 *
 * Mostra as condições devolvidas pela simulação (`consults`) no padrão de
 * blocos do Cartão: um bloco por banco (produto de menor taxa), com logo,
 * tabela · juros e 1ª/última parcela. Clicar no bloco abre a gaveta "Detalhar"
 * (tabela de parcelas, só consulta). "Continuar" leva ao próximo step: o lead da
 * FlowCredi não leva banco, então o cliente não escolhe oferta.
 * Sem condição: mesmo estado de recusa de Veículos (Step2Confirm).
 */

import { useState } from "react";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BRL } from "@/features/financial-hub/components/shared/formatters";
import { useWizard } from "@/features/financial-hub/components/shared/WizardProvider";
import { useTheme } from "@/design-system/sbx-design-system-9f1c03/components/ThemeProvider";
import { DetailSheet } from "./DetailSheet";
import { BankLogo } from "./BankLogo";
import { pct, termLabel, FlowCondition, FlowConsult, FlowInputs, flowProductOf, propertyValueOf, isPosIPCA, conditionLabel, rateLabel, FlowWizardData, FlowParcela } from "./flowcredi.types";
import { STATUS } from "@/features/financial-hub/components/shared/types";

export function FlowOffersStep() {
  const { resolvedTheme } = useTheme();
  const nightMode = resolvedTheme === "dark";
  const { state, update, back } = useWizard<FlowWizardData>();
  const [detailOf, setDetailOf] = useState<FlowCondition | null>(null);

  const data = state?.data ?? {};
  const isHomeEquity = flowProductOf(data) === "home_equity";
  const propertyValue = propertyValueOf(data);
  const inputs: FlowInputs | undefined = data.flowSimulatedWith;
  const results: FlowConsult[] = data.flowResults ?? [];
  // Um bloco por banco: a condição que o gateway marcou como exibida (is_selected:
  // menor taxa do banco; empate → menor 1ª parcela), já com as parcelas mês a mês.
  const best = results.filter((r) => r.status_id === STATUS.COM_CONDICOES && r.is_selected && r.details);
  // Imóveis: menor 1ª parcela primeiro. Home equity (4 condições da FlowCredi): Price em cima,
  // SAC embaixo; pré-fixado à esquerda, pós-fixado à direita.
  const conditions = best
    .map((r) => r.details as FlowCondition)
    .sort((a, b) =>
      isHomeEquity
        ? (a.tabela === "PRICE" ? 0 : 1) - (b.tabela === "PRICE" ? 0 : 1) || Number(isPosIPCA(a)) - Number(isPosIPCA(b))
        : a.primeiraParcela - b.primeiraParcela,
    );
  const scheduleOf = (c: FlowCondition) => best.find((r) => r.details === c)?.installment_schedule ?? [];
  // Parcelas que já vieram na simulação, por condição (mesma chave da gaveta: idProduto|seguradora)
  const knownSchedules: Record<string, FlowParcela[]> = {};
  for (const r of results) {
    if (r.details && r.installment_schedule?.length) {
      knownSchedules[`${r.details.idProduto}|${r.details.seguradora?.id ?? ""}`] = r.installment_schedule;
    }
  }
  // Todas as condições do banco (consultáveis na gaveta), da menor taxa para a maior.
  const optionsOf = (c: FlowCondition) =>
    results
      .filter((r) => r.status_id === STATUS.COM_CONDICOES && r.details?.banco === c.banco)
      .map((r) => r.details as FlowCondition)
      .sort((a, b) => a.taxaJurosAnual - b.taxaJurosAnual || a.primeiraParcela - b.primeiraParcela);

  const handleContinue = () => {
    update({
      meta: { ...state.meta, step: Number(state.meta?.step ?? 0) + 1 },
      data: { ...data, flowInputs: inputs },
    });
  };

  // Sem condição: mesmo estado de recusa de Veículos
  if (conditions.length === 0) {
    return (
      <div className="w-full max-w-lg mx-auto space-y-10 animate-in fade-in duration-500">
        <div className="text-center py-8 space-y-6 flex flex-col items-center">
          <div className="w-36 h-36 flex items-center justify-center dark:bg-black">
            <img
              src={
                nightMode
                  ? "/assets/home/financiamentocreditonegada-dark-320.webp"
                  : "/assets/home/financiamentocreditonegada-320.webp"
              }
              alt="Nenhuma oferta disponível"
              className="w-full h-full object-contain relative"
            />
          </div>

          <div className="space-y-2 max-w-xs mx-auto">
            <h3 className="text-xl font-bold text-neutral-900 dark:text-neutral-100 tracking-tight">
              Nenhuma oferta disponível
            </h3>
            <p className="text-sm text-neutral-600 dark:text-neutral-400 leading-relaxed">
              No momento não encontramos condições para os dados informados.
            </p>
          </div>

          <div className="bg-neutral-50 dark:bg-neutral-900 px-4 py-2 border border-neutral-200 dark:border-neutral-800 rounded-none">
            <p className="text-[10px] font-bold uppercase tracking-widest text-neutral-500 dark:text-neutral-400">
              {isHomeEquity ? "Sugestão: reduza o prazo ou o valor do crédito." : "Sugestão: reduza o prazo ou o valor a financiar."}
            </p>
          </div>

          <Button
            variant="ghost"
            onClick={back}
            className="text-neutral-900 dark:text-neutral-100 hover:bg-neutral-100 dark:hover:bg-neutral-800 hover:text-neutral-900 dark:hover:text-neutral-100 transition-all rounded-none font-medium"
          >
            <ArrowLeft className="mr-2 h-4 w-4" /> Simular novamente
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full space-y-4 animate-in fade-in duration-500">
      {/* Mesmo estilo da descrição do WizardHeader (a frase depende da simulação) */}
      <p className="-mt-4 text-[13px] leading-snug text-neutral-600 dark:text-neutral-400">
        {isHomeEquity ? (
          <>
            {BRL(inputs?.requested_value)} de crédito em {inputs?.installments} meses.
          </>
        ) : (
          <>
            {BRL(Math.max(0, propertyValue - Number(inputs?.requested_value ?? 0)))} de entrada +{" "}
            {BRL(inputs?.requested_value)} financiados em {inputs?.installments} meses.
          </>
        )}
      </p>

      <div>
        {/* Blocos no padrão do Cartão */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-w-xl animate-in slide-in-from-bottom-4 fade-in duration-500 ease-out">
          {conditions.map((c) => (
            <button
              key={`${c.banco}-${c.idProduto}-${c.seguradora?.id}`}
              type="button"
              onClick={() => setDetailOf(c)}
              className="w-full flex flex-col items-start pl-4 pr-4 pt-2.5 pb-2 text-left bg-neutral-50 dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 rounded-none overflow-hidden hover:bg-neutral-100 dark:hover:bg-neutral-800 hover:border-neutral-900 dark:hover:border-neutral-100 transition-all focus-visible:ring-0 focus-visible:outline-none focus:border-neutral-900 dark:focus:border-neutral-100 hover:-translate-y-0.5 shadow-xs"
            >
              {/* Logo à esquerda (padrão do backoffice; cantos 10px por causa do logo do Inter) + tabela/taxa e "Ver detalhes" */}
              <div className="flex items-center gap-3">
                {!isHomeEquity && <BankLogo src={c.logoUrl} alt={c.banco} />}
                <div className="min-w-0">
                  {isHomeEquity ? (
                    <>
                      <p className="text-[13px] font-semibold text-neutral-900 dark:text-neutral-100">{conditionLabel(c, "home_equity")}</p>
                      <p className="text-xs font-medium text-neutral-700 dark:text-neutral-300">{rateLabel(c, "home_equity")}</p>
                    </>
                  ) : (
                    <p className="text-xs font-medium text-neutral-700 dark:text-neutral-300">
                      {c.tabela} · {pct(c.taxaJurosAnual)} a.a.
                    </p>
                  )}
                  <p className="text-xs font-semibold text-[#2246A7] dark:text-blue-400">Ver detalhes →</p>
                </div>
              </div>

              <div className="w-full h-px bg-neutral-200/70 dark:bg-neutral-700/70 mt-2.5 mb-2.5" />
              {c.tabela === "SAC" || isHomeEquity ? (
                <div className="grid grid-cols-2 gap-4 w-full">
                  <div className="min-w-0">
                    <p className="text-[10px] font-medium uppercase tracking-wider text-neutral-500 dark:text-neutral-400 whitespace-nowrap leading-none mb-0.5">
                      1ª parcela
                    </p>
                    <p className="text-[13px] font-bold tracking-tight text-brand-accent leading-tight">
                      {BRL(c.primeiraParcela)}
                    </p>
                  </div>
                  <div className="min-w-0">
                    <p className="text-[10px] font-medium uppercase tracking-wider text-neutral-500 dark:text-neutral-400 whitespace-nowrap leading-none mb-0.5">
                      Última parcela
                    </p>
                    <p className="text-[13px] font-medium tracking-tight text-neutral-600 dark:text-neutral-400 leading-tight">
                      {BRL(c.ultimaParcela)}
                    </p>
                  </div>
                </div>
              ) : (
                <div>
                  <p className="text-[10px] font-medium uppercase tracking-wider text-neutral-500 dark:text-neutral-400 whitespace-nowrap leading-none mb-0.5">
                    Parcela fixa
                  </p>
                  <p className="text-[13px] font-bold tracking-tight text-brand-accent leading-tight">
                    {BRL(c.primeiraParcela)}
                  </p>
                </div>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Ações: mesmo padrão do Auto Equity (Voltar · Continuar) */}
      <div className="flex flex-col-reverse sm:flex-row items-center justify-between gap-4 pt-1">
        <Button
          type="button"
          variant="ghost"
          onClick={back}
          className="w-full sm:w-auto rounded-none text-[#2246A7] hover:bg-[#E7F2FD] dark:hover:bg-neutral-800 hover:text-[#2246A7] font-medium"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Voltar
        </Button>
        <Button
          type="button"
          size="lg"
          onClick={handleContinue}
          className="h-12 w-full sm:w-auto flex-1 rounded-none cta-gradient text-white font-bold shadow-xs transition-all active:scale-[0.98]"
        >
          Continuar
        </Button>
      </div>

      <p className="text-[12px] text-neutral-400 dark:text-neutral-500 font-medium leading-relaxed">
        {isHomeEquity
          ? "* Valores de referência, sujeitos à análise de crédito e do imóvel. As parcelas já incluem seguros (MIP e DFI) e tarifa. No Price, juros e amortização ficam iguais e só o seguro varia; no SAC, as parcelas diminuem mês a mês. No pós-fixado, as parcelas são corrigidas pelo IPCA, que não está incluído na simulação. Registro e avaliação do imóvel não estão incluídos."
          : "* Valores de referência, sujeitos à análise de crédito e do imóvel pelo banco. A 1ª parcela é a maior do contrato e já inclui seguros (MIP e DFI) e tarifa; no SAC, as parcelas diminuem mês a mês. Mostramos a menor taxa de cada banco, que pode depender do seu relacionamento com ele. ITBI, registro e avaliação do imóvel não estão incluídos."}
      </p>

      <DetailSheet
        open={!!detailOf}
        onOpenChange={(o) => !o && setDetailOf(null)}
        condition={detailOf}
        schedule={detailOf ? scheduleOf(detailOf) : []}
        options={detailOf ? optionsOf(detailOf) : []}
        knownSchedules={knownSchedules}
        data={data}
        inputs={inputs ?? null}
        propertyValue={propertyValue}
      />
    </div>
  );
}
