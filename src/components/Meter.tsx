"use client";

/**
 * Medidor de una razón contra un total (inscritos / activos).
 *
 * Es la forma correcta para "una sola razón contra un límite": un carril recesivo
 * con un relleno de un solo tono, en vez de una dona de dos rebanadas. El valor
 * siempre va como etiqueta directa, así que nunca depende del color para leerse.
 */
export default function Meter({
  valor,
  total,
  etiqueta,
  size = "sm",
}: {
  valor: number;
  total: number;
  /** Texto corto bajo el medidor; si se omite se muestra "valor de total". */
  etiqueta?: string;
  size?: "sm" | "xs";
}) {
  const pct = total > 0 ? Math.min(100, Math.round((valor / total) * 100)) : 0;
  const alto = size === "xs" ? "h-1.5" : "h-2";
  const textoPct = size === "xs" ? "text-[11px]" : "text-sm";

  return (
    <div>
      <div className="flex items-baseline justify-between gap-2 mb-1">
        <span className={`${textoPct} font-black text-emerald-400 tabular-nums`}>{pct}%</span>
        <span className="text-[9px] text-slate-500 tabular-nums">
          {etiqueta ?? `${valor} de ${total}`}
        </span>
      </div>
      <div
        className={`${alto} w-full rounded-full bg-white/10 overflow-hidden`}
        role="img"
        aria-label={`${pct}% — ${valor} de ${total}`}
      >
        <div
          className={`${alto} rounded-full bg-emerald-400 transition-[width] duration-500`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
