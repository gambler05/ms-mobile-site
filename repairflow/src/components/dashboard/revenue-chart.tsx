"use client";
import { useId, useState } from "react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { fmtMoney } from "@/lib/format";
import type { Locale } from "@/i18n/types";
import { INTL_LOCALE } from "@/i18n/types";

interface Point { date: string; salesCents: number; repairsCents: number; settledCents: number }

/**
 * Graphique de chiffre d'affaires : trois séries lisibles séparément (aires fines, non empilées),
 * survol avec infobulle, résumé textuel et tableau accessible.
 */
export function RevenueChart({ data, labels, locale, summary }: { data: Point[]; labels: { sales: string; repairs: string; settled: string }; locale: Locale; summary: string }) {
  const id = useId();
  const [showTable, setShowTable] = useState(false);
  const fmtDay = (d: string) => new Intl.DateTimeFormat(INTL_LOCALE[locale], { day: "numeric", month: "short" }).format(new Date(d));
  const series = [
    { key: "salesCents", label: labels.sales, color: "var(--chart-1)" },
    { key: "repairsCents", label: labels.repairs, color: "var(--chart-2)" },
    { key: "settledCents", label: labels.settled, color: "var(--chart-3)" },
  ] as const;
  return (
    <div>
      <div className="h-[240px] w-full" role="img" aria-label={summary}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 8, right: 4, bottom: 0, left: 0 }}>
            <defs>
              {series.map((s) => (
                <linearGradient key={s.key} id={`${id}-${s.key}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={s.color} stopOpacity={0.18} />
                  <stop offset="100%" stopColor={s.color} stopOpacity={0} />
                </linearGradient>
              ))}
            </defs>
            <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
            <XAxis dataKey="date" tickFormatter={fmtDay} tick={{ fill: "var(--fg-subtle)", fontSize: 11 }} axisLine={false} tickLine={false} minTickGap={28} />
            <YAxis domain={[0, "auto"]} allowDataOverflow={false} tickFormatter={(v: number) => `${Math.round(v / 100)}`} tick={{ fill: "var(--fg-subtle)", fontSize: 11 }} axisLine={false} tickLine={false} width={40} />
            <Tooltip
              cursor={{ stroke: "var(--border-strong)", strokeDasharray: "3 3" }}
              content={({ active, payload, label }) =>
                active && payload?.length ? (
                  <div className="glass rounded-[var(--radius-sm)] px-3 py-2 text-[12px] shadow-[var(--shadow-2)]">
                    <div className="mb-1 font-medium">{fmtDay(String(label))}</div>
                    {payload.map((p) => (
                      <div key={String(p.dataKey)} className="flex items-center justify-between gap-4">
                        <span className="flex items-center gap-1.5 text-muted"><span className="size-2 rounded-full" style={{ background: p.color }} />{series.find((s) => s.key === p.dataKey)?.label}</span>
                        <span className="tnum font-medium">{fmtMoney(Number(p.value), locale)}</span>
                      </div>
                    ))}
                  </div>
                ) : null
              }
            />
            {series.map((s) => (
              <Area key={s.key} type="linear" dataKey={s.key} stroke={s.color} strokeWidth={2} fill={`url(#${id}-${s.key})`} dot={false} activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--surface)" }} isAnimationActive={false} />
            ))}
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-2 flex items-center justify-between">
        <p className="text-[11.5px] text-subtle">{summary}</p>
        <button type="button" onClick={() => setShowTable((v) => !v)} className="text-[11.5px] text-accent hover:underline" aria-expanded={showTable}>
          {showTable ? "Masquer le tableau" : "Tableau des données"}
        </button>
      </div>
      {showTable ? (
        <table className="mt-2 w-full text-[12px]">
          <thead><tr className="text-start text-subtle"><th className="py-1 text-start font-medium">Date</th>{series.map((s) => <th key={s.key} className="py-1 text-end font-medium">{s.label}</th>)}</tr></thead>
          <tbody>
            {data.filter((d) => d.salesCents || d.repairsCents || d.settledCents).map((d) => (
              <tr key={d.date} className="border-t border-border"><td className="py-1">{fmtDay(d.date)}</td>{series.map((s) => <td key={s.key} className="tnum py-1 text-end">{fmtMoney(d[s.key], locale)}</td>)}</tr>
            ))}
          </tbody>
        </table>
      ) : null}
    </div>
  );
}
