"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useUser } from "@/contexts/user-context";
import DashboardLayout from "@/components/DashboardLayout";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import {
  KeyRound, DollarSign, TrendingDown, Lock, MapPin,
  RefreshCw, X, AlertCircle, Wallet, Scissors, ChevronRight,
  CreditCard, Shirt, Receipt, Ticket, Sparkles, CalendarRange, LayoutGrid, FileDown,
} from "lucide-react";

interface CorteData {
  idApertura: number;
  idSede: number;
  sede: string;
  fechaApertura: string;
  fechaCierre: string | null;
  usuarioApertura: string;
  usuarioCierre: string;
  cajero: string;
  cerrado: boolean;
  fondoCaja: number;
  ventasMembresias: number;
  ventasUniformes: number;
  totalVentas: number;
  ventasDolares: number;
  totalGastos: number;
  captura: {
    efectivo: number;
    tarjetaCredito: number;
    tarjetaDebito: number;
    depositos: number;
    transferencias: number;
    openPay: number;
    dolares: number;
  };
  ventasEfectivo: number;
  gastosEfectivo: number;
  efectivoCaja: number;
  efectivoCaptura: number;
  diferencia: number;
  difDolares: number;
}

interface FormaPagoRow {
  idFormaPago: number;
  formaPago: string;
  cantidad: number;
  total: number;
}

interface VentasData {
  idApertura: number;
  idSede: number;
  sede: string;
  fechaApertura: string;
  fechaCierre: string | null;
  fondoCaja: number;
  cajero: string;
  cerrado: boolean;
  operaciones: number;
  membresias: FormaPagoRow[];
  uniformes: FormaPagoRow[];
  total: FormaPagoRow[];
  totales: {
    membresias: number;
    uniformes: number;
    total: number;
  };
}

interface EgresoLinea {
  idEgreso: number;
  fecha: string;
  concepto: string;
  total: number;
  formaPago: string;
  usuario: string;
}

interface EgresosData {
  idApertura: number;
  idSede: number;
  sede: string;
  fechaApertura: string;
  fechaCierre: string | null;
  cajero: string;
  cerrado: boolean;
  porFormaPago: FormaPagoRow[];
  detalle: EgresoLinea[];
  totalEgresos: number;
  numEgresos: number;
}

interface Apertura {
  IdApertura: number;
  IdSede: number;
  Sede: string;
  FechaApertura: string;
  Mes: number;
  Anio: number;
  UsuarioApertura: string;
  Cajero: string | null;
  FechaCierre: string | null;
  UsuarioCierre: string | null;
  TotalPagos: number;
  TotalVentas: number;
  NumEgresos: number;
  TotalEgresos: number;
  FondoCaja: number;
}

const MESES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

const SEDE_PALETTES = [
  { gradient: "from-blue-600/25 to-blue-900/10",    border: "border-blue-500/35",    accent: "text-blue-300",   icon: "bg-blue-500/20 border-blue-500/25",   dot: "bg-blue-400",    badge: "bg-blue-600/80 text-blue-100"    },
  { gradient: "from-emerald-600/25 to-emerald-900/10", border: "border-emerald-500/35", accent: "text-emerald-300", icon: "bg-emerald-500/20 border-emerald-500/25", dot: "bg-emerald-400", badge: "bg-emerald-600/80 text-emerald-100" },
  { gradient: "from-purple-600/25 to-purple-900/10", border: "border-purple-500/35",  accent: "text-purple-300", icon: "bg-purple-500/20 border-purple-500/25",  dot: "bg-purple-400",  badge: "bg-purple-600/80 text-purple-100"  },
  { gradient: "from-amber-600/25 to-amber-900/10",   border: "border-amber-500/35",   accent: "text-amber-300",  icon: "bg-amber-500/20 border-amber-500/25",   dot: "bg-amber-400",   badge: "bg-amber-600/80 text-amber-100"    },
  { gradient: "from-rose-600/25 to-rose-900/10",     border: "border-rose-500/35",    accent: "text-rose-300",   icon: "bg-rose-500/20 border-rose-500/25",     dot: "bg-rose-400",    badge: "bg-rose-600/80 text-rose-100"      },
  { gradient: "from-cyan-600/25 to-cyan-900/10",     border: "border-cyan-500/35",    accent: "text-cyan-300",   icon: "bg-cyan-500/20 border-cyan-500/25",     dot: "bg-cyan-400",    badge: "bg-cyan-600/80 text-cyan-100"      },
];

const CURRENT_YEAR = new Date().getFullYear();
const YEARS = [CURRENT_YEAR, CURRENT_YEAR - 1, CURRENT_YEAR - 2, CURRENT_YEAR - 3];

const fmt = (n: number) =>
  new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(n);

function fmtTime(dateStr: string | null): string {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" });
}

function fmtDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("es-MX", {
    weekday: "short", day: "2-digit", month: "short",
  });
}

function InitialAvatar({ name, colorClass }: { name: string; colorClass: string }) {
  return (
    <span className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-[10px] font-black border ${colorClass}`}>
      {name?.charAt(0).toUpperCase() ?? "?"}
    </span>
  );
}

// Una apertura = fila con 4 cards (Apertura · Ventas · Egresos · Corte). Idéntica al Control de Caja.
function AperturaRow({ ap, pal, onVentas, onEgresos, onCorte }: {
  ap: Apertura;
  pal: typeof SEDE_PALETTES[number];
  onVentas: (idApertura: number, idSede: number) => void;
  onEgresos: (idApertura: number, idSede: number) => void;
  onCorte: (idApertura: number, idSede: number) => void;
}) {
  const isOpen = !ap.FechaCierre;
  const neto = Number(ap.TotalVentas) - Number(ap.TotalEgresos);

  return (
    <div className={`rounded-2xl border p-4 ${
      isOpen
        ? "bg-emerald-500/[0.03] border-emerald-500/15"
        : "bg-white/[0.02] border-white/5"
    }`}>

      {/* Row header */}
      <div className="flex items-center justify-between mb-3">
        <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
          {fmtDate(ap.FechaApertura)} · #{ap.IdApertura}
        </span>
        <span className={`text-[9px] font-black px-2 py-0.5 rounded-full flex items-center gap-1 ${
          isOpen
            ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30"
            : "bg-slate-700/50 text-slate-500 border border-white/5"
        }`}>
          <span className={`w-1.5 h-1.5 rounded-full ${isOpen ? "bg-emerald-400 animate-pulse" : "bg-slate-500"}`} />
          {isOpen ? "En Curso" : "Cerrado"}
        </span>
      </div>

      {/* 4 cards side by side */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">

        {/* ── Card 1: Apertura ── */}
        <div className={`bg-gradient-to-br ${pal.gradient} border ${pal.border} rounded-2xl p-4 shadow-lg h-full`}>
          <div className="flex items-center gap-2 mb-3">
            <div className={`p-1.5 rounded-lg border ${pal.icon}`}>
              <KeyRound size={13} className={pal.accent} />
            </div>
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Apertura</span>
          </div>
          <p className={`text-3xl font-black ${pal.accent} leading-none tabular-nums`}>
            {fmtTime(ap.FechaApertura)}
          </p>
          <div className="flex items-center gap-2 mt-2.5">
            <InitialAvatar name={ap.UsuarioApertura} colorClass={`${pal.icon} ${pal.accent}`} />
            <p className="text-xs text-slate-300 font-semibold truncate">{ap.UsuarioApertura}</p>
          </div>
          <div className="mt-3 pt-3 border-t border-white/10 flex items-center justify-between">
            <div className="min-w-0 flex-1 pr-2">
              <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest block">Cajero</span>
              <div className="flex items-center gap-1.5 mt-1.5">
                <InitialAvatar name={ap.Cajero ?? ""} colorClass="bg-white/10 border-white/15 text-slate-200" />
                <p className="text-xs text-white font-bold truncate">{ap.Cajero ?? "—"}</p>
              </div>
            </div>
            <div className="text-right flex-shrink-0">
              <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest block">Fondo Caja</span>
              <span className="text-xs font-black text-emerald-400 tabular-nums block mt-2">{fmt(ap.FondoCaja)}</span>
            </div>
          </div>
        </div>

        {/* ── Card 2: Ventas (clickeable → desglose por forma de pago) ── */}
        <button
          onClick={() => onVentas(ap.IdApertura, ap.IdSede)}
          className="group text-left bg-white/5 border border-white/10 rounded-2xl p-4 shadow-lg h-full transition-all hover:scale-[1.02] hover:border-emerald-500/40 hover:bg-emerald-500/5 cursor-pointer">
          <div className="flex items-center gap-2 mb-3">
            <div className="p-1.5 rounded-lg bg-emerald-500/15 border border-emerald-500/20">
              <DollarSign size={13} className="text-emerald-400" />
            </div>
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Ventas</span>
            <ChevronRight size={13} className="text-slate-600 ml-auto opacity-0 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all" />
          </div>
          <p className="text-2xl font-black text-emerald-400 leading-none tabular-nums">
            {fmt(Number(ap.TotalVentas))}
          </p>
          <p className="text-[11px] text-slate-500 mt-1.5">
            {Number(ap.TotalPagos).toLocaleString("es-MX")}&nbsp;
            pago{Number(ap.TotalPagos) !== 1 ? "s" : ""} · ver desglose →
          </p>
        </button>

        {/* ── Card 3: Egresos (clickeable → desglose de gastos) ── */}
        <button
          onClick={() => onEgresos(ap.IdApertura, ap.IdSede)}
          className="group text-left bg-white/5 border border-white/10 rounded-2xl p-4 shadow-lg h-full transition-all hover:scale-[1.02] hover:border-rose-500/40 hover:bg-rose-500/5 cursor-pointer">
          <div className="flex items-center gap-2 mb-3">
            <div className="p-1.5 rounded-lg bg-rose-500/15 border border-rose-500/20">
              <TrendingDown size={13} className="text-rose-400" />
            </div>
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Egresos</span>
            <ChevronRight size={13} className="text-slate-600 ml-auto opacity-0 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all" />
          </div>
          <p className="text-2xl font-black text-rose-400 leading-none tabular-nums">
            {fmt(Number(ap.TotalEgresos))}
          </p>
          <p className="text-[11px] text-slate-500 mt-1.5">
            {Number(ap.NumEgresos).toLocaleString("es-MX")}&nbsp;
            egreso{Number(ap.NumEgresos) !== 1 ? "s" : ""} · ver detalle →
          </p>
          <div className="mt-3 pt-3 border-t border-white/8 flex items-center justify-between">
            <span className="text-[10px] text-slate-500 font-black uppercase tracking-wider">Neto</span>
            <span className={`text-sm font-black tabular-nums ${neto >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
              {fmt(neto)}
            </span>
          </div>
        </button>

        {/* ── Card 4: Corte (clickeable → modal) ── */}
        <button
          onClick={() => onCorte(ap.IdApertura, ap.IdSede)}
          className={`group text-left rounded-2xl p-4 shadow-lg border h-full transition-all hover:scale-[1.02] cursor-pointer ${
            isOpen
              ? "bg-amber-500/5 border-amber-500/25 hover:border-amber-500/50 hover:bg-amber-500/10"
              : "bg-white/5 border-white/10 hover:border-blue-500/40 hover:bg-white/8"
          }`}>
          <div className="flex items-center gap-2 mb-3">
            <div className={`p-1.5 rounded-lg border ${
              isOpen
                ? "bg-amber-500/15 border-amber-500/20"
                : "bg-slate-500/15 border-slate-500/20"
            }`}>
              <Lock size={13} className={isOpen ? "text-amber-400" : "text-slate-400"} />
            </div>
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Corte</span>
            <ChevronRight size={13} className="text-slate-600 ml-auto opacity-0 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all" />
          </div>
          {isOpen ? (
            <div>
              <p className="text-xl font-black text-amber-400">Sin Corte</p>
              <p className="text-[11px] text-amber-500/60 mt-1.5">Ver detalle del corte →</p>
            </div>
          ) : (
            <>
              <p className="text-3xl font-black text-slate-200 leading-none tabular-nums">
                {fmtTime(ap.FechaCierre)}
              </p>
              <div className="flex items-center gap-2 mt-2.5">
                <InitialAvatar name={ap.UsuarioCierre ?? ""} colorClass="bg-slate-500/20 border-slate-500/25 text-slate-300" />
                <p className="text-xs text-slate-300 font-semibold truncate">{ap.UsuarioCierre}</p>
              </div>
            </>
          )}
        </button>

      </div>{/* end 4-card grid */}
    </div>
  );
}

export default function CortesMensualesPage() {
  const router = useRouter();
  const { user } = useUser();

  const [year, setYear]             = useState<number>(CURRENT_YEAR);
  const [selectedSede, setSelectedSede] = useState<number | "all">("all");
  const [aperturas, setAperturas]   = useState<Apertura[]>([]);
  const [isLoading, setIsLoading]   = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [error, setError]           = useState<string | null>(null);

  // Modal "Detalle del mes" — desglose por IdApertura
  const [monthDetailOpen, setMonthDetailOpen] = useState(false);
  const [monthDetail, setMonthDetail] = useState<{ mes: number; items: Apertura[] } | null>(null);

  const openMonthDetail = useCallback((mes: number, items: Apertura[]) => {
    setMonthDetail({ mes, items });
    setMonthDetailOpen(true);
  }, []);

  // Corte modal
  const [corteOpen, setCorteOpen]       = useState(false);
  const [corteLoading, setCorteLoading] = useState(false);
  const [corteData, setCorteData]       = useState<CorteData | null>(null);
  const [corteError, setCorteError]     = useState<string | null>(null);

  const openCorte = useCallback(async (idApertura: number, idSede: number) => {
    setCorteOpen(true);
    setCorteLoading(true);
    setCorteData(null);
    setCorteError(null);
    try {
      const res  = await fetch(`/api/caja/corte/${idApertura}?idSede=${idSede}`);
      const json = await res.json();
      if (json.success) setCorteData(json.data);
      else setCorteError(json.message ?? "Error al cargar el corte");
    } catch {
      setCorteError("Error de conexión");
    } finally {
      setCorteLoading(false);
    }
  }, []);

  // Ventas modal (desglose por forma de pago — frmProcCorteCaja)
  const [ventasOpen, setVentasOpen]       = useState(false);
  const [ventasLoading, setVentasLoading] = useState(false);
  const [ventasData, setVentasData]       = useState<VentasData | null>(null);
  const [ventasError, setVentasError]     = useState<string | null>(null);

  const openVentas = useCallback(async (idApertura: number, idSede: number) => {
    setVentasOpen(true);
    setVentasLoading(true);
    setVentasData(null);
    setVentasError(null);
    try {
      const res  = await fetch(`/api/caja/ventas/${idApertura}?idSede=${idSede}`);
      const json = await res.json();
      if (json.success) setVentasData(json.data);
      else setVentasError(json.message ?? "Error al cargar las ventas");
    } catch {
      setVentasError("Error de conexión");
    } finally {
      setVentasLoading(false);
    }
  }, []);

  // Detalle de Ventas Individuales Modal (frmProcDetalleCorteCaja)
  const [salesDetailOpen, setSalesDetailOpen] = useState(false);
  const [salesDetailLoading, setSalesDetailLoading] = useState(false);
  const [salesDetailData, setSalesDetailData] = useState<any[]>([]);
  const [salesDetailError, setSalesDetailError] = useState<string | null>(null);
  const [salesDetailMeta, setSalesDetailMeta] = useState<{
    idGrid: number;
    idFormaPago: number;
    formaPago: string;
    gridName: string;
  } | null>(null);

  const openSalesDetail = useCallback(async (idGrid: number, idFormaPago: number, formaPago: string, gridName: string) => {
    if (!ventasData) return;
    setSalesDetailOpen(true);
    setSalesDetailLoading(true);
    setSalesDetailData([]);
    setSalesDetailError(null);
    setSalesDetailMeta({ idGrid, idFormaPago, formaPago, gridName });

    try {
      const res = await fetch(`/api/caja/ventas/${ventasData.idApertura}/detalle?idSede=${ventasData.idSede}&idGrid=${idGrid}&idFormaPago=${idFormaPago}`);
      const json = await res.json();
      if (json.success) setSalesDetailData(json.data);
      else setSalesDetailError(json.message ?? "Error al cargar los detalles de venta");
    } catch {
      setSalesDetailError("Error de conexión");
    } finally {
      setSalesDetailLoading(false);
    }
  }, [ventasData]);

  // Egresos modal (desglose por forma de pago + líneas individuales)
  const [egresosOpen, setEgresosOpen]       = useState(false);
  const [egresosLoading, setEgresosLoading] = useState(false);
  const [egresosData, setEgresosData]       = useState<EgresosData | null>(null);
  const [egresosError, setEgresosError]     = useState<string | null>(null);

  const openEgresos = useCallback(async (idApertura: number, idSede: number) => {
    setEgresosOpen(true);
    setEgresosLoading(true);
    setEgresosData(null);
    setEgresosError(null);
    try {
      const res  = await fetch(`/api/caja/egresos/${idApertura}?idSede=${idSede}`);
      const json = await res.json();
      if (json.success) setEgresosData(json.data);
      else setEgresosError(json.message ?? "Error al cargar los egresos");
    } catch {
      setEgresosError("Error de conexión");
    } finally {
      setEgresosLoading(false);
    }
  }, []);

  const fetchAperturas = useCallback(async (y: number) => {
    setIsLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ period: "year", year: String(y) });
      const res  = await fetch(`/api/caja/aperturas?${params}`);
      const json = await res.json();
      if (json.success) {
        setAperturas(json.data);
        setLastUpdated(new Date());
      } else {
        setError(json.message ?? "Error al cargar datos");
      }
    } catch {
      setError("Error de conexión");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!user) return;
    if ((user.AdminConvocatorias ?? 0) < 2) { router.push("/"); return; }
    fetchAperturas(year);
  }, [user]);

  const handleYearClick = (y: number) => {
    if (y === year) return;
    setYear(y);
    setSelectedSede("all");
    fetchAperturas(y);
  };

  // Sedes presentes en el año (para el selector y colores estables por sede)
  const sedeOptions = (() => {
    const map = new Map<number, { IdSede: number; Sede: string; ventas: number }>();
    for (const ap of aperturas) {
      if (!map.has(ap.IdSede)) map.set(ap.IdSede, { IdSede: ap.IdSede, Sede: ap.Sede, ventas: 0 });
      map.get(ap.IdSede)!.ventas += Number(ap.TotalVentas);
    }
    return [...map.values()].sort((a, b) => a.Sede.localeCompare(b.Sede));
  })();
  const sedePaletteIndex = new Map(sedeOptions.map((s, i) => [s.IdSede, i]));
  const getSedePalette = (idSede: number) =>
    SEDE_PALETTES[(sedePaletteIndex.get(idSede) ?? 0) % SEDE_PALETTES.length];

  // Filtrado por sede seleccionada (TODOS o una sede en particular)
  const filtered = selectedSede === "all"
    ? aperturas
    : aperturas.filter((a) => a.IdSede === selectedSede);

  // Agrupar por mes (descendente: mes más reciente primero)
  const monthMap = new Map<number, Apertura[]>();
  for (const ap of filtered) {
    const m = Number(ap.Mes);
    if (!monthMap.has(m)) monthMap.set(m, []);
    monthMap.get(m)!.push(ap);
  }
  const monthEntries = [...monthMap.entries()].sort((a, b) => b[0] - a[0]);

  // Sub-agrupar las aperturas de un mes por sede, conservando el orden ya ordenado por la API
  const groupBySede = (items: Apertura[]) => {
    const map = new Map<number, { sede: string; items: Apertura[] }>();
    for (const ap of items) {
      if (!map.has(ap.IdSede)) map.set(ap.IdSede, { sede: ap.Sede, items: [] });
      map.get(ap.IdSede)!.items.push(ap);
    }
    return [...map.entries()];
  };

  // Detalle del mes abierto, sub-agrupado por sede (para el modal por IdApertura)
  const monthSedeEntries = monthDetail ? groupBySede(monthDetail.items) : [];

  const totalVentas  = filtered.reduce((s, a) => s + Number(a.TotalVentas),  0);
  const totalEgresos = filtered.reduce((s, a) => s + Number(a.TotalEgresos), 0);

  const sedeLabel = selectedSede === "all"
    ? "Todas las sedes"
    : (sedeOptions.find((s) => s.IdSede === selectedSede)?.Sede ?? "Sede");

  // Exportar el resumen mensual (página principal) — un renglón por mes
  const handleExportResumenPDF = () => {
    if (monthEntries.length === 0) return;

    const doc = new jsPDF();
    doc.setFontSize(18);
    doc.text("Cortes de Caja por Mes", 14, 20);
    doc.setFontSize(12);
    doc.text(`Año: ${year}  ·  ${sedeLabel}`, 14, 28);
    doc.setFontSize(10);
    doc.text(`Fecha de generación: ${new Date().toLocaleString("es-MX")}`, 14, 34);

    const rows = [...monthEntries]
      .sort((a, b) => a[0] - b[0])
      .map(([mes, items]) => {
        const v = items.reduce((s, a) => s + Number(a.TotalVentas), 0);
        const e = items.reduce((s, a) => s + Number(a.TotalEgresos), 0);
        return [MESES[mes - 1], String(items.length), fmt(v), fmt(e), fmt(v - e)];
      });

    autoTable(doc, {
      startY: 40,
      head: [["Mes", "Aperturas", "Ventas", "Egresos", "Neto"]],
      body: rows,
      theme: "grid",
      headStyles: { fillColor: [59, 130, 246] },
      columnStyles: { 1: { halign: "right" }, 2: { halign: "right" }, 3: { halign: "right" }, 4: { halign: "right" } },
      foot: [["TOTAL", String(filtered.length), fmt(totalVentas), fmt(totalEgresos), fmt(totalVentas - totalEgresos)]],
      footStyles: { fillColor: [241, 245, 249], textColor: [30, 41, 59], fontStyle: "bold" },
    });

    doc.save(`Cortes_por_Mes_${year}_${sedeLabel.replace(/\s+/g, "_")}.pdf`);
  };

  // Exportar el detalle del mes abierto — un renglón por IdApertura
  const handleExportDetallePDF = () => {
    if (!monthDetail || monthDetail.items.length === 0) return;
    const mesLabel = `${MESES[monthDetail.mes - 1]} ${year}`;

    const doc = new jsPDF();
    doc.setFontSize(18);
    doc.text(`Detalle de Cortes — ${mesLabel}`, 14, 20);
    doc.setFontSize(12);
    doc.text(sedeLabel, 14, 28);
    doc.setFontSize(10);
    doc.text(`Fecha de generación: ${new Date().toLocaleString("es-MX")}`, 14, 34);

    const rows = monthSedeEntries.flatMap(([, { items: sedeItems }]) =>
      sedeItems.map((ap) => {
        const v = Number(ap.TotalVentas);
        const e = Number(ap.TotalEgresos);
        return [
          `#${ap.IdApertura}`,
          new Date(ap.FechaApertura).toLocaleDateString("es-MX"),
          ap.Sede,
          ap.Cajero ?? "—",
          ap.FechaCierre ? "Cerrado" : "En curso",
          fmt(v),
          fmt(e),
          fmt(v - e),
        ];
      })
    );

    autoTable(doc, {
      startY: 40,
      head: [["Apertura", "Fecha", "Sede", "Cajero", "Estado", "Ventas", "Egresos", "Neto"]],
      body: rows,
      theme: "grid",
      styles: { fontSize: 8 },
      headStyles: { fillColor: [59, 130, 246] },
      columnStyles: { 5: { halign: "right" }, 6: { halign: "right" }, 7: { halign: "right" } },
      foot: [[
        "TOTAL", "", "", "", "",
        fmt(monthDetail.items.reduce((s, a) => s + Number(a.TotalVentas), 0)),
        fmt(monthDetail.items.reduce((s, a) => s + Number(a.TotalEgresos), 0)),
        fmt(monthDetail.items.reduce((s, a) => s + (Number(a.TotalVentas) - Number(a.TotalEgresos)), 0)),
      ]],
      footStyles: { fillColor: [241, 245, 249], textColor: [30, 41, 59], fontStyle: "bold" },
    });

    doc.save(`Detalle_Cortes_${MESES[monthDetail.mes - 1]}_${year}_${sedeLabel.replace(/\s+/g, "_")}.pdf`);
  };

  return (
    <DashboardLayout>
      <main className="overflow-y-auto flex-1 text-white">

        {/* ── Sticky header ─────────────────────────────────────── */}
        <div className="bg-white/5 backdrop-blur-xl border-b border-white/10 px-6 py-4 flex justify-between items-center sticky top-0 z-20">
          <div>
            <h1 className="text-xl font-black flex items-center gap-2">
              <CalendarRange size={20} className="text-blue-400" />
              Cortes de Caja por Mes
            </h1>
            <p className="text-xs text-blue-300 mt-0.5">Aperturas y cortes agrupados por mes — {year}</p>
          </div>
          <div className="flex items-center gap-3">
            {lastUpdated && (
              <span className="text-[10px] text-slate-500">
                Act.&nbsp;{lastUpdated.toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" })}
              </span>
            )}
            <button
              onClick={handleExportResumenPDF}
              disabled={isLoading || monthEntries.length === 0}
              className="flex items-center gap-2 px-3 py-2 rounded-xl bg-blue-600/20 hover:bg-blue-600/30 border border-blue-500/30 text-blue-200 text-xs font-bold transition-all disabled:opacity-40 disabled:cursor-not-allowed"
              title="Exportar resumen a PDF"
            >
              <FileDown size={15} />
              <span className="hidden sm:inline">Exportar PDF</span>
            </button>
            <button
              onClick={() => fetchAperturas(year)}
              disabled={isLoading}
              className="p-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-slate-400 hover:text-white transition-all"
              title="Actualizar"
            >
              <RefreshCw size={15} className={isLoading ? "animate-spin" : ""} />
            </button>
          </div>
        </div>

        <div className="p-6 md:p-8 space-y-8">

          {/* ── Year selector ──────────────────────────────────── */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h2 className="text-lg font-black">Resumen Mensual {year}</h2>
              <p className="text-xs text-slate-400 mt-0.5">Cortes agrupados por mes y sede — selecciona el año</p>
            </div>
            <div className="flex gap-2 bg-white/5 p-1 rounded-2xl border border-white/10 flex-wrap">
              {YEARS.map((y) => (
                <button
                  key={y}
                  onClick={() => handleYearClick(y)}
                  className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold transition-all duration-200 ${
                    year === y
                      ? "bg-blue-600 text-white shadow-lg shadow-blue-500/30 scale-[1.03]"
                      : "text-slate-400 hover:text-white hover:bg-white/8"
                  }`}
                >
                  {y}
                </button>
              ))}
            </div>
          </div>

          {/* ── Sede selector (TODOS / por sede) ───────────────── */}
          {!isLoading && aperturas.length > 0 && (
            <div>
              <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2.5">Filtrar por sede</p>
              <div className="flex flex-wrap gap-3">
                {/* TODOS */}
                <button
                  onClick={() => setSelectedSede("all")}
                  className={`flex items-center gap-3 px-4 py-3 rounded-2xl border text-left transition-all ${
                    selectedSede === "all"
                      ? "bg-blue-600/20 border-blue-500/40 scale-[1.02] shadow-lg shadow-blue-500/10"
                      : "bg-white/5 border-white/10 hover:bg-white/8 hover:border-white/20"
                  }`}
                >
                  <div className={`p-2 rounded-xl border ${selectedSede === "all" ? "bg-blue-500/20 border-blue-500/30" : "bg-white/5 border-white/10"}`}>
                    <LayoutGrid size={16} className={selectedSede === "all" ? "text-blue-300" : "text-slate-400"} />
                  </div>
                  <div>
                    <p className={`text-sm font-black ${selectedSede === "all" ? "text-white" : "text-slate-300"}`}>TODOS</p>
                    <p className="text-[10px] text-slate-500 tabular-nums">{fmt(aperturas.reduce((s, a) => s + Number(a.TotalVentas), 0))}</p>
                  </div>
                </button>

                {/* Por sede */}
                {sedeOptions.map((s) => {
                  const pal = getSedePalette(s.IdSede);
                  const active = selectedSede === s.IdSede;
                  return (
                    <button
                      key={s.IdSede}
                      onClick={() => setSelectedSede(s.IdSede)}
                      className={`flex items-center gap-3 px-4 py-3 rounded-2xl border text-left transition-all ${
                        active
                          ? `bg-gradient-to-br ${pal.gradient} ${pal.border} scale-[1.02] shadow-lg`
                          : "bg-white/5 border-white/10 hover:bg-white/8 hover:border-white/20"
                      }`}
                    >
                      <div className={`p-2 rounded-xl border ${pal.icon}`}>
                        <MapPin size={16} className={pal.accent} />
                      </div>
                      <div>
                        <p className={`text-sm font-black ${active ? "text-white" : "text-slate-300"}`}>{s.Sede}</p>
                        <p className="text-[10px] text-slate-500 tabular-nums">{fmt(s.ventas)}</p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── Summary KPI strip ──────────────────────────────── */}
          {!isLoading && aperturas.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {[
                { label: "Meses con Mov.",  value: monthEntries.length.toString(),       sub: "con aperturas",      icon: <CalendarRange size={16} className="text-blue-400"   />, ibg: "bg-blue-500/10 border-blue-500/20"    },
                { label: "Total Aperturas", value: filtered.length.toString(),            sub: `en ${year}`,        icon: <KeyRound  size={16} className="text-emerald-400"/>, ibg: "bg-emerald-500/10 border-emerald-500/20" },
                { label: "Total Ventas",    value: fmt(totalVentas),                     sub: "ingresos del año",  icon: <DollarSign size={16} className="text-emerald-400"/>, ibg: "bg-emerald-500/10 border-emerald-500/20" },
                { label: "Total Egresos",   value: fmt(totalEgresos),                    sub: "salidas del año",   icon: <TrendingDown size={16} className="text-rose-400" />, ibg: "bg-rose-500/10 border-rose-500/20"       },
              ].map((card) => (
                <div key={card.label} className="bg-white/5 border border-white/10 rounded-2xl p-4 flex items-start gap-3">
                  <div className={`p-2 rounded-xl border flex-shrink-0 ${card.ibg}`}>{card.icon}</div>
                  <div className="min-w-0">
                    <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{card.label}</p>
                    <p className="text-base font-black text-white truncate">{card.value}</p>
                    <p className="text-[10px] text-slate-500">{card.sub}</p>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* ── States: loading / error / empty ───────────────── */}
          {isLoading && (
            <div className="flex flex-col items-center justify-center py-28 gap-4">
              <div className="relative">
                <div className="w-16 h-16 rounded-full border-4 border-blue-500/20 border-t-blue-500 animate-spin" />
                <CalendarRange size={22} className="text-blue-400 absolute inset-0 m-auto" />
              </div>
              <p className="text-sm text-slate-400 font-bold animate-pulse">Cargando cortes del año {year}...</p>
            </div>
          )}

          {!isLoading && error && (
            <div className="flex flex-col items-center justify-center py-24 gap-3 text-rose-400">
              <AlertCircle size={44} className="opacity-60" />
              <p className="text-base font-black">{error}</p>
              <button onClick={() => fetchAperturas(year)}
                className="mt-2 px-5 py-2 rounded-xl bg-rose-500/10 border border-rose-500/20 text-sm font-bold hover:bg-rose-500/20 transition-all">
                Reintentar
              </button>
            </div>
          )}

          {!isLoading && !error && aperturas.length === 0 && (
            <div className="flex flex-col items-center justify-center py-24 gap-3 text-slate-500">
              <AlertCircle size={48} className="opacity-20" />
              <p className="text-lg font-black">Sin aperturas registradas</p>
              <p className="text-sm opacity-60">No hay aperturas de caja para el año {year}.</p>
            </div>
          )}

          {/* ── Cards totalizadas por mes ─────────────────────── */}
          {!isLoading && !error && monthEntries.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {monthEntries.map(([mes, items]) => {
                const mesVentas  = items.reduce((s, a) => s + Number(a.TotalVentas),  0);
                const mesEgresos = items.reduce((s, a) => s + Number(a.TotalEgresos), 0);
                const mesNeto    = mesVentas - mesEgresos;
                const sedeCount  = new Set(items.map((a) => a.IdSede)).size;

                return (
                  <button
                    key={mes}
                    onClick={() => openMonthDetail(mes, items)}
                    className="group text-left bg-white/[0.03] border border-white/10 rounded-3xl p-5 shadow-lg transition-all hover:scale-[1.02] hover:border-blue-500/40 hover:bg-blue-500/5 cursor-pointer"
                  >
                    {/* Card header */}
                    <div className="flex items-center gap-3 mb-4">
                      <div className="p-2.5 rounded-xl border bg-blue-500/15 border-blue-500/25">
                        <CalendarRange size={18} className="text-blue-300" />
                      </div>
                      <div className="min-w-0">
                        <h3 className="text-lg font-black text-white leading-tight">{MESES[mes - 1]}</h3>
                        <p className="text-[10px] text-slate-500">
                          {year} · {items.length} apertura{items.length !== 1 ? "s" : ""} · {sedeCount} sede{sedeCount !== 1 ? "s" : ""}
                        </p>
                      </div>
                      <ChevronRight size={16} className="text-slate-600 ml-auto opacity-0 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all" />
                    </div>

                    {/* Totales del mes */}
                    <div className="space-y-2.5">
                      <div className="flex items-center justify-between">
                        <span className="flex items-center gap-1.5 text-[11px] font-bold text-slate-400">
                          <DollarSign size={13} className="text-emerald-400" /> Ventas
                        </span>
                        <span className="text-sm font-black text-emerald-400 tabular-nums">{fmt(mesVentas)}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="flex items-center gap-1.5 text-[11px] font-bold text-slate-400">
                          <TrendingDown size={13} className="text-rose-400" /> Egresos
                        </span>
                        <span className="text-sm font-black text-rose-400 tabular-nums">{fmt(mesEgresos)}</span>
                      </div>
                      <div className="border-t border-white/10 pt-2.5 flex items-center justify-between">
                        <span className="text-[11px] font-black text-slate-300 uppercase tracking-wider">Neto</span>
                        <span className={`text-base font-black tabular-nums ${mesNeto >= 0 ? "text-emerald-400" : "text-rose-400"}`}>{fmt(mesNeto)}</span>
                      </div>
                    </div>

                    <p className="text-[10px] text-slate-500 mt-4 group-hover:text-blue-400 transition-colors">Ver detalle por apertura →</p>
                  </button>
                );
              })}
            </div>
          )}

        </div>

        {/* ── Modal: Detalle del Mes (desglose por IdApertura) ── */}
        {monthDetailOpen && monthDetail && (
          <div className="fixed inset-0 bg-black/70 backdrop-blur-md flex items-center justify-center z-[110] p-4">
            <div className="bg-[#0f172a] border border-white/10 rounded-3xl w-full max-w-6xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200">

              {/* Header */}
              <div className="p-5 border-b border-white/5 flex items-center justify-between bg-white/5">
                <div className="flex items-center gap-4">
                  <div className="bg-blue-600/20 p-3 rounded-2xl border border-blue-500/20">
                    <CalendarRange size={22} className="text-blue-400" />
                  </div>
                  <div>
                    <h3 className="text-lg font-black text-white">
                      Detalle de {MESES[monthDetail.mes - 1]} {year}
                    </h3>
                    <p className="text-xs text-slate-400">
                      {monthDetail.items.length} apertura{monthDetail.items.length !== 1 ? "s" : ""} · {monthSedeEntries.length} sede{monthSedeEntries.length !== 1 ? "s" : ""} · clic en cada card para ver corte, ventas o egresos
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleExportDetallePDF}
                    className="flex items-center gap-2 px-3 py-2 rounded-xl bg-blue-600/20 hover:bg-blue-600/30 border border-blue-500/30 text-blue-200 text-xs font-bold transition-all"
                    title="Exportar detalle a PDF"
                  >
                    <FileDown size={15} />
                    <span className="hidden sm:inline">Exportar PDF</span>
                  </button>
                  <button onClick={() => setMonthDetailOpen(false)} className="p-2 rounded-xl hover:bg-white/10 text-slate-400 hover:text-white transition-all">
                    <X size={20} />
                  </button>
                </div>
              </div>

              {/* Content */}
              <div className="flex-1 overflow-y-auto p-6 space-y-8">
                {monthSedeEntries.map(([idSede, { sede, items: sedeItems }], sedeIdx) => {
                  const pal        = getSedePalette(idSede);
                  const sedeTotal  = sedeItems.reduce((s, a) => s + Number(a.TotalVentas),  0);
                  const sedeEgreso = sedeItems.reduce((s, a) => s + Number(a.TotalEgresos), 0);
                  const sedeOpen   = sedeItems.filter((a) => !a.FechaCierre).length;

                  return (
                    <div key={idSede}>
                      {/* Sede header */}
                      <div className="flex flex-wrap items-center gap-3 mb-5">
                        <div className={`p-2.5 rounded-xl border ${pal.icon}`}>
                          <MapPin size={16} className={pal.accent} />
                        </div>
                        <div>
                          <h4 className="text-base font-black text-white">{sede}</h4>
                          <p className="text-[10px] text-slate-500">
                            {sedeItems.length} apertura{sedeItems.length !== 1 ? "s" : ""}
                            {sedeOpen > 0 && <span className="text-emerald-400 ml-1">· {sedeOpen} en curso</span>}
                          </p>
                        </div>
                        <div className="ml-auto flex items-center gap-2">
                          <span className={`text-[10px] font-black px-3 py-1 rounded-full border ${pal.icon} ${pal.accent}`}>
                            Ventas {fmt(sedeTotal)}
                          </span>
                          <span className="text-[10px] font-black px-3 py-1 rounded-full bg-rose-500/10 border border-rose-500/20 text-rose-300">
                            Egresos {fmt(sedeEgreso)}
                          </span>
                        </div>
                      </div>

                      {/* Aperturas */}
                      <div className="space-y-4">
                        {sedeItems.map((ap) => (
                          <AperturaRow
                            key={ap.IdApertura}
                            ap={ap}
                            pal={pal}
                            onVentas={openVentas}
                            onEgresos={openEgresos}
                            onCorte={openCorte}
                          />
                        ))}
                      </div>

                      {/* Sede divider */}
                      {sedeIdx < monthSedeEntries.length - 1 && (
                        <div className="mt-8 border-t border-white/5" />
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Footer */}
              <div className="p-4 bg-white/5 border-t border-white/5 flex justify-between items-center text-[11px] text-slate-500 px-6">
                <p>Detalle por apertura — {MESES[monthDetail.mes - 1]} {year}</p>
                <p className="font-black text-white">
                  Ventas: <span className="text-emerald-400">{fmt(monthDetail.items.reduce((s, a) => s + Number(a.TotalVentas), 0))}</span>
                  <span className="mx-2 text-slate-600">·</span>
                  Egresos: <span className="text-rose-400">{fmt(monthDetail.items.reduce((s, a) => s + Number(a.TotalEgresos), 0))}</span>
                </p>
              </div>

            </div>
          </div>
        )}

        {/* ── Modal: Corte de Caja (solo lectura) ──────────────── */}
        {corteOpen && (
          <div className="fixed inset-0 bg-black/70 backdrop-blur-md flex items-center justify-center z-[120] p-4">
            <div className="bg-[#0f172a] border border-white/10 rounded-3xl w-full max-w-5xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200">

              {/* Header */}
              <div className="p-5 border-b border-white/5 flex items-center justify-between bg-white/5">
                <div className="flex items-center gap-4">
                  <div className="bg-blue-600/20 p-3 rounded-2xl border border-blue-500/20">
                    <Scissors size={22} className="text-blue-400" />
                  </div>
                  <div>
                    <h3 className="text-lg font-black text-white">
                      Corte de Caja {corteData ? `— Apertura #${corteData.idApertura}` : ""}
                    </h3>
                    <p className="text-xs text-slate-400">
                      {corteData
                        ? `${corteData.sede} · ${corteData.cerrado ? "Cerrado" : "En curso"}`
                        : "Cargando..."}
                    </p>
                  </div>
                </div>
                <button onClick={() => setCorteOpen(false)} className="p-2 rounded-xl hover:bg-white/10 text-slate-400 hover:text-white transition-all">
                  <X size={20} />
                </button>
              </div>

              {/* Content */}
              <div className="flex-1 overflow-y-auto p-6">
                {corteLoading ? (
                  <div className="h-64 flex flex-col items-center justify-center gap-4">
                    <RefreshCw className="animate-spin text-blue-500" size={32} />
                    <p className="text-sm text-slate-400 font-bold animate-pulse">Calculando corte...</p>
                  </div>
                ) : corteError ? (
                  <div className="h-64 flex flex-col items-center justify-center gap-3 text-rose-400">
                    <AlertCircle size={40} className="opacity-60" />
                    <p className="text-base font-black">{corteError}</p>
                  </div>
                ) : corteData ? (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-5">

                    {/* ── Bloque 1: Datos ── */}
                    <div className="bg-white/5 border border-white/10 rounded-2xl p-5">
                      <div className="flex items-center gap-2 mb-4">
                        <KeyRound size={14} className="text-blue-400" />
                        <h4 className="text-xs font-black text-white uppercase tracking-widest">Datos</h4>
                      </div>
                      <div className="space-y-2.5">
                        <CorteRow label="Apertura #" value={`#${corteData.idApertura}`} strong />
                        <CorteRow label="Fecha Apertura" value={new Date(corteData.fechaApertura).toLocaleDateString("es-MX", { day: "2-digit", month: "short", year: "numeric" })} />
                        <CorteRow label="Hora Apertura" value={fmtTime(corteData.fechaApertura)} />
                        <CorteRow label="Cajero" value={corteData.cajero || "—"} />
                        <div className="border-t border-white/5 my-1" />
                        <CorteRow label="Fondo Caja" money value={corteData.fondoCaja} />
                        <CorteRow label="Vtas Membresías" money value={corteData.ventasMembresias} tone="emerald" />
                        <CorteRow label="Vtas Uniformes" money value={corteData.ventasUniformes} tone="emerald" />
                        <CorteRow label="Total Ventas" money value={corteData.totalVentas} tone="emerald" strong />
                        <CorteRow label="Ventas Dólares" money value={corteData.ventasDolares} tone="emerald" />
                        <CorteRow label="Total Gastos" money value={corteData.totalGastos} tone="rose" />
                      </div>
                    </div>

                    {/* ── Bloque 2: Captura ── */}
                    <div className="bg-white/5 border border-white/10 rounded-2xl p-5">
                      <div className="flex items-center gap-2 mb-4">
                        <DollarSign size={14} className="text-cyan-400" />
                        <h4 className="text-xs font-black text-white uppercase tracking-widest">Captura</h4>
                      </div>
                      <div className="space-y-2.5">
                        <CorteRow label="Efectivo" money value={corteData.captura.efectivo} box />
                        <CorteRow label="Tarjeta Crédito" money value={corteData.captura.tarjetaCredito} box />
                        <CorteRow label="Tarjeta Débito" money value={corteData.captura.tarjetaDebito} box />
                        <CorteRow label="Depósitos" money value={corteData.captura.depositos} box />
                        <CorteRow label="Transferencias" money value={corteData.captura.transferencias} box />
                        <CorteRow label="Open Pay" money value={corteData.captura.openPay} box />
                        <CorteRow label="Dólares" money value={corteData.captura.dolares} box />
                      </div>
                      {!corteData.cerrado && (
                        <p className="text-[10px] text-amber-400/80 mt-4 leading-relaxed">
                          ⏳ Apertura en curso — los valores de captura aún no se registran.
                        </p>
                      )}
                    </div>

                    {/* ── Bloque 3: Efectivo (arqueo) ── */}
                    <div className="bg-white/5 border border-white/10 rounded-2xl p-5">
                      <div className="flex items-center gap-2 mb-4">
                        <Wallet size={14} className="text-purple-400" />
                        <h4 className="text-xs font-black text-white uppercase tracking-widest">Efectivo</h4>
                      </div>
                      <div className="space-y-2.5">
                        <CorteRow label="Fondo Caja" money value={corteData.fondoCaja} />
                        <CorteRow label="Vtas Efectivo" money value={corteData.ventasEfectivo} tone="emerald" />
                        <CorteRow label="Gastos Efectivo" money value={corteData.gastosEfectivo} tone="rose" />
                        <div className="border-t border-white/5 my-1" />
                        <CorteRow label="Efectivo Caja" money value={corteData.efectivoCaja} strong />
                        <CorteRow label="Efectivo Captura" money value={corteData.efectivoCaptura} strong />
                        <CorteRow label="Diferencia" money value={corteData.diferencia} tone={corteData.diferencia === 0 ? "neutral" : corteData.diferencia > 0 ? "emerald" : "rose"} strong />
                        <CorteRow label="Dif. Dólares" money value={corteData.difDolares} tone={corteData.difDolares === 0 ? "neutral" : corteData.difDolares > 0 ? "emerald" : "rose"} strong />
                      </div>
                    </div>

                  </div>
                ) : null}
              </div>

              {/* Footer */}
              <div className="p-4 bg-white/5 border-t border-white/5 flex justify-between items-center text-[11px] text-slate-500 px-6">
                <p>
                  {corteData?.cerrado
                    ? `Cortado por ${corteData.usuarioCierre || "—"} · ${corteData.fechaCierre ? fmtTime(corteData.fechaCierre) : "—"}`
                    : "Apertura sin corte registrado"}
                </p>
                <button onClick={() => setCorteOpen(false)} className="px-5 py-2 rounded-xl bg-white/5 border border-white/10 text-slate-300 font-bold hover:bg-white/10 hover:text-white transition-all">
                  Cerrar
                </button>
              </div>

            </div>
          </div>
        )}

        {/* ── Modal: Detalle de Ventas por forma de pago (frmProcCorteCaja) ── */}
        {ventasOpen && (
          <div className="fixed inset-0 bg-black/70 backdrop-blur-md flex items-center justify-center z-[120] p-4">
            <div className="bg-[#0f172a] border border-white/10 rounded-3xl w-full max-w-6xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200">

              {/* Header */}
              <div className="p-5 border-b border-white/5 flex items-center justify-between bg-white/5">
                <div className="flex items-center gap-4">
                  <div className="bg-emerald-600/20 p-3 rounded-2xl border border-emerald-500/20">
                    <DollarSign size={22} className="text-emerald-400" />
                  </div>
                  <div>
                    <h3 className="text-lg font-black text-white">
                      Detalle de Ventas {ventasData ? `— Apertura #${ventasData.idApertura}` : ""}
                    </h3>
                    <p className="text-xs text-slate-400">
                      {ventasData
                        ? `${ventasData.sede} · Fecha: ${(() => {
                            const d = new Date(ventasData.fechaApertura).toLocaleDateString("es-MX", { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
                            return d.charAt(0).toUpperCase() + d.slice(1);
                          })()} · Cajero: ${ventasData.cajero || "—"} · ${ventasData.cerrado ? "Cerrado" : "En curso"}`
                        : "Cargando..."}
                    </p>
                  </div>
                </div>
                <button onClick={() => setVentasOpen(false)} className="p-2 rounded-xl hover:bg-white/10 text-slate-400 hover:text-white transition-all">
                  <X size={20} />
                </button>
              </div>

              {/* Content */}
              <div className="flex-1 overflow-y-auto p-6">
                {ventasLoading ? (
                  <div className="h-64 flex flex-col items-center justify-center gap-4">
                    <RefreshCw className="animate-spin text-emerald-500" size={32} />
                    <p className="text-sm text-slate-400 font-bold animate-pulse">Calculando desglose de ventas...</p>
                  </div>
                ) : ventasError ? (
                  <div className="h-64 flex flex-col items-center justify-center gap-3 text-rose-400">
                    <AlertCircle size={40} className="opacity-60" />
                    <p className="text-base font-black">{ventasError}</p>
                  </div>
                ) : ventasData ? (
                  <div className="space-y-6">

                    {/* Resumen de apertura */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      {[
                        { label: "Hora Apertura", value: fmtTime(ventasData.fechaApertura),                       icon: <KeyRound size={14} className="text-blue-400" />,    ibg: "bg-blue-500/10 border-blue-500/20" },
                        { label: "Hora Corte",    value: ventasData.fechaCierre ? fmtTime(ventasData.fechaCierre) : "En curso", icon: <Lock size={14} className="text-slate-400" />, ibg: "bg-slate-500/10 border-slate-500/20" },
                        { label: "Tickets",       value: ventasData.operaciones.toLocaleString("es-MX"),          icon: <Ticket size={14} className="text-purple-400" />,    ibg: "bg-purple-500/10 border-purple-500/20" },
                        { label: "Fondo Caja",    value: fmt(ventasData.fondoCaja),                               icon: <Wallet size={14} className="text-cyan-400" />,      ibg: "bg-cyan-500/10 border-cyan-500/20" },
                      ].map((c) => (
                        <div key={c.label} className="bg-white/5 border border-white/10 rounded-2xl p-3 flex items-center gap-3">
                          <div className={`p-2 rounded-xl border flex-shrink-0 ${c.ibg}`}>{c.icon}</div>
                          <div className="min-w-0">
                            <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest">{c.label}</p>
                            <p className="text-sm font-black text-white truncate tabular-nums">{c.value}</p>
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* 3 grids por forma de pago */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                      <FormaPagoGrid title="Membresías" icon={<CreditCard size={14} className="text-emerald-400" />}
                        rows={ventasData.membresias} total={ventasData.totales.membresias} tone="emerald"
                        onRowClick={(idFormaPago, formaPago) => openSalesDetail(0, idFormaPago, formaPago, "Membresías")} />
                      <FormaPagoGrid title="Uniformes" icon={<Shirt size={14} className="text-blue-400" />}
                        rows={ventasData.uniformes} total={ventasData.totales.uniformes} tone="blue"
                        onRowClick={(idFormaPago, formaPago) => openSalesDetail(1, idFormaPago, formaPago, "Uniformes")} />
                      <FormaPagoGrid title="Total Ventas" icon={<DollarSign size={14} className="text-purple-400" />}
                        rows={ventasData.total} total={ventasData.totales.total} tone="purple"
                        onRowClick={(idFormaPago, formaPago) => openSalesDetail(2, idFormaPago, formaPago, "Total Ventas")} />
                    </div>
                  </div>
                ) : null}
              </div>

              {/* Footer */}
              <div className="p-4 bg-white/5 border-t border-white/5 flex justify-between items-center text-[11px] text-slate-500 px-6">
                <p>Desglose por forma de pago — solo lectura</p>
                {ventasData && (
                  <p className="font-black text-white">
                    Total Ventas: <span className="text-emerald-400">{fmt(ventasData.totales.total)}</span>
                  </p>
                )}
              </div>

            </div>
          </div>
        )}

        {/* ── Modal: Detalle de Egresos ─────────────────────────── */}
        {egresosOpen && (
          <div className="fixed inset-0 bg-black/70 backdrop-blur-md flex items-center justify-center z-[120] p-4">
            <div className="bg-[#0f172a] border border-white/10 rounded-3xl w-full max-w-4xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200">

              {/* Header */}
              <div className="p-5 border-b border-white/5 flex items-center justify-between bg-white/5">
                <div className="flex items-center gap-4">
                  <div className="bg-rose-600/20 p-3 rounded-2xl border border-rose-500/20">
                    <TrendingDown size={22} className="text-rose-400" />
                  </div>
                  <div>
                    <h3 className="text-lg font-black text-white">
                      Detalle de Egresos {egresosData ? `— Apertura #${egresosData.idApertura}` : ""}
                    </h3>
                    <p className="text-xs text-slate-400">
                      {egresosData
                        ? `${egresosData.sede} · Fecha: ${(() => {
                            const d = new Date(egresosData.fechaApertura).toLocaleDateString("es-MX", { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
                            return d.charAt(0).toUpperCase() + d.slice(1);
                          })()} · Cajero: ${egresosData.cajero || "—"} · ${egresosData.cerrado ? "Cerrado" : "En curso"}`
                        : "Cargando..."}
                    </p>
                  </div>
                </div>
                <button onClick={() => setEgresosOpen(false)} className="p-2 rounded-xl hover:bg-white/10 text-slate-400 hover:text-white transition-all">
                  <X size={20} />
                </button>
              </div>

              {/* Content */}
              <div className="flex-1 overflow-y-auto p-6">
                {egresosLoading ? (
                  <div className="h-64 flex flex-col items-center justify-center gap-4">
                    <RefreshCw className="animate-spin text-rose-500" size={32} />
                    <p className="text-sm text-slate-400 font-bold animate-pulse">Cargando egresos...</p>
                  </div>
                ) : egresosError ? (
                  <div className="h-64 flex flex-col items-center justify-center gap-3 text-rose-400">
                    <AlertCircle size={40} className="opacity-60" />
                    <p className="text-base font-black">{egresosError}</p>
                  </div>
                ) : egresosData && egresosData.numEgresos === 0 ? (
                  <div className="h-64 flex flex-col items-center justify-center gap-3 text-slate-500">
                    <Receipt size={44} className="opacity-20" />
                    <p className="text-lg font-black">Sin egresos</p>
                    <p className="text-sm opacity-60">Esta apertura no tiene gastos registrados.</p>
                  </div>
                ) : egresosData ? (
                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

                    {/* Desglose por forma de pago */}
                    <div className="lg:col-span-1">
                      <FormaPagoGrid title="Por Forma de Pago" icon={<Receipt size={14} className="text-rose-400" />}
                        rows={egresosData.porFormaPago} total={egresosData.totalEgresos} tone="rose" />
                    </div>

                    {/* Líneas individuales */}
                    <div className="lg:col-span-2 bg-white/5 border border-white/10 rounded-2xl overflow-hidden flex flex-col">
                      <div className="flex items-center gap-2 px-4 py-3 border-b border-white/5 bg-white/5">
                        <Receipt size={14} className="text-rose-400" />
                        <h4 className="text-xs font-black text-white uppercase tracking-widest">Conceptos</h4>
                        <span className="text-[10px] text-slate-500 ml-auto">{egresosData.numEgresos} egreso{egresosData.numEgresos !== 1 ? "s" : ""}</span>
                      </div>
                      <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                          <thead>
                            <tr className="bg-white/5 text-[9px] uppercase font-black text-slate-500 tracking-widest">
                              <th className="px-4 py-3">Hora</th>
                              <th className="px-4 py-3">Concepto</th>
                              <th className="px-4 py-3">Forma Pago</th>
                              <th className="px-4 py-3 text-right">Monto</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-white/5">
                            {egresosData.detalle.map((e) => (
                              <tr key={e.idEgreso} className="hover:bg-white/5 transition-colors">
                                <td className="px-4 py-3 whitespace-nowrap text-[11px] text-slate-400 tabular-nums">{fmtTime(e.fecha)}</td>
                                <td className="px-4 py-3">
                                  <p className="text-[11px] font-bold text-slate-200">{e.concepto}</p>
                                  {e.usuario && <p className="text-[10px] text-slate-500">{e.usuario}</p>}
                                </td>
                                <td className="px-4 py-3">
                                  <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-rose-500/10 text-rose-300 border border-rose-500/20 whitespace-nowrap">
                                    {e.formaPago}
                                  </span>
                                </td>
                                <td className="px-4 py-3 text-right text-xs font-black text-rose-400 tabular-nums whitespace-nowrap">{fmt(e.total)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>

                  </div>
                ) : null}
              </div>

              {/* Footer */}
              <div className="p-4 bg-white/5 border-t border-white/5 flex justify-between items-center text-[11px] text-slate-500 px-6">
                <p>Detalle de egresos — solo lectura</p>
                {egresosData && (
                  <p className="font-black text-white">
                    Total Egresos: <span className="text-rose-400">{fmt(egresosData.totalEgresos)}</span>
                  </p>
                )}
              </div>

            </div>
          </div>
        )}

        {/* ── Modal: Detalle Individual de Ventas (frmProcDetalleCorteCaja) ── */}
        {salesDetailOpen && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center z-[130] p-4">
            <div className="bg-[#0f172a] border border-white/15 rounded-3xl w-full max-w-4xl max-h-[82vh] flex flex-col shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200">

              {/* Header */}
              <div className="p-5 border-b border-white/10 flex items-center justify-between bg-white/5">
                <div className="flex items-center gap-4">
                  <div className="bg-blue-600/20 p-2.5 rounded-xl border border-blue-500/20">
                    <Sparkles size={20} className="text-blue-400" />
                  </div>
                  <div>
                    <h3 className="text-base font-black text-white">
                      Detalle de Ventas — {salesDetailMeta?.gridName} ({salesDetailMeta?.formaPago})
                    </h3>
                    <p className="text-[10px] text-slate-400">
                      {ventasData?.sede} · Apertura #{ventasData?.idApertura} · Fecha: {(() => {
                        if (!ventasData?.fechaApertura) return "";
                        const d = new Date(ventasData.fechaApertura).toLocaleDateString("es-MX", { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
                        return d.charAt(0).toUpperCase() + d.slice(1);
                      })()}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setSalesDetailOpen(false)}
                  className="p-2 rounded-xl hover:bg-white/10 text-slate-400 hover:text-white transition-all"
                >
                  <X size={18} />
                </button>
              </div>

              {/* Content */}
              <div className="flex-1 overflow-y-auto p-6">
                {salesDetailLoading ? (
                  <div className="h-48 flex flex-col items-center justify-center gap-4">
                    <RefreshCw className="animate-spin text-blue-500" size={24} />
                    <p className="text-xs text-slate-500 font-bold animate-pulse">Cargando transacciones...</p>
                  </div>
                ) : salesDetailError ? (
                  <div className="h-48 flex flex-col items-center justify-center gap-3 text-rose-400">
                    <AlertCircle size={40} className="opacity-60" />
                    <p className="text-sm font-black">{salesDetailError}</p>
                  </div>
                ) : salesDetailData.length === 0 ? (
                  <div className="h-48 flex flex-col items-center justify-center gap-3 text-slate-500">
                    <Receipt size={40} className="opacity-20" />
                    <p className="text-sm font-black">Sin registros</p>
                    <p className="text-xs opacity-60">No se encontraron cobros individuales para esta selección.</p>
                  </div>
                ) : (
                  <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden">
                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="bg-white/5 text-[9px] uppercase font-black text-slate-500 tracking-widest border-b border-white/5">
                            <th className="px-4 py-3">Hora</th>
                            <th className="px-4 py-3">Comprador / Alumno</th>
                            <th className="px-4 py-3">Concepto / Producto</th>
                            <th className="px-4 py-3">Método Pago</th>
                            <th className="px-4 py-3">Folio / Recibo</th>
                            <th className="px-4 py-3 text-right">Monto</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5 text-slate-300">
                          {salesDetailData.map((d: any) => (
                            <tr key={d.IdPago} className="hover:bg-white/5 transition-all text-xs">
                              <td className="px-4 py-3 whitespace-nowrap text-slate-500 tabular-nums">
                                {fmtTime(d.Fecha)}
                              </td>
                              <td className="px-4 py-3">
                                <p className="font-bold text-white">{d.Jugador}</p>
                                {d.Categoria && (
                                  <span className="text-[9px] text-slate-500 uppercase bg-white/5 px-1.5 py-0.5 rounded border border-white/5">
                                    Cat: {d.Categoria}
                                  </span>
                                )}
                              </td>
                              <td className="px-4 py-3 text-slate-400">
                                {d.Producto}
                              </td>
                              <td className="px-4 py-3 whitespace-nowrap text-[10px] font-black text-slate-400">
                                {d.FormaPago}
                              </td>
                              <td className="px-4 py-3 text-slate-500 tabular-nums">
                                {d.Recibo ? `Recibo: ${d.Recibo}` : d.Referencia ? `Ref: ${d.Referencia}` : "—"}
                              </td>
                              <td className="px-4 py-3 text-right font-black text-emerald-400 tabular-nums whitespace-nowrap">
                                {fmt(d.Pago)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>

              {/* Footer */}
              <div className="p-4 bg-white/5 border-t border-white/10 flex justify-between items-center px-6">
                <span className="text-xs text-slate-500 font-bold">
                  Total Recaudado:{" "}
                  <span className="text-emerald-400">
                    {fmt(salesDetailData.reduce((acc, curr) => acc + curr.Pago, 0))}
                  </span>
                </span>
                <button
                  onClick={() => setSalesDetailOpen(false)}
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-500 rounded-xl text-white text-xs font-black transition-all"
                >
                  Entendido
                </button>
              </div>

            </div>
          </div>
        )}

      </main>
    </DashboardLayout>
  );
}

function FormaPagoGrid({ title, icon, rows, total, tone, onRowClick }: {
  title: string;
  icon: React.ReactNode;
  rows: FormaPagoRow[];
  total: number;
  tone: "emerald" | "blue" | "purple" | "rose";
  onRowClick?: (idFormaPago: number, formaPago: string) => void;
}) {
  const fmtMoney = (n: number) =>
    new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(n);
  const toneText =
    tone === "emerald" ? "text-emerald-400"
      : tone === "blue" ? "text-blue-400"
        : tone === "purple" ? "text-purple-400"
          : "text-rose-400";
  const toneBar =
    tone === "emerald" ? "bg-emerald-500/10 border-emerald-500/20"
      : tone === "blue" ? "bg-blue-500/10 border-blue-500/20"
        : tone === "purple" ? "bg-purple-500/10 border-purple-500/20"
          : "bg-rose-500/10 border-rose-500/20";
  const totalCant = rows.reduce((s, r) => s + r.cantidad, 0);
  return (
    <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden flex flex-col">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-white/5 bg-white/5">
        {icon}
        <h4 className="text-xs font-black text-white uppercase tracking-widest">{title}</h4>
      </div>
      {rows.length === 0 ? (
        <div className="flex-1 flex items-center justify-center py-8 text-slate-600 text-xs font-bold">Sin movimientos</div>
      ) : (
        <div className="divide-y divide-white/5">
          {/* Encabezado de columnas */}
          <div className="grid grid-cols-[1fr_auto_auto] gap-2 px-4 py-2 text-[9px] font-black text-slate-500 uppercase tracking-widest">
            <span>Forma Pago</span>
            <span className="text-right w-10">Cant.</span>
            <span className="text-right w-24">Total</span>
          </div>
          {rows.map((r) => (
            <div
              key={r.idFormaPago}
              onClick={() => onRowClick && onRowClick(r.idFormaPago, r.formaPago)}
              className={`grid grid-cols-[1fr_auto_auto] gap-2 px-4 py-2.5 items-center hover:bg-white/5 transition-colors ${
                onRowClick ? "cursor-pointer" : ""
              }`}
            >
              <span className="text-[11px] font-bold text-slate-300 truncate">{r.formaPago}</span>
              <span className="text-[11px] font-bold text-slate-400 text-right w-10 tabular-nums">{r.cantidad}</span>
              <span className="text-xs font-black text-white text-right w-24 tabular-nums">{fmtMoney(r.total)}</span>
            </div>
          ))}
        </div>
      )}
      {/* Total */}
      <div
        onClick={() => onRowClick && onRowClick(0, "TOTAL")}
        className={`mt-auto grid grid-cols-[1fr_auto_auto] gap-2 px-4 py-3 border-t border-white/10 ${toneBar} ${
          onRowClick ? "cursor-pointer hover:bg-white/10" : ""
        }`}
      >
        <span className="text-[11px] font-black text-white uppercase tracking-wider">Total</span>
        <span className={`text-[11px] font-black text-right w-10 tabular-nums ${toneText}`}>{totalCant}</span>
        <span className={`text-sm font-black text-right w-24 tabular-nums ${toneText}`}>{fmtMoney(total)}</span>
      </div>
    </div>
  );
}

function CorteRow({ label, value, money, strong, box, tone }: {
  label: string;
  value: number | string;
  money?: boolean;
  strong?: boolean;
  box?: boolean;
  tone?: "emerald" | "rose" | "neutral";
}) {
  const fmtMoney = (n: number) =>
    new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(n);
  const display = money && typeof value === "number" ? fmtMoney(value) : String(value);
  const toneClass =
    tone === "emerald" ? "text-emerald-400"
      : tone === "rose" ? "text-rose-400"
        : tone === "neutral" ? "text-slate-300"
          : "text-white";
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-[11px] font-bold text-slate-400 truncate">{label}</span>
      <span className={`tabular-nums whitespace-nowrap ${strong ? "text-sm font-black" : "text-xs font-bold"} ${toneClass} ${
        box ? "bg-white/5 border border-white/10 rounded-lg px-2.5 py-1 min-w-[90px] text-right" : ""
      }`}>
        {display}
      </span>
    </div>
  );
}
