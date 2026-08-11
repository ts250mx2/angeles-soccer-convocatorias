"use client";

import { useMemo, useState } from "react";
import AgentMarkdown from "@/components/AgentMarkdown";
import AgentBarChart from "@/components/AgentBarChart";
import {
  parseMarkdownTables, toChartData, exportAnswerToPdf, exportTablesToExcel,
} from "@/lib/agent-export";
import { FileDown, FileSpreadsheet, BarChart3, Loader2, CornerDownRight } from "lucide-react";
import { separarSugerencias } from "@/lib/agent-sugerencias";

/**
 * Respuesta del agente: markdown + gráfica automática (si los datos son
 * graficables) + exportación a PDF (siempre) y Excel (solo si hay tabla).
 */
export default function AgentAnswer({
  content,
  question,
  compact = false,
  onSugerencia,
  sugerenciasActivas = true,
}: {
  content: string;
  question: string;
  compact?: boolean;
  /** Si se provee, las preguntas de seguimiento se muestran y son clicables. */
  onSugerencia?: (pregunta: string) => void;
  /** false mientras el agente responde, para no encadenar preguntas. */
  sugerenciasActivas?: boolean;
}) {
  const [downloading, setDownloading] = useState<null | "pdf" | "excel">(null);

  /* Las sugerencias viajan dentro del texto; se separan antes de cualquier otra
     cosa para que no lleguen ni al markdown ni a las exportaciones. */
  const { texto, sugerencias } = useMemo(() => separarSugerencias(content), [content]);

  const tables = useMemo(() => parseMarkdownTables(texto), [texto]);
  const chart = useMemo(() => {
    for (const t of tables) {
      const c = toChartData(t);
      if (c) return c;
    }
    return null;
  }, [tables]);

  const [showChart, setShowChart] = useState(true);

  const doPdf = () => {
    setDownloading("pdf");
    try { exportAnswerToPdf(texto, question); } finally { setDownloading(null); }
  };

  const doExcel = async () => {
    setDownloading("excel");
    try { await exportTablesToExcel(tables, question); } finally { setDownloading(null); }
  };

  const btn = `flex items-center gap-1.5 rounded-lg border transition-all disabled:opacity-50 ${
    compact ? "px-2 py-1 text-[10px]" : "px-2.5 py-1.5 text-[11px]"
  } font-bold`;

  return (
    <div>
      <AgentMarkdown content={texto} compact={compact} />

      {chart && showChart && <AgentBarChart data={chart} compact={compact} />}

      <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
        <button onClick={doPdf} disabled={downloading !== null}
          className={`${btn} bg-blue-600/15 hover:bg-blue-600/25 border-blue-500/30 text-blue-200`}
          title={chart ? "Descargar en PDF (incluye tabla y gráfica)" : "Descargar esta respuesta en PDF"}>
          {downloading === "pdf" ? <Loader2 size={12} className="animate-spin" /> : <FileDown size={12} />}
          PDF
        </button>

        {tables.length > 0 && (
          <button onClick={doExcel} disabled={downloading !== null}
            className={`${btn} bg-emerald-600/15 hover:bg-emerald-600/25 border-emerald-500/30 text-emerald-200`}
            title="Descargar la tabla en Excel">
            {downloading === "excel" ? <Loader2 size={12} className="animate-spin" /> : <FileSpreadsheet size={12} />}
            Excel
          </button>
        )}

        {chart && (
          <button onClick={() => setShowChart((v) => !v)}
            className={`${btn} bg-white/5 hover:bg-white/10 border-white/10 text-slate-300`}
            title={showChart ? "Ocultar gráfica" : "Mostrar gráfica"}>
            <BarChart3 size={12} />
            {showChart ? "Ocultar gráfica" : "Ver gráfica"}
          </button>
        )}
      </div>

      {/* Preguntas de seguimiento: se envían con un clic. */}
      {onSugerencia && sugerencias.length > 0 && (
        <div className={`${compact ? "mt-2" : "mt-3"} border-t border-white/5 ${compact ? "pt-2" : "pt-2.5"}`}>
          <p className={`${compact ? "text-[8px]" : "text-[9px]"} font-black uppercase tracking-widest text-slate-500 mb-1.5`}>
            Seguir preguntando
          </p>
          <div className="flex flex-col gap-1">
            {sugerencias.map((s, i) => (
              <button
                key={i}
                type="button"
                onClick={() => onSugerencia(s)}
                disabled={!sugerenciasActivas}
                title="Enviar esta pregunta"
                className={`group flex items-start gap-1.5 text-left rounded-lg border border-white/10 bg-white/[0.03] hover:bg-blue-500/10 hover:border-blue-500/30 text-slate-300 hover:text-blue-200 transition-all disabled:opacity-40 disabled:cursor-not-allowed ${
                  compact ? "px-2 py-1 text-[10px]" : "px-2.5 py-1.5 text-[11px]"
                }`}
              >
                <CornerDownRight
                  size={compact ? 10 : 11}
                  className="flex-shrink-0 mt-[2px] text-slate-500 group-hover:text-blue-400 transition-colors"
                />
                <span>{s}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
