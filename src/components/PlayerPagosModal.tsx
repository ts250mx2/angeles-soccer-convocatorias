"use client";

import { Fragment, useEffect, useState } from "react";
import {
  X, Loader2, AlertCircle, Receipt, FileDown, FileSpreadsheet, CalendarCheck,
  AlertTriangle, Check, Pencil,
} from "lucide-react";
import {
  type PagoRow, exportPagosToPdf, exportPagosToExcel, money, fecha, mesLabel,
  esPagoAnticipado, MESES_ANTICIPO_SOSPECHOSO,
} from "@/lib/inscripciones-export";

interface JugadorInfo {
  IdJugador: number;
  Jugador: string;
  Categoria: string;
  Status: number;
  Beca: string | null;
  SedeNombre: string;
}

export interface PagosTarget {
  idJugador: number;
  jugador: string;
}

interface InscripcionSugerida {
  IdPago: number;
  FechaPago: string;
  Pago: number;
  TemporadaActual: number | null;
  TemporadaActualNombre: string;
  Producto: string;
  DiasDeDistancia: number;
}

export interface InscripcionSospechosa {
  idPago: number;
  fecha: string;
  /** Temporada bajo la que está archivada actualmente. */
  tempNombreActual: string;
  temporadaDestinoId: number;
  temporadaDestinoNombre: string;
}

export default function PlayerPagosModal({
  target,
  temporadaId,
  temporadaNombre,
  onClose,
  onDataChanged,
  inscripcionSospechosa,
}: {
  target: PagosTarget | null;
  temporadaId: number | null;
  temporadaNombre?: string;
  onClose: () => void;
  /** Se llama cuando un pago cambió (año o temporada), para refrescar la lista. */
  onDataChanged?: () => void;
  /** Inscripción de la temporada anterior que podría ser de la temporada seleccionada
   *  (detectada en adeudos). Muestra un aviso con botón para reasignarla. */
  inscripcionSospechosa?: InscripcionSospechosa | null;
}) {
  const [jugador, setJugador] = useState<JugadorInfo | null>(null);
  const [pagos, setPagos] = useState<PagoRow[]>([]);
  const [total, setTotal] = useState(0);
  const [fechaInscripcion, setFechaInscripcion] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Por defecto se muestra la temporada en curso; el histórico completo es opcional.
  const [soloTemporada, setSoloTemporada] = useState(true);
  // Corrección del año de un pago anticipado
  const [editando, setEditando] = useState<number | null>(null);
  const [anioNuevo, setAnioNuevo] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [avisoCorreccion, setAvisoCorreccion] = useState<string | null>(null);
  const [recarga, setRecarga] = useState(0);
  // Inscripción de otra temporada que parece corresponder a la seleccionada
  const [sugerida, setSugerida] = useState<InscripcionSugerida | null>(null);
  const [moviendo, setMoviendo] = useState(false);
  // Una vez movida la inscripción sospechosa, el aviso desaparece.
  const [movidaSosp, setMovidaSosp] = useState(false);

  useEffect(() => {
    if (target) setSoloTemporada(true);
    // Al cambiar de jugador (o de aviso), el banner de sospecha vuelve a mostrarse.
    setMovidaSosp(false);
  }, [target, inscripcionSospechosa]);

  useEffect(() => {
    if (!target) return;
    let alive = true;
    setIsLoading(true);
    setError(null);

    const params = new URLSearchParams({ idJugador: String(target.idJugador) });
    if (soloTemporada && temporadaId) params.set("temporadaId", String(temporadaId));

    (async () => {
      try {
        const res = await fetch(`/api/inscripciones/pagos?${params}`);
        const json = await res.json();
        if (!alive) return;
        if (json.success) {
          setJugador(json.data.jugador);
          setPagos(json.data.pagos);
          setTotal(Number(json.data.total ?? 0));
          setFechaInscripcion(json.data.fechaInscripcion ?? null);
          setSugerida(json.data.inscripcionSugerida ?? null);
        } else {
          setError(json.message ?? "Error al cargar los pagos");
        }
      } catch {
        if (alive) setError("Error de conexión");
      } finally {
        if (alive) setIsLoading(false);
      }
    })();

    return () => { alive = false; };
  }, [target, temporadaId, soloTemporada, recarga]);

  // Al cambiar de jugador o de alcance se cierra cualquier edición abierta.
  useEffect(() => {
    setEditando(null);
    setAvisoCorreccion(null);
  }, [target, soloTemporada]);

  const corregirAnio = async (idPago: number) => {
    const anio = Number(anioNuevo);
    if (!Number.isInteger(anio)) return;

    setGuardando(true);
    setAvisoCorreccion(null);
    try {
      const res = await fetch("/api/inscripciones/pagos/anio", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idPago, anio }),
      });
      const json = await res.json();

      if (!json.success) {
        setAvisoCorreccion(json.message ?? "No se pudo corregir el pago");
        return;
      }

      const d = json.data;
      let msg = `Pago ${idPago}: año ${d.anioAnterior} → ${d.anioNuevo}`;
      if (d.sinTemporada) {
        msg += ". Ninguna temporada cubre ese mes, se conservó la anterior.";
      } else if (d.temporadaAnterior !== d.temporadaNueva) {
        msg += `, temporada → ${d.temporadaNombre}`;
        if (d.ambigua) msg += ` (varias temporadas cubren ese mes: ${d.candidatas.join(", ")}; se tomó la más reciente)`;
      }
      setAvisoCorreccion(msg);
      setEditando(null);
      setRecarga((r) => r + 1);
      onDataChanged?.();
    } catch {
      setAvisoCorreccion("Error de conexión al corregir el pago");
    } finally {
      setGuardando(false);
    }
  };

  const moverInscripcion = async () => {
    if (!sugerida || !temporadaId) return;

    setMoviendo(true);
    setAvisoCorreccion(null);
    try {
      const res = await fetch("/api/inscripciones/pagos/temporada", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idPago: sugerida.IdPago, temporadaId }),
      });
      const json = await res.json();

      if (!json.success) {
        setAvisoCorreccion(json.message ?? "No se pudo mover la inscripción");
        return;
      }

      setAvisoCorreccion(
        `Inscripción ${sugerida.IdPago} movida de ${sugerida.TemporadaActualNombre} a ${json.data.temporadaNombre}. El jugador ya cuenta como inscrito.`
      );
      setSugerida(null);
      setRecarga((r) => r + 1);
      onDataChanged?.();
    } catch {
      setAvisoCorreccion("Error de conexión al mover la inscripción");
    } finally {
      setMoviendo(false);
    }
  };

  // Reasigna la inscripción sospechosa (detectada en adeudos) a la temporada destino.
  const moverSospechosa = async () => {
    if (!inscripcionSospechosa) return;
    setMoviendo(true);
    setAvisoCorreccion(null);
    try {
      const res = await fetch("/api/inscripciones/pagos/temporada", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          idPago: inscripcionSospechosa.idPago,
          temporadaId: inscripcionSospechosa.temporadaDestinoId,
        }),
      });
      const json = await res.json();
      if (!json.success) {
        setAvisoCorreccion(json.message ?? "No se pudo mover la inscripción");
        return;
      }
      setAvisoCorreccion(
        `Inscripción ${inscripcionSospechosa.idPago} movida a ${inscripcionSospechosa.temporadaDestinoNombre}. El jugador ya cuenta como inscrito.`
      );
      setMovidaSosp(true);
      setRecarga((r) => r + 1);
      onDataChanged?.();
    } catch {
      setAvisoCorreccion("Error de conexión al mover la inscripción");
    } finally {
      setMoviendo(false);
    }
  };

  useEffect(() => {
    if (!target) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [target, onClose]);

  if (!target) return null;

  const anticipados = pagos.filter(esPagoAnticipado);
  const scopeLabel = soloTemporada && temporadaNombre ? temporadaNombre : "Histórico completo";
  const subtitle = [jugador?.SedeNombre, jugador?.Categoria, scopeLabel].filter(Boolean).join(" · ");
  const nombre = jugador?.Jugador ?? target.jugador;
  const canExport = !isLoading && !error && pagos.length > 0;

  const btn = "flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-[11px] font-bold transition-all disabled:opacity-40 disabled:cursor-not-allowed";

  return (
    <div
      className="fixed inset-0 bg-black/75 backdrop-blur-md flex items-center justify-center z-[160] p-4"
      onClick={onClose}
    >
      <div
        className="bg-[#0f172a] border border-white/15 rounded-3xl w-full max-w-4xl max-h-[88vh] flex flex-col shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-5 border-b border-white/10 bg-white/5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className="text-lg font-black text-white flex items-center gap-2">
                <Receipt size={18} className="text-blue-400 flex-shrink-0" />
                <span className="truncate">{nombre}</span>
              </h3>
              {subtitle && <p className="text-xs text-slate-400 mt-0.5">{subtitle}</p>}
              {fechaInscripcion && (
                <p className="text-[10px] text-emerald-400/90 font-semibold mt-1 flex items-center gap-1">
                  <CalendarCheck size={11} />
                  Inscripción: {fecha(fechaInscripcion)}
                </p>
              )}
            </div>
            <button onClick={onClose} className="p-2 rounded-xl hover:bg-white/10 text-slate-400 hover:text-white transition-all flex-shrink-0">
              <X size={20} />
            </button>
          </div>

          {/* Alcance + exportación */}
          <div className="mt-4 flex flex-wrap items-center gap-2">
            {temporadaId && (
              <div className="flex bg-white/5 border border-white/10 rounded-lg p-0.5">
                <button
                  onClick={() => setSoloTemporada(true)}
                  className={`px-3 py-1 rounded-md text-[11px] font-bold transition-all ${
                    soloTemporada ? "bg-blue-600 text-white" : "text-slate-400 hover:text-white"
                  }`}
                >
                  {temporadaNombre ?? "Temporada"}
                </button>
                <button
                  onClick={() => setSoloTemporada(false)}
                  className={`px-3 py-1 rounded-md text-[11px] font-bold transition-all ${
                    !soloTemporada ? "bg-blue-600 text-white" : "text-slate-400 hover:text-white"
                  }`}
                >
                  Todo el histórico
                </button>
              </div>
            )}

            <div className="ml-auto flex items-center gap-2">
              <button
                onClick={() => exportPagosToPdf(pagos, nombre, subtitle, total)}
                disabled={!canExport}
                className={`${btn} bg-blue-600/15 hover:bg-blue-600/25 border-blue-500/30 text-blue-200`}
              >
                <FileDown size={13} /> PDF
              </button>
              <button
                onClick={() => exportPagosToExcel(pagos, nombre, subtitle, total)}
                disabled={!canExport}
                className={`${btn} bg-emerald-600/15 hover:bg-emerald-600/25 border-emerald-500/30 text-emerald-200`}
              >
                <FileSpreadsheet size={13} /> Excel
              </button>
            </div>
          </div>
        </div>

        {/* Inscripción de otra temporada pagada cerca del inicio de esta (detectada en
            adeudos): probable inscripción de esta temporada. Al moverla, el aviso se
            oculta. */}
        {inscripcionSospechosa && !movidaSosp && (
          <div className="mx-5 mt-4 bg-amber-500/10 border border-amber-500/30 rounded-xl px-3.5 py-3">
            <div className="flex items-start gap-2.5">
              <AlertTriangle size={16} className="text-amber-300 flex-shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="text-[11px] text-amber-100/90 leading-relaxed">
                  Este jugador tiene una <span className="font-black">inscripción</span> pagada el{" "}
                  <span className="font-bold">{inscripcionSospechosa.fecha}</span> a menos de 2 meses del
                  inicio de <span className="font-bold">{inscripcionSospechosa.temporadaDestinoNombre}</span>,
                  pero registrada en <span className="font-bold">{inscripcionSospechosa.tempNombreActual}</span>.{" "}
                  <span className="font-bold">Podría ser la inscripción de {inscripcionSospechosa.temporadaDestinoNombre}.</span>
                </p>
                <button
                  onClick={moverSospechosa}
                  disabled={moviendo}
                  className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-white text-[11px] font-bold transition-all disabled:opacity-50"
                >
                  {moviendo ? <Loader2 size={12} className="animate-spin" /> : <CalendarCheck size={12} />}
                  Mover a {inscripcionSospechosa.temporadaDestinoNombre}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Inscripción de otra temporada que parece corresponder a la seleccionada */}
        {sugerida && !inscripcionSospechosa && (
          <div className="mx-5 mt-4 bg-purple-500/10 border border-purple-500/30 rounded-xl px-3.5 py-3">
            <div className="flex items-start gap-2.5">
              <CalendarCheck size={16} className="text-purple-300 flex-shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="text-[11px] text-purple-100/90 leading-relaxed">
                  Se encontró un pago de <span className="font-black">inscripción</span> del{" "}
                  <span className="font-bold">{sugerida.FechaPago}</span> ({sugerida.Producto},{" "}
                  {money(Number(sugerida.Pago))}) cobrado{" "}
                  {sugerida.DiasDeDistancia === 0
                    ? "el mismo día"
                    : `a ${sugerida.DiasDeDistancia} día(s)`}{" "}
                  de las mensualidades, pero archivado en{" "}
                  <span className="font-bold">{sugerida.TemporadaActualNombre}</span>. Parece la
                  inscripción de {temporadaNombre ?? "esta temporada"}.
                </p>
                <button
                  onClick={moverInscripcion}
                  disabled={moviendo}
                  className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-500 text-white text-[11px] font-bold transition-all disabled:opacity-50"
                >
                  {moviendo ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
                  Mover a {temporadaNombre ?? "esta temporada"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Aviso de pagos con antelación sospechosa */}
        {anticipados.length > 0 && (
          <div className="mx-5 mt-4 flex items-start gap-2.5 bg-amber-500/10 border border-amber-500/30 rounded-xl px-3.5 py-2.5">
            <AlertTriangle size={16} className="text-amber-400 flex-shrink-0 mt-0.5" />
            <div className="text-[11px] text-amber-200/90 leading-relaxed">
              <span className="font-black">
                {anticipados.length} {anticipados.length === 1 ? "pago marcado" : "pagos marcados"}
              </span>{" "}
              con más de {MESES_ANTICIPO_SOSPECHOSO} meses de antelación al inicio de la temporada. El detalle está en cada renglón.
            </div>
          </div>
        )}

        {avisoCorreccion && (
          <div className="mx-5 mt-3 flex items-start gap-2.5 bg-blue-500/10 border border-blue-500/30 rounded-xl px-3.5 py-2.5">
            <Check size={16} className="text-blue-300 flex-shrink-0 mt-0.5" />
            <p className="text-[11px] text-blue-100/90 leading-relaxed">{avisoCorreccion}</p>
          </div>
        )}

        {/* Tabla */}
        <div className="flex-1 overflow-auto p-5">
          {isLoading ? (
            <div className="h-48 flex flex-col items-center justify-center gap-3 text-slate-400">
              <Loader2 size={28} className="animate-spin text-blue-500" />
              <p className="text-sm font-bold">Cargando pagos...</p>
            </div>
          ) : error ? (
            <div className="h-48 flex flex-col items-center justify-center gap-3 text-rose-400">
              <AlertCircle size={36} className="opacity-60" />
              <p className="text-sm font-black">{error}</p>
            </div>
          ) : pagos.length === 0 ? (
            <div className="h-48 flex flex-col items-center justify-center gap-3 text-slate-500">
              <Receipt size={40} className="opacity-20" />
              <p className="text-base font-black">Sin pagos registrados</p>
              <p className="text-xs opacity-60">
                {soloTemporada ? "No hay pagos en esta temporada" : "Este jugador no tiene pagos"}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-2xl border border-white/10">
              <table className="w-full text-sm min-w-[760px]">
                <thead className="bg-white/[0.07]">
                  <tr className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                    <th className="px-3 py-2.5 text-left">Recibo</th>
                    <th className="px-3 py-2.5 text-left">Fecha</th>
                    <th className="px-3 py-2.5 text-left">Concepto</th>
                    <th className="px-3 py-2.5 text-left">Tipo</th>
                    <th className="px-3 py-2.5 text-left">Mes</th>
                    <th className="px-3 py-2.5 text-left">Forma</th>
                    <th className="px-3 py-2.5 text-right">Importe</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {pagos.map((p) => {
                    const anticipado = esPagoAnticipado(p);
                    const enEdicion = editando === p.IdPago;
                    return (
                    <Fragment key={p.IdPago}>
                    <tr className={`transition-colors ${anticipado ? "bg-amber-500/[0.07] hover:bg-amber-500/[0.12]" : "hover:bg-white/[0.04]"}`}>
                      <td className="px-3 py-2 text-slate-500 text-xs font-mono">{p.Recibo || p.IdPago}</td>
                      <td className="px-3 py-2 text-slate-300 text-xs whitespace-nowrap">{fecha(p.FechaPago)}</td>
                      <td className="px-3 py-2 text-slate-200 font-semibold text-xs">{p.Producto}</td>
                      <td className="px-3 py-2">
                        <span className={`text-[9px] font-black px-2 py-0.5 rounded-md border whitespace-nowrap ${
                          p.IdTipoProducto === 2
                            ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/25"
                            : p.IdTipoProducto === 1
                              ? "bg-blue-500/15 text-blue-300 border-blue-500/25"
                              : "bg-white/5 text-slate-400 border-white/10"
                        }`}>
                          {p.TipoProducto}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-xs whitespace-nowrap">
                        <span className={anticipado ? "text-amber-300 font-bold" : "text-slate-400"}>
                          {mesLabel(p.Mes, p.Anio)}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-slate-400 text-xs">{p.FormaPago}</td>
                      <td className="px-3 py-2 text-right whitespace-nowrap">
                        {Number(p.Pago) === 0 ? (
                          /* Importe en cero = concepto cubierto por beca, no un cobro real. */
                          <span
                            title="Concepto cubierto por beca (importe en cero)"
                            className="text-[9px] font-black px-2 py-0.5 rounded-md bg-purple-500/15 text-purple-300 border border-purple-500/30"
                          >
                            BECADO
                          </span>
                        ) : (
                          <span className="text-emerald-400 font-black">{money(Number(p.Pago))}</span>
                        )}
                      </td>
                    </tr>

                    {/* El aviso va pegado al renglón del pago que lo provoca */}
                    {anticipado && (
                      <tr className="bg-amber-500/[0.07]">
                        <td colSpan={7} className="px-3 pb-2.5 pt-0">
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-2 bg-amber-500/10 border border-amber-500/30 rounded-lg px-3 py-2">
                            <AlertTriangle size={14} className="text-amber-400 flex-shrink-0" />
                            <p className="text-[11px] text-amber-100/90 leading-snug">
                              Se cobró el <span className="font-bold">{fecha(p.FechaPago).split(" ")[0]}</span>,{" "}
                              <span className="font-bold">{p.MesesAntesDeTemporada} meses antes</span> de que iniciara
                              {temporadaNombre ? ` ${temporadaNombre}` : " la temporada"}, pero ampara{" "}
                              <span className="font-bold">{mesLabel(p.Mes, p.Anio)}</span>. Probable error de captura del año.
                            </p>

                            {enEdicion ? (
                              <div className="flex items-center gap-1.5 ml-auto">
                                <span className="text-[11px] text-amber-200/80">{mesLabel(p.Mes, null)} de</span>
                                <input
                                  type="number"
                                  value={anioNuevo}
                                  onChange={(e) => setAnioNuevo(e.target.value)}
                                  onKeyDown={(e) => { if (e.key === "Enter") corregirAnio(p.IdPago); }}
                                  autoFocus
                                  className="w-[74px] bg-white/10 border border-amber-500/50 rounded-md px-2 py-1 text-white text-xs outline-none focus:border-amber-400 [color-scheme:dark]"
                                />
                                <button
                                  onClick={() => corregirAnio(p.IdPago)}
                                  disabled={guardando || !anioNuevo}
                                  className="flex items-center gap-1 px-2.5 py-1 rounded-md bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-bold disabled:opacity-40"
                                >
                                  {guardando ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
                                  Guardar
                                </button>
                                <button
                                  onClick={() => setEditando(null)}
                                  disabled={guardando}
                                  className="p-1.5 rounded-md bg-white/10 hover:bg-white/20 text-slate-300"
                                  title="Cancelar"
                                >
                                  <X size={12} />
                                </button>
                              </div>
                            ) : (
                              <button
                                onClick={() => {
                                  setEditando(p.IdPago);
                                  setAnioNuevo(String((p.Anio ?? new Date().getFullYear()) - 1));
                                  setAvisoCorreccion(null);
                                }}
                                className="ml-auto flex items-center gap-1.5 px-3 py-1 rounded-md bg-amber-500/20 hover:bg-amber-500/35 text-amber-200 border border-amber-500/40 text-[11px] font-bold whitespace-nowrap"
                              >
                                <Pencil size={11} /> Corregir año
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                    </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Footer con el total */}
        <div className="p-4 px-5 bg-white/5 border-t border-white/10 flex items-center justify-between gap-3">
          <p className="text-[11px] text-slate-500">
            {isLoading ? "—" : `${pagos.length} pago(s)`}
          </p>
          <div className="text-right">
            <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Total pagado</p>
            <p className="text-xl font-black text-emerald-400">{money(total)}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
