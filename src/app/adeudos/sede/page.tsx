"use client";
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  MapPin, Users, UserCheck, UserMinus, ChevronRight, ChevronDown, CalendarRange, History, CalendarClock, Brain,
  AlertTriangle, X,
} from 'lucide-react';
import { useUser } from '@/contexts/user-context';
import DashboardLayout from '@/components/DashboardLayout';
import AdeudosModal, { type AdeudosModalConfig } from '@/components/AdeudosModal';
import AnalisisProfundoModal from '@/components/AnalisisProfundoModal';
import {
  GRUPO_COLOR, VerSedesBtn, PanelHeader, PastelKpi, BarraColapsada, OcultarBtn,
  type RebanadaKpi,
} from '@/components/KpiPanel';
import GraficaPastel from '@/components/GraficaPastel';

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
  ActualKeepersSinPagos: number;
  ActualKeepersBecadosSinPagos: number;
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
  AnteriorKeepersSinPagos: number;
  AnteriorKeepersBecadosSinPagos: number;
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
function DesgloseAdeudo({ inscripcion = 0, meses, onInscripcion, onMes, size = 'sm', temporada = 'la temporada' }: {
  inscripcion?: number;
  meses: DebeMes[];
  onInscripcion?: () => void;
  onMes: (mes: number) => void;
  size?: 'sm' | 'xs';
  /** Cómo nombrar la temporada en las explicaciones de cada chip. */
  temporada?: string;
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
          title={`${inscripcion} jugador(es) no pagaron la inscripción de ${temporada}.`}
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
          title={`${m.cantidad} jugador(es) no han pagado ${MESES_CORTOS[m.mes - 1]} de ${temporada}, que ya venció.`}
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
  /** Porteros que ya empezaron a pagar y traen un mes ya vencido sin pagar. */
  keepersDebe: number;
  /** Porteros sin una sola mensualidad pagada de la temporada. */
  keepersSinPagos: number;
  /** Porteros con beca 100% y sin un solo pago registrado. */
  keepersBecadosSinPagos: number;
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
  keepersSinPagos: sumDe(lista, s => s.AnteriorKeepersSinPagos),
  keepersBecadosSinPagos: sumDe(lista, s => s.AnteriorKeepersBecadosSinPagos),
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
  keepersSinPagos: sumDe(lista, s => s.ActualKeepersSinPagos),
  keepersBecadosSinPagos: sumDe(lista, s => s.ActualKeepersBecadosSinPagos),
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

/**
 * Porteros al corriente: los que quedan tras apartar a los tres cortes con nombre
 * propio. Son los que ya empezaron a pagar y están al día (los becados con pagos
 * también caen aquí, porque nunca deben).
 */
const keepersAlCorriente = (d: DatosAdeudo) =>
  Math.max(0, d.keepers - d.keepersDebe - d.keepersSinPagos - d.keepersBecadosSinPagos);

/* ¿La sede tiene algo en los segmentos que la tarjeta de plantilla MUESTRA? Se filtra
   con esto y no con el total del API (s.Bajas incluye los dummies de venta al público,
   que la tarjeta de bajas no pinta: la sede saldría listada con puros ceros). */
const hayPlantilla = (d: DatosPlantilla) =>
  d.sedes + d.keepers + d.futsal + d.ventaPublico + d.clinics + d.clinicsFutsal > 0;

type Abrir = (cfg: AdeudosModalConfig) => void;

/** KPIs que saben desglosarse por sede en el modal. */
type KpiClave = 'activos' | 'bajas' | 'anterior' | 'actual';

/** Las rebanadas de un lado de la plantilla (activos o bajas), con sus cortes. */
function rebanadasPlantilla(modo: 'activos' | 'bajas', d: DatosPlantilla, abrir: Abrir): RebanadaKpi[] {
  const esActivos = modo === 'activos';
  // "Jugadores Baja" (singular) es el título histórico de los modales de bajas.
  const titulo = esActivos ? 'Jugadores Activos' : 'Jugadores Baja';
  const filtro = modo;
  // Los textos de ayuda cambian de sujeto entre activos y bajas, pero describen el
  // mismo reparto de grupos.
  const q = esActivos ? 'Jugadores vigentes' : 'Jugadores dados de baja';

  const partes: { etiqueta: string; cantidad: number; color: string; title: string; cfg: AdeudosModalConfig }[] = [
    { etiqueta: 'Sedes', cantidad: d.sedes, color: GRUPO_COLOR.sedes, title: `${q} de sedes normales. Son los únicos que entran en el cálculo de adeudo.`, cfg: { title: `${titulo} · Sedes`, filtro, grupo: 'normal' } },
    { etiqueta: 'Keepers', cantidad: d.keepers, color: GRUPO_COLOR.keepers, title: `${q} de sedes de keepers o con categoría de portero. Tienen su propia regla: no vuelven a pagar inscripción cada temporada.`, cfg: { title: `${titulo} · Keepers/Porteros`, filtro, grupo: 'keepers' } },
    { etiqueta: 'Futsal', cantidad: d.futsal, color: GRUPO_COLOR.futsal, title: `${q} de futsal. Cuentan en los adeudos como sede normal, pero se reportan aparte por meses pagados.`, cfg: { title: `${titulo} · Futsal`, filtro, grupo: 'futsal' } },
  ];
  if (esActivos) {
    partes.push({ etiqueta: 'Venta púb.', cantidad: d.ventaPublico, color: GRUPO_COLOR.ventaPublico, title: 'Registros de venta al público (no son jugadores inscritos). No entran en los adeudos.', cfg: { title: `${titulo} · Venta al Público`, filtro, grupo: 'ventapublico' } });
  }
  partes.push(
    { etiqueta: 'Clinics', cantidad: d.clinics, color: GRUPO_COLOR.clinics, title: `${q} de sedes de clinics. No manejan inscripción ni mensualidad, así que no entran en los adeudos.`, cfg: { title: `${titulo} · Clinics`, filtro, grupo: 'excluido' } },
    { etiqueta: 'Clinics F.', cantidad: d.clinicsFutsal, color: GRUPO_COLOR.clinicsFutsal, title: `${q} de clinics futsal (sede de futsal con categoría de clinics). Tampoco entran en los adeudos.`, cfg: { title: `${titulo} · Clinics Futsal`, filtro, grupo: 'clinicsfutsal' } },
  );

  return partes.map((p) => ({
    etiqueta: p.etiqueta,
    cantidad: p.cantidad,
    color: p.color,
    title: p.title,
    onClick: () => abrir(p.cfg),
  }));
}

const sumaPlantilla = (d: DatosPlantilla) =>
  d.sedes + d.keepers + d.futsal + d.ventaPublico + d.clinics + d.clinicsFutsal;

/**
 * Plantilla: activos y bajas en una sola tarjeta. Van juntos porque son las dos caras
 * del mismo padrón —quién sigue y quién se fue— y ninguno se consulta a diario: son el
 * contexto sobre el que se leen los adeudos, así que la tarjeta arranca plegada.
 */
function TarjetaPlantillaDoble({ activos, bajas, abrir, verActivos, verBajas, colapso }: {
  activos: DatosPlantilla;
  bajas: DatosPlantilla;
  abrir: Abrir;
  verActivos?: () => void;
  verBajas?: () => void;
  colapso?: { abierta: boolean; onToggle: () => void };
}) {
  const totalActivos = sumaPlantilla(activos);
  const totalBajas = sumaPlantilla(bajas);

  if (colapso && !colapso.abierta) {
    return (
      <BarraColapsada
        icono={<Users size={20} className="text-emerald-400" />}
        iconoClase="bg-emerald-500/20 border-emerald-500/30"
        titulo="Plantilla"
        tituloClase="text-emerald-400"
        subtitulo="Quién sigue vigente y quién se dio de baja"
        cifras={[
          { valor: totalActivos, nota: 'activos', clase: 'text-emerald-400' },
          { valor: totalBajas, nota: 'bajas', clase: 'text-rose-400' },
        ]}
        onToggle={colapso.onToggle}
        title="Ver el reparto de la plantilla por grupo"
        className="bg-white/5 border-white/10 hover:bg-white/8 hover:border-white/25"
      />
    );
  }

  const lado = (
    modo: 'activos' | 'bajas',
    d: DatosPlantilla,
    total: number,
    verSedes?: () => void,
  ) => {
    const esActivos = modo === 'activos';
    return (
      /* Columna completa: con h-full y el pie en mt-auto, los dos "Ver detalle por
         sedes" quedan a la misma altura aunque una leyenda tenga más renglones. */
      <div className="flex flex-col h-full">
        <div className="flex items-center gap-2.5 mb-3">
          <span className={`p-2 rounded-xl border flex-shrink-0 ${
            esActivos ? 'bg-emerald-500/20 border-emerald-500/30' : 'bg-rose-500/20 border-rose-500/30'
          }`}>
            {esActivos
              ? <UserCheck size={16} className="text-emerald-400" />
              : <UserMinus size={16} className="text-rose-400" />}
          </span>
          <span className="min-w-0">
            <span className={`block text-[11px] uppercase tracking-widest font-black ${
              esActivos ? 'text-emerald-400' : 'text-rose-400'
            }`}>
              {esActivos ? 'Jugadores Activos' : 'Jugadores Bajas'}
            </span>
            <span className="block text-[11px] text-slate-400 leading-snug">
              {esActivos
                ? 'Vigentes: no se les ha dado de baja ni eliminado'
                : 'Dados de baja: ya no cuentan como plantilla'}
            </span>
          </span>
        </div>
        <PastelKpi
          tamano={104}
          unidad="jugadores"
          centro={total}
          centroNota={esActivos ? 'activos' : 'bajas'}
          rebanadas={rebanadasPlantilla(modo, d, abrir)}
        />
        <div className="mt-auto">{verSedes && <VerSedesBtn onClick={verSedes} />}</div>
      </div>
    );
  };

  return (
    <div className="border border-white/10 bg-white/5 rounded-2xl p-5">
      {colapso && <div className="flex justify-end"><OcultarBtn onClick={colapso.onToggle} /></div>}
      {/* Sin tarjetas anidadas: los dos lados se separan con una línea, no con más
          cajas dentro de la caja. Los DOS envoltorios llevan flex-1: si solo lo llevara
          uno, ese se quedaría con todo el espacio libre y el divisor saldría corrido a
          un lado. El aire va simétrico a ambos lados de la línea (pr-6 / pl-6), no
          repartido entre un gap del contenedor y un padding de un solo hijo. */}
      <div className="flex flex-col lg:flex-row divide-y lg:divide-y-0 lg:divide-x divide-white/10">
        <div className="flex-1 min-w-0 pb-5 lg:pb-0 lg:pr-6">
          {lado('activos', activos, totalActivos, verActivos)}
        </div>
        <div className="flex-1 min-w-0 pt-5 lg:pt-0 lg:pl-6">
          {lado('bajas', bajas, totalBajas, verBajas)}
        </div>
      </div>
    </div>
  );
}

/** Panel de plantilla de UNA sola cara; se usa dentro del modal de detalle por sedes. */
function TarjetaPlantilla({ modo, d, abrir, pie }: {
  modo: 'activos' | 'bajas';
  d: DatosPlantilla;
  abrir: Abrir;
  pie?: React.ReactNode;
}) {
  const esActivos = modo === 'activos';
  const total = sumaPlantilla(d);

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
        subtitulo={esActivos
          ? 'Jugadores dados de alta que siguen vigentes: no se les ha dado de baja ni se han eliminado'
          : 'Jugadores que fueron dados de baja y ya no cuentan como plantilla'}
        valor={total}
        nota="jugadores"
        ayuda={esActivos
          ? 'Toda la gente con registro vigente en el sistema, hayan pagado o no. Es la base sobre la que se calculan los adeudos: los jugadores eliminados o dados de baja no aparecen aquí.'
          : 'Jugadores marcados como baja. Ya no se les exige inscripción ni mensualidad, por eso no aparecen en ningún corte de adeudo.'}
      />
      <PastelKpi
        className="mt-4 flex-1"
        unidad="jugadores"
        centro={total}
        centroNota={esActivos ? 'activos' : 'bajas'}
        rebanadas={rebanadasPlantilla(modo, d, abrir)}
      />
      {pie}
    </div>
  );
}

/** Una sede con sus cifras de adeudo, para el resumen que va dentro de la tarjeta. */
export interface SedeResumen {
  id: number;
  nombre: string;
  d: DatosAdeudo;
}

/**
 * Resumen de adeudos por sede, dentro de la tarjeta de una temporada.
 *
 * A propósito NO desglosa porteros ni futsal: aquí la pregunta es "¿dónde está el
 * rezago?", y para eso basta cuánto debe y cuánto va al corriente cada sede. El
 * desglose fino vive en «Ver detalle por sedes», que abre la tarjeta completa de cada
 * una. Va ordenado por adeudo descendente: arriba lo que hay que cobrar primero.
 */
function ResumenPorSede({ sedes, esAnterior, suf, abrirSede, verSinInscripcion = false }: {
  sedes: SedeResumen[];
  esAnterior: boolean;
  suf: string;
  /** Abre un corte acotado a esa sede. */
  abrirSede: (sede: SedeResumen, cfg: AdeudosModalConfig) => void;
  /** Con el check apagado, los que aún no empiezan a pagar se descartan también aquí. */
  verSinInscripcion?: boolean;
}) {
  const conNoIniciados = esAnterior || verSinInscripcion;

  /* Los tres grupos de una sede, cada uno con su reparto. Se arman con los mismos
     cortes y colores que las donas grandes de la tarjeta, para que la sucursal se lea
     igual que el total y no haya que reaprender la pantalla. */
  const gruposDe = (s: SedeResumen) => {
    const d = s.d;
    const sinInsc = conNoIniciados ? d.sinInscripcion : 0;
    const porterosSinPagos = conNoIniciados ? d.keepersSinPagos : 0;
    const futsalSinPagos = conNoIniciados ? d.futsalSinPagos : 0;
    return [
      {
        clave: 'sedes',
        etiqueta: 'Sedes',
        deben: d.debe,
        rebanadas: [
          { etiqueta: 'Con adeudo', cantidad: d.debe, color: '#fb7185' },
          { etiqueta: 'Al corriente', cantidad: d.alCorriente, color: '#2dd4bf' },
          ...(sinInsc > 0 ? [{ etiqueta: 'Sin inscripción', cantidad: sinInsc, color: '#fbbf24' }] : []),
        ],
        cfg: { title: `Con Adeudo${suf}`, filtro: 'debe' as const },
      },
      {
        clave: 'porteros',
        etiqueta: 'Porteros',
        deben: d.keepersDebe,
        rebanadas: [
          { etiqueta: 'Con adeudo', cantidad: d.keepersDebe, color: '#fb7185' },
          ...(porterosSinPagos > 0 ? [{ etiqueta: 'Sin pagos', cantidad: porterosSinPagos, color: '#fbbf24' }] : []),
          { etiqueta: 'Becados 100%', cantidad: d.keepersBecadosSinPagos, color: '#c084fc' },
          { etiqueta: 'Al corriente', cantidad: keepersAlCorriente(d), color: '#22d3ee' },
        ],
        cfg: { title: `Porteros con Adeudo${suf}`, filtro: 'keepers-debe' as const },
      },
      {
        clave: 'futsal',
        etiqueta: 'Futsal',
        deben: futsalSinPagos,
        rebanadas: [
          ...(futsalSinPagos > 0 ? [{ etiqueta: 'Sin pagos', cantidad: futsalSinPagos, color: '#701a75' }] : []),
          { etiqueta: '1 mes', cantidad: d.futsal1Mes, color: '#a21caf' },
          { etiqueta: '2 meses', cantidad: d.futsal2Meses, color: '#d946ef' },
          { etiqueta: '3+ meses', cantidad: d.futsal3Mas, color: '#f0abfc' },
        ],
        cfg: { title: `Futsal Sin Pagos${suf}`, filtro: 'futsal-sin-pagos' as const },
      },
    ];
  };

  const totalGrupo = (r: { cantidad: number }[]) => r.reduce((a, x) => a + x.cantidad, 0);
  /* Se ordena por lo que hay que cobrar —grupo normal más porteros—, para que arriba
     quede la sucursal con más rezago. */
  const conDatos = sedes
    .map((s) => ({ s, grupos: gruposDe(s) }))
    .filter(({ grupos }) => grupos.some((g) => totalGrupo(g.rebanadas) > 0))
    .sort((a, b) => (b.s.d.debe + b.s.d.keepersDebe) - (a.s.d.debe + a.s.d.keepersDebe));
  if (conDatos.length === 0) return null;

  return (
    <div className="bg-white/5 border border-white/10 rounded-xl p-2.5">
      <p className="text-[10px] uppercase font-black text-slate-400 tracking-wider mb-1.5">
        Adeudo por sede
      </p>
      <div className="space-y-1.5 max-h-[28rem] overflow-y-auto pr-1">
        {conDatos.map(({ s, grupos }) => (
          <div key={s.id} className="bg-white/5 rounded-lg px-2 py-1.5">
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-[11px] font-black text-slate-200 truncate min-w-0" title={s.nombre}>
                {s.nombre}
              </span>
              <span className="text-[10px] font-bold text-slate-500 tabular-nums flex-shrink-0">
                {(s.d.debe + s.d.keepersDebe).toLocaleString('es-MX')} con adeudo
              </span>
            </div>
            <div className="grid grid-cols-3 gap-1.5 mt-1">
              {grupos.map((g) => {
                const total = totalGrupo(g.rebanadas);
                const detalle = g.rebanadas
                  .filter((r) => r.cantidad > 0)
                  .map((r) => `${r.etiqueta}: ${r.cantidad}`)
                  .join(' · ');
                return (
                  <button
                    key={g.clave}
                    type="button"
                    disabled={total === 0}
                    onClick={() => abrirSede(s, g.cfg)}
                    title={total === 0
                      ? `${s.nombre} · ${g.etiqueta}: sin jugadores en este grupo.`
                      : `${s.nombre} · ${g.etiqueta} (${total}). ${detalle}. Clic para ver a los que hay que cobrar.`}
                    className="flex items-center gap-1.5 rounded-md px-1 py-0.5 text-left hover:bg-white/10 transition-colors disabled:opacity-40 disabled:cursor-default min-w-0"
                  >
                    <GraficaPastel rebanadas={g.rebanadas} total={total} tamano={34} unidad="jugadores" />
                    <span className="min-w-0">
                      <span className="block text-[9px] uppercase font-black text-slate-400 tracking-wider truncate">
                        {g.etiqueta}
                      </span>
                      <span className="block text-[11px] font-black tabular-nums text-white leading-tight">
                        <span className={g.deben > 0 ? 'text-rose-400' : 'text-slate-500'}>{g.deben}</span>
                        <span className="text-slate-500">/{total}</span>
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
      <p className="text-[9px] text-slate-500 mt-1.5 px-1">
        En rojo, cuántos hay que cobrar de cada grupo; después de la diagonal, cuántos son en total.
      </p>
    </div>
  );
}

/**
 * Panel de adeudos (temporada anterior o en curso): la cifra protagonista es "con
 * adeudo", con la dona del grupo normal, porteros, becados, futsal, el resumen por
 * sede y —según la temporada— sin inscripción o posibles bajas.
 */
function TarjetaAdeudos({ variante, caption, d, abrir, disabled, descartarPB, onToggleDescartar, pie, colapso, porSede, abrirSede, verSinInscripcion = false, onToggleSinInscripcion }: {
  variante: 'anterior' | 'actual';
  caption: string;
  d: DatosAdeudo;
  abrir: Abrir;
  disabled?: boolean;
  descartarPB?: boolean;
  onToggleDescartar?: () => void;
  pie?: React.ReactNode;
  /** Si se provee, la tarjeta se puede plegar; cerrada se reduce a una barra. */
  colapso?: { abierta: boolean; onToggle: () => void };
  /** Resumen por sede; solo en la tarjeta global (dentro del modal ya es una sede). */
  porSede?: SedeResumen[];
  abrirSede?: (sede: SedeResumen, cfg: AdeudosModalConfig) => void;
  /**
   * Si se muestran los que todavía NO empiezan a pagar: sin inscripción del grupo
   * normal, porteros sin pagos y futsal sin pagos. Apagado, se descartan de la vista y
   * las donas reparten solo al resto. Solo aplica a la temporada en curso.
   */
  verSinInscripcion?: boolean;
  onToggleSinInscripcion?: () => void;
}) {
  const esAnterior = variante === 'anterior';
  const suf = esAnterior ? ' · Temporada Anterior' : ' · Esta Temporada';
  // Sujeto de los textos de ayuda: la temporada de la que habla esta tarjeta.
  const T = esAnterior ? 'esa temporada' : 'esta temporada';
  const titulo = esAnterior ? 'Adeudos Temporada Anterior' : 'Adeudos Esta Temporada';
  const tituloClase = esAnterior ? 'text-amber-400' : 'text-blue-400';
  const icono = esAnterior
    ? <History size={20} className="text-amber-400" />
    : <CalendarClock size={20} className="text-blue-400" />;
  const iconoClase = esAnterior ? 'bg-amber-500/20 border-amber-500/30' : 'bg-blue-500/20 border-blue-500/30';
  const base = d.debe + d.alCorriente;
  const pctDebe = base > 0 ? Math.round((d.debe / base) * 100) : 0;
  const btn = 'text-left transition-all disabled:opacity-40 disabled:cursor-not-allowed';
  const porterosCorriente = keepersAlCorriente(d);

  /* "Aún no empiezan a pagar": los tres grupos que no son deudores pero tampoco están
     al corriente. El check solo existe en la temporada en curso, que es donde tiene
     sentido separarlos; apagado, se descartan de las donas y del resumen por sede, y
     los repartos se recalculan sin ellos. */
  const conNoIniciados = esAnterior || verSinInscripcion;
  const sinInscripcion = conNoIniciados ? d.sinInscripcion : 0;
  const porterosSinPagos = conNoIniciados ? d.keepersSinPagos : 0;
  const futsalSinPagos = conNoIniciados ? d.futsalSinPagos : 0;
  const totalPorteros = d.keepersDebe + porterosSinPagos + d.keepersBecadosSinPagos + porterosCorriente;
  const totalFutsal = futsalSinPagos + d.futsal1Mes + d.futsal2Meses + d.futsal3Mas;

  /* Plegada: se reduce a una barra con el titulo y la cifra de cabecera, y el resto
     ni siquiera se monta. Asi la pagina arranca enfocada en la temporada en curso,
     que es la que se consulta a diario. */
  if (colapso && !colapso.abierta) {
    return (
      <BarraColapsada
        icono={icono}
        iconoClase={iconoClase}
        titulo={titulo}
        tituloClase={tituloClase}
        subtitulo={caption}
        cifras={disabled ? [] : [{ valor: d.debe, nota: 'con adeudo', clase: 'text-rose-400' }]}
        /* El descarte de posibles bajas se recuerda entre sesiones y recorta este
           mismo número, así que plegada la tarjeta tiene que confesarlo: si no, la
           cifra se lee como el adeudo completo y el control para quitarlo vive
           dentro de lo que está oculto. */
        insignia={!disabled && descartarPB ? (
          <span className="hidden sm:inline text-[9px] font-black uppercase tracking-wider text-red-200 bg-red-500/20 border border-red-500/40 rounded-md px-2 py-1">
            Sin posibles bajas
          </span>
        ) : undefined}
        onToggle={colapso.onToggle}
        title={descartarPB
          ? `${caption}: la cifra EXCLUYE a los posibles bajas (filtro activo). Expande la tarjeta para verlos o quitar el descarte.`
          : `Ver el detalle de adeudos de ${caption}`}
        className={esAnterior
          ? 'bg-amber-500/10 border-amber-500/20 hover:bg-amber-500/15 hover:border-amber-500/40'
          : 'bg-blue-500/10 border-blue-500/20 hover:bg-blue-500/15 hover:border-blue-500/40'}
      />
    );
  }

  return (
    <div className={`h-full border rounded-2xl p-5 flex flex-col ${
      esAnterior ? 'bg-amber-500/10 border-amber-500/20' : 'bg-blue-500/10 border-blue-500/20'
    }`}>
      {colapso && <OcultarBtn onClick={colapso.onToggle} />}
      <PanelHeader
        icono={icono}
        iconoClase={iconoClase}
        titulo={titulo}
        tituloClase={tituloClase}
        subtitulo={caption}
        valor={d.debe}
        nota={base > 0 ? `con adeudo · ${pctDebe}%` : 'con adeudo'}
        notaClase="text-rose-300/90"
        ayuda={esAnterior
          ? `Jugadores del grupo normal (sin porteros ni futsal) que terminaron ${T} debiendo la inscripción o algún mes.`
          : `Jugadores inscritos del grupo normal (sin porteros ni futsal) con al menos un mes ya vencido sin pagar. Los que aún no se inscriben no generan adeudo: se cuentan aparte en «Sin inscripción».`}
      />

      {/* Interruptor de los que aún no empiezan a pagar. Va junto al encabezado porque
          cambia lo que TODA la tarjeta reparte, no un bloque suelto. */}
      {!esAnterior && onToggleSinInscripcion && (
        <label
          title="Incluye o descarta de toda la tarjeta a los que aún no empiezan a pagar: sin inscripción del grupo normal, porteros sin pagos y futsal sin pagos. Apagado, las gráficas reparten solo al resto."
          className={`mt-3 self-start flex items-center gap-2 px-2.5 py-1.5 rounded-lg cursor-pointer select-none border transition-all ${
            verSinInscripcion
              ? 'bg-amber-500/15 border-amber-500/30 text-amber-100'
              : 'bg-white/5 border-white/10 text-slate-400 hover:bg-white/10'
          }`}
        >
          <input
            type="checkbox"
            checked={verSinInscripcion}
            onChange={onToggleSinInscripcion}
            className="accent-amber-500"
          />
          <span className="text-[10px] uppercase font-black tracking-wider">Ver sin inscripción</span>
        </label>
      )}

      {/* Dos columnas: a la izquierda quién debe, a la derecha en qué sede está. Son
          preguntas distintas y se responden mejor lado a lado que una bajo la otra. */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 mt-4 items-start">
        <div className="xl:col-span-7 min-w-0">

      {/* Reparto del GRUPO NORMAL (sin porteros ni futsal, que van en sus propios
          bloques): son cortes excluyentes que juntos son todo ese grupo, así que la
          dona reparte un entero de verdad y no una mezcla de universos. */}
      {!disabled && (
        <PastelKpi
          tamano={116}
          unidad="jugadores"
          centro={d.debe}
          centroNota="con adeudo"
          rebanadas={[
            {
              etiqueta: 'Con adeudo',
              cantidad: d.debe,
              color: '#fb7185',
              title: esAnterior
                ? `Jugadores del grupo normal que terminaron ${T} debiendo la inscripción o algún mes.`
                : `Jugadores inscritos del grupo normal con al menos un mes ya vencido sin pagar.`,
              onClick: () => abrir({ title: `Con Adeudo${suf}`, filtro: 'debe' }),
            },
            {
              etiqueta: 'Al corriente',
              cantidad: d.alCorriente,
              color: '#2dd4bf',
              title: `Jugadores inscritos del grupo normal que no deben ningún mes vencido de ${T}.`,
              onClick: () => abrir({ title: `Al Corriente${suf}`, filtro: 'al-corriente' }),
            },
            ...(esAnterior || !verSinInscripcion ? [] : [{
              etiqueta: 'Sin inscripción',
              cantidad: sinInscripcion,
              color: '#fbbf24',
              title: 'Jugadores vigentes del grupo normal que todavía no pagan la inscripción de esta temporada. Quedan fuera del cálculo de adeudo.',
              onClick: () => abrir({ title: `Sin Inscripción${suf}`, filtro: 'pendiente-inscripcion' }),
            }]),
          ]}
        />
      )}

      {/* Qué concepto se debe. Las cifras de "con adeudo", "al corriente" y "sin
          inscripción" ya viven en la leyenda de la dona; aquí queda solo lo que la
          dona no puede decir: por cuál mes o concepto es la deuda. */}
      {!disabled && (d.debe > 0 || d.insc > 0) && (
        <div className="mt-3 bg-rose-500/10 border border-rose-500/20 rounded-xl px-3 py-2.5">
          <p className="text-[10px] uppercase font-black text-rose-300/90 tracking-wider">
            Qué deben los {d.debe.toLocaleString('es-MX')} con adeudo
          </p>
          <DesgloseAdeudo
            temporada={T}
            inscripcion={esAnterior ? d.insc : 0}
            meses={d.meses}
            onInscripcion={esAnterior ? () => abrir({ title: `Deben Inscripción${suf}`, filtro: 'pendiente-inscripcion' }) : undefined}
            onMes={(mes) => abrir({ title: `Deben ${MESES_CORTOS[mes - 1]}${suf}`, filtro: 'debe-mes', mes })}
          />
        </div>
      )}

      {/* Porteros: su regla de adeudo es propia (no re-pagan inscripción cada
          temporada), por eso van aparte del grupo normal. Los cuatro cortes son
          excluyentes y suman el total de porteros de la sede. */}
      <div className="mt-3 bg-cyan-500/10 border border-cyan-500/20 rounded-xl p-2.5">
        <p className="text-[10px] uppercase font-black text-cyan-300/90 tracking-wider mb-1.5">
          Porteros
        </p>
        <PastelKpi
          tamano={92}
          unidad="porteros"
          centro={totalPorteros}
          /* Con el filtro apagado el centro ya no son TODOS los porteros, así que el
             rótulo lo dice en vez de dejar una cifra que se lee como el total. */
          centroNota={conNoIniciados ? 'porteros' : 'con pagos'}
          rebanadas={[
            {
              etiqueta: 'Con adeudo',
              cantidad: d.keepersDebe,
              color: '#fb7185',
              title: `Porteros que ya pagaron alguna mensualidad de ${T} y traen al menos un mes ya vencido sin pagar.`,
              onClick: () => abrir({ title: `Porteros con Adeudo${suf}`, filtro: 'keepers-debe' }),
            },
            {
              /* El corte mide MENSUALIDADES, no inscripción: rotularlo "no inscritos"
                 señalaba justo al revés, porque el portero no re-paga inscripción cada
                 temporada y casi todos los de esta lista ya la tienen cubierta. El
                 título viaja además al encabezado del PDF y del Excel. */
              etiqueta: 'Sin pagos',
              cantidad: porterosSinPagos,
              color: '#fbbf24',
              title: `Porteros que no han pagado ninguna mensualidad de ${T}. Todavía no empiezan a pagar, por eso no cuentan como deudores. No tiene que ver con la inscripción: el portero no vuelve a pagarla cada temporada.`,
              onClick: () => abrir({ title: `Porteros sin Pagos${suf}`, filtro: 'keepers-sin-pagos' }),
            },
            {
              etiqueta: 'Becados 100%',
              cantidad: d.keepersBecadosSinPagos,
              color: '#c084fc',
              title: `Porteros con beca del 100% y sin un solo pago registrado en ${T}. No deben nada porque la beca cubre todo, pero tampoco hay pago capturado.`,
              onClick: () => abrir({ title: `Porteros Becados 100% sin Pago${suf}`, filtro: 'keepers-becados' }),
            },
            {
              etiqueta: 'Al corriente',
              cantidad: porterosCorriente,
              color: '#22d3ee',
              title: `Porteros que ya empezaron a pagar y están al día con los meses vencidos de ${T}.`,
              onClick: () => abrir({ title: `Porteros al Corriente${suf}`, filtro: 'keepers-corriente' }),
            },
          ]}
        />
      </div>

      <button
        type="button"
        onClick={() => abrir({ title: `Becados 100% sin Inscripción${suf}`, filtro: 'becado-sin-inscripcion' })}
        disabled={disabled}
        title={`Jugadores con beca del 100% que no tienen pago de inscripción registrado en ${T}. No deben dinero (su beca cubre todo), pero su inscripción no está capturada.`}
        className={`mt-3 w-full bg-purple-500/10 hover:bg-purple-500/25 border border-purple-500/20 rounded-xl px-3 py-2 flex items-center justify-between gap-3 ${btn}`}
      >
        <p className="text-[10px] uppercase font-black text-purple-300/80 tracking-wider leading-tight">Becados 100% s/inscripción</p>
        <p className="text-2xl font-black text-purple-300 tabular-nums">{d.becadosSinInsc}</p>
      </button>

      {/* Bloque Futsal */}
      <div className="mt-3 bg-fuchsia-500/10 border border-fuchsia-500/20 rounded-xl p-2.5">
        <p
          className="text-[10px] uppercase font-black text-fuchsia-300/90 tracking-wider mb-1.5"
          title={`El futsal no se mide por adeudo sino por cuántos meses de ${T} lleva pagados cada jugador.`}
        >
          Futsal (Meses pagados)
        </p>
        {/* Rampa de un solo tono: los meses pagados son una escala ordenada (0 → 3+),
            no categorías sueltas, así que el color va de menos a más. */}
        <PastelKpi
          tamano={92}
          unidad="jugadores de futsal"
          centro={totalFutsal}
          centroNota={conNoIniciados ? 'futsal' : 'con pagos'}
          rebanadas={[
            { etiqueta: 'Sin pagos', cantidad: futsalSinPagos, color: '#701a75', title: `Jugadores de futsal que no han pagado ninguna mensualidad de ${T}.`, onClick: () => abrir({ title: `Futsal Sin Pagos${suf}`, filtro: 'futsal-sin-pagos' }) },
            { etiqueta: '1 mes', cantidad: d.futsal1Mes, color: '#a21caf', title: `Jugadores de futsal con exactamente 1 mes pagado de ${T}.`, onClick: () => abrir({ title: `Futsal 1 Mes${suf}`, filtro: 'futsal-1-mes' }) },
            { etiqueta: '2 meses', cantidad: d.futsal2Meses, color: '#d946ef', title: `Jugadores de futsal con exactamente 2 meses pagados de ${T}.`, onClick: () => abrir({ title: `Futsal 2 Meses${suf}`, filtro: 'futsal-2-meses' }) },
            { etiqueta: '3+ meses', cantidad: d.futsal3Mas, color: '#f0abfc', title: `Jugadores de futsal con 3 o más meses pagados de ${T}.`, onClick: () => abrir({ title: `Futsal 3+ Meses${suf}`, filtro: 'futsal-3-mas' }) },
          ]}
        />
      </div>

      {/* Posibles bajas: deben la inscripción y todos los meses vencidos. El check
          "descartar" vive dentro del propio cuadro. */}
      {esAnterior && (
        <div className="mt-3 bg-red-600/15 border border-red-600/30 rounded-xl px-3 py-2 flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => abrir({ title: `Posibles Bajas${suf}`, filtro: 'posible-baja' })}
            disabled={disabled}
            title={`Jugadores que no pagaron la inscripción ni un solo mes vencido de ${T}: lo más probable es que ya no asistan. Con el check de al lado se pueden descartar del "Con adeudo".`}
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

        </div>
        {/* Dónde está el rezago: una fila por sede, ordenada por lo que más se debe. */}
        {!disabled && porSede && abrirSede && (
          <div className="xl:col-span-5 min-w-0">
            <ResumenPorSede
              sedes={porSede}
              esAnterior={esAnterior}
              suf={suf}
              abrirSede={abrirSede}
              verSinInscripcion={verSinInscripcion}
            />
          </div>
        )}
      </div>

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
  /* La temporada anterior arranca plegada: el día a día se consulta sobre la
     temporada en curso, y la anterior solo se revisa cuando se va a cobrar rezago. */
  const [anteriorAbierta, setAnteriorAbierta] = useState(false);
  /* La plantilla es el contexto del adeudo, no lo que se revisa a diario: su tarjeta
     —activos y bajas juntos— también arranca plegada. */
  const [plantillaAbierta, setPlantillaAbierta] = useState(false);
  /* Ver a los que aún no empiezan a pagar (sin inscripción, porteros sin pagos y futsal
     sin pagos). Arranca APAGADO: la pantalla se usa para cobrar, y esa gente no debe
     todavía. Se enciende cuando se quiere ver el padrón completo. */
  const [verSinInscripcion, setVerSinInscripcion] = useState(false);
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

  /* Las cifras de cada sede para el resumen que va dentro de las tarjetas de adeudos.
     Se calculan con la MISMA función que el total (aplicada a una sola sede), así que
     el resumen y la dona de arriba no pueden discrepar. */
  const resumenSedes = (datos: (lista: SedeSummary[]) => DatosAdeudo): SedeResumen[] =>
    sedes.map((s) => ({ id: s.IdSede, nombre: s.Sede, d: datos([s]) }));
  const sedePorId = (id: number): SedeSummary =>
    sedes.find((s) => s.IdSede === id) as SedeSummary;

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
            porSede={esGlobal ? resumenSedes(datosAnterior) : undefined}
            abrirSede={esGlobal ? (s, cfg) => abrirAnteriorSede(sedePorId(s.id))(cfg) : undefined}
            disabled={!anterior}
            /* Solo se pliega la tarjeta global; dentro del modal por sedes ya se
               entró a propósito a ver este indicador. */
            colapso={esGlobal ? { abierta: anteriorAbierta, onToggle: () => setAnteriorAbierta((v) => !v) } : undefined}
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
            porSede={esGlobal ? resumenSedes(datosActual) : undefined}
            abrirSede={esGlobal ? (s, cfg) => abrirActualSede(sedePorId(s.id))(cfg) : undefined}
            verSinInscripcion={verSinInscripcion}
            /* El check solo se ofrece en la tarjeta global; dentro del modal por sede
               la vista hereda lo que se eligió afuera. */
            onToggleSinInscripcion={esGlobal ? () => setVerSinInscripcion((v) => !v) : undefined}
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
              {/* Temporada anterior y plantilla arrancan plegadas (barras); en medio,
                  la temporada en curso con su alto completo. */}
              <div className="h-[4.75rem] bg-white/5 rounded-2xl animate-pulse border border-white/10" />
              <div className="h-[40rem] bg-white/5 rounded-2xl animate-pulse border border-white/10" />
              <div className="h-[4.75rem] bg-white/5 rounded-2xl animate-pulse border border-white/10" />
            </div>
          ) : (
            <div className="space-y-5">
              {/* La temporada anterior encabeza la pantalla: plegada es una barra y
                  expandida ocupa el ancho completo, sin mover nada de lo de abajo. */}
              {tarjetaDe('anterior', sedes, true)}
              {/* Lo que se consulta a diario, a todo lo ancho. */}
              {tarjetaDe('actual', sedes, true)}
              {/* La plantilla cierra la pantalla: es el contexto sobre el que se leen
                  los adeudos de arriba, no algo que se consulte por sí solo. */}
              <TarjetaPlantillaDoble
                activos={datosActivos(sedes)}
                bajas={datosBajas(sedes)}
                abrir={abrirPlantillaGlobal}
                verActivos={() => setDetalleKpi('activos')}
                verBajas={() => setDetalleKpi('bajas')}
                colapso={{ abierta: plantillaAbierta, onToggle: () => setPlantillaAbierta((v) => !v) }}
              />
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
