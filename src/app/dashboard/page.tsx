"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useUser } from "@/contexts/user-context";
import DashboardLayout from "@/components/DashboardLayout";
import {
  DollarSign, CreditCard, Users, TrendingUp, TrendingDown,
  Calendar, BarChart3, RefreshCw, Trophy, Target, MapPin, X,
  ExternalLink, ChevronRight, Search, FileText, Download
} from "lucide-react";

type Period = "today" | "yesterday" | "week" | "month" | "custom";

interface KPIData {
  totalRecaudado: number;
  totalPagos: number;
  jugadoresUnicos: number;
  promedioPago: number;
}
interface RowData { 
  IdLiga?: number; 
  Liga?: string; 
  IdSede?: number; 
  Sede?: string; 
  Categoria?: string; 
  Pagos: number; 
  Jugadores?: number; 
  Total: number; 
  PagosReg?: number;
  JugadoresReg?: number;
  TotalReg?: number;
}
interface TimelineEntry { Fecha: string; Pagos: number; Total: number; }
interface DashboardData {
  period: Period;
  dateFrom: string | null;
  dateTo: string | null;
  season: { IdTemporada: number; Temporada: string } | null;
  kpi: KPIData;
  byLeague: RowData[];
  bySede: RowData[];
  byCategory: RowData[];
  timeline: TimelineEntry[];
  seasonSummary: { TotalPagosTemporada: number; JugadoresTemporada: number; TotalTemporada: number; };
  /** Avance de la temporada: recaudación mes a mes y comparativo con la anterior. */
  seasonProgress?: {
    mesesTranscurridos: number;
    mesesTotales: number;
    /** code = Anio*100+Mes del cobro. */
    porMes: { code: number; total: number }[];
    comparativo: {
      temporadaAnterior: string;
      mesesComparados: number;
      actual: number;
      anterior: number;
      variacionPct: number | null;
    } | null;
  } | null;
  breakdown?: { IdSedePago: number; IdSedeJugador: number; SedeJugador: string; Jugadores: number; Pagos: number; Total: number; }[];
  productBySede?: { IdSedePago: number; IdTipoProducto: number; TipoProducto: string; Pagos: number; Jugadores: number; Total: number; }[];
  productDetailBySede?: { IdSedePago: number; IdTipoProducto: number; IdProducto: number; Producto: string; Pagos: number; Jugadores: number; Total: number; }[];
}

interface PaymentDetail {
  IdPago: number;
  Pago: number;
  FechaPago: string;
  Recibo: string;
  IdJugador?: number;
  Jugador: string;
  Categoria: string;
  Liga: string;
  Sede: string;
  SedeJugador?: string;
  IdSedeJugador?: number;
  Producto: string;
}

const PERIODS: { key: Period; label: string }[] = [
  { key: "today", label: "Hoy" },
  { key: "yesterday", label: "Ayer" },
  { key: "week", label: "Esta Semana" },
  { key: "month", label: "Este Mes" },
  { key: "custom", label: "Fechas..." },
];

const BAR_COLORS = [
  "from-blue-600 to-blue-400",
  "from-emerald-600 to-emerald-400",
  "from-purple-600 to-purple-400",
  "from-amber-600 to-amber-400",
  "from-rose-600 to-rose-400",
  "from-cyan-600 to-cyan-400",
];

const fmt = (n: number) =>
  new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(n);
const fmtC = (n: number) =>
  new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", notation: "compact", maximumFractionDigits: 1 }).format(n);
/** Cifra completa sin centavos: para montos que deben poder cuadrarse contra otro reporte. */
const fmt0 = (n: number) =>
  new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 0 }).format(n);

const MESES_CORTOS = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
/** Etiqueta de un código Anio*100+Mes. */
const mesLabel = (code: number) => MESES_CORTOS[(code % 100) - 1] ?? "";

/**
 * Avance de la temporada: recaudación mes a mes (una barra por mes de cobro) y
 * comparativo contra la temporada anterior a la misma altura.
 *
 * Serie única, así que no lleva leyenda: el título la nombra. El mes en curso se
 * resalta con un tono más claro del MISMO azul y además lleva su etiqueta en la
 * base, para que no dependa solo del color.
 */
function SeasonProgress({ progreso }: {
  progreso: NonNullable<DashboardData["seasonProgress"]>;
}) {
  const { porMes, mesesTranscurridos, mesesTotales, comparativo } = progreso;
  if (porMes.length === 0) return null;

  const hoy = new Date();
  const codeActual = hoy.getFullYear() * 100 + (hoy.getMonth() + 1);
  const max = Math.max(...porMes.map((m) => m.total), 1);
  const pctTranscurrido = mesesTotales > 0
    ? Math.round((mesesTranscurridos / mesesTotales) * 100)
    : null;

  return (
    <div className="mt-4 pt-3 border-t border-white/5">
      <div className="flex justify-between items-baseline mb-2 gap-2">
        <span className="text-[9px] uppercase font-black text-slate-500 tracking-wider">Recaudación por mes</span>
        {pctTranscurrido !== null && (
          <span className="text-[9px] text-slate-500 whitespace-nowrap">
            Mes <span className="font-black text-slate-300">{mesesTranscurridos}</span> de {mesesTotales}
            <span className="text-slate-600"> · {pctTranscurrido}% transcurrido</span>
          </span>
        )}
      </div>

      <div className="flex items-end gap-[2px] h-14">
        {porMes.map((m) => {
          const esActual = m.code === codeActual;
          // Mínimo visible para que un mes con poco cobro no desaparezca.
          const pct = Math.max((m.total / max) * 100, 3);
          return (
            <div key={m.code} className="flex-1 flex flex-col items-center gap-1 min-w-0">
              <div
                title={`${mesLabel(m.code)} ${Math.floor(m.code / 100)}: ${fmt(m.total)}`}
                className={`w-full rounded-t transition-opacity hover:opacity-100 ${
                  esActual ? 'bg-blue-400 opacity-100' : 'bg-blue-600 opacity-80'
                }`}
                style={{ height: `${pct}%` }}
              />
            </div>
          );
        })}
      </div>
      {/* Etiquetas selectivas: primer mes, último y el mes en curso. */}
      <div className="flex gap-[2px] mt-1">
        {porMes.map((m, i) => {
          const esActual = m.code === codeActual;
          const mostrar = esActual || i === 0 || i === porMes.length - 1;
          return (
            <span
              key={m.code}
              className={`flex-1 text-center text-[7px] leading-none truncate ${
                esActual ? 'font-black text-blue-400' : 'text-slate-600'
              }`}
            >
              {mostrar ? mesLabel(m.code) : ''}
            </span>
          );
        })}
      </div>

      {comparativo && (
        <div className="mt-3 pt-2.5 border-t border-white/5">
          <p className="text-[9px] uppercase font-black text-slate-500 tracking-wider mb-1.5">
            vs {comparativo.temporadaAnterior}
            <span className="text-slate-600 normal-case tracking-normal font-medium">
              {' '}· primeros {comparativo.mesesComparados} {comparativo.mesesComparados === 1 ? 'mes' : 'meses'}
            </span>
          </p>
          <div className="flex items-end justify-between gap-2">
            <div className="min-w-0">
              <p className="text-sm font-black text-white leading-none">{fmtC(comparativo.actual)}</p>
              <p className="text-[9px] text-slate-500 mt-1 truncate">antes {fmtC(comparativo.anterior)}</p>
            </div>
            {comparativo.variacionPct === null ? (
              <span className="text-[10px] font-bold text-slate-500">Sin comparativo</span>
            ) : (
              <span
                title={`${fmt(comparativo.actual)} vs ${fmt(comparativo.anterior)} a la misma altura de la temporada`}
                className={`flex items-center gap-1 text-xs font-black px-2 py-0.5 rounded-lg border whitespace-nowrap ${
                  comparativo.variacionPct >= 0
                    ? 'text-emerald-300 bg-emerald-500/10 border-emerald-500/25'
                    : 'text-rose-300 bg-rose-500/10 border-rose-500/25'
                }`}
              >
                {comparativo.variacionPct >= 0 ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
                {comparativo.variacionPct >= 0 ? '+' : ''}{comparativo.variacionPct.toFixed(1)}%
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Acumulado de la temporada activa. Es la única tarjeta que NO responde al selector
 * de período, de ahí el badge; cada renglón lleva su aclaración porque son los
 * números que más se confundían con los KPIs de período y con la plantilla.
 */
function SeasonCard({ data }: { data: DashboardData | null }) {
  const renglones = [
    {
      label: "Recaudado",
      hint: "Todo el dinero cobrado en la temporada: inscripciones, mensualidades, copas, ligas y ventas. No depende del período de arriba.",
      title: `Suma de todos los pagos vigentes registrados en esta temporada, sin importar la fecha de cobro.\nExacto: ${fmt(data?.seasonSummary.TotalTemporada ?? 0)}`,
      val: fmt0(data?.seasonSummary.TotalTemporada ?? 0),
      color: "text-white",
    },
    {
      label: "Transacciones",
      hint: "Recibos capturados. Los cancelados no cuentan.",
      title: "Número de recibos vigentes de la temporada. Un recibo puede cubrir varios conceptos.",
      val: (data?.seasonSummary.TotalPagosTemporada ?? 0).toLocaleString("es-MX"),
      color: "text-emerald-400",
    },
    {
      label: "Jugadores con pagos",
      hint: "Jugadores distintos que han pagado algo. No es la plantilla ni los inscritos.",
      title: "Jugadores distintos con al menos un pago vigente en la temporada. Para plantilla e inscritos usa Inscripciones por Sede.",
      val: (data?.seasonSummary.JugadoresTemporada ?? 0).toLocaleString("es-MX"),
      color: "text-purple-400",
    },
  ];

  return (
    <div className="bg-gradient-to-br from-slate-800/50 to-slate-900/50 border border-white/10 rounded-2xl p-5 flex flex-col justify-between">
      <div>
        <div className="flex items-center gap-2 mb-4">
          <div className="bg-blue-500/10 p-2 rounded-xl border border-blue-500/10"><Trophy size={16} className="text-blue-400" /></div>
          <div className="min-w-0">
            <p className="text-xs font-black text-white">Acumulado de la temporada</p>
            <p className="text-[10px] text-slate-500 truncate">{data?.season?.Temporada || "Actual"}</p>
          </div>
          <span
            title="Esta tarjeta no responde al selector de período: siempre muestra la temporada completa"
            className="ml-auto text-[8px] font-black text-slate-400 uppercase tracking-widest bg-white/5 px-2 py-0.5 rounded-full border border-white/10 whitespace-nowrap"
          >
            Toda la temporada
          </span>
        </div>
        <div className="space-y-1">
          {renglones.map(item => (
            <div key={item.label} title={item.title} className="flex justify-between items-start gap-3 py-2 border-b border-white/5 last:border-0">
              <div className="min-w-0">
                <p className="text-[11px] text-slate-300 font-bold leading-none">{item.label}</p>
                <p className="text-[9px] text-slate-500 leading-snug mt-1">{item.hint}</p>
              </div>
              <span className={`text-sm font-black ${item.color} whitespace-nowrap flex-shrink-0`}>{item.val}</span>
            </div>
          ))}
        </div>
      </div>
      {data?.seasonProgress && <SeasonProgress progreso={data.seasonProgress} />}
    </div>
  );
}

// Reusable horizontal bar section
function BarSection({ title, icon, data, labelKey, colorBase, period, onClickItem }: {
  title: string; icon: React.ReactNode; data: RowData[]; labelKey: keyof RowData; colorBase?: string; period: string;
  onClickItem?: (item: RowData) => void;
}) {
  const max = Math.max(...data.map((d) => d.Total), 1);
  return (
    <div className="bg-white/5 border border-white/10 rounded-2xl p-5">
      <div className="flex items-center gap-2 mb-4">
        <div className="bg-white/10 p-1.5 rounded-lg border border-white/10">{icon}</div>
        <h3 className="text-sm font-black text-white">{title}</h3>
        <span className="text-[10px] text-slate-500 ml-auto">{period}</span>
      </div>
      {data.length === 0 ? (
        <div className="py-10 text-center text-slate-500 text-sm">Sin datos para este período</div>
      ) : (
        <div className="space-y-3">
          {data.map((row, i) => {
            const label = String(row[labelKey] ?? "—");
            const pct = (row.Total / max) * 100;
            const color = colorBase ?? BAR_COLORS[i % BAR_COLORS.length];
            return (
              <div 
                key={label + i} 
                className="group cursor-pointer"
                onClick={() => onClickItem?.(row)}
              >
                <div className="flex justify-between items-center mb-1">
                  <div className="flex items-center gap-2">
                    <div className={`w-2 h-2 rounded-full flex-shrink-0 bg-gradient-to-r ${color}`} />
                    <span className="text-xs font-bold text-slate-300 group-hover:text-white transition-colors truncate max-w-[160px]">{label}</span>
                    <ChevronRight size={10} className="text-slate-600 opacity-0 group-hover:opacity-100 transition-all -ml-1" />
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0">
                    <span className="text-[10px] text-slate-500">{row.Pagos} pagos</span>
                    <span className="text-xs font-black text-white">{fmtC(row.Total)}</span>
                  </div>
                </div>
                <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
                  <div className={`h-full bg-gradient-to-r ${color} rounded-full transition-all duration-700`} style={{ width: `${pct}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function DashboardPage() {
  const router = useRouter();
  const { user, isInitialized, season } = useUser();

  const today = new Date().toISOString().split("T")[0];
  const [period, setPeriod] = useState<Period>("month");
  const [dateFrom, setDateFrom] = useState(today);
  const [dateTo, setDateTo] = useState(today);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [pendingFrom, setPendingFrom] = useState(today);
  const [pendingTo, setPendingTo] = useState(today);

  // Drill down details state
  const [detailsModal, setDetailsModal] = useState<{ open: boolean, title: string, subtitle: string }>({ open: false, title: "", subtitle: "" });
  const [detailsData, setDetailsData] = useState<PaymentDetail[]>([]);
  const [isDetailsLoading, setIsDetailsLoading] = useState(false);
  const [payingPlayersModalOpen, setPayingPlayersModalOpen] = useState(false);

  // Nested subcard drill down states
  const [activeSubcardModal, setActiveSubcardModal] = useState<{ 
    idSede: number; 
    type: 'pago' | 'registro' | 'both'; 
    sedeName: string;
    idSedeJugador?: number;
    sedeJugadorName?: string;
  } | null>(null);
  const [subcardPlayersData, setSubcardPlayersData] = useState<PaymentDetail[]>([]);
  const [isSubcardLoading, setIsSubcardLoading] = useState(false);
  const [selectedPlayerDetails, setSelectedPlayerDetails] = useState<{ idJugador: number; name: string } | null>(null);
  const [subcardSearchQuery, setSubcardSearchQuery] = useState('');

  // Intermediate modal: TipoProducto product breakdown per sede
  const [tipoProductoModal, setTipoProductoModal] = useState<{
    idSede: number;
    sedeName: string;
    idTipoProducto: number;
    tipoProductoName: string;
  } | null>(null);

  const [data, setData] = useState<DashboardData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  useEffect(() => {
    if (isInitialized) {
      if (!user) {
        router.push("/login");
      } else if ((user.AdminConvocatorias ?? 0) < 2) {
        router.push("/inscripciones");
      }
    }
  }, [user, isInitialized, router]);

  const fetchKPIs = useCallback(async (p: Period, from?: string, to?: string) => {
    setIsLoading(true);
    try {
      let url = `/api/dashboard/kpis?period=${p}`;
      if (p === "custom" && from && to) url += `&dateFrom=${from}&dateTo=${to}`;
      const res = await fetch(url);
      const json = await res.json();
      if (json.success) { setData(json); setLastUpdated(new Date()); }
    } catch (e) { console.error(e); }
    finally { setIsLoading(false); }
  }, []);

  const fetchDetails = async (filters: { idSede?: number, idSedeJugador?: number, otrasCuotas?: boolean, idLiga?: number, categoria?: string, idProducto?: number, idTipoProducto?: number }, title: string, sub: string) => {
    setDetailsModal({ open: true, title, subtitle: sub });
    setIsDetailsLoading(true);
    setDetailsData([]);
    try {
      let url = `/api/dashboard/payments/details?period=${period}`;
      if (period === "custom") url += `&dateFrom=${dateFrom}&dateTo=${dateTo}`;
      if (filters.idSede) url += `&idSede=${filters.idSede}`;
      if (filters.idSedeJugador) url += `&idSedeJugador=${filters.idSedeJugador}`;
      if (filters.otrasCuotas) url += `&otrasCuotas=true`;
      if (filters.idLiga) url += `&idLiga=${filters.idLiga}`;
      if (filters.categoria) url += `&categoria=${encodeURIComponent(filters.categoria)}`;
      if (filters.idTipoProducto) url += `&idTipoProducto=${filters.idTipoProducto}`;
      if (filters.idProducto) url += `&idProducto=${filters.idProducto}`;
      
      const res = await fetch(url);
      const json = await res.json();
      if (json.success) setDetailsData(json.data);
    } catch (e) {
      console.error(e);
    } finally {
      setIsDetailsLoading(false);
    }
  };

  const exportToExcel = async () => {
    try {
      const ExcelJS = (await import("exceljs")).default;
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet("Detalle de Pagos");

      // Enable grid lines
      worksheet.views = [{ showGridLines: true }];

      // Title Styling
      worksheet.mergeCells("A2:H2");
      const titleCell = worksheet.getCell("A2");
      titleCell.value = "Ángeles Soccer Club";
      titleCell.font = { name: "Segoe UI", size: 16, bold: true, color: { argb: "FF4F46E5" } };
      titleCell.alignment = { vertical: "middle", horizontal: "left" };

      worksheet.mergeCells("A3:H3");
      const subtitleCell = worksheet.getCell("A3");
      subtitleCell.value = `Reporte de Convocatorias y Pagos — ${detailsModal.title}`;
      subtitleCell.font = { name: "Segoe UI", size: 12, bold: true, color: { argb: "FF1E293B" } };
      subtitleCell.alignment = { vertical: "middle", horizontal: "left" };

      worksheet.mergeCells("A4:H4");
      const filterCell = worksheet.getCell("A4");
      filterCell.value = `Filtro: ${detailsModal.subtitle}  |  Rango de Fechas: ${periodLabel}`;
      filterCell.font = { name: "Segoe UI", size: 10, italic: true, color: { argb: "FF64748B" } };
      filterCell.alignment = { vertical: "middle", horizontal: "left" };

      worksheet.mergeCells("A5:H5");
      const exportCell = worksheet.getCell("A5");
      exportCell.value = `Fecha de exportación: ${new Date().toLocaleString("es-MX")}`;
      exportCell.font = { name: "Segoe UI", size: 9, italic: true, color: { argb: "FF94A3B8" } };
      exportCell.alignment = { vertical: "middle", horizontal: "left" };

      // Set headers
      const headerRowNumber = 7;
      const headers = [
        "Fecha de Pago",
        "Recibo",
        "Jugador",
        "Categoría",
        "Sede",
        "Liga",
        "Producto",
        "Monto (MXN)"
      ];

      const headerRow = worksheet.getRow(headerRowNumber);
      headerRow.values = headers;
      headerRow.height = 28;

      const headerFont = { name: "Segoe UI", size: 10, bold: true, color: { argb: "FFFFFFFF" } };
      const headerFill = {
        type: "pattern" as const,
        pattern: "solid" as const,
        fgColor: { argb: "FF4F46E5" } // Elegant Purple/Indigo theme
      };
      
      const thinBorder = {
        top: { style: "thin" as const, color: { argb: "FFE2E8F0" } },
        left: { style: "thin" as const, color: { argb: "FFE2E8F0" } },
        bottom: { style: "thin" as const, color: { argb: "FFE2E8F0" } },
        right: { style: "thin" as const, color: { argb: "FFE2E8F0" } }
      };

      headers.forEach((_, colIndex) => {
        const cell = headerRow.getCell(colIndex + 1);
        cell.font = headerFont;
        cell.fill = headerFill;
        cell.alignment = { 
          vertical: "middle", 
          horizontal: colIndex === 0 || colIndex === 1 ? "center" : colIndex === 7 ? "right" : "left" 
        };
        cell.border = thinBorder;
      });

      // Populate data
      let currentRowNumber = headerRowNumber + 1;

      detailsData.forEach((item, index) => {
        const row = worksheet.getRow(currentRowNumber);
        const formattedDate = new Date(item.FechaPago).toLocaleDateString("es-MX", { day: '2-digit', month: '2-digit', year: 'numeric' }) + " " + new Date(item.FechaPago).toLocaleTimeString("es-MX", { hour: '2-digit', minute: '2-digit' });

        row.values = [
          formattedDate,
          item.Recibo || "—",
          item.Jugador,
          item.Categoria || "—",
          item.Sede || "—",
          item.Liga || "—",
          item.Producto || "—",
          Number(item.Pago)
        ];

        row.height = 22;

        const isEven = index % 2 === 0;
        const rowBgColor = isEven ? "FFFFFFFF" : "FFF8FAFC"; // Alternate zebra rows
        const dataFill = {
          type: "pattern" as const,
          pattern: "solid" as const,
          fgColor: { argb: rowBgColor }
        };

        for (let colIndex = 1; colIndex <= 8; colIndex++) {
          const cell = row.getCell(colIndex);
          cell.font = { name: "Segoe UI", size: 9.5 };
          cell.fill = dataFill;
          cell.border = thinBorder;

          if (colIndex === 1 || colIndex === 2) {
            cell.alignment = { vertical: "middle", horizontal: "center" };
          } else if (colIndex === 8) {
            cell.alignment = { vertical: "middle", horizontal: "right" };
            cell.numFmt = '"$"#,##0.00';
          } else {
            cell.alignment = { vertical: "middle", horizontal: "left" };
          }
        }

        currentRowNumber++;
      });

      // Total Row
      const totalRow = worksheet.getRow(currentRowNumber);
      totalRow.height = 26;
      worksheet.mergeCells(`A${currentRowNumber}:G${currentRowNumber}`);

      const labelCell = totalRow.getCell(1);
      labelCell.value = "TOTAL GENERAL   ";
      labelCell.font = { name: "Segoe UI", size: 10, bold: true, color: { argb: "FF1E293B" } };
      labelCell.alignment = { vertical: "middle", horizontal: "right" };

      // Apply borders to the merged cells
      const totalBorder = {
        top: { style: "thin" as const, color: { argb: "FFCBD5E1" } },
        bottom: { style: "double" as const, color: { argb: "FF475569" } }
      };

      for (let colIndex = 1; colIndex <= 7; colIndex++) {
        totalRow.getCell(colIndex).border = totalBorder;
      }

      const totalValueCell = totalRow.getCell(8);
      totalValueCell.value = { formula: `=SUM(H8:H${currentRowNumber - 1})` };
      totalValueCell.font = { name: "Segoe UI", size: 10, bold: true, color: { argb: "FF059669" } }; // Emerald green total
      totalValueCell.alignment = { vertical: "middle", horizontal: "right" };
      totalValueCell.numFmt = '"$"#,##0.00';
      totalValueCell.border = totalBorder;

      // Auto-fit columns
      worksheet.columns.forEach((column, colIndex) => {
        let maxLen = 10;
        worksheet.eachRow((row, rowNumber) => {
          if (rowNumber >= 7 && rowNumber < currentRowNumber) {
            const cellVal = row.getCell(colIndex + 1).value;
            if (cellVal) {
              const strVal = String(cellVal);
              if (strVal.length > maxLen) maxLen = strVal.length;
            }
          }
        });
        column.width = Math.min(maxLen + 4, 35);
      });

      // Write Workbook to buffer and download
      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      const downloadLink = document.createElement("a");
      downloadLink.href = URL.createObjectURL(blob);
      
      const cleanTitle = detailsModal.title.replace(/[^a-z0-9]/gi, '_').toLowerCase();
      downloadLink.download = `reporte_pagos_${cleanTitle}_${new Date().toISOString().slice(0, 10)}.xlsx`;
      
      document.body.appendChild(downloadLink);
      downloadLink.click();
      document.body.removeChild(downloadLink);
    } catch (e) {
      console.error("Error al exportar a Excel:", e);
    }
  };

  const exportPlayersToExcel = async () => {
    if (!activeSubcardModal || subcardPlayersData.length === 0) return;
    try {
      const ExcelJS = (await import("exceljs")).default;
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet("Lista de Jugadores");

      // Enable grid lines
      worksheet.views = [{ showGridLines: true }];

      // Title Styling
      worksheet.mergeCells("A2:F2");
      const titleCell = worksheet.getCell("A2");
      titleCell.value = "Ángeles Soccer Club";
      titleCell.font = { name: "Segoe UI", size: 16, bold: true, color: { argb: "FF4F46E5" } };
      titleCell.alignment = { vertical: "middle", horizontal: "left" };

      worksheet.mergeCells("A3:F3");
      const subtitleCell = worksheet.getCell("A3");
      const filterDesc = activeSubcardModal.type === 'both' 
        ? `Pago en ${activeSubcardModal.sedeName} / Registro en ${activeSubcardModal.sedeJugadorName}`
        : `${activeSubcardModal.sedeName} (${activeSubcardModal.type === 'pago' ? 'Sede de Pago' : 'Sede de Registro'})`;
      subtitleCell.value = `Lista de Jugadores Únicos — ${filterDesc}`;
      subtitleCell.font = { name: "Segoe UI", size: 12, bold: true, color: { argb: "FF1E293B" } };
      subtitleCell.alignment = { vertical: "middle", horizontal: "left" };

      worksheet.mergeCells("A4:F4");
      const filterCell = worksheet.getCell("A4");
      filterCell.value = `Rango de Fechas: ${periodLabel}`;
      filterCell.font = { name: "Segoe UI", size: 10, italic: true, color: { argb: "FF64748B" } };
      filterCell.alignment = { vertical: "middle", horizontal: "left" };

      worksheet.mergeCells("A5:F5");
      const exportCell = worksheet.getCell("A5");
      exportCell.value = `Fecha de exportación: ${new Date().toLocaleString("es-MX")}`;
      exportCell.font = { name: "Segoe UI", size: 9, italic: true, color: { argb: "FF94A3B8" } };
      exportCell.alignment = { vertical: "middle", horizontal: "left" };

      // Set headers
      const headerRowNumber = 7;
      const headers = [
        "Jugador",
        "Categoría",
        "Sede de Pago",
        "Sede de Origen",
        "Cant. Pagos",
        "Total Pagado (MXN)"
      ];

      const headerRow = worksheet.getRow(headerRowNumber);
      headerRow.values = headers;
      headerRow.height = 28;

      const headerFont = { name: "Segoe UI", size: 10, bold: true, color: { argb: "FFFFFFFF" } };
      const headerFill = {
        type: "pattern" as const,
        pattern: "solid" as const,
        fgColor: { argb: "FF6B21A8" } // Elegant Purple theme matching the modal
      };
      
      const thinBorder = {
        top: { style: "thin" as const, color: { argb: "FFE2E8F0" } },
        left: { style: "thin" as const, color: { argb: "FFE2E8F0" } },
        bottom: { style: "thin" as const, color: { argb: "FFE2E8F0" } },
        right: { style: "thin" as const, color: { argb: "FFE2E8F0" } }
      };

      headers.forEach((_, colIndex) => {
        const cell = headerRow.getCell(colIndex + 1);
        cell.font = headerFont;
        cell.fill = headerFill;
        cell.alignment = { 
          vertical: "middle", 
          horizontal: colIndex === 4 || colIndex === 5 ? "right" : "left" 
        };
        cell.border = thinBorder;
      });

      // Populate data
      let currentRowNumber = headerRowNumber + 1;
      const players = getGroupedPlayers(subcardPlayersData);

      players.forEach((item, index) => {
        const row = worksheet.getRow(currentRowNumber);
        row.values = [
          item.jugador,
          item.categoria || "—",
          item.sede || "—", // Sede de Pago
          item.sedeJugador || "—", // Sede de Origen / Registro
          Number(item.pagosCount),
          Number(item.total)
        ];

        row.height = 22;

        const isEven = index % 2 === 0;
        const rowBgColor = isEven ? "FFFFFFFF" : "FFFDF4FF"; // Alternate zebra rows
        const dataFill = {
          type: "pattern" as const,
          pattern: "solid" as const,
          fgColor: { argb: rowBgColor }
        };

        for (let colIndex = 1; colIndex <= 6; colIndex++) {
          const cell = row.getCell(colIndex);
          cell.font = { name: "Segoe UI", size: 9.5 };
          cell.fill = dataFill;
          cell.border = thinBorder;

          if (colIndex === 5) {
            cell.alignment = { vertical: "middle", horizontal: "right" };
            cell.numFmt = '#,##0';
          } else if (colIndex === 6) {
            cell.alignment = { vertical: "middle", horizontal: "right" };
            cell.numFmt = '"$"#,##0.00';
          } else {
            cell.alignment = { vertical: "middle", horizontal: "left" };
          }
        }

        currentRowNumber++;
      });

      // Total Row
      const totalRow = worksheet.getRow(currentRowNumber);
      totalRow.height = 26;
      worksheet.mergeCells(`A${currentRowNumber}:E${currentRowNumber}`);

      const labelCell = totalRow.getCell(1);
      labelCell.value = "TOTAL SUMATORIA JUGADORES   ";
      labelCell.font = { name: "Segoe UI", size: 10, bold: true, color: { argb: "FF1E293B" } };
      labelCell.alignment = { vertical: "middle", horizontal: "right" };

      const totalBorder = {
        top: { style: "thin" as const, color: { argb: "FFCBD5E1" } },
        bottom: { style: "double" as const, color: { argb: "FF475569" } }
      };

      for (let colIndex = 1; colIndex <= 5; colIndex++) {
        totalRow.getCell(colIndex).border = totalBorder;
      }

      const totalValueCell = totalRow.getCell(6);
      totalValueCell.value = { formula: `=SUM(F8:F${currentRowNumber - 1})` };
      totalValueCell.font = { name: "Segoe UI", size: 10, bold: true, color: { argb: "FF059669" } }; // Emerald green total
      totalValueCell.alignment = { vertical: "middle", horizontal: "right" };
      totalValueCell.numFmt = '"$"#,##0.00';
      totalValueCell.border = totalBorder;

      // Auto-fit columns
      worksheet.columns.forEach((column, colIndex) => {
        let maxLen = 10;
        worksheet.eachRow((row, rowNumber) => {
          if (rowNumber >= 7 && rowNumber < currentRowNumber) {
            const cellVal = row.getCell(colIndex + 1).value;
            if (cellVal) {
              const strVal = String(cellVal);
              if (strVal.length > maxLen) maxLen = strVal.length;
            }
          }
        });
        column.width = Math.min(maxLen + 4, 35);
      });

      // Write Workbook to buffer and download
      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      const downloadLink = document.createElement("a");
      downloadLink.href = URL.createObjectURL(blob);
      
      const cleanTitle = activeSubcardModal.sedeName.replace(/[^a-z0-9]/gi, '_').toLowerCase();
      downloadLink.download = `jugadores_unicos_${cleanTitle}_${new Date().toISOString().slice(0, 10)}.xlsx`;
      
      document.body.appendChild(downloadLink);
      downloadLink.click();
      document.body.removeChild(downloadLink);
    } catch (e) {
      console.error("Error al exportar jugadores a Excel:", e);
    }
  };

  const fetchSubcardDetails = async (
    idSede: number, 
    type: 'pago' | 'registro' | 'both', 
    sedeName: string,
    idSedeJugador?: number,
    sedeJugadorName?: string
  ) => {
    setActiveSubcardModal({ idSede, type, sedeName, idSedeJugador, sedeJugadorName });
    setIsSubcardLoading(true);
    setSubcardPlayersData([]);
    try {
      let url = `/api/dashboard/payments/details?period=${period}`;
      if (period === "custom") url += `&dateFrom=${dateFrom}&dateTo=${dateTo}`;
      
      if (type === 'pago') {
        url += `&idSede=${idSede}`;
      } else if (type === 'registro') {
        url += `&idSedeJugador=${idSede}`;
      } else if (type === 'both') {
        url += `&idSede=${idSede}&idSedeJugador=${idSedeJugador}`;
      }
      
      const res = await fetch(url);
      const json = await res.json();
      if (json.success) setSubcardPlayersData(json.data);
    } catch (e) {
      console.error(e);
    } finally {
      setIsSubcardLoading(false);
    }
  };

  const openSubcardTotal = () => {
    if (!activeSubcardModal) return;
    const filterTypeLabel = activeSubcardModal.type === 'pago' 
      ? 'Sede de Pago' 
      : activeSubcardModal.type === 'registro' 
      ? 'Sede de Registro (tblJugadores.IdSede)' 
      : `Pagaron en Sede: ${activeSubcardModal.sedeName} / Pertenecen a: ${activeSubcardModal.sedeJugadorName}`;
    setDetailsModal({
      open: true,
      title: activeSubcardModal.type === 'both' 
        ? `${activeSubcardModal.sedeName} + ${activeSubcardModal.sedeJugadorName}` 
        : `${activeSubcardModal.sedeName}`,
      subtitle: `${filterTypeLabel} — ${periodLabel}`
    });
    setDetailsData(subcardPlayersData);
  };

  // Group subcardPlayersData by player
  const getGroupedPlayers = (payments: PaymentDetail[]) => {
    const map: Record<number | string, {
      idJugador: number;
      jugador: string;
      categoria: string;
      sede: string;
      sedeJugador?: string;
      liga: string;
      total: number;
      pagosCount: number;
      payments: PaymentDetail[];
    }> = {};

    payments.forEach(p => {
      const key = p.IdJugador || p.Jugador;
      if (!map[key]) {
        map[key] = {
          idJugador: p.IdJugador || 0,
          jugador: p.Jugador,
          categoria: p.Categoria || "—",
          sede: p.Sede || "—",
          sedeJugador: p.SedeJugador || "—",
          liga: p.Liga || "—",
          total: 0,
          pagosCount: 0,
          payments: []
        };
      }
      map[key].total += Number(p.Pago);
      map[key].pagosCount += 1;
      map[key].payments.push(p);
    });

    return Object.values(map).sort((a, b) => b.total - a.total);
  };

  useEffect(() => {
    if (isInitialized && user) fetchKPIs(period, dateFrom, dateTo);
  }, [isInitialized, user, period, fetchKPIs]);

  const handlePeriodClick = (p: Period) => {
    if (p === "custom") { setShowDatePicker(true); setPendingFrom(dateFrom); setPendingTo(dateTo); return; }
    setPeriod(p);
  };

  const applyCustomDates = () => {
    setDateFrom(pendingFrom); setDateTo(pendingTo);
    setPeriod("custom"); setShowDatePicker(false);
    fetchKPIs("custom", pendingFrom, pendingTo);
  };

  const periodLabel = period === "custom" ? `${dateFrom} → ${dateTo}` : PERIODS.find(p => p.key === period)?.label ?? "";
  const timelineSlice = data?.timeline.slice(-14) ?? [];
  const maxTimeline = Math.max(...timelineSlice.map((t) => t.Total), 1);

  // KPI card config
  const kpiCards = [
    { label: "Total Recaudado", value: fmtC(data?.kpi.totalRecaudado ?? 0), sub: fmt(data?.kpi.totalRecaudado ?? 0), icon: <DollarSign size={18} className="text-blue-400" />, bg: "from-blue-600/20 to-blue-800/10", border: "border-blue-500/30", iconBg: "bg-blue-500/20 border-blue-500/20", accent: true },
    { label: "Pagos Registrados", value: (data?.kpi.totalPagos ?? 0).toLocaleString("es-MX"), sub: "transacciones", icon: <CreditCard size={18} className="text-emerald-400" />, bg: "bg-white/5", border: "border-white/10", iconBg: "bg-emerald-500/10 border-emerald-500/10", accent: false },
    { label: "Jugadores Pagantes", value: (data?.kpi.jugadoresUnicos ?? 0).toLocaleString("es-MX"), sub: "jugadores únicos", icon: <Users size={18} className="text-purple-400" />, bg: "bg-white/5 hover:bg-purple-500/5 transition-all hover:scale-[1.02] cursor-pointer", border: "border-white/10 hover:border-purple-500/30", iconBg: "bg-purple-500/10 border-purple-500/10", accent: false, onClick: () => setPayingPlayersModalOpen(true) },
    { label: "Promedio por Pago", value: fmtC(data?.kpi.promedioPago ?? 0), sub: fmt(data?.kpi.promedioPago ?? 0), icon: <TrendingUp size={18} className="text-amber-400" />, bg: "bg-white/5", border: "border-white/10", iconBg: "bg-amber-500/10 border-amber-500/10", accent: false },
  ];

  return (
    <DashboardLayout>
      <main className="overflow-y-auto flex-1 text-white">
        {/* Header */}
        <div className="bg-white/5 backdrop-blur-xl border-b border-white/10 px-6 py-4 flex justify-between items-center sticky top-0 z-20">
          <div>
            <h1 className="text-xl font-black">Dashboard</h1>
            <p className="text-xs text-blue-300">{data?.season?.Temporada ? `Temporada ${data.season.Temporada}` : season ? `Temporada ${season}` : "Resumen ejecutivo"}</p>
          </div>
          <div className="flex items-center gap-3">
            {lastUpdated && <span className="text-[10px] text-slate-500">Act. {lastUpdated.toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" })}</span>}
            <button onClick={() => fetchKPIs(period, dateFrom, dateTo)} disabled={isLoading} className="p-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-slate-400 hover:text-white transition-all" title="Actualizar">
              <RefreshCw size={15} className={isLoading ? "animate-spin" : ""} />
            </button>
          </div>
        </div>

        <div className="p-6 md:p-8 max-w-7xl mx-auto space-y-8">

          {/* Period Selector */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h2 className="text-lg font-black">Recaudación por Período</h2>
              <p className="text-xs text-slate-400 mt-0.5">Pagos de convocatorias — {periodLabel}</p>
            </div>
            <div className="flex gap-2 bg-white/5 p-1 rounded-2xl border border-white/10 flex-wrap">
              {PERIODS.map((p) => (
                <button key={p.key} onClick={() => handlePeriodClick(p.key)}
                  className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold transition-all duration-200 ${
                    period === p.key
                      ? "bg-blue-600 text-white shadow-lg shadow-blue-500/30 scale-[1.03]"
                      : "text-slate-400 hover:text-white hover:bg-white/8"
                  }`}>
                  {p.key === "custom" ? <Calendar size={13} /> : null}
                  {p.label}
                  {p.key === "custom" && period === "custom" && <span className="text-[9px] opacity-70 ml-1">{dateFrom.slice(5)} → {dateTo.slice(5)}</span>}
                </button>
              ))}
            </div>
          </div>

          {/* Custom Date Picker Modal */}
          {showDatePicker && (
            <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
              <div className="bg-slate-900 border border-white/15 rounded-2xl p-6 w-full max-w-sm shadow-2xl">
                <div className="flex items-center justify-between mb-5">
                  <h3 className="text-base font-black text-white flex items-center gap-2"><Calendar size={16} className="text-blue-400" />Rango de Fechas</h3>
                  <button onClick={() => setShowDatePicker(false)} className="p-1 rounded-lg text-slate-500 hover:text-white hover:bg-white/10 transition-all"><X size={18} /></button>
                </div>
                <div className="space-y-4">
                  <div>
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Fecha Inicio</label>
                    <input type="date" value={pendingFrom} onChange={e => setPendingFrom(e.target.value)}
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white text-sm outline-none focus:border-blue-500/60 focus:bg-white/10 transition-all [color-scheme:dark]" />
                  </div>
                  <div>
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Fecha Fin</label>
                    <input type="date" value={pendingTo} onChange={e => setPendingTo(e.target.value)}
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white text-sm outline-none focus:border-blue-500/60 focus:bg-white/10 transition-all [color-scheme:dark]" />
                  </div>
                </div>
                <div className="flex gap-3 mt-6">
                  <button onClick={() => setShowDatePicker(false)} className="flex-1 py-2.5 rounded-xl border border-white/10 text-slate-400 text-sm font-bold hover:bg-white/5 transition-all">Cancelar</button>
                  <button onClick={applyCustomDates} className="flex-1 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-black transition-all shadow-lg shadow-blue-500/20">Aplicar</button>
                </div>
              </div>
            </div>
          )}

          {/* Drill Down Details Modal */}
          {detailsModal.open && (
            <div className="fixed inset-0 bg-black/70 backdrop-blur-md flex items-center justify-center z-[120] p-4">
              <div className="bg-[#0f172a] border border-white/10 rounded-3xl w-full max-w-5xl h-[85vh] flex flex-col shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200">
                {/* Modal Header */}
                <div className="p-6 border-b border-white/5 flex items-center justify-between bg-white/5">
                  <div className="flex items-center gap-4">
                    <div className="bg-blue-600/20 p-3 rounded-2xl border border-blue-500/20">
                      <FileText size={24} className="text-blue-400" />
                    </div>
                    <div>
                      <h3 className="text-xl font-black text-white">{detailsModal.title}</h3>
                      <p className="text-xs text-slate-400">Detalle de pagos — {detailsModal.subtitle}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    {detailsData.length > 0 && (
                      <button 
                        onClick={exportToExcel}
                        className="flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black transition-all shadow-lg shadow-emerald-500/20 cursor-pointer"
                      >
                        <Download size={14} />
                        Exportar a Excel
                      </button>
                    )}
                    <button onClick={() => setDetailsModal({ ...detailsModal, open: false })} className="p-2 rounded-xl hover:bg-white/10 text-slate-400 hover:text-white transition-all">
                      <X size={20} />
                    </button>
                  </div>
                </div>

                {/* Modal Content */}
                <div className="flex-1 overflow-y-auto p-6">
                  {isDetailsLoading ? (
                    <div className="h-full flex flex-col items-center justify-center gap-4">
                      <RefreshCw className="animate-spin text-blue-500" size={32} />
                      <p className="text-sm text-slate-400 font-bold animate-pulse">Obteniendo transacciones...</p>
                    </div>
                  ) : detailsData.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-slate-500 gap-2">
                      <Search size={48} className="opacity-20" />
                      <p className="text-lg font-bold">No se encontraron pagos</p>
                      <p className="text-sm opacity-60">No hay registros para este criterio en el período seleccionado.</p>
                    </div>
                  ) : (
                    <div className="overflow-x-auto rounded-2xl border border-white/5">
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="bg-white/5 text-[10px] uppercase font-black text-slate-500 tracking-widest">
                            <th className="px-4 py-4">Fecha</th>
                            <th className="px-4 py-4">Jugador</th>
                            <th className="px-4 py-4">Categoría</th>
                            <th className="px-4 py-4">Sede / Liga</th>
                            <th className="px-4 py-4">Producto</th>
                            <th className="px-4 py-4 text-right">Monto</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                          {detailsData.map((p) => (
                            <tr key={p.IdPago} className="hover:bg-white/5 transition-colors group">
                              <td className="px-4 py-4 whitespace-nowrap">
                                <p className="text-xs font-bold text-slate-300">
                                  {new Date(p.FechaPago).toLocaleDateString("es-MX", { day: '2-digit', month: 'short', year: 'numeric' })}
                                </p>
                                <p className="text-[10px] text-slate-500">{new Date(p.FechaPago).toLocaleTimeString("es-MX", { hour: '2-digit', minute: '2-digit' })}</p>
                              </td>
                              <td className="px-4 py-4">
                                <div className="flex items-center gap-2">
                                  <div className="w-7 h-7 rounded-full bg-blue-500/10 flex items-center justify-center text-[10px] font-black text-blue-400 border border-blue-500/20">
                                    {p.Jugador.charAt(0)}
                                  </div>
                                  <div>
                                    <p className="text-xs font-black text-white">{p.Jugador}</p>
                                    <p className="text-[10px] text-slate-500">Recibo: {p.Recibo || 'N/A'}</p>
                                  </div>
                                </div>
                              </td>
                              <td className="px-4 py-4">
                                <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-purple-500/10 text-purple-400 border border-purple-500/20">
                                  {p.Categoria}
                                </span>
                              </td>
                              <td className="px-4 py-4">
                                <p className="text-[11px] font-bold text-slate-300">{p.Sede || 'Sin Sede'}</p>
                                <p className="text-[10px] text-slate-500">{p.Liga}</p>
                              </td>
                              <td className="px-4 py-4">
                                <p className="text-[11px] text-slate-400">{p.Producto}</p>
                              </td>
                              <td className="px-4 py-4 text-right">
                                <p className="text-sm font-black text-emerald-400">{fmt(p.Pago)}</p>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

                {/* Modal Footer */}
                <div className="p-4 bg-white/5 border-t border-white/5 flex justify-between items-center text-[11px] text-slate-500 px-8">
                  <p>Mostrando {detailsData.length} transacciones encontradas</p>
                  <p className="font-bold text-white">Total: {fmt(detailsData.reduce((acc, curr) => acc + curr.Pago, 0))}</p>
                </div>
              </div>
            </div>
          )}

          {/* Modal de Jugadores Pagantes por Sucursal */}
          {payingPlayersModalOpen && (
            <div className="fixed inset-0 bg-black/75 backdrop-blur-md flex items-center justify-center z-[100] p-4">
              <div className="bg-[#0f172a] border border-white/10 rounded-3xl w-full max-w-4xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200">
                {/* Modal Header */}
                <div className="p-6 border-b border-white/5 flex items-center justify-between bg-white/5">
                  <div className="flex items-center gap-4">
                    <div className="bg-purple-600/20 p-3 rounded-2xl border border-purple-500/20">
                      <Users size={24} className="text-purple-400" />
                    </div>
                    <div>
                      <h3 className="text-xl font-black text-white">Jugadores Pagantes por Sucursal</h3>
                      <p className="text-xs text-slate-400">Distribución de jugadores únicos que realizaron pagos — {periodLabel}</p>
                    </div>
                  </div>
                  <button onClick={() => setPayingPlayersModalOpen(false)} className="p-2 rounded-xl hover:bg-white/10 text-slate-400 hover:text-white transition-all">
                    <X size={20} />
                  </button>
                </div>

                {/* Modal Content */}
                <div className="flex-1 overflow-y-auto p-6">
                  {(!data?.bySede || data.bySede.filter(item => (item.Jugadores ?? 0) > 0).length === 0) ? (
                    <div className="h-48 flex flex-col items-center justify-center text-slate-500 gap-2">
                      <Search size={48} className="opacity-20" />
                      <p className="text-lg font-bold">Sin datos para mostrar</p>
                      <p className="text-sm opacity-60">No hay registros de pagos en el período seleccionado.</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                      {data.bySede.filter(item => (item.Jugadores ?? 0) > 0).map((item) => {
                        const breakdownItems = data?.breakdown?.filter(b => b.IdSedePago === item.IdSede) || [];
                        return (
                          <div 
                            key={item.IdSede}
                          className="bg-slate-800/40 border border-white/10 rounded-2xl p-5 relative overflow-hidden group flex flex-col min-h-[300px]"
                          >
                            {/* Decorative background glow */}
                            <div className="absolute -right-12 -top-12 w-32 h-32 bg-purple-500/5 rounded-full blur-2xl pointer-events-none" />
                            
                            <div>
                              <div className="flex items-center gap-2 mb-4">
                                <MapPin size={16} className="text-purple-400" />
                                <h4 className="text-sm font-black text-white truncate">{item.Sede || 'Sede'}</h4>
                              </div>
                              
                              {/* Subcards Grid */}
                              <div className="space-y-3 mb-4">
                                {/* Main Sede de Pago Total (tal como está ahorita, pero simplificado a 1 card principal elegante) */}
                                <div 
                                  onClick={() => {
                                    setPayingPlayersModalOpen(false);
                                    fetchSubcardDetails(item.IdSede ?? 0, 'pago', item.Sede || 'Sede');
                                  }}
                                  className="bg-slate-900/60 border border-white/5 hover:border-purple-500/30 hover:bg-slate-900/90 rounded-xl p-3.5 cursor-pointer transition-all hover:scale-[1.02] flex items-center justify-between group/sub"
                                >
                                  <div>
                                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Total Pagantes</p>
                                    <p className="text-[10px] text-slate-500 mt-0.5">Jugadores únicos cobrados aquí</p>
                                  </div>
                                  <div className="text-right flex flex-col items-end">
                                    <div className="flex items-baseline gap-1">
                                      <span className="text-xl font-black text-purple-400 group-hover/sub:text-purple-300 transition-colors">{item.Jugadores ?? 0}</span>
                                      <span className="text-[8px] font-bold text-slate-500 uppercase tracking-wider">jugadores</span>
                                    </div>
                                    <p className="text-[9px] font-medium text-slate-500 mt-0.5">{item.Pagos ?? 0} operaciones</p>
                                  </div>
                                </div>

                                {/* breakdown registered sedes subcards */}
                                {/* Fixed-height sedes de origen area - same height on all cards */}
                                <div className="h-[185px]">
                                  {breakdownItems.length > 0 && (
                                    <div className="mt-2 space-y-2">
                                      <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Sedes de Origen de los Jugadores</p>
                                      <div className="grid grid-cols-2 gap-2 h-[145px] overflow-y-auto pr-0.5 content-start">
                                        {breakdownItems.map((b) => (
                                          <div 
                                            key={b.IdSedeJugador}
                                            onClick={() => {
                                              setPayingPlayersModalOpen(false);
                                              fetchSubcardDetails(item.IdSede ?? 0, 'both', item.Sede || 'Sede', b.IdSedeJugador, b.SedeJugador);
                                            }}
                                            className="bg-slate-900/40 border border-white/5 hover:border-purple-500/40 hover:bg-slate-900/80 rounded-xl p-2.5 cursor-pointer transition-all hover:scale-[1.03] flex flex-col justify-between group/subcard"
                                          >
                                            <p className="text-[9px] font-black text-slate-300 truncate group-hover/subcard:text-purple-300 transition-colors" title={b.SedeJugador}>
                                              {b.SedeJugador}
                                            </p>
                                            <div className="flex items-baseline justify-between mt-1.5">
                                              <div className="flex items-baseline gap-0.5">
                                                <span className="text-xs font-black text-purple-400 group-hover/subcard:text-purple-300 transition-colors">{b.Jugadores}</span>
                                                <span className="text-[8px] text-slate-500 font-semibold">jug.</span>
                                              </div>
                                              <span className="text-[8px] text-slate-500 font-medium">{b.Pagos} op.</span>
                                            </div>
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>
                            
                            {/* Product TYPE cards */}
                            <div>
                            {(() => {
                              const tipoItems = data?.productBySede?.filter(p => p.IdSedePago === item.IdSede) || [];
                              if (tipoItems.length === 0) {
                                return (
                                  <div
                                    onClick={() => {
                                      setPayingPlayersModalOpen(false);
                                      fetchDetails({ idSede: item.IdSede }, item.Sede || 'Sede', `Cobrado en Sede — ${periodLabel}`);
                                    }}
                                    className="cursor-pointer hover:bg-white/5 p-2 rounded-lg border border-transparent hover:border-white/10 transition-all flex flex-col pt-3 border-t border-white/5"
                                    title="Ver detalle de todo lo cobrado en sede"
                                  >
                                    <p className="text-[8px] font-bold text-slate-500 uppercase tracking-wider">Cobrado Sede</p>
                                    <p className="text-[10px] font-black text-emerald-400 mt-1">{fmt(item.Total)}</p>
                                  </div>
                                );
                              }
                              
                              const TIPO_COLORS = [
                                { text: 'text-emerald-400', border: 'hover:border-emerald-500/40', dot: 'bg-emerald-500' },
                                { text: 'text-blue-400',    border: 'hover:border-blue-500/40',    dot: 'bg-blue-500' },
                                { text: 'text-amber-400',   border: 'hover:border-amber-500/40',   dot: 'bg-amber-500' },
                                { text: 'text-rose-400',    border: 'hover:border-rose-500/40',    dot: 'bg-rose-500' },
                                { text: 'text-cyan-400',    border: 'hover:border-cyan-500/40',    dot: 'bg-cyan-500' },
                                { text: 'text-purple-400',  border: 'hover:border-purple-500/40',  dot: 'bg-purple-500' },
                              ];

                              return (
                                <div className="pt-3 border-t border-white/5 mt-1">
                                  <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-2">Cobrado por Tipo de Producto</p>
                                  <div className="grid grid-cols-2 gap-1.5">
                                    {tipoItems.map((tipo, ti) => {
                                      const c = TIPO_COLORS[ti % TIPO_COLORS.length];
                                      return (
                                        <div
                                          key={tipo.IdTipoProducto}
                                          onClick={() => {
                                            setTipoProductoModal({
                                              idSede: item.IdSede ?? 0,
                                              sedeName: item.Sede || 'Sede',
                                              idTipoProducto: tipo.IdTipoProducto,
                                              tipoProductoName: tipo.TipoProducto,
                                            });
                                          }}
                                          className={`bg-slate-900/50 border border-white/5 ${c.border} rounded-xl p-2.5 cursor-pointer transition-all hover:scale-[1.03] hover:bg-slate-900/80 flex flex-col group/tipo`}
                                          title={`Ver desglose de ${tipo.TipoProducto}`}
                                        >
                                          <div className="flex items-start gap-1.5 mb-2">
                                            <div className={`w-1.5 h-1.5 rounded-full ${c.dot} flex-shrink-0 mt-[3px]`} />
                                            <p className="text-[9px] font-black text-slate-300 group-hover/tipo:text-white transition-colors leading-tight" title={tipo.TipoProducto}>
                                              {tipo.TipoProducto}
                                            </p>
                                          </div>
                                          <p className={`text-[11px] font-black ${c.text} leading-none`}>{fmtC(Number(tipo.Total))}</p>
                                          <p className="text-[8px] text-slate-500 mt-0.5">{tipo.Pagos} pagos · {tipo.Jugadores} jug.</p>
                                        </div>
                                      );
                                    })}
                                  </div>
                                </div>
                              );
                            })()}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Modal Footer */}
                <div className="p-4 bg-white/5 border-t border-white/5 flex justify-between items-center text-[11px] text-slate-500 px-8">
                  <p>Mostrando {data?.bySede.filter(item => (item.Jugadores ?? 0) > 0).length ?? 0} sucursales con actividad</p>
                  <p className="font-bold text-slate-400">Total Jugadores Únicos: <span className="text-white text-xs font-black ml-1">{data?.kpi.jugadoresUnicos ?? 0}</span></p>
                </div>
              </div>
            </div>
          )}

          {/* Modal Intermedio: Desglose por Producto dentro de un TipoProducto */}
          {tipoProductoModal && (
            <div className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center z-[115] p-4">
              <div className="bg-[#0f172a] border border-white/10 rounded-3xl w-full max-w-lg max-h-[75vh] flex flex-col shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200">
                {/* Header */}
                <div className="p-5 border-b border-white/5 flex items-center justify-between bg-white/5">
                  <div className="flex items-center gap-3">
                    <div className="bg-amber-500/15 p-2.5 rounded-2xl border border-amber-500/20">
                      <BarChart3 size={20} className="text-amber-400" />
                    </div>
                    <div>
                      <h3 className="text-base font-black text-white">{tipoProductoModal.tipoProductoName}</h3>
                      <p className="text-[11px] text-slate-400">{tipoProductoModal.sedeName} — Desglose por producto · {periodLabel}</p>
                    </div>
                  </div>
                  <button
                    onClick={() => setTipoProductoModal(null)}
                    className="p-2 rounded-xl hover:bg-white/10 text-slate-400 hover:text-white transition-all"
                  >
                    <X size={18} />
                  </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-5">
                  {(() => {
                    const productos = data?.productDetailBySede?.filter(
                      p => p.IdSedePago === tipoProductoModal.idSede && p.IdTipoProducto === tipoProductoModal.idTipoProducto
                    ) || [];

                    if (productos.length === 0) {
                      return (
                        <div className="py-12 text-center text-slate-500 text-sm">
                          Sin detalle de productos disponible
                        </div>
                      );
                    }

                    const totalTipo = productos.reduce((acc, p) => acc + Number(p.Total), 0);
                    const maxTotal = Math.max(...productos.map(p => Number(p.Total)), 1);

                    const PROD_COLORS = [
                      { text: 'text-emerald-400', bar: 'from-emerald-600 to-emerald-400', badge: 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' },
                      { text: 'text-blue-400',    bar: 'from-blue-600 to-blue-400',       badge: 'bg-blue-500/10 border-blue-500/20 text-blue-400' },
                      { text: 'text-amber-400',   bar: 'from-amber-600 to-amber-400',     badge: 'bg-amber-500/10 border-amber-500/20 text-amber-400' },
                      { text: 'text-rose-400',    bar: 'from-rose-600 to-rose-400',       badge: 'bg-rose-500/10 border-rose-500/20 text-rose-400' },
                      { text: 'text-cyan-400',    bar: 'from-cyan-600 to-cyan-400',       badge: 'bg-cyan-500/10 border-cyan-500/20 text-cyan-400' },
                      { text: 'text-purple-400',  bar: 'from-purple-600 to-purple-400',   badge: 'bg-purple-500/10 border-purple-500/20 text-purple-400' },
                    ];

                    return (
                      <div className="space-y-2">
                        {productos.map((prod, pi) => {
                          const c = PROD_COLORS[pi % PROD_COLORS.length];
                          const pct = (Number(prod.Total) / maxTotal) * 100;
                          return (
                            <div
                              key={prod.IdProducto}
                              onClick={() => {
                                setTipoProductoModal(null);
                                fetchDetails(
                                  { idSede: tipoProductoModal.idSede, idProducto: prod.IdProducto },
                                  `${tipoProductoModal.sedeName} — ${prod.Producto}`,
                                  `Producto: ${prod.Producto} · ${tipoProductoModal.tipoProductoName} — ${periodLabel}`
                                );
                              }}
                              className="bg-slate-800/40 border border-white/5 hover:border-white/20 rounded-2xl p-4 cursor-pointer transition-all hover:scale-[1.01] hover:bg-slate-800/80 group"
                            >
                              <div className="flex items-center justify-between mb-2">
                                <div className="flex items-center gap-2 min-w-0">
                                  <span className={`text-[10px] font-black px-2 py-0.5 rounded-full border ${c.badge}`}>
                                    #{pi + 1}
                                  </span>
                                  <p className="text-sm font-black text-white group-hover:text-slate-200 truncate transition-colors">
                                    {prod.Producto}
                                  </p>
                                </div>
                                <div className="text-right flex-shrink-0 ml-3">
                                  <p className={`text-sm font-black ${c.text}`}>{fmt(Number(prod.Total))}</p>
                                  <p className="text-[10px] text-slate-500">{prod.Pagos} pagos · {prod.Jugadores} jug.</p>
                                </div>
                              </div>
                              {/* Mini bar */}
                              <div className="h-1 bg-white/5 rounded-full overflow-hidden">
                                <div className={`h-full bg-gradient-to-r ${c.bar} rounded-full transition-all duration-500`} style={{ width: `${pct}%` }} />
                              </div>
                              <div className="flex justify-between items-center mt-1.5">
                                <span className="text-[9px] text-slate-500">{((Number(prod.Total) / totalTipo) * 100).toFixed(1)}% del tipo</span>
                                <span className="text-[9px] text-slate-500 opacity-0 group-hover:opacity-100 transition-all flex items-center gap-1">
                                  Ver detalle <ChevronRight size={9} />
                                </span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    );
                  })()}
                </div>

                {/* Footer */}
                <div className="p-4 bg-white/5 border-t border-white/5 flex justify-between items-center text-[11px] text-slate-500 px-6">
                  <p>
                    {data?.productDetailBySede?.filter(
                      p => p.IdSedePago === tipoProductoModal.idSede && p.IdTipoProducto === tipoProductoModal.idTipoProducto
                    ).length ?? 0} productos en esta categoría
                  </p>
                  <p className="font-bold text-slate-400">
                    Total: <span className="text-amber-400 font-black ml-1">
                      {fmt(
                        (data?.productDetailBySede?.filter(
                          p => p.IdSedePago === tipoProductoModal.idSede && p.IdTipoProducto === tipoProductoModal.idTipoProducto
                        ) || []).reduce((acc, p) => acc + Number(p.Total), 0)
                      )}
                    </span>
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Modal de Lista de Jugadores por Subtarjeta */}
          {activeSubcardModal && (
            <div className="fixed inset-0 bg-black/75 backdrop-blur-md flex items-center justify-center z-[110] p-4">
              <div className="bg-[#0f172a] border border-white/10 rounded-3xl w-full max-w-2xl max-h-[80vh] flex flex-col shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200">
                {/* Header */}
                <div className="p-6 border-b border-white/5 flex items-center justify-between bg-white/5">
                  <div className="flex items-center gap-4">
                    <div className="bg-purple-600/20 p-3 rounded-2xl border border-purple-500/20">
                      <Users size={24} className="text-purple-400" />
                    </div>
                    <div>
                      <h3 className="text-lg font-black text-white">Jugadores Únicos</h3>
                      <p className="text-xs text-slate-400">
                        {activeSubcardModal.type === 'both'
                          ? `Pagaron en ${activeSubcardModal.sedeName} • Pertenecen a ${activeSubcardModal.sedeJugadorName}`
                          : `${activeSubcardModal.sedeName} — ${activeSubcardModal.type === 'pago' ? 'Sede de Pago' : 'Sede de Registro (tblJugadores)'}`
                        }
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    {subcardPlayersData.length > 0 && (
                      <>
                        <button 
                          onClick={exportPlayersToExcel}
                          className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black transition-all shadow-lg shadow-emerald-500/20 cursor-pointer"
                          title="Exportar lista de jugadores a Excel"
                        >
                          <Download size={13} />
                          Exportar Excel
                        </button>
                        <button 
                          onClick={openSubcardTotal}
                          className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-black transition-all shadow-lg shadow-blue-500/20 cursor-pointer"
                          title="Ver detalle de todos los pagos"
                        >
                          <FileText size={13} />
                          Ver Detalle
                        </button>
                      </>
                    )}
                     <button onClick={() => { setActiveSubcardModal(null); setPayingPlayersModalOpen(true); setSubcardSearchQuery(''); }} className="p-2 rounded-xl hover:bg-white/10 text-slate-400 hover:text-white transition-all">
                      <X size={20} />
                    </button>
                  </div>
                </div>

                {/* Search Bar inside Submodal */}
                {subcardPlayersData.length > 0 && !isSubcardLoading && (
                  <div className="px-6 py-3 border-b border-white/5 bg-slate-900/40 relative group flex items-center">
                    <Search className="absolute left-9 text-slate-500 group-focus-within:text-purple-400 transition-colors" size={14} />
                    <input 
                      type="text" 
                      placeholder="Buscar jugador por nombre o ID..." 
                      value={subcardSearchQuery}
                      onChange={(e) => setSubcardSearchQuery(e.target.value)}
                      className="w-full bg-white/5 border border-white/10 rounded-xl pl-10 pr-4 py-2 outline-none focus:bg-white/10 focus:border-purple-500/50 transition-all text-white text-xs placeholder-slate-500"
                    />
                  </div>
                )}

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-6">
                  {isSubcardLoading ? (
                    <div className="h-48 flex flex-col items-center justify-center gap-4">
                      <RefreshCw className="animate-spin text-purple-500" size={32} />
                      <p className="text-sm text-slate-400 font-bold animate-pulse">Cargando jugadores...</p>
                    </div>
                  ) : subcardPlayersData.length === 0 ? (
                    <div className="h-48 flex flex-col items-center justify-center text-slate-500 gap-2">
                      <Search size={48} className="opacity-20" />
                      <p className="text-lg font-bold">No se encontraron jugadores</p>
                      <p className="text-sm opacity-60">No hay registros para este período.</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {(() => {
                        const grouped = getGroupedPlayers(subcardPlayersData);
                        const filtered = grouped.filter(p => 
                          p.jugador.toLowerCase().includes(subcardSearchQuery.toLowerCase()) ||
                          p.idJugador.toString().includes(subcardSearchQuery)
                        );
                        
                        if (filtered.length === 0) {
                          return (
                            <div className="py-12 text-center text-slate-500 text-xs">
                              No se encontraron jugadores que coincidan con la búsqueda
                            </div>
                          );
                        }
                        
                        return filtered.map((player) => (
                          <div 
                            key={player.idJugador || player.jugador}
                            onClick={() => setSelectedPlayerDetails({ idJugador: player.idJugador, name: player.jugador })}
                            className="bg-slate-800/40 border border-white/5 hover:border-purple-500/40 rounded-2xl p-4 flex items-center justify-between cursor-pointer transition-all hover:scale-[1.01] hover:bg-slate-800/80 group"
                          >
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 rounded-full bg-purple-500/10 flex items-center justify-center text-xs font-black text-purple-400 border border-purple-500/20 group-hover:bg-purple-500/20 transition-all">
                                {player.jugador.charAt(0).toUpperCase()}
                              </div>
                              <div>
                                <p className="text-sm font-black text-white group-hover:text-purple-300 transition-colors">{player.jugador}</p>
                                <div className="flex items-center gap-2 mt-0.5 text-[10px] text-slate-500">
                                  <span className="font-medium bg-white/5 px-2 py-0.5 rounded-full border border-white/5">{player.categoria}</span>
                                  <span>•</span>
                                  <span className="opacity-75 font-semibold">ID: {player.idJugador}</span>
                                  <span>•</span>
                                  <span>{player.sedeJugador}</span>
                                </div>
                              </div>
                            </div>
                            
                            <div className="text-right">
                              <p className="text-sm font-black text-emerald-400">{fmt(player.total)}</p>
                              <p className="text-[10px] text-slate-500 mt-0.5">{player.pagosCount} pagos</p>
                            </div>
                          </div>
                        ));
                      })()}
                    </div>
                  )}
                </div>

                {/* Footer */}
                <div className="p-4 bg-white/5 border-t border-white/5 flex justify-between items-center text-[11px] text-slate-500 px-8">
                  <p>Total jugadores listados: {(() => {
                    const grouped = getGroupedPlayers(subcardPlayersData);
                    const filtered = grouped.filter(p => 
                      p.jugador.toLowerCase().includes(subcardSearchQuery.toLowerCase()) ||
                      p.idJugador.toString().includes(subcardSearchQuery)
                    );
                    return filtered.length;
                  })()}</p>
                  <p className="font-bold text-slate-400">Suma total: <span className="text-emerald-400 font-black ml-1">{fmt(subcardPlayersData.reduce((acc, curr) => acc + Number(curr.Pago), 0))}</span></p>
                </div>
              </div>
            </div>
          )}

          {/* Modal de Detalle de Pagos de un Jugador Específico */}
          {selectedPlayerDetails && (
            <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-[130] p-4">
              <div className="bg-[#0b0f19] border border-white/10 rounded-3xl w-full max-w-2xl max-h-[70vh] flex flex-col shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-150">
                {/* Header */}
                <div className="p-5 border-b border-white/5 flex items-center justify-between bg-white/3">
                  <div className="flex items-center gap-3">
                    <div className="bg-emerald-500/10 p-2.5 rounded-xl border border-emerald-500/20">
                      <CreditCard size={18} className="text-emerald-400" />
                    </div>
                    <div>
                      <h4 className="text-base font-black text-white">{selectedPlayerDetails.name}</h4>
                      <p className="text-[10px] text-slate-500">Historial de transacciones — {periodLabel}</p>
                    </div>
                  </div>
                  <button onClick={() => setSelectedPlayerDetails(null)} className="p-1.5 rounded-lg hover:bg-white/10 text-slate-400 hover:text-white transition-all">
                    <X size={18} />
                  </button>
                </div>

                {/* Content - Table list of specific player's payments */}
                <div className="flex-1 overflow-y-auto p-5">
                  {(() => {
                    const playerPayments = subcardPlayersData.filter(p => 
                      (p.IdJugador && p.IdJugador === selectedPlayerDetails.idJugador) || 
                      (!p.IdJugador && p.Jugador === selectedPlayerDetails.name)
                    );
                    
                    return playerPayments.length === 0 ? (
                      <div className="py-12 text-center text-slate-500 text-sm">Sin pagos registrados</div>
                    ) : (
                      <div className="overflow-x-auto rounded-xl border border-white/5">
                        <table className="w-full text-left border-collapse text-xs">
                          <thead>
                            <tr className="bg-white/5 text-[9px] uppercase font-black text-slate-500 tracking-wider">
                              <th className="px-3 py-3">Fecha</th>
                              <th className="px-3 py-3">Recibo</th>
                              <th className="px-3 py-3">Liga / Producto</th>
                              <th className="px-3 py-3 text-right">Monto</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-white/5">
                            {playerPayments.map((p) => (
                              <tr key={p.IdPago} className="hover:bg-white/3 transition-colors">
                                <td className="px-3 py-3 whitespace-nowrap text-slate-400">
                                  {new Date(p.FechaPago).toLocaleDateString("es-MX", { day: '2-digit', month: 'short', year: 'numeric' })}
                                  <span className="block text-[9px] opacity-60">{new Date(p.FechaPago).toLocaleTimeString("es-MX", { hour: '2-digit', minute: '2-digit' })}</span>
                                </td>
                                <td className="px-3 py-3 text-slate-400 font-bold">{p.Recibo || '—'}</td>
                                <td className="px-3 py-3">
                                  <p className="font-bold text-slate-300">{p.Liga}</p>
                                  <p className="text-[10px] text-slate-500">{p.Producto}</p>
                                </td>
                                <td className="px-3 py-3 text-right font-black text-emerald-400">{fmt(p.Pago)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    );
                  })()}
                </div>

                {/* Footer */}
                <div className="p-4 bg-white/3 border-t border-white/5 flex justify-between items-center text-[10px] text-slate-500 px-6">
                  <p>Pagos registrados: {subcardPlayersData.filter(p => (p.IdJugador && p.IdJugador === selectedPlayerDetails.idJugador) || (!p.IdJugador && p.Jugador === selectedPlayerDetails.name)).length}</p>
                  <p className="font-bold text-slate-400">Total pagado por el jugador: <span className="text-emerald-400 font-black ml-1">{fmt(subcardPlayersData.filter(p => (p.IdJugador && p.IdJugador === selectedPlayerDetails.idJugador) || (!p.IdJugador && p.Jugador === selectedPlayerDetails.name)).reduce((acc, curr) => acc + Number(curr.Pago), 0))}</span></p>
                </div>
              </div>
            </div>
          )}

          {/* KPI Cards */}
          {isLoading ? (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">{[...Array(4)].map((_, i) => <div key={i} className="h-36 bg-white/5 rounded-2xl animate-pulse border border-white/10" />)}</div>
          ) : (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {kpiCards.map((card) => (
                <div 
                  key={card.label} 
                  onClick={card.onClick}
                  className={`relative group ${card.bg} border ${card.border} rounded-2xl p-5 overflow-hidden hover:shadow-lg transition-all ${card.onClick ? 'cursor-pointer' : ''}`}
                >
                  <div className="absolute -top-6 -right-6 w-24 h-24 bg-white/5 rounded-full blur-xl group-hover:bg-white/10 transition-all" />
                  <div className="relative z-10">
                    <div className="flex items-center justify-between mb-3">
                      <div className={`${card.iconBg} p-2 rounded-xl border`}>{card.icon}</div>
                      {card.accent && <span className="text-[10px] font-black text-blue-400/70 uppercase tracking-widest bg-blue-500/10 px-2 py-0.5 rounded-full border border-blue-500/20">{periodLabel}</span>}
                    </div>
                    <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">{card.label}</p>
                    <p className="text-3xl font-black text-white leading-none">{card.value}</p>
                    <p className="text-[10px] text-slate-500 mt-2">{card.sub}</p>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Tendencia de pagos, a todo lo ancho */}
          <div className="bg-white/5 border border-white/10 rounded-2xl p-5">
            <div className="flex items-center justify-between mb-5">
              <div>
                <h3 className="text-sm font-black text-white">Tendencia de Pagos (últimos {timelineSlice.length} días con pagos)</h3>
                <p className="text-[10px] text-slate-500 mt-0.5">Monto cobrado por día</p>
              </div>
              <BarChart3 size={16} className="text-slate-500" />
            </div>
            {isLoading ? <div className="h-56 bg-white/5 rounded-xl animate-pulse" /> : timelineSlice.length > 0 ? (
              <div className="flex items-stretch gap-1 h-56">
                {timelineSlice.map((entry, i) => {
                  /* Se topa al 90% para dejar sitio a la cantidad encima de la barra;
                     el mínimo evita que un día flojo desaparezca. */
                  const pct = Math.min(Math.max((entry.Total / maxTimeline) * 90, 2), 90);
                  const dateLabel = new Date(entry.Fecha + "T12:00:00").toLocaleDateString("es-MX", { day: "2-digit", month: "short" });
                  /* Con pantalla angosta no cabe una etiqueta por barra: se dejan las
                     de los extremos y la del centro, y el resto aparece desde lg. */
                  const esClave = i === 0 || i === Math.floor(timelineSlice.length / 2) || i === timelineSlice.length - 1;
                  return (
                    <div key={i} className="flex-1 flex flex-col min-w-0 group/bar">
                      <div className="flex-1 flex flex-col justify-end items-center">
                        <span className="hidden lg:block text-[9px] font-bold text-slate-400 group-hover/bar:text-white transition-colors mb-1 whitespace-nowrap">
                          {fmtC(entry.Total)}
                        </span>
                        <div
                          title={`${dateLabel}: ${fmt(entry.Total)} · ${entry.Pagos} pagos`}
                          className="w-full rounded-t bg-gradient-to-t from-blue-700 to-blue-400 opacity-80 group-hover/bar:opacity-100 transition-all cursor-default"
                          style={{ height: `${pct}%` }}
                        />
                      </div>
                      <span className={`text-[8px] text-slate-500 text-center leading-tight whitespace-nowrap mt-1.5 ${esClave ? '' : 'hidden lg:block'}`}>
                        {dateLabel}
                      </span>
                    </div>
                  );
                })}
              </div>
            ) : <div className="h-56 flex items-center justify-center text-slate-500 text-sm">Sin datos en los últimos 30 días</div>}
          </div>

          {/* Bottom: Por Sede + Por Liga + Acumulado de la temporada */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <BarSection
              title="Por Sede"
              icon={<MapPin size={14} className="text-rose-400" />}
              data={data?.bySede ?? []}
              labelKey="Sede"
              colorBase="from-rose-600 to-rose-400"
              period={periodLabel}
              onClickItem={(item) => fetchDetails({ idSede: item.IdSede }, item.Sede || 'Sede', periodLabel)}
            />
            <BarSection
              title="Por Liga"
              icon={<Trophy size={14} className="text-blue-400" />}
              data={data?.byLeague ?? []}
              labelKey="Liga"
              period={periodLabel}
              onClickItem={(item) => fetchDetails({ idLiga: item.IdLiga }, item.Liga || 'Liga', periodLabel)}
            />
            <SeasonCard data={data} />
          </div>

          {/* Empty state */}
          {!isLoading && data && data.kpi.totalPagos === 0 && (
            <div className="bg-white/5 border border-dashed border-white/10 rounded-2xl p-12 text-center">
              <TrendingDown size={40} className="mx-auto text-slate-600 mb-3" />
              <h3 className="text-lg font-bold text-slate-300">Sin pagos en este período</h3>
              <p className="text-sm text-slate-500 mt-1">Prueba seleccionando un período diferente o ajustando las fechas.</p>
            </div>
          )}
        </div>
      </main>
    </DashboardLayout>
  );
}
