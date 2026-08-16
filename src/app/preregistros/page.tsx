"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useUser, usePuedeVer } from "@/contexts/user-context";
import DashboardLayout from "@/components/DashboardLayout";
import ExcelJS from "exceljs";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import {
  UserPlus, Search, RefreshCw, Calendar, X, MapPin, Layers, AlertCircle,
  FileSpreadsheet, FileText, Copy, Phone,
} from "lucide-react";
import type { FilaPreregistro, Vinculo } from "@/lib/preregistros";
import { esConvertido } from "@/lib/preregistros";
import PreregistroDetalle, {
  ESTILO_VINCULO, ETIQUETA_VINCULO, ICONO_VINCULO, etiquetaStatus, fechaCorta, fechaHora,
} from "@/components/PreregistroDetalle";

/**
 * Reporte de preregistros.
 *
 * Se traen todas las filas de una vez y se filtran en el navegador: son unos cientos,
 * y así los filtros (periodo, sede, tipo de relación, búsqueda) responden sin ir al
 * servidor. La relación con la plantilla la resuelve el servidor —ver
 * @/lib/preregistros—: aquí solo se pinta.
 */

type Periodo = "hoy" | "semana" | "mes" | "todo" | "rango";
type FiltroVinculo = Vinculo | "todos";

const ETIQUETA_PERIODO: Record<Periodo, string> = {
  hoy: "Hoy",
  semana: "Últimos 7 días",
  mes: "Últimos 30 días",
  todo: "Todo el historial",
  rango: "Rango personalizado",
};

/** Orden en que se presentan los estados de relación, del mejor al peor desenlace. */
const VINCULOS: Vinculo[] = ["vinculado", "mismo-nombre", "probable", "familiar", "sin-relacion"];

const DESCRIPCION_VINCULO: Record<Vinculo, string> = {
  vinculado: "Sellados por el escritorio",
  "mismo-nombre": "Mismo nombre en la plantilla",
  probable: "Nombre parecido, mismo cumpleaños",
  familiar: "Un hermano ya está inscrito",
  "sin-relacion": "Nadie de la familia aparece",
};

const pad = (n: number) => String(n).padStart(2, "0");
const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const haceDias = (dias: number) => {
  const d = new Date();
  d.setDate(d.getDate() - dias);
  return ymd(d);
};

export default function PreregistrosPage() {
  const router = useRouter();
  const { user, isInitialized } = useUser();
  const puedeVer = usePuedeVer("/preregistros");

  const [filas, setFilas] = useState<FilaPreregistro[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [exporting, setExporting] = useState(false);

  const [busqueda, setBusqueda] = useState("");
  const [sedeFiltro, setSedeFiltro] = useState("");
  const [vinculoFiltro, setVinculoFiltro] = useState<FiltroVinculo>("todos");
  const [periodo, setPeriodo] = useState<Periodo>("todo");
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [pendingDesde, setPendingDesde] = useState("");
  const [pendingHasta, setPendingHasta] = useState("");

  const [detalle, setDetalle] = useState<FilaPreregistro | null>(null);

  useEffect(() => {
    if (isInitialized && !user) router.push("/login");
  }, [user, isInitialized, router]);

  const cargar = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/preregistros");
      const json = await res.json();
      if (!json.success) {
        setError(json.message ?? "Error al cargar los preregistros");
        return;
      }
      setFilas(json.data);
      setLastUpdated(new Date());
    } catch {
      setError("Error de conexión");
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Sin el permiso, DashboardLayout pinta "Sin acceso": no hay nada que pedir.
  useEffect(() => {
    if (user && puedeVer) cargar();
  }, [user, puedeVer, cargar]);

  // ── Filtros ──
  const rango = useMemo((): { desde: string; hasta: string } | null => {
    const hoy = ymd(new Date());
    if (periodo === "hoy") return { desde: hoy, hasta: hoy };
    if (periodo === "semana") return { desde: haceDias(6), hasta: hoy };
    if (periodo === "mes") return { desde: haceDias(29), hasta: hoy };
    if (periodo === "rango" && desde && hasta) return { desde, hasta };
    return null;
  }, [periodo, desde, hasta]);

  /* Base del reporte: periodo + búsqueda. De aquí salen las tarjetas de sede y los
     indicadores, para que al elegir una sede o un tipo de relación el resto de la
     pantalla siga mostrando contra qué se está comparando. */
  const base = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return filas.filter((f) => {
      if (rango && f.FechaAlta) {
        const dia = f.FechaAlta.slice(0, 10);
        if (dia < rango.desde || dia > rango.hasta) return false;
      }
      if (!q) return true;
      return [
        f.JugadorPre, f.Padre, f.Madre, f.TelPadre, f.TelMadre,
        f.CorreoElectronicoPadre, f.CorreoElectronicoMadre, f.Sede,
        f.Jugador?.Jugador, f.CURP, f.Escuela,
      ]
        .filter(Boolean)
        .some((valor) => String(valor).toLowerCase().includes(q));
    });
  }, [filas, rango, busqueda]);

  const sedes = useMemo(() => {
    const mapa = new Map<string, { IdSede: number | null; Sede: string; total: number; convertidos: number }>();
    for (const f of base) {
      const clave = String(f.IdSede ?? "");
      const actual = mapa.get(clave) ?? { IdSede: f.IdSede, Sede: f.Sede ?? "Sin sede", total: 0, convertidos: 0 };
      mapa.set(clave, {
        ...actual,
        total: actual.total + 1,
        convertidos: actual.convertidos + (esConvertido(f) ? 1 : 0),
      });
    }
    return [...mapa.values()].sort((a, b) => b.total - a.total);
  }, [base]);

  const porSede = useMemo(
    () => (sedeFiltro === "" ? base : base.filter((f) => String(f.IdSede ?? "") === sedeFiltro)),
    [base, sedeFiltro],
  );

  const conteos = useMemo(() => {
    const inicial = Object.fromEntries(VINCULOS.map((v) => [v, 0])) as Record<Vinculo, number>;
    return porSede.reduce((acc, f) => ({ ...acc, [f.Vinculo]: acc[f.Vinculo] + 1 }), inicial);
  }, [porSede]);

  const convertidos = useMemo(() => porSede.filter(esConvertido).length, [porSede]);
  const conversion = porSede.length > 0 ? Math.round((convertidos / porSede.length) * 100) : 0;
  const duplicados = useMemo(() => porSede.filter((f) => f.Duplicado).length, [porSede]);

  const filtradas = useMemo(
    () => (vinculoFiltro === "todos" ? porSede : porSede.filter((f) => f.Vinculo === vinculoFiltro)),
    [porSede, vinculoFiltro],
  );

  const aplicarRango = () => {
    setDesde(pendingDesde);
    setHasta(pendingHasta);
    setPeriodo("rango");
    setShowDatePicker(false);
  };

  const cambiarPeriodo = (p: Periodo) => {
    if (p === "rango") {
      setPendingDesde(desde || haceDias(30));
      setPendingHasta(hasta || ymd(new Date()));
      setShowDatePicker(true);
      return;
    }
    setPeriodo(p);
  };

  // ── Exportación ──
  const sedeLabel = sedeFiltro === "" ? "Todas las sedes" : (sedes.find((s) => String(s.IdSede ?? "") === sedeFiltro)?.Sede ?? "Sede");
  const rangoLabel = periodo === "rango" && desde && hasta ? `${fechaCorta(desde)} a ${fechaCorta(hasta)}` : ETIQUETA_PERIODO[periodo];
  const vinculoLabel = vinculoFiltro === "todos" ? "Todas las relaciones" : ETIQUETA_VINCULO[vinculoFiltro];
  const sufijo = periodo === "rango" && desde && hasta ? `${desde}_${hasta}` : periodo;

  const filaExport = (f: FilaPreregistro) => [
    fechaHora(f.FechaAlta),
    f.JugadorPre ?? "",
    fechaCorta(f.FechaNacimiento),
    f.Edad ?? "",
    f.GeneroDesc ?? "",
    f.Sede ?? "",
    f.Padre ?? "",
    f.TelPadre ?? "",
    f.Madre ?? "",
    f.TelMadre ?? "",
    f.CorreoElectronicoPadre || f.CorreoElectronicoMadre || "",
    ETIQUETA_VINCULO[f.Vinculo],
    f.Jugador?.Jugador ?? "",
    f.Jugador ? `${f.Jugador.Sede ?? "—"} · ${etiquetaStatus(f.Jugador.Status)}` : "",
    f.FamiliaresTotal > 0 ? f.Familiares.map((h) => h.Jugador).join(" / ") : "",
  ];

  const ENCABEZADOS = [
    "Recibido", "Jugador preregistrado", "Nacimiento", "Edad", "Género", "Sede",
    "Padre / Tutor", "Tel. padre", "Madre / Tutora", "Tel. madre", "Correo",
    "Relación", "Jugador en plantilla", "Sede / estatus", "Familia en la academia",
  ];

  const exportExcel = async () => {
    setExporting(true);
    try {
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet("Preregistros");
      ws.getCell("A1").value = `Preregistros — ${sedeLabel} · ${rangoLabel} · ${vinculoLabel}`;
      ws.getCell("A1").font = { bold: true, size: 14, color: { argb: "FF1E3A8A" } };
      ws.getCell("A2").value =
        `${filtradas.length} preregistros · ${convertidos} ya son jugadores (${conversion}%) · ` +
        `${conteos.familiar} con familiar inscrito · ${conteos["sin-relacion"]} sin relación`;
      ws.getCell("A2").font = { size: 10, color: { argb: "FF475569" } };
      ws.columns = [
        { width: 17 }, { width: 32 }, { width: 12 }, { width: 7 }, { width: 12 }, { width: 16 },
        { width: 26 }, { width: 14 }, { width: 26 }, { width: 14 }, { width: 28 },
        { width: 18 }, { width: 32 }, { width: 22 }, { width: 34 },
      ];
      const header = ws.getRow(4);
      header.values = ENCABEZADOS;
      header.font = { bold: true, color: { argb: "FFFFFFFF" } };
      header.eachCell((c) => {
        c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1D4ED8" } };
        c.alignment = { horizontal: "center", wrapText: true };
      });
      filtradas.forEach((f) => ws.addRow(filaExport(f)));
      const buffer = await wb.xlsx.writeBuffer();
      descarga(
        new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }),
        `Preregistros_${sufijo}.xlsx`,
      );
    } finally {
      setExporting(false);
    }
  };

  const exportPdf = () => {
    setExporting(true);
    try {
      const doc = new jsPDF({ orientation: "landscape" });
      doc.setFontSize(14);
      doc.text("Preregistros", 14, 16);
      doc.setFontSize(9);
      doc.setTextColor(100);
      doc.text(`${sedeLabel} · ${rangoLabel} · ${vinculoLabel}`, 14, 22);
      doc.text(
        `${filtradas.length} preregistros · ${convertidos} ya son jugadores (${conversion}%) · ${conteos["sin-relacion"]} sin relación`,
        14,
        27,
      );
      autoTable(doc, {
        startY: 32,
        head: [["Recibido", "Jugador preregistrado", "Nac.", "Edad", "Sede", "Tutor", "Teléfono", "Relación", "Jugador en plantilla"]],
        body: filtradas.map((f) => [
          fechaHora(f.FechaAlta),
          f.JugadorPre ?? "",
          fechaCorta(f.FechaNacimiento),
          f.Edad ?? "",
          f.Sede ?? "",
          f.Padre || f.Madre || "",
          f.TelPadre || f.TelMadre || "",
          ETIQUETA_VINCULO[f.Vinculo],
          f.Jugador?.Jugador ?? (f.FamiliaresTotal > 0 ? `Familia: ${f.Familiares[0].Jugador}` : "—"),
        ]),
        styles: { fontSize: 7 },
        headStyles: { fillColor: [29, 78, 216], fontSize: 7 },
        margin: { left: 14, right: 14 },
      });
      doc.save(`Preregistros_${sufijo}.pdf`);
    } finally {
      setExporting(false);
    }
  };

  return (
    <DashboardLayout>
      <main className="overflow-y-auto flex-1 text-white">
        {/* HEADER */}
        <div className="bg-white/5 backdrop-blur-xl border-b border-white/10 px-6 py-4 flex justify-between items-center sticky top-0 z-20">
          <div className="flex items-center gap-4">
            <div className="bg-blue-600/20 p-2.5 rounded-xl border border-blue-500/20">
              <UserPlus size={20} className="text-blue-400" />
            </div>
            <div>
              <h1 className="text-xl font-black">Preregistros</h1>
              <p className="text-xs text-blue-300">Prospectos del QR de cada sede y su relación con la plantilla</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {lastUpdated && (
              <span className="text-[10px] text-slate-500">
                Act. {lastUpdated.toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" })}
              </span>
            )}
            <ExportGroup disabled={isLoading || filtradas.length === 0 || exporting} onExcel={exportExcel} onPdf={exportPdf} />
            <button
              onClick={cargar}
              disabled={isLoading}
              className="p-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-slate-400 hover:text-white transition-all"
            >
              <RefreshCw size={15} className={isLoading || exporting ? "animate-spin" : ""} />
            </button>
          </div>
        </div>

        <div className="p-6 md:p-8 max-w-7xl mx-auto space-y-8">
          {error && (
            <div className="flex items-center gap-2 bg-rose-500/10 border border-rose-500/30 text-rose-200 rounded-xl px-4 py-3 text-sm">
              <AlertCircle size={16} /> {error}
            </div>
          )}

          {/* INDICADORES — cada uno filtra la tabla por su tipo de relación */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            <button
              onClick={() => setVinculoFiltro("todos")}
              className={`text-left bg-white/5 border rounded-2xl p-4 transition-all ${
                vinculoFiltro === "todos" ? "border-blue-500/40 bg-blue-600/10" : "border-white/10 hover:bg-white/8"
              }`}
            >
              <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Preregistros</p>
              <p className="text-2xl font-black text-white mt-1 tabular-nums">{porSede.length}</p>
              <p className="text-[10px] text-slate-400 mt-0.5">{conversion}% ya son jugadores</p>
            </button>
            {VINCULOS.map((v) => (
              <button
                key={v}
                onClick={() => setVinculoFiltro(vinculoFiltro === v ? "todos" : v)}
                className={`text-left border rounded-2xl p-4 transition-all ${
                  vinculoFiltro === v ? `${ESTILO_VINCULO[v]} scale-[1.02]` : "bg-white/5 border-white/10 hover:bg-white/8"
                }`}
              >
                <p className="text-[10px] font-black uppercase tracking-widest flex items-center gap-1.5 text-slate-400">
                  {ICONO_VINCULO[v]} {ETIQUETA_VINCULO[v]}
                </p>
                <p className="text-2xl font-black text-white mt-1 tabular-nums">{conteos[v]}</p>
                <p className="text-[10px] text-slate-400 mt-0.5">{DESCRIPCION_VINCULO[v]}</p>
              </button>
            ))}
          </div>

          {duplicados > 0 && (
            <p className="flex items-center gap-2 text-xs text-amber-300/90 -mt-4">
              <Copy size={13} />
              {duplicados} preregistros están repetidos entre sí (mismo nombre y fecha de nacimiento).
            </p>
          )}

          {/* FILTROS */}
          <div className="flex flex-col lg:flex-row gap-4 items-start lg:items-center justify-between">
            <div className="relative group w-full lg:w-96">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-blue-400 transition-colors" size={16} />
              <input
                type="text"
                placeholder="Buscar por jugador, tutor, teléfono o correo..."
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-xl pl-10 pr-4 py-2.5 outline-none focus:bg-white/10 focus:border-blue-500/50 transition-all text-sm text-white placeholder-slate-400"
              />
            </div>
            <div className="flex gap-1.5 bg-white/5 p-1 rounded-xl border border-white/10 flex-wrap">
              {(["hoy", "semana", "mes", "todo", "rango"] as Periodo[]).map((p) => (
                <button
                  key={p}
                  onClick={() => cambiarPeriodo(p)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                    periodo === p ? "bg-blue-600 text-white shadow shadow-blue-500/20" : "text-slate-400 hover:text-white hover:bg-white/5"
                  }`}
                >
                  {p === "rango" ? "Fechas..." : ETIQUETA_PERIODO[p]}
                </button>
              ))}
            </div>
          </div>

          {/* SEDES */}
          <div className="flex flex-wrap gap-3">
            <TarjetaSede
              activo={sedeFiltro === ""}
              icono={<Layers size={16} />}
              titulo="Todas"
              detalle={`${base.length} preregistros`}
              onClick={() => setSedeFiltro("")}
            />
            {sedes.map((s) => (
              <TarjetaSede
                key={String(s.IdSede)}
                activo={sedeFiltro === String(s.IdSede ?? "")}
                icono={<MapPin size={16} />}
                titulo={s.Sede}
                detalle={`${s.total} · ${s.convertidos} inscritos`}
                onClick={() => setSedeFiltro(String(s.IdSede ?? ""))}
              />
            ))}
          </div>

          {/* RANGO PERSONALIZADO */}
          {showDatePicker && (
            <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[130] p-4">
              <div className="bg-slate-900 border border-white/15 rounded-2xl p-6 w-full max-w-sm shadow-2xl">
                <div className="flex items-center justify-between mb-5">
                  <h3 className="text-sm font-black text-white flex items-center gap-2">
                    <Calendar size={16} className="text-blue-400" /> Rango de fechas
                  </h3>
                  <button onClick={() => setShowDatePicker(false)} className="p-1 rounded-lg text-slate-500 hover:text-white hover:bg-white/10 transition-all">
                    <X size={18} />
                  </button>
                </div>
                <div className="space-y-4">
                  <CampoFecha etiqueta="Desde" valor={pendingDesde} onChange={setPendingDesde} />
                  <CampoFecha etiqueta="Hasta" valor={pendingHasta} onChange={setPendingHasta} />
                </div>
                <div className="flex gap-3 mt-6">
                  <button onClick={() => setShowDatePicker(false)} className="flex-1 py-2.5 rounded-xl border border-white/10 text-slate-400 text-sm font-bold hover:bg-white/5 transition-all">
                    Cancelar
                  </button>
                  <button onClick={aplicarRango} className="flex-1 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-black transition-all shadow-lg shadow-blue-500/20">
                    Aplicar
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* TABLA */}
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-32 gap-4">
              <div className="w-10 h-10 rounded-full border-4 border-blue-500/20 border-t-blue-500 animate-spin" />
              <p className="text-xs font-bold text-slate-500 animate-pulse">Cargando preregistros...</p>
            </div>
          ) : filtradas.length === 0 ? (
            <div className="text-center py-20 bg-white/5 rounded-3xl border border-dashed border-white/10">
              <UserPlus size={40} className="mx-auto text-slate-600 mb-4" />
              <h3 className="text-base font-bold text-slate-300">No hay preregistros</h3>
              <p className="text-xs text-slate-500 mt-2">Ningún preregistro coincide con los filtros aplicados.</p>
            </div>
          ) : (
            <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden shadow-2xl">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-white/5 text-[9px] uppercase font-black text-slate-500 tracking-widest border-b border-white/10">
                      <th className="px-5 py-4">Recibido</th>
                      <th className="px-5 py-4">Jugador preregistrado</th>
                      <th className="px-5 py-4">Sede</th>
                      <th className="px-5 py-4">Contacto</th>
                      <th className="px-5 py-4">Relación</th>
                      <th className="px-5 py-4">Jugador en la plantilla</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5 text-slate-300">
                    {filtradas.map((f) => (
                      <tr
                        key={f.IdJugadorPre}
                        onClick={() => setDetalle(f)}
                        className="hover:bg-white/5 transition-colors cursor-pointer"
                      >
                        <td className="px-5 py-3.5 text-xs whitespace-nowrap tabular-nums text-slate-400">
                          {fechaCorta(f.FechaAlta)}
                          <span className="block text-[10px] text-slate-600 mt-0.5">{f.FechaAlta?.slice(11, 16) ?? ""}</span>
                        </td>
                        <td className="px-5 py-3.5">
                          <p className="text-xs font-bold text-white truncate max-w-[230px] flex items-center gap-1.5">
                            {f.JugadorPre}
                            {f.Duplicado && <Copy size={11} className="text-amber-400 flex-shrink-0" aria-label="Repetido" />}
                          </p>
                          <span className="text-[10px] text-slate-500">
                            {fechaCorta(f.FechaNacimiento)}
                            {f.Edad != null && ` · ${f.Edad} años`}
                            {f.GeneroDesc && ` · ${f.GeneroDesc}`}
                          </span>
                        </td>
                        <td className="px-5 py-3.5 text-xs whitespace-nowrap">
                          <span className="flex items-center gap-1 text-slate-400">
                            <MapPin size={12} className="text-slate-600" />
                            {f.Sede ?? "—"}
                          </span>
                        </td>
                        <td className="px-5 py-3.5">
                          <p className="text-xs text-white truncate max-w-[180px]">{f.Padre || f.Madre || "—"}</p>
                          <span className="text-[10px] text-slate-500 flex items-center gap-1">
                            <Phone size={9} className="text-slate-600" />
                            {f.TelPadre || f.TelMadre || "—"}
                          </span>
                        </td>
                        <td className="px-5 py-3.5">
                          <span
                            className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black border tracking-wide whitespace-nowrap ${ESTILO_VINCULO[f.Vinculo]}`}
                          >
                            {ICONO_VINCULO[f.Vinculo]}
                            {ETIQUETA_VINCULO[f.Vinculo]}
                          </span>
                        </td>
                        <td className="px-5 py-3.5">
                          {f.Jugador ? (
                            <>
                              <p className="text-xs font-bold text-white truncate max-w-[220px]">{f.Jugador.Jugador}</p>
                              <span className="text-[10px] text-slate-500">
                                #{f.Jugador.IdJugador} · {f.Jugador.Sede ?? "—"}
                                {f.Jugador.Categoria && ` · ${f.Jugador.Categoria}`} · {etiquetaStatus(f.Jugador.Status)}
                              </span>
                            </>
                          ) : f.FamiliaresTotal > 0 ? (
                            <>
                              <p className="text-xs text-amber-200/90 truncate max-w-[220px]">{f.Familiares[0].Jugador}</p>
                              <span className="text-[10px] text-slate-500">
                                Familiar{f.FamiliaresTotal > 1 ? ` (+${f.FamiliaresTotal - 1})` : ""} · {f.Familiares[0].Sede ?? "—"}
                              </span>
                            </>
                          ) : (
                            <span className="text-xs text-slate-600">Sin coincidencias</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {detalle && <PreregistroDetalle fila={detalle} onClose={() => setDetalle(null)} />}
      </main>
    </DashboardLayout>
  );
}

function TarjetaSede({
  activo, icono, titulo, detalle, onClick,
}: {
  activo: boolean; icono: React.ReactNode; titulo: string; detalle: string; onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-3 px-4 py-3 rounded-2xl border text-left transition-all ${
        activo ? "bg-blue-600/20 border-blue-500/40 scale-[1.02] shadow-lg shadow-blue-500/10" : "bg-white/5 border-white/10 hover:bg-white/8 hover:border-white/20"
      }`}
    >
      <div className={`p-2 rounded-xl border ${activo ? "bg-blue-500/20 border-blue-500/30" : "bg-white/5 border-white/10"}`}>
        <span className={activo ? "text-blue-300" : "text-slate-400"}>{icono}</span>
      </div>
      <div>
        <p className={`text-sm font-black ${activo ? "text-white" : "text-slate-300"}`}>{titulo}</p>
        <p className="text-[10px] text-slate-500 tabular-nums">{detalle}</p>
      </div>
    </button>
  );
}

function CampoFecha({ etiqueta, valor, onChange }: { etiqueta: string; valor: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">{etiqueta}</label>
      <input
        type="date"
        value={valor}
        onChange={(e) => onChange(e.target.value)}
        className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-white text-sm outline-none focus:border-blue-500/60 focus:bg-white/10 transition-all [color-scheme:dark]"
      />
    </div>
  );
}

function descarga(blob: Blob, nombre: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nombre;
  a.click();
  URL.revokeObjectURL(url);
}

function ExportGroup({ disabled, onExcel, onPdf }: { disabled?: boolean; onExcel: () => void; onPdf: () => void }) {
  return (
    <div className="flex items-center gap-1 bg-white/5 border border-white/10 rounded-xl pl-2.5 pr-1 py-1">
      <span className="text-[9px] font-black uppercase tracking-wider text-slate-400 hidden sm:inline">Exportar</span>
      <button
        onClick={onExcel}
        disabled={disabled}
        title="Exportar: Excel"
        className="flex items-center gap-1 px-2 py-1 rounded-lg bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-500/30 text-emerald-200 text-[11px] font-bold transition-all disabled:opacity-40 disabled:cursor-not-allowed"
      >
        <FileSpreadsheet size={13} /> Excel
      </button>
      <button
        onClick={onPdf}
        disabled={disabled}
        title="Exportar: PDF"
        className="flex items-center gap-1 px-2 py-1 rounded-lg bg-red-600/20 hover:bg-red-600/30 border border-red-500/30 text-red-200 text-[11px] font-bold transition-all disabled:opacity-40 disabled:cursor-not-allowed"
      >
        <FileText size={13} /> PDF
      </button>
    </div>
  );
}
