"use client";

import { useState } from "react";
import { X, Loader2, AlertCircle, Check, PenLine, Pencil } from "lucide-react";
import BuscadorIncremental, { type OpcionBuscador } from "@/components/BuscadorIncremental";
import type { IncorporacionRow } from "@/lib/incorporaciones";

/**
 * Edición de un formato ya capturado.
 *
 * El ALTA no vive aquí: se captura en un renglón de la propia tabla
 * (@/components/NuevaIncorporacionFila), que es como se llena el formato en papel. La
 * edición sí es un modal porque se abre sobre un renglón concreto, para corregirlo, y
 * no forma parte del trabajo de capturar en tanda.
 *
 * De aquí salen además dos piezas que comparte el renglón de alta: la `Firma` de la
 * autorización y el `Marco` del modal.
 */

const CAMPO =
  "w-full bg-white/5 border border-white/15 text-slate-200 text-sm py-2 px-3 rounded-lg outline-none focus:border-blue-500 transition-colors";
const ETIQUETA = "block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1.5";

export function EditarIncorporacionModal({
  fila, categorias, onClose, onGuardado,
}: {
  fila: IncorporacionRow;
  categorias: string[];
  onClose: () => void;
  onGuardado: () => void;
}) {
  const [fecha, setFecha] = useState(fila.FechaCaptura);
  const [grupo, setGrupo] = useState<OpcionBuscador | null>({
    valor: fila.GrupoIncorporar,
    etiqueta: fila.GrupoIncorporar,
  });
  const [justificacion, setJustificacion] = useState(fila.Justificacion ?? "");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const guardar = async () => {
    setError(null);
    if (!grupo) return setError("Elige el grupo a incorporar");

    setGuardando(true);
    try {
      const res = await fetch(`/api/incorporaciones/${fila.IdIncorporacion}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fecha, grupoIncorporar: grupo.valor, justificacion: justificacion.trim() }),
      });
      const json = await res.json();
      if (json.success) onGuardado();
      else setError(json.message ?? "No se pudo guardar");
    } catch {
      setError("Error de conexión");
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Marco titulo="Editar incorporación" subtitulo={fila.Temporada} icono={<Pencil size={18} />} onClose={onClose}>
      <div className="bg-white/5 border border-white/10 rounded-xl px-4 py-3 mb-5">
        <p className="text-sm font-black text-white">{fila.Jugador}</p>
        <p className="text-[11px] text-slate-400 mt-0.5">
          Profesor: {fila.Profesor ?? "—"} · Procedencia: {fila.Procedencia || "—"}
        </p>
        <p className="text-[10px] text-slate-500 mt-1">
          El jugador, el profesor y la procedencia no se cambian: eso sería otro formato.
        </p>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <div>
          <label className={ETIQUETA}>Fecha de captura</label>
          <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className={`${CAMPO} [color-scheme:dark]`} />
        </div>
        <BuscadorIncremental
          etiqueta="Grupo a incorporar"
          opciones={categorias.map((c) => ({ valor: c, etiqueta: c }))}
          valor={grupo?.valor ?? null}
          onChange={setGrupo}
          permiteNuevo
        />
        <div className="md:col-span-2">
          <label className={ETIQUETA}>Justificación de incorporación</label>
          <textarea
            value={justificacion}
            onChange={(e) => setJustificacion(e.target.value)}
            maxLength={500}
            rows={3}
            className={`${CAMPO} resize-none`}
          />
        </div>
        <div className="md:col-span-2">
          <label className={ETIQUETA}>Autorización</label>
          <Firma nombre={fila.Autorizacion ?? "—"} fecha={fila.FechaAutorizacion} />
        </div>
      </div>

      {error && (
        <p className="flex items-start gap-2 mt-4 text-xs text-rose-300 bg-rose-500/10 border border-rose-500/30 rounded-lg px-3 py-2">
          <AlertCircle size={14} className="flex-shrink-0 mt-0.5" /> {error}
        </p>
      )}

      <div className="flex justify-end gap-2 mt-6">
        <button onClick={onClose} className="px-4 py-2 rounded-lg border border-white/15 text-slate-300 text-xs font-bold hover:bg-white/5 transition-colors">
          Cancelar
        </button>
        <button
          onClick={guardar}
          disabled={guardando}
          className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-black transition-colors disabled:opacity-40"
        >
          {guardando ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
          Guardar cambios
        </button>
      </div>
    </Marco>
  );
}

/** La autorización del formato, con aire de firma: nombre sobre una raya. */
export function Firma({ nombre, fecha }: { nombre: string; fecha?: string | null }) {
  return (
    <div className="bg-white/[0.03] border border-white/10 rounded-lg px-4 pt-3 pb-2 text-center">
      <p className="font-[cursive] text-lg text-slate-100 leading-tight">{nombre}</p>
      <div className="border-t border-slate-500/60 mt-1 pt-1 flex items-center justify-center gap-1.5">
        <PenLine size={11} className="text-slate-500" />
        <span className="text-[10px] uppercase tracking-widest text-slate-500 font-bold">
          Autoriza{fecha ? ` · ${fecha}` : ""}
        </span>
      </div>
    </div>
  );
}

function Marco({
  titulo, subtitulo, icono, onClose, children,
}: {
  titulo: string; subtitulo?: string | null; icono: React.ReactNode; onClose: () => void; children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-[130] p-4" onClick={onClose}>
      <div
        className="bg-slate-900 border border-white/15 rounded-2xl w-full max-w-3xl shadow-2xl max-h-[92vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-slate-900/95 backdrop-blur border-b border-white/10 px-6 py-4 flex items-center justify-between">
          <div>
            <h3 className="text-base font-black text-white flex items-center gap-2">
              <span className="text-blue-400">{icono}</span>
              {titulo}
            </h3>
            {subtitulo && <p className="text-[11px] text-slate-500 mt-0.5 ml-7">Ciclo {subtitulo}</p>}
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-slate-500 hover:text-white hover:bg-white/10 transition-colors">
            <X size={18} />
          </button>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>
  );
}
