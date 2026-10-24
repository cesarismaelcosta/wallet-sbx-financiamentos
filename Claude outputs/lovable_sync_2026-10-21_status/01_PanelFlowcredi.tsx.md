Crie o arquivo `src/features/financial-hub/components/shared/renderes/PanelFlowcredi.tsx` com exatamente o conteúdo abaixo. Não altere nada além deste arquivo e não rode formatação.

```
/**
 * @fileoverview Componente: PanelFlowcredi (Shared Renderer Backoffice)
 * @path src/features/financial-hub/components/shared/renderes/PanelFlowcredi.tsx
 *
 * Detalhe das simulações FlowCredi (parceiro 3) na aba lateral do backoffice, no lugar
 * do PanelSimulation: financiamento imobiliário, home equity e car equity.
 * - Pedido: o que o cliente informou (raw_payload.simulation_details).
 * - Garantia: simulation_collateral_home / simulation_collateral_vehicle.
 * - Condições por banco: a condição selecionada de cada banco em destaque e as demais
 *   recolhidas (simulation_consults.simulation_details.details).
 * - Lead: envio à FlowCredi (consulta com status Enviado).
 * Dados vindos de get_backoffice_simulation_details.
 *
 * @author César Ismael Pereira da Costa
 */

import { Building2 } from "lucide-react";
import { BRL } from "@/features/financial-hub/components/shared/formatters";
import { STATUS } from "@/features/financial-hub/components/shared/types";
import { BankLogo } from "@/features/financial-hub/components/shared/flowcredi/BankLogo";
import {
  FlowCondition,
  FlowProduct,
  conditionLabel,
  rateLabel,
  termLabel,
} from "@/features/financial-hub/components/shared/flowcredi/flowcredi.types";

const PRODUCT_BY_ID: Record<number, FlowProduct> = { 6: "home_equity", 7: "auto_equity" };

const Box = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <div className="rounded-none border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-4 space-y-3 break-inside-avoid shadow-xs">
    <div className="flex items-center border-b border-neutral-100 dark:border-neutral-800 pb-2">
      <h4 className="text-[11px] font-semibold uppercase tracking-wider text-neutral-900 dark:text-neutral-100 flex items-center gap-1.5">
        <Building2 size={14} className="text-neutral-900 dark:text-neutral-100" /> {title}
      </h4>
    </div>
    {children}
  </div>
);

const Field = ({ label, value }: { label: string; value: React.ReactNode }) => (
  <div className="flex flex-col min-w-0">
    <span className="text-[10px] font-medium uppercase tracking-wider text-neutral-400 dark:text-neutral-500">{label}</span>
    <span className="text-neutral-900 dark:text-neutral-100 font-medium text-xs mt-0.5 break-words">{value ?? "—"}</span>
  </div>
);

const yesNo = (v: unknown) => (v === true ? "Sim" : v === false ? "Não" : "—");
const money = (v: unknown) => (v === null || v === undefined || v === "" ? "—" : BRL(Number(v)));

export function PanelFlowcredi({ simulation }: { simulation: any }) {
  if (!simulation) return null;

  const product: FlowProduct = PRODUCT_BY_ID[Number(simulation.product_id)] ?? "mortgage";
  const raw = typeof simulation.raw_payload === "string" ? (() => { try { return JSON.parse(simulation.raw_payload); } catch { return {}; } })() : simulation.raw_payload ?? {};
  const inp = raw?.simulation_details ?? {};
  const offer = (simulation.simulation_offers ?? [])[0] ?? null;
  const consults: any[] = simulation.simulation_consults ?? [];
  const home = simulation.collateral_home;
  const vehicle = simulation.collateral_vehicle;

  // Condições por banco (só consultas com condição)
  const conditions = consults
    .filter((c) => c.status_id === STATUS.COM_CONDICOES && c.simulation_details?.details)
    .map((c) => ({ c, d: c.simulation_details.details as FlowCondition }));
  const banks = Array.from(new Set(conditions.map((x) => x.d.banco)));
  const lead = consults.find((c) => c.status_id === STATUS.ENVIADO);

  return (
    <div className="space-y-6">
      {/* Pedido */}
      <Box title="Pedido do cliente">
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {product === "mortgage" && (
            <>
              <Field label="Valor do imóvel" value={money(offer?.offer_value)} />
              <Field label="Entrada" value={money(offer?.offer_value != null && inp.requested_value != null ? Number(offer.offer_value) - Number(inp.requested_value) : null)} />
              <Field label="Valor financiado" value={money(inp.requested_value)} />
            </>
          )}
          {product !== "mortgage" && <Field label="Crédito pedido" value={money(inp.requested_value)} />}
          <Field label="Prazo" value={inp.installments ? `${inp.installments} meses (${termLabel(Number(inp.installments))})` : "—"} />
          <Field label="Renda bruta familiar" value={money(inp.monthly_income)} />
          {product === "auto_equity" && (
            <>
              <Field label="Motivo" value={inp.loan_purpose} />
              <Field label="Situação profissional" value={inp.professional_status} />
              <Field label="Profissão" value={inp.profession} />
              <Field label="Tempo na ocupação" value={inp.employment_years ? `${inp.employment_years} anos` : "—"} />
            </>
          )}
        </div>
      </Box>

      {/* Garantia */}
      {home && (
        <Box title="Garantia · Imóvel">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <Field label="Tipo" value={home.real_estate_type} />
            <Field label="Valor informado" value={money(home.estimated_value)} />
            <Field label="Cidade" value={[home.city, home.state].filter(Boolean).join("/") || "—"} />
            <Field label="Quitado" value={yesNo(home.is_debt_free)} />
            {home.is_debt_free === false && <Field label="Saldo devedor" value={money(home.debt_amount)} />}
          </div>
        </Box>
      )}
      {vehicle && (
        <Box title="Garantia · Veículo">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <Field label="Placa" value={[vehicle.license_plate, vehicle.licensing_state].filter(Boolean).join(" · ")} />
            <Field label="Veículo" value={[vehicle.brand, vehicle.model].filter(Boolean).join(" ") || "—"} />
            <Field label="Ano" value={[vehicle.manufacture_year, vehicle.model_year].filter(Boolean).join("/") || "—"} />
            <Field label="Portas" value={vehicle.doors} />
            <Field label="Valor informado" value={money(vehicle.declared_value)} />
            <Field label="No nome do cliente" value={vehicle.kinship_degree === "SELF" ? "Sim" : vehicle.kinship_degree ? "Não" : "—"} />
            <Field label="Quitado" value={yesNo(vehicle.is_debt_free)} />
            {vehicle.is_debt_free === false && <Field label="Saldo devedor" value={money(vehicle.debt_amount)} />}
          </div>
        </Box>
      )}

      {/* Condições por banco */}
      {banks.length > 0 && (
        <Box title={`Condições encontradas · ${banks.length} ${banks.length === 1 ? "banco" : "bancos"}`}>
          <div className="space-y-3">
            {banks.map((bank) => {
              const list = conditions.filter((x) => x.d.banco === bank);
              const main = list.find((x) => x.c.is_selected) ?? list[0];
              const others = list.filter((x) => x !== main);
              const logo = main.c.financial_institutions?.logo_url ?? main.d.logoUrl ?? null;
              return (
                <div key={bank} className="border border-neutral-200 dark:border-neutral-800 p-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <BankLogo src={logo} alt={bank} />
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-neutral-900 dark:text-neutral-100 truncate">{bank}</p>
                      <p className="text-[11px] text-neutral-500 dark:text-neutral-400 truncate">
                        {conditionLabel(main.d, product)} · {rateLabel(main.d, product)}
                      </p>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <Field label="1ª parcela" value={money(main.d.primeiraParcela)} />
                    <Field label="Última parcela" value={money(main.d.ultimaParcela)} />
                    <Field label="Prazo" value={main.c.installments ? `${main.c.installments} meses` : "—"} />
                  </div>
                  {others.length > 0 && (
                    <details className="text-[11px] text-neutral-600 dark:text-neutral-400">
                      <summary className="cursor-pointer select-none">
                        Outras condições do banco ({others.length})
                      </summary>
                      <ul className="mt-2 space-y-1">
                        {others.map(({ c, d }) => (
                          <li key={c.id} className="flex justify-between gap-2">
                            <span className="truncate">
                              {conditionLabel(d, product)} · {rateLabel(d, product)}
                            </span>
                            <span className="shrink-0">
                              {money(d.primeiraParcela)} → {money(d.ultimaParcela)}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </details>
                  )}
                </div>
              );
            })}
          </div>
        </Box>
      )}

      {/* Lead */}
      {lead && (
        <Box title="Lead · FlowCredi">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Enviado em" value={lead.created_at ? new Date(lead.created_at).toLocaleString("pt-BR") : "—"} />
            <Field label="Referência (refId)" value={<span className="font-mono break-all">{lead.external_operation_id ?? "—"}</span>} />
          </div>
        </Box>
      )}
    </div>
  );
}

```
