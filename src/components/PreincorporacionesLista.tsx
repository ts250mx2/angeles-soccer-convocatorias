"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Search, RefreshCw, AlertCircle, Phone, Ban, RotateCcw, Inbox, MessageSquare,
} from "lucide-react";
import { VIGENTE, BAJA, type PreincorporacionRow } from "@/lib/preincorporaciones";

/**
 * Lo que llegó por el QR público de preinscripción.
 *
 * Es una bandeja de contactos, no un reporte: lo que importa de cada renglón es poder
 * llamar. Por eso el teléfono va grande y con enlace `tel:`, que en el celular marca
 * de un toque.
 *
 * Un contacto que no cuajó se descarta, no se borra: qué equipo pidió y cuándo preguntó
 * siguen siendo información del embudo.
 */

type FiltroEstado = "vigentes" | "descartadas" | "todas";

const SELECT =
  "bg-white/5 border border-white/15 text-slate-200 text-xs py-2 px-3 rounded-lg outline-none focus:border-blue-500 transition-colors";

const fechaHora = (valor: string | null): string => {
  if (!valor) return "—";
  const [fecha, hora] = valor.split(" ");
  const [anio, mes, dia] = (fecha ?? "").split("-");
  return anio && mes && dia ? `${dia}/${mes}/${anio}${hora ? ` ${hora}` : ""}` : valor;
};

export default function PreincorporacionesLista() {
  const [filas, setFilas] = useState<PreincorporacionRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busqueda, setBusqueda] = useState("");
  const [filtroEstado, setFiltroEstado] = useState<FiltroEstado>("vigentes");

  const cargar = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/incorporaciones/preregistros");
      const json = await res.json();
      if (json.success) setFilas(json.data);
      else setError(json.message ?? "Error al cargar las preinscripciones");
    } catch {
      setError("Error de conexión");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  const filtradas = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return filas.filter((f) => {
      if (filtroEstado === "vigentes" && f.Status !== VIGENTE) return false;
      if (filtroEstado === "descartadas" && f.Status !== BAJA) return false;
      if (!q) return true;
      return [f.Jugador, f.Telefono, f.Equipo, f.Comentarios, String(f.AnioNacimiento ?? "")]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q));
    });
  }, [filas, busqueda, filtroEstado]);

  const vigentes = filas.filter((f) => f.Status === VIGENTE).length;

  const cambiarEstado = async (fila: PreincorporacionRow, status: number) => {
    try {
      const res = await fetch(`/api/incorporaciones/preregistros/${fila.IdIncorporacionPre}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const json = await res.json();
      if (!json.success) {
        setError(json.message ?? "No se pudo actualizar");
        return;
      }
      cargar();
    } catch {
      setError("Error de conexión");
    }
  };

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 mb-5">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={14} />
          <input
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar por jugador, teléfono, equipo o comentario..."
            className="w-full bg-white/5 border border-white/15 text-slate-200 text-xs py-2 pl-9 pr-3 rounded-lg outline-none focus:border-blue-500"
          />
        </div>
        <select value={filtroEstado} onChange={(e) => setFiltroEstado(e.target.value as FiltroEstado)} className={SELECT}>
          <option value="vigentes">Vigentes ({vigentes})</option>
          <option value="descartadas">Descartadas</option>
          <option value="todas">Todas</option>
        </select>
        <button
          onClick={cargar}
          disabled={isLoading}
          title="Actualizar"
          className="p-2 rounded-lg bg-white/5 border border-white/15 text-slate-300 hover:bg-white/10 transition-colors disabled:opacity-40"
        >
          <RefreshCw size={15} className={isLoading ? "animate-spin" : ""} />
        </button>
      </div>

      {error && (
        <p className="flex items-start gap-2 mb-4 text-xs text-rose-300 bg-rose-500/10 border border-rose-500/30 rounded-lg px-3 py-2">
          <AlertCircle size={14} className="flex-shrink-0 mt-0.5" /> {error}
        </p>
      )}

      {isLoading ? (
        <div className="flex flex-col items-center justify-center py-20 gap-3">
          <div className="w-9 h-9 rounded-full border-4 border-blue-500/20 border-t-blue-500 animate-spin" />
          <p className="text-xs font-bold text-slate-500">Cargando preinscripciones...</p>
        </div>
      ) : filtradas.length === 0 ? (
        <div className="text-center py-16 bg-white/5 rounded-2xl border border-dashed border-white/10">
          <Inbox size={36} className="mx-auto text-slate-600 mb-3" />
          <h3 className="text-sm font-bold text-slate-300">
            {filas.length === 0 ? "Todavía no llega ninguna preinscripción" : "Nada coincide con los filtros"}
          </h3>
          <p className="text-xs text-slate-500 mt-1.5">
            {filas.length === 0
              ? "Comparte el QR de preinscripción para que empiecen a llegar."
              : "Prueba con otro estado o limpiando la búsqueda."}
          </p>
        </div>
      ) : (
        <div className="rounded-2xl border border-white/10 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-white/5 text-[9px] uppercase font-black text-slate-500 tracking-widest border-b border-white/10">
                  <th className="px-4 py-3">Recibida</th>
                  <th className="px-4 py-3">Jugador</th>
                  <th className="px-4 py-3">Teléfono</th>
                  <th className="px-4 py-3">Equipo</th>
                  <th className="px-4 py-3">Comentarios</th>
                  <th className="px-4 py-3 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5 text-slate-300">
                {filtradas.map((f) => {
                  const descartada = f.Status === BAJA;
                  return (
                    <tr key={f.IdIncorporacionPre} className={`transition-colors ${descartada ? "opacity-50" : "hover:bg-white/5"}`}>
                      <td className="px-4 py-3 text-xs tabular-nums whitespace-nowrap text-slate-400">
                        {fechaHora(f.FechaAlta)}
                      </td>
                      <td className="px-4 py-3">
                        <p className={`text-xs font-bold truncate max-w-[220px] ${descartada ? "text-slate-400 line-through" : "text-white"}`}>
                          {f.Jugador}
                        </p>
                        <span className="text-[10px] text-slate-500">
                          {f.AnioNacimiento ?? "—"}
                          {f.Edad != null && ` · ${f.Edad} años`}
                        </span>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        {f.Telefono ? (
                          <a
                            href={`tel:${f.Telefono.replace(/\D/g, "")}`}
                            className="flex items-center gap-1.5 text-xs font-bold text-blue-300 hover:text-blue-200 tabular-nums transition-colors"
                          >
                            <Phone size={12} /> {f.Telefono}
                          </a>
                        ) : (
                          <span className="text-xs text-slate-600">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {f.Equipo ? (
                          <span className="inline-block px-2 py-0.5 rounded bg-white/5 border border-white/10 text-[10px] font-bold text-slate-300">
                            {f.Equipo}
                          </span>
                        ) : (
                          <span className="text-xs text-slate-600">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-[11px] text-slate-400 max-w-[260px]">
                        {f.Comentarios ? (
                          <span className="flex items-start gap-1.5">
                            <MessageSquare size={11} className="text-slate-600 flex-shrink-0 mt-0.5" />
                            <span className="line-clamp-2">{f.Comentarios}</span>
                          </span>
                        ) : (
                          <span className="text-slate-600">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end">
                          {descartada ? (
                            <button
                              onClick={() => cambiarEstado(f, VIGENTE)}
                              title="Regresarla a vigentes"
                              className="p-1.5 rounded-lg text-slate-400 hover:text-emerald-300 hover:bg-emerald-500/10 transition-colors"
                            >
                              <RotateCcw size={14} />
                            </button>
                          ) : (
                            <button
                              onClick={() => cambiarEstado(f, BAJA)}
                              title="Descartar (no se borra)"
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
  );
}
