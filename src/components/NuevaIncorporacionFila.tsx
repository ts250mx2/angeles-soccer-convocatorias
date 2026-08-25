"use client";

import { useCallback, useState } from "react";
import { Loader2, AlertCircle, Check, X, UserRoundPlus, ArrowRight } from "lucide-react";
import BuscadorIncremental, { type OpcionBuscador } from "@/components/BuscadorIncremental";
import { Firma } from "@/components/IncorporacionModal";
import type { JugadorBuscado, OpcionProfesor } from "@/lib/incorporaciones";

/**
 * Captura de una incorporación nueva, como un renglón más de la tabla.
 *
 * Va dentro de una celda que abarca todo el ancho, en lugar de una casilla por columna:
 * la justificación es un párrafo y los tres buscadores despliegan su lista, y ninguna
 * de las dos cosas cabe en una columna de tabla sin dejar el formato ilegible. Los
 * campos van en el ORDEN del papel, que es el de las columnas de arriba.
 *
 * La procedencia no se captura: es la categoría que el jugador tiene hoy. El servidor
 * la vuelve a leer de la base al guardar, así que lo que se ve aquí es informativo.
 */

const CAMPO =
  "w-full bg-white/5 border border-white/15 text-slate-200 text-sm py-2 px-3 rounded-lg outline-none focus:border-blue-500 transition-colors";
const ETIQUETA = "block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1.5";

const hoy = () => {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

export default function NuevaIncorporacionFila({
  temporadaId, temporada, profesores, categorias, autorizante, onCancelar, onGuardado,
}: {
  temporadaId: number;
  temporada: string | null;
  profesores: OpcionProfesor[];
  categorias: string[];
  autorizante: string;
  onCancelar: () => void;
  /** La fila se queda abierta: se capturan varias seguidas. */
  onGuardado: () => void;
}) {
  const [fecha, setFecha] = useState(hoy);
  const [profesor, setProfesor] = useState<OpcionBuscador | null>(null);
  const [jugador, setJugador] = useState<OpcionBuscador | null>(null);
  const [procedencia, setProcedencia] = useState("");
  const [grupo, setGrupo] = useState<OpcionBuscador | null>(null);
  const [justificacion, setJustificacion] = useState("");

  const [jugadores, setJugadores] = useState<JugadorBuscado[]>([]);
  const [buscando, setBuscando] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const buscarJugadores = useCallback(async (texto: string) => {
    setBuscando(true);
    try {
      const res = await fetch(`/api/incorporaciones/jugadores?q=${encodeURIComponent(texto)}`);
      const json = await res.json();
      if (json.success) setJugadores(json.data);
    } catch {
      /* el buscador se queda con lo que ya tenía; el error real sale al guardar */
    } finally {
      setBuscando(false);
    }
  }, []);

  /* Elegir jugador llena la procedencia: es su categoría de hoy, no se captura. */
  const elegirJugador = (opcion: OpcionBuscador | null) => {
    setJugador(opcion);
    const encontrado = jugadores.find((j) => String(j.IdJugador) === opcion?.valor);
    setProcedencia(encontrado?.Categoria ?? "");
  };

  const guardar = async () => {
    setError(null);
    if (!profesor) return setError("Elige el profesor");
    if (!jugador) return setError("Elige el jugador");
    if (!grupo) return setError("Elige el grupo a incorporar");

    setGuardando(true);
    try {
      const res = await fetch("/api/incorporaciones", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          temporadaId,
          fecha,
          idProfesor: Number(profesor.valor),
          idJugador: Number(jugador.valor),
          grupoIncorporar: grupo.valor,
          justificacion: justificacion.trim(),
        }),
      });
      const json = await res.json();
      if (!json.success) {
        setError(json.message ?? "No se pudo guardar");
        return;
      }
      /* Se limpia el jugador y lo que cuelga de él, pero NO la fecha ni el profesor:
         los formatos se capturan en tanda, y esos dos se repiten renglón tras renglón. */
      setJugador(null);
      setProcedencia("");
      setGrupo(null);
      setJustificacion("");
      onGuardado();
    } catch {
      setError("Error de conexión");
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="px-4 py-4 space-y-3">
      <div className="flex items-center gap-2">
        <UserRoundPlus size={14} className="text-blue-400" />
        <p className="text-[11px] font-black uppercase tracking-widest text-blue-200">
          Nueva incorporación
        </p>
        {temporada && <span className="text-[10px] text-slate-500">Ciclo {temporada}</span>}
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <div>
          <label className={ETIQUETA}>Fecha de captura</label>
          <input
            type="date"
            value={fecha}
            onChange={(e) => setFecha(e.target.value)}
            className={`${CAMPO} [color-scheme:dark]`}
          />
        </div>

        <BuscadorIncremental
          etiqueta="Profesor"
          placeholder="Buscar profesor..."
          opciones={profesores.map((p) => ({ valor: String(p.IdUsuario), etiqueta: p.Usuario }))}
          valor={profesor?.valor ?? null}
          onChange={setProfesor}
          autoFocus
        />

        <BuscadorIncremental
          etiqueta="Jugador"
          placeholder="Buscar jugador..."
          opciones={jugadores.map((j) => ({
            valor: String(j.IdJugador),
            etiqueta: j.Jugador,
            detalle: `${j.Categoria || "Sin categoría"}${j.Sede ? ` · ${j.Sede}` : ""}`,
          }))}
          valor={jugador?.valor ?? null}
          onChange={elegirJugador}
          onBuscar={buscarJugadores}
          cargando={buscando}
        />

        <div>
          <label className={ETIQUETA}>Procedencia</label>
          <div className="w-full bg-white/[0.03] border border-dashed border-white/15 rounded-lg py-2 px-3 text-sm text-slate-400">
            {procedencia || <span className="text-slate-600">Se llena al elegir al jugador</span>}
          </div>
        </div>

        <BuscadorIncremental
          etiqueta="Grupo a incorporar"
          placeholder="Buscar o escribir categoría..."
          opciones={categorias.map((c) => ({ valor: c, etiqueta: c }))}
          valor={grupo?.valor ?? null}
          onChange={setGrupo}
          permiteNuevo
        />

        <div className="xl:col-span-2">
          <label className={ETIQUETA}>Justificación de incorporación</label>
          <textarea
            value={justificacion}
            onChange={(e) => setJustificacion(e.target.value)}
            maxLength={500}
            rows={2}
            placeholder="Por qué se incorpora al jugador a este grupo..."
            className={`${CAMPO} resize-none`}
          />
          <p className="text-[10px] text-slate-600 mt-1 text-right">{justificacion.length}/500</p>
        </div>

        <div>
          <label className={ETIQUETA}>Autorización</label>
          <Firma nombre={autorizante} />
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
        <div className="min-w-0">
          {error ? (
            <p className="flex items-start gap-2 text-xs text-rose-300 bg-rose-500/10 border border-rose-500/30 rounded-lg px-3 py-2">
              <AlertCircle size={14} className="flex-shrink-0 mt-0.5" /> {error}
            </p>
          ) : procedencia && grupo ? (
            <p className="flex items-center gap-2 text-xs text-slate-300">
              <span className="px-2 py-1 rounded bg-white/5 border border-white/10 font-bold">{procedencia}</span>
              <ArrowRight size={14} className="text-blue-400" />
              <span className="px-2 py-1 rounded bg-blue-600/20 border border-blue-500/40 font-bold text-blue-200">
                {grupo.etiqueta}
              </span>
            </p>
          ) : (
            <p className="text-[11px] text-slate-500">
              Al guardar, el renglón se queda abierto para capturar el siguiente formato.
            </p>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={onCancelar}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg border border-white/15 text-slate-300 text-xs font-bold hover:bg-white/5 transition-colors"
          >
            <X size={14} /> Cerrar
          </button>
          <button
            onClick={guardar}
            disabled={guardando}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-black transition-colors disabled:opacity-40"
          >
            {guardando ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
            Guardar incorporación
          </button>
        </div>
      </div>
    </div>
  );
}
