"use client";
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  MapPin, UserCheck, UserMinus, ChevronRight, ChevronDown, CalendarRange, History, CalendarClock, Brain,
  AlertTriangle, X,
} from 'lucide-react';
import { useUser } from '@/contexts/user-context';
import DashboardLayout from '@/components/DashboardLayout';
import AdeudosModal, { type AdeudosModalConfig } from '@/components/AdeudosModal';
import AnalisisProfundoModal from '@/components/AnalisisProfundoModal';
import { GRUPO_COLOR, VerSedesBtn, BarraComposicion, TileGrupo, PanelHeader } from '@/components/KpiPanel';

interface DebeMes {
  mes: number;
  cantidad: number;
}

interface SedeSummary {
  IdSede: number;
  Sede: string;
  /** 1 = sede de clinics; se excluye de los adeudos. */
  EsClinics: number;
  Activos: number;
  ActivosNormal: number;
  ActivosKeepers: number;
  ActivosFutsal: number;
  ActivosVentaPublico: number;
  ActivosExcluido: number;
  ActivosClinicsFutsal: number;
  Bajas: number;
  BajasNormal: number;
  BajasKeepers: number;
  BajasFutsal: number;
  BajasExcluido: number;
  BajasClinicsFutsal: number;
  /** Activos de una sede keeper que NO son de categoría portero: error de captura. */
  FueraDeLugar: number;
  ActualDebe: number;
  ActualAlCorriente: number;
  ActualKeepers: number;
  ActualKeepersDebe: number;
  ActualBecadosSinInscripcion: number;
  ActualDebeInscripcion: number;
  /** Activos del grupo normal sin inscripción de esta temporada (fuera del adeudo). */
  ActualSinInscripcion: number;
  ActualDebeMeses: DebeMes[];
  ActualFutsalSinPagos: number;
  ActualFutsal1Mes: number;
  ActualFutsal2Meses: number;
  ActualFutsal3Mas: number;
  AnteriorDebe: number;
  AnteriorAlCorriente: number;
  AnteriorKeepers: number;
  AnteriorKeepersDebe: number;
  AnteriorBecadosSinInscripcion: number;
  AnteriorPosiblesBajas: number;
  AnteriorDebeInscripcion: number;
  AnteriorDebeMeses: DebeMes[];
  AnteriorFutsalSinPagos: number;
  AnteriorFutsal1Mes: number;
  AnteriorFutsal2Meses: number;
  AnteriorFutsal3Mas: number;
}

const MESES_CORTOS = [
  'Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun',
  'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic',
];

/**
 * Desglose del adeudo: un chip por concepto (inscripción y cada mes vencido) con
 * cuántos jugadores lo deben. Solo se muestran los conceptos con adeudo, para que
 * la tarjeta no se llene de ceros.
 *
 * En la temporada en curso la inscripción ya no es adeudo (los no inscritos salen del
 * cálculo y van a "Sin inscripción"), así que ahí se omite `inscripcion`.
 */
function DesgloseAdeudo({ inscripcion = 0, meses, onInscripcion, onMes, size = 'sm' }: {
  inscripcion?: number;
  meses: DebeMes[];
  onInscripcion?: () => void;
  onMes: (mes: number) => void;
  size?: 'sm' | 'xs';
}) {
  const conAdeudo = meses.filter((m) => m.cantidad > 0);
  if (inscripcion === 0 && conAdeudo.length === 0) return null;

  const chip = size === 'xs'
    ? 'px-1.5 py-0.5 text-[9px] rounded-md'
    : 'px-2 py-0.5 text-[10px] rounded-md';

  return (
    <div className="flex flex-wrap gap-1 mt-1.5">
      {inscripcion > 0 && onInscripcion && (
        <button
          type="button"
          onClick={onInscripcion}
          title={`${inscripcion} deben la inscripción`}
          className={`${chip} font-black bg-amber-500/15 text-amber-300 border border-amber-500/30 hover:bg-amber-500/30 transition-colors`}
        >
          Insc. {inscripcion}
        </button>
      )}
      {conAdeudo.map((m) => (
        <button
          key={m.mes}
          type="button"
          onClick={() => onMes(m.mes)}
          title={`${m.cantidad} deben ${MESES_CORTOS[m.mes - 1]}`}
          className={`${chip} font-black bg-orange-500/15 text-orange-300 border border-orange-500/30 hover:bg-orange-500/30 transition-colors`}
        >
          {MESES_CORTOS[m.mes - 1]} {m.cantidad}
        </button>
      ))}
    </div>
  );
}

interface TemporadaInfo {
  seasonId: number;
  temporadaNombre: string;
}

interface Temporada {
  IdTemporada: number;
  Temporada: string;
  EsActiva: boolean;
}

/**
 * Cifras de un KPI para un conjunto de sedes. Es la MISMA aritmética para el total
 * (todas las sedes) y para cada tarjeta del modal (una sola sede), así que el total
 * y el desglose por sede no pueden discrepar.
 */
const sumDe = (lista: SedeSummary[], pick: (s: SedeSummary) => number) =>
  lista.reduce((acc, s) => acc + (pick(s) || 0), 0);

// Desglose por mes: se suman los conteos de cada sede del conjunto.
const sumaMesesDe = (lista: SedeSummary[], pick: (s: SedeSummary) => DebeMes[]): DebeMes[] => {
  const acc = new Map<number, number>();
  for (const s of lista) {
    for (const m of pick(s) ?? []) acc.set(m.mes, (acc.get(m.mes) ?? 0) + m.cantidad);
  }
  return [...acc.entries()]
    .map(([mes, cantidad]) => ({ mes, cantidad }))
    .sort((a, b) => a.mes - b.mes);
};

/** Plantilla partida en grupos mutuamente excluyentes (los conteos vienen del backend). */
interface DatosPlantilla {
  sedes: number;
  keepers: number;
  futsal: number;
  ventaPublico: number;
  clinics: number;
  clinicsFutsal: number;
}

const datosActivos = (lista: SedeSummary[]): DatosPlantilla => ({
  sedes: sumDe(lista, s => s.ActivosNormal),
  keepers: sumDe(lista, s => s.ActivosKeepers),
  futsal: sumDe(lista, s => s.ActivosFutsal),
  ventaPublico: sumDe(lista, s => s.ActivosVentaPublico),
  clinics: sumDe(lista, s => s.ActivosExcluido),
  clinicsFutsal: sumDe(lista, s => s.ActivosClinicsFutsal),
});

const datosBajas = (lista: SedeSummary[]): DatosPlantilla => ({
  sedes: sumDe(lista, s => s.BajasNormal),
  keepers: sumDe(lista, s => s.BajasKeepers),
  futsal: sumDe(lista, s => s.BajasFutsal),
  ventaPublico: 0,
  clinics: sumDe(lista, s => s.BajasExcluido),
  clinicsFutsal: sumDe(lista, s => s.BajasClinicsFutsal),
});

/** Cifras de una tarjeta de adeudos (temporada anterior o en curso). */
interface DatosAdeudo {
  debe: number;
  alCorriente: number;
  keepers: number;
  keepersDebe: number;
  becadosSinInsc: number;
  futsalSinPagos: number;
  futsal1Mes: number;
  futsal2Meses: number;
  futsal3Mas: number;
  /** Cuántos deben la inscripción (solo aplica a la temporada anterior). */
  insc: number;
  meses: DebeMes[];
  posiblesBajas: number;
  sinInscripcion: number;
}

const datosAnterior = (lista: SedeSummary[]): DatosAdeudo => ({
  debe: sumDe(lista, s => s.AnteriorDebe),
  alCorriente: sumDe(lista, s => s.AnteriorAlCorriente),
  keepers: sumDe(lista, s => s.AnteriorKeepers),
  keepersDebe: sumDe(lista, s => s.AnteriorKeepersDebe),
  becadosSinInsc: sumDe(lista, s => s.AnteriorBecadosSinInscripcion),
  futsalSinPagos: sumDe(lista, s => s.AnteriorFutsalSinPagos),
  futsal1Mes: sumDe(lista, s => s.AnteriorFutsal1Mes),
  futsal2Meses: sumDe(lista, s => s.AnteriorFutsal2Meses),
  futsal3Mas: sumDe(lista, s => s.AnteriorFutsal3Mas),
  insc: sumDe(lista, s => s.AnteriorDebeInscripcion),
  meses: sumaMesesDe(lista, s => s.AnteriorDebeMeses),
  posiblesBajas: sumDe(lista, s => s.AnteriorPosiblesBajas),
  sinInscripcion: 0,
});

const datosActual = (lista: SedeSummary[]): DatosAdeudo => ({
  debe: sumDe(lista, s => s.ActualDebe),
  alCorriente: sumDe(lista, s => s.ActualAlCorriente),
  keepers: sumDe(lista, s => s.ActualKeepers),
  keepersDebe: sumDe(lista, s => s.ActualKeepersDebe),
  becadosSinInsc: sumDe(lista, s => s.ActualBecadosSinInscripcion),
  futsalSinPagos: sumDe(lista, s => s.ActualFutsalSinPagos),
  futsal1Mes: sumDe(lista, s => s.ActualFutsal1Mes),
  futsal2Meses: sumDe(lista, s => s.ActualFutsal2Meses),
  futsal3Mas: sumDe(lista, s => s.ActualFutsal3Mas),
  insc: 0,
  meses: sumaMesesDe(lista, s => s.ActualDebeMeses),
  posiblesBajas: 0,
  sinInscripcion: sumDe(lista, s => s.ActualSinInscripcion),
});

/** ¿La sede tiene algo que mostrar en esta tarjeta de adeudos? */
const hayAdeudo = (d: DatosAdeudo) =>
  d.debe + d.alCorriente + d.keepers + d.becadosSinInsc
    + d.futsalSinPagos + d.futsal1Mes + d.futsal2Meses + d.futsal3Mas
    + d.posiblesBajas + d.sinInscripcion > 0;

/* ¿La sede tiene algo en los segmentos que la tarjeta de plantilla MUESTRA? Se filtra
   con esto y no con el total del API (s.Bajas incluye los dummies de venta al público,
   que la tarjeta de bajas no pinta: la sede saldría listada con puros ceros). */
const hayPlantilla = (d: DatosPlantilla) =>
  d.sedes + d.keepers + d.futsal + d.ventaPublico + d.clinics + d.clinicsFutsal > 0;

type Abrir = (cfg: AdeudosModalConfig) => void;

/** KPIs que saben desglosarse por sede en el modal. */
type KpiClave = 'activos' | 'bajas' | 'anterior' | 'actual';

/** Panel de plantilla (activos o bajas): total, composición y un tile por grupo. */
function TarjetaPlantilla({ modo, d, abrir, pie }: {
  modo: 'activos' | 'bajas';
  d: DatosPlantilla;
  abrir: Abrir;
  pie?: React.ReactNode;
}) {
  const esActivos = modo === 'activos';
  // "Jugadores Baja" (singular) es el título histórico de los modales de bajas.
  const titulo = esActivos ? 'Jugadores Activos' : 'Jugadores Baja';
  const filtro = modo;
  const partes: { label: string; valor: number; color: string; title?: string; cfg: AdeudosModalConfig }[] = [
    { label: 'Sedes', valor: d.sedes, color: GRUPO_COLOR.sedes, cfg: { title: `${titulo} · Sedes`, filtro, grupo: 'normal' } },
    { label: 'Keepers', valor: d.keepers, color: GRUPO_COLOR.keepers, cfg: { title: `${titulo} · Keepers/Porteros`, filtro, grupo: 'keepers' } },
    { label: 'Futsal', valor: d.futsal, color: GRUPO_COLOR.futsal, title: 'Futsal: cuenta en los adeudos como sede normal', cfg: { title: `${titulo} · Futsal`, filtro, grupo: 'futsal' } },
  ];
  if (esActivos) {
    partes.push({ label: 'Venta púb.', valor: d.ventaPublico, color: GRUPO_COLOR.ventaPublico, title: 'Venta al público: no entra en los adeudos', cfg: { title: `${titulo} · Venta al Público`, filtro, grupo: 'ventapublico' } });
  }
  partes.push(
    { label: 'Clinics', valor: d.clinics, color: GRUPO_COLOR.clinics, title: 'Clinics no entra en los adeudos', cfg: { title: `${titulo} · Clinics`, filtro, grupo: 'excluido' } },
    { label: 'Clinics F.', valor: d.clinicsFutsal, color: GRUPO_COLOR.clinicsFutsal, title: 'Clinics Futsal no entra en los adeudos', cfg: { title: `${titulo} · Clinics Futsal`, filtro, grupo: 'clinicsfutsal' } },
  );
  const total = partes.reduce((s, p) => s + p.valor, 0);
  const pctDe = (n: number) => (total > 0 ? Math.round((n / total) * 100) : 0);
  return (
    <div className={`h-full border rounded-2xl p-5 flex flex-col ${
      esActivos ? 'bg-emerald-500/10 border-emerald-500/20' : 'bg-rose-500/10 border-rose-500/20'
    }`}>
      <PanelHeader
        icono={esActivos
          ? <UserCheck size={20} className="text-emerald-400" />
          : <UserMinus size={20} className="text-rose-400" />}
        iconoClase={esActivos ? 'bg-emerald-500/20 border-emerald-500/30' : 'bg-rose-500/20 border-rose-500/30'}
        titulo={esActivos ? 'Jugadores Activos' : 'Jugadores Bajas'}
        tituloClase={esActivos ? 'text-emerald-400' : 'text-rose-400'}
        subtitulo={esActivos ? 'Plantilla vigente registrada en las sedes' : 'Jugadores dados de baja'}
        valor={total}
        nota="jugadores"
      />
      <BarraComposicion
        className="mt-4"
        partes={partes.map((p) => ({ etiqueta: p.label, cantidad: p.valor, color: p.color }))}
      />
      {/* Tres columnas solo desde xl, que es donde la tarjeta deja de medir media fila
          (ver la rejilla de la fila 2): con tres a partir de sm, en tablet el tile se
          quedaba sin ancho para su cifra. */}
      <div className="grid grid-cols-2 xl:grid-cols-3 gap-2.5 mt-3 flex-1 content-start">
        {partes.map((p) => (
          <TileGrupo key={p.label} label={p.label} valor={p.valor} color={p.color} pct={pctDe(p.valor)} title={p.title} onClick={() => abrir(p.cfg)} />
        ))}
      </div>
      {pie}
    </div>
  );
}

/**
 * Panel de adeudos (temporada anterior o en curso): la cifra protagonista es "con
 * adeudo", con la barra deuda/al-corriente del grupo normal, porteros, becados,
 * futsal y —según la temporada— sin inscripción o posibles bajas.
 */
function TarjetaAdeudos({ variante, caption, d, abrir, disabled, descartarPB, onToggleDescartar, pie }: {
  variante: 'anterior' | 'actual';
  caption: string;
  d: DatosAdeudo;
  abrir: Abrir;
  disabled?: boolean;
  descartarPB?: boolean;
  onToggleDescartar?: () => void;
  pie?: React.ReactNode;
}) {
  const esAnterior = variante === 'anterior';
  const suf = esAnterior ? ' · Temporada Anterior' : ' · Esta Temporada';
  const base = d.debe + d.alCorriente;
  const pctDebe = base > 0 ? Math.round((d.debe / base) * 100) : 0;
  const btn = 'text-left transition-all disabled:opacity-40 disabled:cursor-not-allowed';

  return (
    <div className={`h-full border rounded-2xl p-5 flex flex-col ${
      esAnterior ? 'bg-amber-500/10 border-amber-500/20' : 'bg-blue-500/10 border-blue-500/20'
    }`}>
      <PanelHeader
        icono={esAnterior
          ? <History size={20} className="text-amber-400" />
          : <CalendarClock size={20} className="text-blue-400" />}
        iconoClase={esAnterior ? 'bg-amber-500/20 border-amber-500/30' : 'bg-blue-500/20 border-blue-500/30'}
        titulo={esAnterior ? 'Adeudos Temporada Anterior' : 'Adeudos Esta Temporada'}
        tituloClase={esAnterior ? 'text-amber-400' : 'text-blue-400'}
        subtitulo={caption}
        valor={d.debe}
        nota={base > 0 ? `con adeudo · ${pctDebe}%` : 'con adeudo'}
        notaClase="text-rose-300/90"
      />

      {/* Con adeudo vs al corriente del grupo normal: la misma proporción que las cifras. */}
      {!disabled && base > 0 && (
        <div className="h-2 w-full rounded-full overflow-hidden flex bg-white/5 mt-4">
          <div className="bg-rose-400" title={`Con adeudo: ${d.debe}`} style={{ width: `${(d.debe / base) * 100}%` }} />
          <div className="bg-teal-400" title={`Al corriente: ${d.alCorriente}`} style={{ width: `${(d.alCorriente / base) * 100}%` }} />
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 mt-3 items-start">
        {/* Con adeudo, con su desglose por concepto. */}
        <div className="bg-rose-500/10 border border-rose-500/20 rounded-xl overflow-hidden">
          <button
            type="button"
            onClick={() => abrir({ title: `Con Adeudo${suf}`, filtro: 'debe' })}
            disabled={disabled}
            className={`w-full px-3 py-2.5 hover:bg-rose-500/20 ${btn}`}
          >
            <p className="text-[10px] uppercase font-black text-rose-300/80 tracking-wider">Con adeudo</p>
            <p className="text-3xl font-black text-rose-400 tabular-nums leading-tight">{d.debe}</p>
          </button>
          {!disabled && (
            <div className="px-3 pb-2.5">
              <DesgloseAdeudo
                inscripcion={esAnterior ? d.insc : 0}
                meses={d.meses}
                onInscripcion={esAnterior ? () => abrir({ title: `Deben Inscripción${suf}`, filtro: 'pendiente-inscripcion' }) : undefined}
                onMes={(mes) => abrir({ title: `Deben ${MESES_CORTOS[mes - 1]}${suf}`, filtro: 'debe-mes', mes })}
              />
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={() => abrir({ title: `Al Corriente${suf}`, filtro: 'al-corriente' })}
          disabled={disabled}
          title="Al corriente, sin contar keepers/porteros"
          className={`h-full bg-teal-500/10 hover:bg-teal-500/25 border border-teal-500/20 rounded-xl px-3 py-2.5 ${btn}`}
        >
          <p className="text-[10px] uppercase font-black text-teal-300/80 tracking-wider">Al corriente</p>
          <p className="text-3xl font-black text-teal-400 tabular-nums leading-tight">{d.alCorriente}</p>
          {base > 0 && <p className="text-[10px] font-bold text-slate-500 tabular-nums mt-0.5">{100 - pctDebe}% del grupo normal</p>}
        </button>
      </div>

      {/* Sin inscripción: no generan adeudo en la temporada en curso. */}
      {!esAnterior && (
        <button
          type="button"
          onClick={() => abrir({ title: `Sin Inscripción${suf}`, filtro: 'pendiente-inscripcion' })}
          disabled={disabled}
          title="Activos que no se han inscrito en esta temporada: quedan fuera del cálculo de adeudo"
          className={`mt-3 w-full bg-amber-500/10 hover:bg-amber-500/25 border border-amber-500/25 rounded-xl px-3 py-2 flex items-center justify-between gap-3 ${btn}`}
        >
          <span>
            <p className="text-[10px] uppercase font-black text-amber-300/80 tracking-wider">Sin inscripción</p>
            <p className="text-[10px] text-slate-500 leading-tight">Fuera del cálculo de adeudo</p>
          </span>
          <span className="text-2xl font-black text-amber-300 tabular-nums">{d.sinInscripcion}</span>
        </button>
      )}

      {/* Porteros: su regla de adeudo es propia, por eso van aparte del grupo normal. */}
      <div className="mt-3 grid grid-cols-2 gap-3">
        <button
          type="button"
          onClick={() => abrir({ title: `Porteros con Adeudo${suf}`, filtro: 'keepers-debe' })}
          disabled={disabled}
          title="Porteros con adeudo: sin inscripción (regla de portero) o con meses vencidos"
          className={`bg-rose-500/10 hover:bg-rose-500/25 border border-rose-500/20 rounded-xl px-3 py-2 ${btn}`}
        >
          <p className="text-[10px] uppercase font-black text-rose-300/80 tracking-wider leading-tight">Porteros c/adeudo</p>
          <p className="text-2xl font-black text-rose-400 tabular-nums leading-tight">{d.keepersDebe}</p>
        </button>
        <button
          type="button"
          onClick={() => abrir({ title: `Porteros al Corriente${suf}`, filtro: 'keepers-corriente' })}
          disabled={disabled}
          title="Porteros al corriente: inscritos (regla de portero) y sin meses vencidos"
          className={`bg-cyan-500/10 hover:bg-cyan-500/25 border border-cyan-500/20 rounded-xl px-3 py-2 ${btn}`}
        >
          <p className="text-[10px] uppercase font-black text-cyan-300/80 tracking-wider leading-tight">Porteros al corr.</p>
          <p className="text-2xl font-black text-cyan-300 tabular-nums leading-tight">{d.keepers - d.keepersDebe}</p>
        </button>
      </div>

      <button
        type="button"
        onClick={() => abrir({ title: `Becados 100% sin Inscripción${suf}`, filtro: 'becado-sin-inscripcion' })}
        disabled={disabled}
        title="Beca 100% sin pago de inscripción: no deben, pero no están inscritos"
        className={`mt-3 w-full bg-purple-500/10 hover:bg-purple-500/25 border border-purple-500/20 rounded-xl px-3 py-2 flex items-center justify-between gap-3 ${btn}`}
      >
        <p className="text-[10px] uppercase font-black text-purple-300/80 tracking-wider leading-tight">Becados 100% s/inscripción</p>
        <p className="text-2xl font-black text-purple-300 tabular-nums">{d.becadosSinInsc}</p>
      </button>

      {/* Bloque Futsal */}
      <div className="mt-3 bg-fuchsia-500/10 border border-fuchsia-500/20 rounded-xl p-2.5">
        <p className="text-[10px] uppercase font-black text-fuchsia-300/90 tracking-wider mb-1.5">
          Futsal (Meses pagados)
        </p>
        <div className="grid grid-cols-4 gap-1.5">
          {[
            { label: 'Sin pagos', valor: d.futsalSinPagos, title: 'Futsal sin pagos realizados', cfg: { title: `Futsal Sin Pagos${suf}`, filtro: 'futsal-sin-pagos' as const } },
            { label: '1 mes', valor: d.futsal1Mes, title: 'Futsal con 1 mes pagado', cfg: { title: `Futsal 1 Mes${suf}`, filtro: 'futsal-1-mes' as const } },
            { label: '2 meses', valor: d.futsal2Meses, title: 'Futsal con 2 meses pagados', cfg: { title: `Futsal 2 Meses${suf}`, filtro: 'futsal-2-meses' as const } },
            { label: '3+', valor: d.futsal3Mas, title: 'Futsal con 3 o más meses pagados', cfg: { title: `Futsal 3+ Meses${suf}`, filtro: 'futsal-3-mas' as const } },
          ].map((f) => (
            <button
              key={f.label}
              type="button"
              onClick={() => abrir(f.cfg)}
              disabled={disabled}
              title={f.title}
              className={`bg-white/5 hover:bg-fuchsia-500/25 border border-white/10 rounded-lg px-2 py-1.5 ${btn}`}
            >
              <p className="text-[9px] uppercase font-black text-slate-400 tracking-wider">{f.label}</p>
              <p className="text-xl font-black text-fuchsia-300 tabular-nums leading-tight">{f.valor}</p>
            </button>
          ))}
        </div>
      </div>

      {/* Posibles bajas: deben la inscripción y todos los meses vencidos. El check
          "descartar" vive dentro del propio cuadro. */}
      {esAnterior && (
        <div className="mt-3 bg-red-600/15 border border-red-600/30 rounded-xl px-3 py-2 flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => abrir({ title: `Posibles Bajas${suf}`, filtro: 'posible-baja' })}
            disabled={disabled}
            title="No pagaron la inscripción ni un solo mes vencido de esa temporada"
            className={`flex items-center gap-2 hover:opacity-80 ${btn}`}
          >
            <UserMinus size={14} className="text-red-300" />
            <span className="text-[10px] uppercase font-black text-red-300 tracking-wider">Posibles bajas</span>
            <span className="text-2xl font-black text-red-300 tabular-nums ml-1">{d.posiblesBajas}</span>
          </button>
          {onToggleDescartar && (
            <label
              title="Descartar los posibles bajas: los quita del 'Con adeudo' y sus modales (temporal, solo en este navegador). El conteo de posibles bajas no cambia."
              className={`flex items-center gap-1 px-1.5 py-1 rounded-lg cursor-pointer select-none transition-all ${
                descartarPB ? 'bg-red-500/30 text-red-100' : 'text-red-300/70 hover:bg-red-500/15'
              } ${disabled ? 'opacity-40 pointer-events-none' : ''}`}
            >
              <input
                type="checkbox"
                checked={!!descartarPB}
                onChange={onToggleDescartar}
                disabled={disabled}
                className="accent-red-500"
              />
              <span className="text-[8px] uppercase font-black tracking-wider">Descartar</span>
            </label>
          )}
        </div>
      )}
      <div className="flex-1" />
      {pie}
    </div>
  );
}

export default function AdeudosSedePage() {
  const router = useRouter();
  const { user, isInitialized } = useUser();
  const [sedes, setSedes] = useState<SedeSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [temporadas, setTemporadas] = useState<Temporada[]>([]);
  const [temporadaId, setTemporadaId] = useState<number | null>(null);
  const [actual, setActual] = useState<TemporadaInfo | null>(null);
  const [anterior, setAnterior] = useState<TemporadaInfo | null>(null);
  const [modal, setModal] = useState<AdeudosModalConfig | null>(null);
  const [analisisOpen, setAnalisisOpen] = useState(false);
  // KPI abierto en el modal de desglose por sedes (null = cerrado).
  const [detalleKpi, setDetalleKpi] = useState<KpiClave | null>(null);
  // Descartar (temporal, solo este navegador) los posibles bajas de la temporada
  // anterior. Se guarda por temporada seleccionada en localStorage.
  const [descartarPB, setDescartarPB] = useState(false);

  useEffect(() => {
    if (isInitialized && !user) router.push('/login');
  }, [user, isInitialized, router]);

  const fetchSedes = async (temporada: number | null, silent = false, descartar = false) => {
    if (!silent) setIsLoading(true);
    try {
      const params = new URLSearchParams();
      if (temporada) params.set('temporadaId', String(temporada));
      if (descartar) params.set('descartarPBAnterior', '1');
      const qs = params.toString() ? `?${params}` : '';
      // no-store: sin esto el navegador puede servir una respuesta vieja y los
      // campos nuevos llegan como undefined (se veían en cero).
      const response = await fetch(`/api/adeudos/sedes${qs}`, { cache: 'no-store' });
      const data = await response.json();
      if (data.success) {
        setSedes(data.data);
        setActual(data.config?.actual ?? null);
        setAnterior(data.config?.anterior ?? null);
      } else {
        console.error('Error fetching sedes:', data.message);
      }
    } catch (error) {
      console.error('Error fetching sedes:', error);
    } finally {
      if (!silent) setIsLoading(false);
    }
  };

  useEffect(() => {
    if (!isInitialized || !user) return;
    (async () => {
      try {
        const res = await fetch('/api/inscripciones/temporadas');
        const json = await res.json();
        if (json.success) {
          setTemporadas(json.data);
          setTemporadaId(json.temporadaActiva ?? null);
        } else {
          fetchSedes(null);
        }
      } catch {
        fetchSedes(null);
      }
    })();
  }, [isInitialized, user]);

  useEffect(() => {
    if (isInitialized && user && temporadaId !== null) {
      // El descarte se recuerda por temporada seleccionada (su "anterior").
      const saved = typeof window !== 'undefined'
        && localStorage.getItem(`descartarPBsel_${temporadaId}`) === '1';
      setDescartarPB(saved);
      fetchSedes(temporadaId, false, saved);
    }
  }, [isInitialized, user, temporadaId]);

  const toggleDescartarPB = () => {
    const nuevo = !descartarPB;
    setDescartarPB(nuevo);
    if (temporadaId !== null) {
      localStorage.setItem(`descartarPBsel_${temporadaId}`, nuevo ? '1' : '0');
      fetchSedes(temporadaId, true, nuevo);
    }
  };

  // Cortes de la temporada anterior: el modal debe consultar ESA temporada.
  const scopeAnterior = anterior
    ? { temporadaId: anterior.seasonId, temporadaNombre: anterior.temporadaNombre, descartarPB }
    : {};
  /* Cortes de esta temporada: solo los inscritos generan adeudo, así que el modal
     debe aplicar la misma regla que las tarjetas. */
  const scopeActual = { soloInscritos: true } as const;

  const categoriaHref = (sede: SedeSummary) =>
    `/adeudos/sede/${sede.IdSede}${temporadaId ? `?temporada=${temporadaId}` : ''}`;

  /* Aperturas del AdeudosModal. Las variantes "Sede" acotan el mismo corte a una
     sola sede: son las que usan las tarjetas del modal de desglose. El AdeudosModal
     (z-150) se pinta ENCIMA del desglose (z-120), así que al cerrarlo se regresa al
     desglose sin perderlo. */
  const abrirPlantillaGlobal: Abrir = (cfg) => setModal({ subtitle: actual?.temporadaNombre, ...cfg });
  const abrirPlantillaSede = (sede: SedeSummary): Abrir => (cfg) =>
    setModal({ subtitle: sede.Sede, sedeId: sede.IdSede, ...cfg });
  const abrirAnteriorGlobal: Abrir = (cfg) =>
    setModal({ subtitle: anterior?.temporadaNombre, ...scopeAnterior, ...cfg });
  const abrirAnteriorSede = (sede: SedeSummary): Abrir => (cfg) =>
    setModal({ subtitle: [sede.Sede, anterior?.temporadaNombre].filter(Boolean).join(' · '), sedeId: sede.IdSede, ...scopeAnterior, ...cfg });
  const abrirActualGlobal: Abrir = (cfg) =>
    setModal({ subtitle: actual?.temporadaNombre, ...scopeActual, ...cfg });
  const abrirActualSede = (sede: SedeSummary): Abrir => (cfg) =>
    setModal({ subtitle: [sede.Sede, actual?.temporadaNombre].filter(Boolean).join(' · '), sedeId: sede.IdSede, ...scopeActual, ...cfg });

  const fueraDeLugar = sedes.filter(s => (s.FueraDeLugar || 0) > 0);

  /** La tarjeta del KPI pedido con los datos que se le den (total o una sede). */
  const tarjetaDe = (kpi: KpiClave, lista: SedeSummary[], esGlobal: boolean, sede?: SedeSummary) => {
    switch (kpi) {
      case 'activos':
        return (
          <TarjetaPlantilla
            modo="activos"
            d={datosActivos(lista)}
            abrir={esGlobal ? abrirPlantillaGlobal : abrirPlantillaSede(sede as SedeSummary)}
            pie={esGlobal ? <VerSedesBtn onClick={() => setDetalleKpi('activos')} /> : undefined}
          />
        );
      case 'bajas':
        return (
          <TarjetaPlantilla
            modo="bajas"
            d={datosBajas(lista)}
            abrir={esGlobal ? abrirPlantillaGlobal : abrirPlantillaSede(sede as SedeSummary)}
            pie={esGlobal ? <VerSedesBtn onClick={() => setDetalleKpi('bajas')} /> : undefined}
          />
        );
      case 'anterior':
        return (
          <TarjetaAdeudos
            variante="anterior"
            caption={anterior?.temporadaNombre ?? 'Sin temporada anterior'}
            d={datosAnterior(lista)}
            abrir={esGlobal ? abrirAnteriorGlobal : abrirAnteriorSede(sede as SedeSummary)}
            disabled={!anterior}
            descartarPB={descartarPB}
            /* El descarte es un ajuste global de la página; en las tarjetas por sede
               solo se refleja, no se cambia. Igual que el resto de la tarjeta, el pie
               solo funciona cuando existe temporada anterior. */
            onToggleDescartar={esGlobal && anterior ? toggleDescartarPB : undefined}
            pie={esGlobal && anterior ? <VerSedesBtn onClick={() => setDetalleKpi('anterior')} /> : undefined}
          />
        );
      case 'actual':
        return (
          <TarjetaAdeudos
            variante="actual"
            caption={actual?.temporadaNombre ?? ''}
            d={datosActual(lista)}
            abrir={esGlobal ? abrirActualGlobal : abrirActualSede(sede as SedeSummary)}
            pie={esGlobal ? <VerSedesBtn onClick={() => setDetalleKpi('actual')} /> : undefined}
          />
        );
    }
  };

  const KPI_TITULOS: Record<KpiClave, string> = {
    activos: 'Jugadores Activos',
    bajas: 'Jugadores Bajas',
    anterior: 'Adeudos Temporada Anterior',
    actual: 'Adeudos Esta Temporada',
  };

  // Sedes del modal: solo las que tienen algo de lo que su tarjeta muestra, de mayor a menor.
  const sedesDetalle = (() => {
    if (!detalleKpi) return [];
    if (detalleKpi === 'activos') return sedes.filter(s => hayPlantilla(datosActivos([s]))).sort((a, b) => b.Activos - a.Activos);
    if (detalleKpi === 'bajas') return sedes.filter(s => hayPlantilla(datosBajas([s]))).sort((a, b) => b.Bajas - a.Bajas);
    if (detalleKpi === 'anterior') {
      return sedes.filter(s => hayAdeudo(datosAnterior([s]))).sort((a, b) => b.AnteriorDebe - a.AnteriorDebe);
    }
    return sedes.filter(s => hayAdeudo(datosActual([s]))).sort((a, b) => b.ActualDebe - a.ActualDebe);
  })();

  return (
    <DashboardLayout>
      <main className="overflow-y-auto flex-1 text-white p-6 md:p-8 relative">
        <div className="w-full">

          <div className="mb-8 flex flex-col md:flex-row md:items-end md:justify-between gap-5">
            <div>
              <h1 className="text-3xl font-black text-white mb-2">Adeudos por Sede</h1>
              <p className="text-slate-400">Indicadores totales · el desglose por campus vive en «Ver detalle por sedes»</p>
            </div>
            <div className="flex flex-col sm:flex-row sm:items-end gap-3">
              <button
                type="button"
                onClick={() => setAnalisisOpen(true)}
                disabled={isLoading || sedes.length === 0}
                title="Analiza los adeudos de la temporada anterior y de esta temporada con IA (Opus 5)"
                className="inline-flex items-center justify-center gap-2 h-[46px] px-4 rounded-xl text-sm font-black text-white bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:from-violet-500 hover:to-fuchsia-500 border border-violet-400/30 shadow-lg shadow-violet-900/30 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Brain size={16} />
                Análisis Profundo
              </button>
              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Temporada</label>
                <div className="relative">
                  <CalendarRange size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-blue-400 pointer-events-none" />
                  <select
                    value={temporadaId ?? ''}
                    onChange={(e) => setTemporadaId(e.target.value ? Number(e.target.value) : null)}
                    className="appearance-none w-full min-w-[270px] bg-slate-900/80 border border-white/15 rounded-xl pl-9 pr-10 py-2.5 text-white text-sm font-semibold outline-none cursor-pointer hover:bg-slate-800 hover:border-white/25 focus:border-blue-500/60 focus:ring-2 focus:ring-blue-500/20 transition-all [color-scheme:dark]"
                  >
                    {temporadas.map((t) => (
                      <option key={t.IdTemporada} value={t.IdTemporada} className="bg-slate-900 text-white">
                        {t.Temporada}{t.EsActiva ? ' · activa' : ''}
                      </option>
                    ))}
                  </select>
                  <ChevronDown size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                </div>
              </div>
            </div>
          </div>

          {/* ── KPIs a pantalla completa (el desglose por sede se abre desde cada panel) ── */}
          {isLoading ? (
            <div className="space-y-5">
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
                <div className="h-[34rem] bg-white/5 rounded-2xl animate-pulse border border-white/10" />
                <div className="h-[34rem] bg-white/5 rounded-2xl animate-pulse border border-white/10" />
              </div>
              <div className="grid grid-cols-1 xl:grid-cols-12 gap-5">
                <div className="xl:col-span-7 h-72 bg-white/5 rounded-2xl animate-pulse border border-white/10" />
                <div className="xl:col-span-5 h-72 bg-white/5 rounded-2xl animate-pulse border border-white/10" />
              </div>
            </div>
          ) : (
            <div className="space-y-5">
              {/* Fila protagonista: los adeudos de las dos temporadas, lado a lado. */}
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
                {tarjetaDe('anterior', sedes, true)}
                {tarjetaDe('actual', sedes, true)}
              </div>
              {/* Segunda fila: la plantilla sobre la que se calculan (activos y bajas). */}
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-12 gap-5">
                <div className="xl:col-span-7">{tarjetaDe('activos', sedes, true)}</div>
                <div className="xl:col-span-5">{tarjetaDe('bajas', sedes, true)}</div>
              </div>
            </div>
          )}

          {/* Solo sale si hay algo mal capturado: una sede de keepers no debería tener
              a nadie que no sea portero. Estos quedan fuera de los conteos y del
              cálculo de adeudo, así que sin este aviso serían invisibles. */}
          {!isLoading && fueraDeLugar.length > 0 && (
            <div className="mt-6 bg-red-500/10 border border-red-500/40 rounded-2xl px-4 py-3">
              <p className="text-xs text-red-300 font-black uppercase tracking-wider flex items-center gap-2 mb-2">
                <AlertTriangle size={14} className="text-red-400" />
                No son porteros
              </p>
              <p className="text-[11px] text-slate-400 mb-2">
                Dados de alta en una sede de keepers con categoría que no es de portero. No entran en ningún conteo ni en el cálculo de adeudo.
              </p>
              <div className="flex flex-wrap gap-2">
                {fueraDeLugar.map((s) => (
                  <button
                    key={s.IdSede}
                    type="button"
                    onClick={() => setModal({ title: 'No son porteros', subtitle: s.Sede, filtro: 'fuera-de-lugar', sedeId: s.IdSede })}
                    className="flex items-center gap-2 bg-red-500/10 hover:bg-red-500/20 border border-red-500/40 rounded-lg px-2.5 py-1.5 transition-all"
                  >
                    <span className="text-[10px] font-bold text-red-200">{s.Sede}</span>
                    <span className="text-sm font-black text-red-400">{s.FueraDeLugar}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* ── Modal: el mismo KPI, dividido por sedes ── */}
        {detalleKpi && (
          <div className="fixed inset-0 bg-black/70 backdrop-blur-md flex items-center justify-center z-[120] p-4">
            <div className="bg-[#0f172a] border border-white/10 rounded-3xl w-full max-w-6xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200">
              {/* Header */}
              <div className="p-5 border-b border-white/5 flex items-center justify-between bg-white/5">
                <div className="flex items-center gap-4">
                  <div className="bg-blue-600/20 p-2.5 rounded-xl border border-blue-500/20">
                    <MapPin size={20} className="text-blue-400" />
                  </div>
                  <div>
                    <h3 className="text-lg font-black text-white">{KPI_TITULOS[detalleKpi]} · Detalle por sedes</h3>
                    <p className="text-xs text-slate-400">
                      {detalleKpi === 'anterior' ? anterior?.temporadaNombre : actual?.temporadaNombre}
                    </p>
                  </div>
                </div>
                <button onClick={() => setDetalleKpi(null)} className="p-2 rounded-xl hover:bg-white/10 text-slate-400 hover:text-white transition-all">
                  <X size={20} />
                </button>
              </div>

              {/* Content */}
              <div className="flex-1 overflow-y-auto p-5">
                {sedesDetalle.length === 0 ? (
                  <div className="h-56 flex flex-col items-center justify-center gap-3 text-slate-500">
                    <MapPin size={44} className="opacity-20" />
                    <p className="text-lg font-black">Sin registros</p>
                    <p className="text-sm opacity-60">Ninguna sede tiene datos de este indicador.</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
                    {sedesDetalle.map((sede) => (
                      <div key={sede.IdSede} className="bg-white/5 border border-white/10 rounded-2xl p-4">
                        <div className="flex items-center justify-between gap-3 mb-3">
                          <div className="flex items-center gap-2.5 min-w-0">
                            <div className="bg-blue-500/10 text-blue-400 p-2 rounded-xl border border-blue-500/10 flex-shrink-0">
                              <MapPin size={15} />
                            </div>
                            <h4 className="text-sm font-black text-white truncate">{sede.Sede}</h4>
                            <span className={`text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-md border flex-shrink-0 ${
                              sede.EsClinics
                                ? 'text-sky-300 bg-sky-500/10 border-sky-500/25'
                                : 'text-slate-500 bg-white/5 border-white/5'
                            }`}>
                              {sede.EsClinics ? 'Clinics' : 'Campus'}
                            </span>
                          </div>
                          <Link
                            href={categoriaHref(sede)}
                            className="flex items-center gap-1 text-blue-400 hover:text-blue-300 transition-colors flex-shrink-0"
                          >
                            <span className="text-[9px] font-black uppercase tracking-widest">Ver por Categoría</span>
                            <ChevronRight size={13} />
                          </Link>
                        </div>
                        {tarjetaDe(detalleKpi, [sede], false, sede)}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Footer */}
              <div className="p-4 bg-white/5 border-t border-white/5 flex justify-between items-center text-[11px] text-slate-500 px-6">
                <p>{sedesDetalle.length} sede(s) con datos · clic en cualquier cifra para ver a los jugadores</p>
                <p>Las sedes sin registros de este indicador no se listan</p>
              </div>
            </div>
          </div>
        )}

        <AdeudosModal
          config={modal}
          temporadaId={temporadaId}
          temporadaNombre={actual?.temporadaNombre}
          onClose={() => setModal(null)}
          onDataChanged={() => fetchSedes(temporadaId, true, descartarPB)}
        />

        <AnalisisProfundoModal
          open={analisisOpen}
          onClose={() => setAnalisisOpen(false)}
          sedes={sedes}
          actual={actual}
          anterior={anterior}
        />
      </main>
    </DashboardLayout>
  );
}
