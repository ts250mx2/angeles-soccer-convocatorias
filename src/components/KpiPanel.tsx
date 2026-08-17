"use client";
import { MapPin, ChevronRight } from 'lucide-react';

/**
 * Primitivos visuales de los paneles de KPI (Inscripciones y Adeudos por Sede):
 * el mismo lenguaje —color fijo por grupo, encabezado con cifra protagonista,
 * barra de composición y tiles clicables— en las dos páginas y en sus modales
 * de desglose por sede.
 */

/**
 * Color fijo por grupo de plantilla. Es el MISMO en todos los paneles (composición,
 * tiles, becados por grupo), para que "Keepers" se lea igual en toda la aplicación.
 */
export const GRUPO_COLOR = {
  sedes: '#34d399',         // emerald-400
  keepers: '#22d3ee',       // cyan-400
  futsal: '#e879f9',        // fuchsia-400
  clinicsFutsal: '#94a3b8', // slate-400
  ventaPublico: '#64748b',  // slate-500
  clinics: '#38bdf8',       // sky-400
};

/** Pie de panel que abre el desglose por sedes del mismo KPI. */
export function VerSedesBtn({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="mt-3 pt-3 border-t border-white/10 w-full flex items-center justify-between text-blue-300 hover:text-white transition-colors"
    >
      <span className="text-[10px] font-black uppercase tracking-widest flex items-center gap-1.5">
        <MapPin size={12} /> Ver detalle por sedes
      </span>
      <ChevronRight size={14} />
    </button>
  );
}

/**
 * Barra de composición: cómo se reparte el total del panel entre sus grupos, con el
 * color fijo de cada uno. Es el hilo visual que comparten todos los paneles.
 */
export function BarraComposicion({ partes, className }: {
  partes: { etiqueta: string; cantidad: number; color: string }[];
  className?: string;
}) {
  const total = partes.reduce((s, p) => s + p.cantidad, 0);
  if (total <= 0) return null;
  return (
    <div className={`h-2 w-full rounded-full overflow-hidden flex bg-white/5 ${className ?? ''}`}>
      {partes.filter((p) => p.cantidad > 0).map((p) => (
        <div
          key={p.etiqueta}
          title={`${p.etiqueta}: ${p.cantidad}`}
          style={{ width: `${(p.cantidad / total) * 100}%`, backgroundColor: p.color }}
        />
      ))}
    </div>
  );
}

/** Tile clicable de un grupo: punto de color, etiqueta, cifra grande y su peso. */
export function TileGrupo({ label, valor, color, pct, title, onClick }: {
  label: string;
  valor: number;
  color: string;
  /** Peso del grupo dentro del total del panel (0-100). */
  pct?: number;
  title?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className="group bg-white/5 hover:bg-white/10 border border-white/10 hover:border-white/25 rounded-xl px-3 py-2.5 text-left transition-all overflow-hidden"
    >
      <span className="flex items-center gap-1.5 min-w-0">
        <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
        <span className="text-[10px] uppercase font-black text-slate-400 tracking-wider group-hover:text-slate-200 transition-colors truncate">{label}</span>
      </span>
      {/* flex-wrap: en una columna angosta el porcentaje baja de renglón en vez de
          desbordarse encima del tile vecino (ninguno de los dos textos encoge). */}
      <span className="flex flex-wrap items-baseline gap-x-1.5 mt-1">
        <span className="text-2xl font-black text-white tabular-nums leading-none">{valor}</span>
        {pct !== undefined && <span className="text-[10px] font-bold text-slate-500 tabular-nums">{pct}%</span>}
      </span>
    </button>
  );
}

/** Encabezado común de panel: icono y título a la izquierda, cifra protagonista a la derecha. */
export function PanelHeader({ icono, iconoClase, titulo, tituloClase, subtitulo, valor, nota, notaClase, ayuda }: {
  icono: React.ReactNode;
  iconoClase: string;
  titulo: string;
  tituloClase: string;
  subtitulo: string;
  valor: number;
  /** Renglón chico bajo la cifra: el contexto del número (%, base, unidad). */
  nota?: string;
  notaClase?: string;
  /** Explicación al pasar el mouse: qué cuenta exactamente esta cifra. */
  ayuda?: string;
}) {
  /* El bloque de la cifra NO lleva flex-shrink-0: con él, una nota larga fijaba un
     ancho intocable que aplastaba al título hasta desbordarlo (el panel mide la mitad
     dentro del modal por sedes). Sin él, la nota se acomoda en dos renglones y la
     cifra nunca baja de su propio ancho. Y con flex-wrap, en un contenedor muy
     angosto la cifra pasa a su propio renglón en vez de encimarse con el icono. */
  return (
    <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
      {/* La base de 12rem es la que dispara el salto de renglón: se declara con el
          atajo completo para que no dependa del orden en que Tailwind emita
          `flex` y `basis`. */}
      <div className="flex items-center gap-3 min-w-0 flex-[1_1_12rem]">
        <div className={`p-2.5 rounded-xl border flex-shrink-0 ${iconoClase}`}>{icono}</div>
        <div className="min-w-0">
          <p className={`text-[11px] uppercase tracking-widest font-black break-words ${tituloClase}`}>{titulo}</p>
          <p className="text-xs text-slate-400 leading-snug break-words">{subtitulo}</p>
        </div>
      </div>
      <div className="text-right" title={ayuda}>
        <p className="text-4xl xl:text-5xl font-black text-white tabular-nums leading-none">{valor}</p>
        {nota && <p className={`text-[10px] font-bold uppercase tracking-wider mt-1 leading-tight ${notaClase ?? 'text-slate-500'}`}>{nota}</p>}
      </div>
    </div>
  );
}
