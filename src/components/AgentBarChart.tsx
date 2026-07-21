"use client";

import type { ChartData } from "@/lib/agent-export";

/**
 * Barras horizontales para "magnitud por categoría" — la forma correcta para los
 * resultados tabulares del agente (comparar un measure entre categorías).
 *
 * Decisiones de diseño (dataviz):
 *  - UNA sola serie ⇒ un solo hue (el color no codifica identidad, la longitud sí),
 *    por eso no aplica la validación CVD de pares categóricos adyacentes.
 *  - Sin leyenda: una sola serie, el título nombra la medida.
 *  - Extremo de dato redondeado (4px) y anclado a la línea base; marcas delgadas.
 *  - Ejes/grid recesivos; etiquetas de valor directas en cada barra.
 *  - La tabla markdown queda justo arriba y hace de "table view" accesible.
 */
const MAX_BARS = 12;

const fmtValue = (raw: string, value: number) => {
  const trimmed = raw.trim();
  // Conserva el formato original ($, %) si lo traía; si no, formatea el número
  if (/[$%]/.test(trimmed)) return trimmed;
  return value.toLocaleString("es-MX", { maximumFractionDigits: 2 });
};

export default function AgentBarChart({ data, compact = false }: { data: ChartData; compact?: boolean }) {
  const sorted = [...data.points].sort((a, b) => b.value - a.value);
  const shown = sorted.slice(0, MAX_BARS);
  const hidden = sorted.length - shown.length;

  const max = Math.max(...shown.map((p) => Math.abs(p.value)), 0);
  if (max <= 0) return null;

  const total = data.points.reduce((s, p) => s + p.value, 0);

  return (
    <figure className={`my-3 rounded-2xl border border-white/10 bg-white/[0.03] ${compact ? "p-3" : "p-4"}`}>
      <figcaption className="flex items-baseline justify-between gap-3 mb-3">
        <span className={`${compact ? "text-[11px]" : "text-xs"} font-black text-white uppercase tracking-widest`}>
          {data.measure}
        </span>
        <span className="text-[10px] text-slate-500 tabular-nums">
          Total {total.toLocaleString("es-MX", { maximumFractionDigits: 2 })}
        </span>
      </figcaption>

      <div className="space-y-2">
        {shown.map((p, i) => {
          const pct = (Math.abs(p.value) / max) * 100;
          return (
            <div key={`${p.label}-${i}`} className="group">
              <div className="flex items-baseline justify-between gap-3 mb-1">
                <span className={`${compact ? "text-[10px]" : "text-[11px]"} text-slate-300 truncate min-w-0`} title={p.label}>
                  {p.label}
                </span>
                {/* Etiqueta directa: evita depender del eje para leer el valor */}
                <span className={`${compact ? "text-[10px]" : "text-[11px]"} font-black text-white tabular-nums flex-shrink-0`}>
                  {fmtValue(p.raw, p.value)}
                </span>
              </div>
              {/* Carril recesivo + barra delgada anclada a la izquierda */}
              <div className="h-2 w-full rounded-full bg-white/[0.06] overflow-hidden">
                <div
                  className="h-full rounded-r-[4px] bg-blue-500 transition-all duration-500 group-hover:bg-blue-400"
                  style={{ width: `${Math.max(pct, 1.5)}%` }}
                  title={`${p.label}: ${fmtValue(p.raw, p.value)}`}
                />
              </div>
            </div>
          );
        })}
      </div>

      {hidden > 0 && (
        <p className="mt-3 text-[10px] text-slate-500">
          Mostrando los {MAX_BARS} mayores de {sorted.length}. La tabla de arriba tiene el detalle completo.
        </p>
      )}
    </figure>
  );
}
