"use client";

import { useMemo, useState } from "react";
import AgentMarkdown from "@/components/AgentMarkdown";
import AgentBarChart from "@/components/AgentBarChart";
import {
  parseMarkdownTables, toChartData, exportAnswerToPdf, exportTablesToExcel,
} from "@/lib/agent-export";
import { FileDown, FileSpreadsheet, BarChart3, Loader2 } from "lucide-react";

/**
 * Respuesta del agente: markdown + gráfica automática (si los datos son
 * graficables) + exportación a PDF (siempre) y Excel (solo si hay tabla).
 */
export default function AgentAnswer({
  content,
  question,
  compact = false,
}: {
  content: string;
  question: string;
  compact?: boolean;
}) {
  const [downloading, setDownloading] = useState<null | "pdf" | "excel">(null);

  const tables = useMemo(() => parseMarkdownTables(content), [content]);
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
    try { exportAnswerToPdf(content, question); } finally { setDownloading(null); }
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
      <AgentMarkdown content={content} compact={compact} />

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
    </div>
  );
}
