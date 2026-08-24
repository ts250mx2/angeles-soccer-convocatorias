"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useUser, usePuedeVer } from "@/contexts/user-context";
import DashboardLayout from "@/components/DashboardLayout";
import ExcelJS from "exceljs";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import {
  UserRoundPlus, Plus, RefreshCw, Search, AlertCircle, Pencil, Ban, RotateCcw, ArrowRight, Check,
  FileSpreadsheet, FileText, QrCode, ClipboardList, Inbox, ExternalLink,
} from "lucide-react";
import { VIGENTE, BAJA, yaAplicada, type IncorporacionRow, type OpcionProfesor, type OpcionTemporada } from "@/lib/incorporaciones";
import { NuevaIncorporacionModal, EditarIncorporacionModal } from "@/components/IncorporacionModal";
import PlayersModal, { type PlayersModalConfig } from "@/components/PlayersModal";
import PreincorporacionesLista from "@/components/PreincorporacionesLista";
import QrPreincorporacion from "@/components/QrPreincorporacion";

/**
 * Formato de incorporación.
 *
 * Es la versión en sistema del formato en Excel: una fila por jugador que cambia de
 * grupo, con quién lo propone, de dónde viene, a dónde va, por qué y quién lo autoriza.
 *
 * La pantalla NO mueve al jugador de categoría; deja constancia. Cuando el cambio ya se
 * aplicó en la plantilla, la fila lo marca como **aplicada** comparando el grupo del
 * formato contra la categoría que el jugador tiene hoy. Ver @/lib/incorporaciones.
 */

type FiltroEstado = "vigentes" | "canceladas" | "todas";

const SELECT =
  "bg-white/5 border border-white/15 text-slate-200 text-xs py-2 px-3 rounded-lg outline-none focus:border-blue-500 transition-colors";

/** Encabezado del formato, el mismo del papel. */
const CLUB = "ANGELES SOCCER ELITE";
const TITULO_FORMATO = "FORMATO DE INCORPORACION";

/** Columnas del formato, en el orden en que se captura. */
const COLUMNAS = [
  "#", "FECHA", "PROFESOR", "JUGADOR", "PROCEDENCIA",
  "GRUPO A INCORPORAR", "JUSTIFICACION DE INCORPORACION", "AUTORIZACION",
];

const fechaCorta = (valor: string | null): string => {
  if (!valor) return "—";
  const [anio, mes, dia] = valor.slice(0, 10).split("-");
  return anio && mes && dia ? `${dia}/${mes}/${anio}` : valor;
};

export default function IncorporacionesPage() {
  const router = useRouter();
  const { user, isInitialized } = useUser();
  const puedeVer = usePuedeVer("/incorporaciones");

  const [filas, setFilas] = useState<IncorporacionRow[]>([]);
  const [profesores, setProfesores] = useState<OpcionProfesor[]>([]);
  const [categorias, setCategorias] = useState<string[]>([]);
  const [temporadas, setTemporadas] = useState<OpcionTemporada[]>([]);
  const [temporadaId, setTemporadaId] = useState<number | null>(null);
  const [autorizante, setAutorizante] = useState("");

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const [busqueda, setBusqueda] = useState("");
  const [filtroProfesor, setFiltroProfesor] = useState<number | "todos">("todos");
  const [filtroEstado, setFiltroEstado] = useState<FiltroEstado>("vigentes");

  /* Dos vistas: los formatos capturados y la bandeja de lo que llega por el QR
     público. Se abre en los formatos, que es el trabajo de todos los días. */
  const [vista, setVista] = useState<"formatos" | "preinscripciones">("formatos");
  const [qrAbierto, setQrAbierto] = useState(false);
  /* Listado de una categoría, abierto desde la procedencia o el grupo destino. */
  const [categoriaAbierta, setCategoriaAbierta] = useState<PlayersModalConfig | null>(null);
  const [exportando, setExportando] = useState(false);
  const [creando, setCreando] = useState(false);
  const [editando, setEditando] = useState<IncorporacionRow | null>(null);

  useEffect(() => {
    if (isInitialized && !user) router.push("/login");
  }, [user, isInitialized, router]);

  const cargar = useCallback(async (temporada?: number | null) => {
    setIsLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (temporada) params.set("temporadaId", String(temporada));
      const res = await fetch(`/api/incorporaciones?${params}`);
      const json = await res.json();
      if (!json.success) {
        setError(json.message ?? "Error al cargar las incorporaciones");
        return;
      }
      setFilas(json.data);
      setProfesores(json.profesores);
      setCategorias(json.categorias);
      setTemporadas(json.temporadas);
      setTemporadaId(json.temporada);
      setAutorizante(json.autorizante);
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

  const filtradas = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return filas.filter((f) => {
      if (filtroEstado === "vigentes" && f.Status !== VIGENTE) return false;
      if (filtroEstado === "canceladas" && f.Status !== BAJA) return false;
      if (filtroProfesor !== "todos" && f.IdProfesor !== filtroProfesor) return false;
      if (!q) return true;
      return [f.Jugador, f.Profesor, f.Procedencia, f.GrupoIncorporar, f.Justificacion, f.Sede]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q));
    });
  }, [filas, busqueda, filtroProfesor, filtroEstado]);

  const kpis = useMemo(() => {
    const vigentes = filtradas.filter((f) => f.Status === VIGENTE);
    return {
      num: vigentes.length,
      aplicadas: vigentes.filter(yaAplicada).length,
      grupos: new Set(vigentes.map((f) => f.GrupoIncorporar)).size,
      profesores: new Set(vigentes.map((f) => f.IdProfesor).filter(Boolean)).size,
    };
  }, [filtradas]);

  const cambiarEstado = async (fila: IncorporacionRow, status: number) => {
    setAviso(null);
    try {
      const res = await fetch(`/api/incorporaciones/${fila.IdIncorporacion}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const json = await res.json();
      if (!json.success) {
        setError(json.message ?? "No se pudo cambiar el estado");
        return;
      }
      setAviso(status === BAJA ? "Incorporación cancelada" : "Incorporación reactivada");
      cargar(temporadaId);
    } catch {
      setError("Error de conexión");
    }
  };

  const temporadaActual = temporadas.find((t) => t.IdTemporada === temporadaId);
  const enFormatos = vista === "formatos";

  /* Abre una categoría desde el formato con sus jugadores ACTIVOS, estén inscritos o
     no: al leer una incorporación lo que se pregunta es a quién tiene ese grupo hoy.

     La temporada elegida arriba sí viaja, y no para filtrar sino para marcar: cada
     renglón muestra si esa persona ya pagó la inscripción del ciclo y qué mensualidades
     lleva. Filtrar por inscritos dejaba el listado vacío en las categorías de clinics,
     que no manejan inscripción, y en los grupos que apenas arrancan la temporada. */
  const verCategoria = (categoria: string, contexto: string) =>
    setCategoriaAbierta({
      title: `Categoría ${categoria}`,
      subtitle: [contexto, temporadaActual?.Temporada].filter(Boolean).join(" · "),
      filtro: "activos",
      categoria,
    });

  /* ── Exportación ──
     Sale lo que se está viendo, con los filtros puestos. La columna de estatus solo se
     agrega cuando el filtro puede traer canceladas: en el caso normal el archivo es el
     formato tal cual, sin una columna que diría "VIGENTE" en todos los renglones. */
  const conEstatus = filtroEstado !== "vigentes";
  const ciclo = temporadaActual?.Temporada ?? "";
  const archivo = `Incorporaciones_${(ciclo || "ciclo").replace(/\s+/g, "_")}`;
  const encabezados = conEstatus ? [...COLUMNAS, "ESTATUS"] : [...COLUMNAS];

  const renglon = (f: IncorporacionRow, i: number): (string | number)[] => {
    const base = [
      i + 1,
      fechaCorta(f.FechaCaptura),
      f.Profesor ?? "",
      f.Jugador ?? "",
      f.Procedencia ?? "",
      f.GrupoIncorporar,
      f.Justificacion ?? "",
      f.Autorizacion ?? "",
    ];
    return conEstatus ? [...base, f.Status === BAJA ? "CANCELADA" : "VIGENTE"] : base;
  };

  const exportExcel = async () => {
    setExportando(true);
    try {
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet("Incorporaciones");
      const ultima = String.fromCharCode(64 + encabezados.length);

      ws.mergeCells(`A1:${ultima}1`);
      const titulo = ws.getCell("A1");
      titulo.value = `CICLO ${ciclo.toUpperCase()}`;
      titulo.font = { bold: true, size: 16, color: { argb: "FF1E293B" } };
      titulo.alignment = { horizontal: "center", vertical: "middle" };

      ws.getCell("B2").value = TITULO_FORMATO;
      ws.getCell("B2").font = { bold: true, size: 12, color: { argb: "FF334155" } };
      const celdaClub = ws.getCell(`${ultima}2`);
      celdaClub.value = CLUB;
      celdaClub.font = { bold: true, size: 12, color: { argb: "FF1E293B" } };
      celdaClub.alignment = { horizontal: "right" };

      ws.columns = [
        { width: 5 }, { width: 12 }, { width: 26 }, { width: 32 },
        { width: 18 }, { width: 20 }, { width: 42 }, { width: 28 },
        ...(conEstatus ? [{ width: 12 }] : []),
      ];

      const header = ws.getRow(3);
      header.values = encabezados;
      header.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 9 };
      header.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
      header.eachCell((c) => {
        c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF334155" } };
        c.border = { top: { style: "thin" }, left: { style: "thin" }, bottom: { style: "thin" }, right: { style: "thin" } };
      });

      filtradas.forEach((f, i) => {
        const fila = ws.addRow(renglon(f, i));
        fila.alignment = { vertical: "middle", wrapText: true };
        fila.eachCell((c) => {
          c.border = { top: { style: "thin" }, left: { style: "thin" }, bottom: { style: "thin" }, right: { style: "thin" } };
        });
        // La autorización va centrada y en cursiva, con aire de firma.
        fila.getCell(8).alignment = { horizontal: "center", vertical: "middle" };
        fila.getCell(8).font = { italic: true };
        if (f.Status === BAJA) fila.font = { strike: true, color: { argb: "FF94A3B8" } };
      });

      const pie = ws.addRow([`${filtradas.length} incorporacion(es)`]);
      pie.font = { bold: true, color: { argb: "FF334155" } };

      const buffer = await wb.xlsx.writeBuffer();
      descarga(
        new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }),
        `${archivo}.xlsx`,
      );
    } finally {
      setExportando(false);
    }
  };

  const exportPdf = () => {
    setExportando(true);
    try {
      const doc = new jsPDF({ orientation: "landscape" });
      const ancho = doc.internal.pageSize.getWidth();

      doc.setFontSize(15);
      doc.setFont("helvetica", "bold");
      doc.text(`CICLO ${ciclo.toUpperCase()}`, ancho / 2, 14, { align: "center" });
      doc.setFontSize(11);
      doc.text(TITULO_FORMATO, 14, 22);
      doc.text(CLUB, ancho - 14, 22, { align: "right" });

      doc.setFontSize(8);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(110);
      const profesorLabel = filtroProfesor === "todos"
        ? "Todos los profesores"
        : profesores.find((p) => p.IdUsuario === filtroProfesor)?.Usuario ?? "Profesor";
      const estadoLabel = filtroEstado === "vigentes" ? "Vigentes" : filtroEstado === "canceladas" ? "Canceladas" : "Todas";
      doc.text(`${profesorLabel} · ${estadoLabel} · ${filtradas.length} incorporacion(es)`, 14, 27);

      autoTable(doc, {
        startY: 30,
        head: [encabezados],
        body: filtradas.map((f, i) => renglon(f, i).map(String)),
        styles: { fontSize: 7, cellPadding: 2, valign: "middle", lineWidth: 0.1, lineColor: [148, 163, 184] },
        headStyles: { fillColor: [51, 65, 85], fontSize: 7, halign: "center" },
        columnStyles: {
          0: { cellWidth: 8, halign: "center" },
          1: { cellWidth: 18 },
          4: { cellWidth: 24 },
          5: { cellWidth: 28 },
          6: { cellWidth: 70 },
          7: { cellWidth: 42, halign: "center", fontStyle: "italic" },
        },
        margin: { left: 14, right: 14 },
        didDrawPage: (datos) => {
          doc.setFontSize(7);
          doc.setTextColor(140);
          doc.text(
            `Pagina ${datos.pageNumber}`,
            ancho - 14,
            doc.internal.pageSize.getHeight() - 8,
            { align: "right" },
          );
        },
      });

      doc.save(`${archivo}.pdf`);
    } finally {
      setExportando(false);
    }
  };


  return (
    <DashboardLayout>
      <main className="p-4 md:p-8 overflow-y-auto flex-1">
        <div className="max-w-7xl mx-auto">
          <div className="bg-[#0f172a] backdrop-blur-sm rounded-xl shadow-2xl p-4 md:p-8 border border-white/20">

            {/* Encabezado */}
            <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 mb-6">
              <div>
                <h2 className="text-2xl md:text-3xl font-bold text-white flex items-center gap-3">
                  <UserRoundPlus className="text-blue-400" size={28} />
                  Incorporaciones
                </h2>
                <p className="text-xs text-slate-400 mt-1">
                  Formato de incorporación: el paso de un jugador a otro grupo, con su justificación y autorización.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={() => setQrAbierto(true)}
                  title="Códigos QR del formulario público de preinscripción"
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white/5 border border-white/15 text-slate-300 hover:bg-white/10 text-xs font-bold transition-colors"
                >
                  <QrCode size={14} /> QR
                </button>
                <a
                  href="/preincorporacion"
                  target="_blank"
                  rel="noopener noreferrer"
                  title="Abrir el formulario público de preinscripción en otra pestaña"
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white/5 border border-white/15 text-slate-300 hover:bg-white/10 text-xs font-bold transition-colors"
                >
                  <ExternalLink size={14} /> Preinscripción
                </a>
                {enFormatos && (
                <select
                  value={temporadaId ?? ""}
                  onChange={(e) => { const t = Number(e.target.value); setTemporadaId(t); cargar(t); }}
                  className={SELECT}
                >
                  {temporadas.map((t) => (
                    <option key={t.IdTemporada} value={t.IdTemporada}>
                      {t.Temporada}{t.EsActiva ? " (activo)" : ""}
                    </option>
                  ))}
                </select>
                )}
                {enFormatos && (
                <ExportGroup
                  disabled={isLoading || exportando || filtradas.length === 0}
                  onExcel={exportExcel}
                  onPdf={exportPdf}
                />
                )}
                {enFormatos && (
                <button
                  onClick={() => cargar(temporadaId)}
                  disabled={isLoading}
                  title="Actualizar"
                  className="p-2 rounded-lg bg-white/5 border border-white/15 text-slate-300 hover:bg-white/10 transition-colors disabled:opacity-40"
                >
                  <RefreshCw size={15} className={isLoading ? "animate-spin" : ""} />
                </button>
                )}
                {enFormatos && (
                <button
                  onClick={() => setCreando(true)}
                  disabled={!temporadaId}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold transition-colors disabled:opacity-40"
                >
                  <Plus size={14} /> Nueva incorporación
                </button>
                )}
              </div>
            </div>

            {/* Pestañas */}
            <div className="flex items-center gap-1 border-b border-white/10 mb-6">
              <button
                onClick={() => setVista("formatos")}
                className={`flex items-center gap-1.5 px-3 py-2 text-[11px] font-black uppercase tracking-widest border-b-2 transition-all ${
                  enFormatos ? "border-blue-500 text-white" : "border-transparent text-slate-500 hover:text-slate-300"
                }`}
              >
                <ClipboardList size={13} /> Formatos
              </button>
              <button
                onClick={() => setVista("preinscripciones")}
                className={`flex items-center gap-1.5 px-3 py-2 text-[11px] font-black uppercase tracking-widest border-b-2 transition-all ${
                  !enFormatos ? "border-blue-500 text-white" : "border-transparent text-slate-500 hover:text-slate-300"
                }`}
              >
                <Inbox size={13} /> Preinscripciones
              </button>
            </div>

            {enFormatos && error && (
              <p className="flex items-start gap-2 mb-4 text-xs text-rose-300 bg-rose-500/10 border border-rose-500/30 rounded-lg px-3 py-2">
                <AlertCircle size={14} className="flex-shrink-0 mt-0.5" /> {error}
              </p>
            )}
            {enFormatos && aviso && (
              <p className="mb-4 text-xs text-emerald-300 bg-emerald-500/10 border border-emerald-500/30 rounded-lg px-3 py-2">
                {aviso}
              </p>
            )}

            {enFormatos && (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
              <Kpi etiqueta="Incorporaciones" valor={String(kpis.num)} clase="text-blue-300" />
              <Kpi etiqueta="Ya aplicadas" valor={String(kpis.aplicadas)} clase="text-emerald-300" />
              <Kpi etiqueta="Grupos destino" valor={String(kpis.grupos)} clase="text-slate-200" />
              <Kpi etiqueta="Profesores" valor={String(kpis.profesores)} clase="text-slate-200" />
            </div>
            )}

            {/* Filtros */}
            {enFormatos && (
            <div className="flex flex-wrap items-center gap-2 mb-5">
              <div className="relative flex-1 min-w-[220px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={14} />
                <input
                  value={busqueda}
                  onChange={(e) => setBusqueda(e.target.value)}
                  placeholder="Buscar por jugador, profesor, grupo o justificación..."
                  className="w-full bg-white/5 border border-white/15 text-slate-200 text-xs py-2 pl-9 pr-3 rounded-lg outline-none focus:border-blue-500"
                />
              </div>
              <select
                value={filtroProfesor}
                onChange={(e) => setFiltroProfesor(e.target.value === "todos" ? "todos" : Number(e.target.value))}
                className={SELECT}
              >
                <option value="todos">Todos los profesores</option>
                {profesores.map((p) => (
                  <option key={p.IdUsuario} value={p.IdUsuario}>{p.Usuario}</option>
                ))}
              </select>
              <select value={filtroEstado} onChange={(e) => setFiltroEstado(e.target.value as FiltroEstado)} className={SELECT}>
                <option value="vigentes">Vigentes</option>
                <option value="canceladas">Canceladas</option>
                <option value="todas">Todas</option>
              </select>
            </div>
            )}

            {/* Cuerpo: los formatos capturados o lo que llegó por el QR */}
            {!enFormatos ? (
              <PreincorporacionesLista />
            ) : isLoading ? (
              <div className="flex flex-col items-center justify-center py-24 gap-3">
                <div className="w-9 h-9 rounded-full border-4 border-blue-500/20 border-t-blue-500 animate-spin" />
                <p className="text-xs font-bold text-slate-500">Cargando incorporaciones...</p>
              </div>
            ) : filtradas.length === 0 ? (
              <div className="text-center py-16 bg-white/5 rounded-2xl border border-dashed border-white/10">
                <UserRoundPlus size={36} className="mx-auto text-slate-600 mb-3" />
                <h3 className="text-sm font-bold text-slate-300">
                  {filas.length === 0 ? "Todavía no hay incorporaciones" : "Nada coincide con los filtros"}
                </h3>
                <p className="text-xs text-slate-500 mt-1.5">
                  {filas.length === 0
                    ? `Pulsa "Nueva incorporación" para llenar el formato${temporadaActual ? ` del ciclo ${temporadaActual.Temporada}` : ""}.`
                    : "Prueba con otro profesor, otro estado o limpiando la búsqueda."}
                </p>
              </div>
            ) : (
              <div className="rounded-2xl border border-white/10 overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-white/5 text-[9px] uppercase font-black text-slate-500 tracking-widest border-b border-white/10">
                        <th className="px-3 py-3 text-center">#</th>
                        <th className="px-4 py-3">Fecha</th>
                        <th className="px-4 py-3">Profesor</th>
                        <th className="px-4 py-3">Jugador</th>
                        <th className="px-4 py-3">Procedencia</th>
                        <th className="px-4 py-3">Grupo a incorporar</th>
                        <th className="px-4 py-3">Justificación</th>
                        <th className="px-4 py-3">Autorización</th>
                        <th className="px-4 py-3 text-right">Acciones</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5 text-slate-300">
                      {filtradas.map((f, i) => {
                        const cancelada = f.Status === BAJA;
                        const aplicada = yaAplicada(f);
                        return (
                          <tr key={f.IdIncorporacion} className={`transition-colors ${cancelada ? "opacity-50" : "hover:bg-white/5"}`}>
                            <td className="px-3 py-3 text-center text-[10px] font-mono text-slate-600 tabular-nums">{i + 1}</td>
                            <td className="px-4 py-3 text-xs tabular-nums whitespace-nowrap text-slate-400">
                              {fechaCorta(f.FechaCaptura)}
                            </td>
                            <td className="px-4 py-3 text-xs text-slate-300 max-w-[160px]">
                              <span className="block truncate">{f.Profesor ?? "—"}</span>
                            </td>
                            <td className="px-4 py-3">
                              <p className={`text-xs font-bold truncate max-w-[200px] ${cancelada ? "text-slate-400 line-through" : "text-white"}`}>
                                {f.Jugador}
                              </p>
                              {f.Sede && <span className="text-[10px] text-slate-500">{f.Sede}</span>}
                            </td>
                            <td className="px-4 py-3">
                              {f.Procedencia ? (
                                <button
                                  type="button"
                                  onClick={() => verCategoria(f.Procedencia!, "Procedencia")}
                                  title={`Ver a los jugadores de ${f.Procedencia}`}
                                  className="px-2 py-0.5 rounded bg-white/5 border border-white/10 text-[10px] font-bold text-slate-300 hover:bg-white/15 hover:text-white transition-colors"
                                >
                                  {f.Procedencia}
                                </button>
                              ) : (
                                <span className="inline-block px-2 py-0.5 rounded bg-white/5 border border-white/10 text-[10px] font-bold text-slate-600">
                                  —
                                </span>
                              )}
                            </td>
                            <td className="px-4 py-3">
                              <span className="inline-flex items-center gap-1.5">
                                <ArrowRight size={11} className="text-blue-400 flex-shrink-0" />
                                <button
                                  type="button"
                                  onClick={() => verCategoria(f.GrupoIncorporar, "Grupo a incorporar")}
                                  title={`Ver a los jugadores de ${f.GrupoIncorporar}`}
                                  className="px-2 py-0.5 rounded bg-blue-600/20 border border-blue-500/40 text-[10px] font-black text-blue-200 hover:bg-blue-600/40 hover:text-white transition-colors"
                                >
                                  {f.GrupoIncorporar}
                                </button>
                                {aplicada && (
                                  <span title="El jugador ya está en ese grupo" className="text-emerald-400">
                                    <Check size={12} />
                                  </span>
                                )}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-[11px] text-slate-400 max-w-[240px]">
                              <span className="line-clamp-2">{f.Justificacion || "—"}</span>
                            </td>
                            <td className="px-4 py-3">
                              <p className="font-[cursive] text-[13px] text-slate-200 leading-tight border-b border-slate-600/60 pb-0.5 max-w-[150px] truncate">
                                {f.Autorizacion ?? "—"}
                              </p>
                              <span className="text-[9px] uppercase tracking-widest text-slate-600">Autoriza</span>
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex items-center justify-end gap-1.5">
                                <button
                                  onClick={() => setEditando(f)}
                                  title="Editar fecha, grupo o justificación"
                                  className="p-1.5 rounded-lg text-slate-400 hover:text-blue-300 hover:bg-blue-500/10 transition-colors"
                                >
                                  <Pencil size={14} />
                                </button>
                                {cancelada ? (
                                  <button
                                    onClick={() => cambiarEstado(f, VIGENTE)}
                                    title="Volver a dejarla vigente"
                                    className="p-1.5 rounded-lg text-slate-400 hover:text-emerald-300 hover:bg-emerald-500/10 transition-colors"
                                  >
                                    <RotateCcw size={14} />
                                  </button>
                                ) : (
                                  <button
                                    onClick={() => cambiarEstado(f, BAJA)}
                                    title="Cancelar la incorporación (no se borra)"
                                    className="p-1.5 rounded-lg text-slate-400 hover:text-rose-300 hover:bg-rose-500/10 transition-colors"
                                  >
                                    <Ban size={14} />
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </div>

        {creando && temporadaId && (
          <NuevaIncorporacionModal
            temporadaId={temporadaId}
            temporada={temporadaActual?.Temporada ?? null}
            profesores={profesores}
            categorias={categorias}
            autorizante={autorizante}
            onClose={() => setCreando(false)}
            onGuardado={() => {
              setCreando(false);
              setAviso("Incorporación guardada");
              cargar(temporadaId);
            }}
          />
        )}

        {qrAbierto && <QrPreincorporacion onClose={() => setQrAbierto(false)} />}

        <PlayersModal
          config={categoriaAbierta}
          temporadaId={temporadaId}
          temporadaNombre={temporadaActual?.Temporada}
          onClose={() => setCategoriaAbierta(null)}
        />

        {editando && (
          <EditarIncorporacionModal
            fila={editando}
            categorias={categorias}
            onClose={() => setEditando(null)}
            onGuardado={() => {
              setEditando(null);
              setAviso("Incorporación actualizada");
              cargar(temporadaId);
            }}
          />
        )}
      </main>
    </DashboardLayout>
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
    <div className="flex items-center gap-1 bg-white/5 border border-white/15 rounded-lg pl-2.5 pr-1 py-1">
      <span className="text-[9px] font-black uppercase tracking-wider text-slate-400 hidden sm:inline">Exportar</span>
      <button
        onClick={onExcel}
        disabled={disabled}
        title="Exportar: Excel"
        className="flex items-center gap-1 px-2 py-1 rounded-lg bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-500/30 text-emerald-200 text-[11px] font-bold transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
      >
        <FileSpreadsheet size={13} /> Excel
      </button>
      <button
        onClick={onPdf}
        disabled={disabled}
        title="Exportar: PDF"
        className="flex items-center gap-1 px-2 py-1 rounded-lg bg-red-600/20 hover:bg-red-600/30 border border-red-500/30 text-red-200 text-[11px] font-bold transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
      >
        <FileText size={13} /> PDF
      </button>
    </div>
  );
}

function Kpi({ etiqueta, valor, clase }: { etiqueta: string; valor: string; clase: string }) {
  return (
    <div className="bg-white/5 border border-white/10 rounded-xl px-4 py-3">
      <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{etiqueta}</p>
      <p className={`text-lg font-black mt-0.5 tabular-nums ${clase}`}>{valor}</p>
    </div>
  );
}
