"use client";
import { MapPin, ChevronRight, ChevronDown, ChevronUp } from 'lucide-react';
import GraficaPastel from '@/components/GraficaPastel';

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

/** Una rebanada del pastel de un panel, con su corte clicable. */
export interface RebanadaKpi {
  etiqueta: string;
  cantidad: number;
  color: string;
  /** Explicación al pasar el mouse: qué cuenta exactamente esta rebanada. */
  title?: string;
  onClick?: () => void;
}

/**
 * Reparto de un panel: la dona a la izquierda con la cifra en el hueco, y a la derecha
 * la lista con el número y el porcentaje de cada rebanada.
 *
 * La lista no es decoración. En una dona los ángulos parecidos no se comparan bien, así
 * que el valor exacto va escrito y el color solo acompaña; es también lo que la mantiene
 * legible para quien no distingue los tonos. El número vive en el hueco porque es el
 * dato que la dona está contando, no un adorno al lado.
 */
export function PastelKpi({ rebanadas, centro, centroNota, tamano = 128, unidad = 'registros', className }: {
  rebanadas: RebanadaKpi[];
  /** Cifra que va en el hueco. */
  centro: number;
  centroNota?: string;
  tamano?: number;
  unidad?: string;
  className?: string;
}) {
  const total = rebanadas.reduce((s, r) => s + r.cantidad, 0);
  const visibles = rebanadas.filter((r) => r.cantidad > 0);
  const pct = (n: number) => (total > 0 ? Math.round((n / total) * 100) : 0);

  return (
    <div className={`flex items-center gap-4 ${className ?? ''}`}>
      <div className="relative flex-shrink-0" style={{ width: tamano, height: tamano }}>
        <GraficaPastel rebanadas={rebanadas} total={total} tamano={tamano} hueco={28} unidad={unidad} />
        {/* Sin datos la dona no se dibuja, pero la cifra igual se muestra: un cero
            explícito se entiende, un hueco en blanco no. */}
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <span className="text-2xl font-black text-white leading-none tabular-nums">{centro.toLocaleString('es-MX')}</span>
          {centroNota && (
            <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400 leading-none mt-1 text-center px-2">
              {centroNota}
            </span>
          )}
        </div>
      </div>

      <div className="min-w-0 flex-1 space-y-1">
        {visibles.length === 0 ? (
          <p className="text-[11px] text-slate-500">Sin registros en este período.</p>
        ) : visibles.map((r) => {
          const contenido = (
            <>
              <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ backgroundColor: r.color }} />
              <span className="text-[11px] font-bold text-slate-300 truncate flex-1 min-w-0">{r.etiqueta}</span>
              <span className="text-sm font-black text-white tabular-nums">{r.cantidad.toLocaleString('es-MX')}</span>
              <span className="text-[10px] text-slate-500 tabular-nums w-9 text-right">{pct(r.cantidad)}%</span>
            </>
          );
          return r.onClick ? (
            <button
              key={r.etiqueta}
              type="button"
              onClick={r.onClick}
              title={r.title}
              className="w-full flex items-center gap-2 text-left rounded-lg px-1.5 py-1 hover:bg-white/10 transition-colors"
            >
              {contenido}
            </button>
          ) : (
            <div key={r.etiqueta} title={r.title} className="w-full flex items-center gap-2 px-1.5 py-1">
              {contenido}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Un panel plegado: una barra con su título y su cifra clave, que se expande al
 * oprimirla. Es la misma forma para todos los paneles plegables, para que se lea como
 * un solo mecanismo y no como varios controles distintos.
 */
export function BarraColapsada({ icono, iconoClase, titulo, tituloClase, subtitulo, cifras = [], insignia, onToggle, title, className }: {
  icono: React.ReactNode;
  iconoClase: string;
  titulo: string;
  tituloClase: string;
  subtitulo: string;
  /** Cifras clave que se siguen viendo con el panel plegado. */
  cifras?: { valor: number; nota: string; clase?: string }[];
  /** Aviso a la derecha (por ejemplo, que un filtro está recortando la cifra). */
  insignia?: React.ReactNode;
  onToggle: () => void;
  title?: string;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      title={title}
      className={`w-full border rounded-2xl px-5 py-3.5 flex items-center justify-between gap-4 transition-all ${className ?? ''}`}
    >
      <span className="flex items-center gap-3 min-w-0">
        <span className={`p-2 rounded-xl border flex-shrink-0 ${iconoClase}`}>{icono}</span>
        <span className="min-w-0 text-left">
          <span className={`block text-[11px] uppercase tracking-widest font-black ${tituloClase}`}>{titulo}</span>
          <span className="block text-xs text-slate-400 truncate">{subtitulo}</span>
        </span>
      </span>
      <span className="flex items-center gap-4 flex-shrink-0">
        {insignia}
        {cifras.map((c) => (
          <span key={c.nota} className="text-right">
            <span className={`block text-2xl font-black tabular-nums leading-none ${c.clase ?? 'text-white'}`}>
              {c.valor.toLocaleString('es-MX')}
            </span>
            <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mt-0.5">{c.nota}</span>
          </span>
        ))}
        <span className="flex items-center gap-1 text-[10px] font-black uppercase tracking-widest text-blue-300">
          Expandir <ChevronDown size={14} />
        </span>
      </span>
    </button>
  );
}

/** Control para volver a plegar un panel abierto. */
export function OcultarBtn({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title="Volver a plegar esta tarjeta"
      className="self-end -mt-1 mb-1 flex items-center gap-1 text-[10px] font-black uppercase tracking-widest text-slate-400 hover:text-white transition-colors"
    >
      Ocultar <ChevronUp size={13} />
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
