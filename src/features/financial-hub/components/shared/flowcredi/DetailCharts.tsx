/**
 * @fileoverview Gráficos da gaveta de detalhes (Financiamento Imobiliário · FlowCredi)
 * @path src/features/financial-hub/components/products/financial/imoveis/DetailCharts.tsx
 *
 * 1. Evolução do saldo devedor (área, uma série).
 * 2. Composição da parcela (áreas empilhadas: amortização, juros, seguros e tarifa).
 * Um ponto por ano (1ª parcela de cada ano + a última), a partir da tabela da FlowCredi.
 * Paleta em tons de azul da marca (validada no dataviz: separação OK; o tom claro
 * tem contraste baixo com o fundo, compensado por legenda, filete branco entre
 * camadas, tooltip e a tabela logo abaixo).
 */

import { useMemo } from "react";
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip } from "recharts";
import { BRL } from "@/features/financial-hub/components/shared/formatters";
import { FlowParcela } from "./flowcredi.types";
import { useTheme } from "@/design-system/sbx-design-system-9f1c03/components/ThemeProvider";

const C_SALDO = "#2246A7";
const C_AMORT = "#1E3F96";
const C_JUROS = "#4F7BD8";
const C_SEG = "#9DB8EC";

const money = (v: number) => (v >= 1000 ? `R$ ${Math.round(v / 1000)} mil` : `R$ ${Math.round(v)}`);

interface Point {
  ano: number;
  saldo: number;
  amortizacao: number;
  juros: number;
  seguros: number;
}

const Box = ({ title, sub, children }: { title: string; sub: string; children: React.ReactNode }) => (
  <div className="border border-neutral-200 dark:border-neutral-800 px-3.5 pt-3 pb-2.5">
    <p className="text-xs font-bold text-neutral-900 dark:text-neutral-100">{title}</p>
    <p className="text-[11px] text-neutral-500 dark:text-neutral-400 mb-2">{sub}</p>
    {children}
  </div>
);

const TipBox = ({ children }: { children: React.ReactNode }) => (
  <div className="bg-neutral-900 text-white text-[11px] px-2.5 py-1.5 leading-snug shadow-md">{children}</div>
);

export function DetailCharts({ parcelas }: { parcelas: FlowParcela[] }) {
  const data: Point[] = useMemo(() => {
    const out: Point[] = [];
    parcelas.forEach((p, idx) => {
      if (idx % 12 === 0 || idx === parcelas.length - 1) {
        out.push({
          ano: Math.floor(idx / 12) + 1,
          saldo: p.saldoDevedor,
          amortizacao: p.amortizacao,
          juros: p.juros,
          seguros: p.mip + p.dfi + p.tac,
        });
      }
    });
    return out;
  }, [parcelas]);

  const { resolvedTheme } = useTheme();
  const nightMode = resolvedTheme === "dark";
  const gridStroke = nightMode ? "#262626" : "#e5e5e5";
  const surface = nightMode ? "#0a0a0a" : "#fff"; // separa as áreas empilhadas e contorna o ponto ativo
  const saldoColor = nightMode ? C_JUROS : C_SALDO;

  if (data.length < 2) return null;
  const lastYear = data[data.length - 1].ano;
  const ticks = [1, Math.round(lastYear / 4), Math.round(lastYear / 2), Math.round((lastYear * 3) / 4), lastYear].filter(
    (v, i, a) => v >= 1 && a.indexOf(v) === i,
  );
  const axisProps = { tick: { fontSize: 10, fill: "#737373" }, tickLine: false, axisLine: false } as const;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-6">
      <Box title="Evolução do saldo devedor" sub="quanto falta pagar ao longo do contrato">
        <div className="h-44">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 6, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke={gridStroke} />
              <XAxis dataKey="ano" ticks={ticks} tickFormatter={(v) => `ano ${v}`} {...axisProps} />
              <YAxis width={66} tickFormatter={money} {...axisProps} />
              <Tooltip
                cursor={{ stroke: "#a3a3a3", strokeDasharray: "3 3" }}
                content={({ active, payload }) =>
                  active && payload?.length ? (
                    <TipBox>
                      Ano {payload[0].payload.ano}
                      <br />
                      <strong>Saldo {BRL(payload[0].payload.saldo)}</strong>
                    </TipBox>
                  ) : null
                }
              />
              <Area
                type="linear"
                dataKey="saldo"
                stroke={saldoColor}
                strokeWidth={2}
                fill={saldoColor}
                fillOpacity={nightMode ? 0.22 : 0.12}
                activeDot={{ r: 4.5, stroke: surface, strokeWidth: 2, fill: saldoColor }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </Box>

      <Box title="Composição da parcela" sub="quanto de cada parcela vai para amortização, juros e seguros">
        <div className="h-44">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 6, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke={gridStroke} />
              <XAxis dataKey="ano" ticks={ticks} tickFormatter={(v) => `ano ${v}`} {...axisProps} />
              <YAxis width={66} tickFormatter={money} {...axisProps} />
              <Tooltip
                cursor={{ stroke: "#a3a3a3", strokeDasharray: "3 3" }}
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const p = payload[0].payload as Point;
                  return (
                    <TipBox>
                      Ano {p.ano} · parcela {BRL(p.amortizacao + p.juros + p.seguros)}
                      <br />
                      Amortização {BRL(p.amortizacao)}
                      <br />
                      Juros {BRL(p.juros)}
                      <br />
                      Seguros e tarifa {BRL(p.seguros)}
                    </TipBox>
                  );
                }}
              />
              <Area type="linear" dataKey="amortizacao" stackId="p" stroke={surface} strokeWidth={1.5} fill={C_AMORT} fillOpacity={1} />
              <Area type="linear" dataKey="juros" stackId="p" stroke={surface} strokeWidth={1.5} fill={C_JUROS} fillOpacity={1} />
              <Area type="linear" dataKey="seguros" stackId="p" stroke={surface} strokeWidth={1.5} fill={C_SEG} fillOpacity={1} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
        <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1.5 text-[11px] text-neutral-600 dark:text-neutral-400">
          {[
            ["Amortização", C_AMORT],
            ["Juros", C_JUROS],
            ["Seguros e tarifa", C_SEG],
          ].map(([l, c]) => (
            <span key={l} className="inline-flex items-center gap-1.5">
              <i className="inline-block h-2.5 w-2.5" style={{ background: c }} />
              {l}
            </span>
          ))}
        </div>
      </Box>
    </div>
  );
}
