"use client";
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { MapPin, ChevronRight, ChevronDown, UserCheck, Users, CalendarRange, AlertTriangle, GraduationCap, X } from 'lucide-react';
import { useUser } from '@/contexts/user-context';
import DashboardLayout from '@/components/DashboardLayout';
import PlayersModal, { type PlayersModalConfig } from '@/components/PlayersModal';
import Meter from '@/components/Meter';
import BecasDonut, {
  SIN_BECA_COLOR, BECA_RAMPA, OTRAS_BECAS_COLOR, MAX_NIVELES, type Rebanada,
} from '@/components/BecasDonut';
import { GRUPO_COLOR, VerSedesBtn, BarraComposicion, TileGrupo, PanelHeader } from '@/components/KpiPanel';
import GraficaPastel from '@/components/GraficaPastel';

/** Colores del reparto por tipo de inscripción; los mismos de sus dos botones. */
const NUEVAS_COLOR = '#34d399';   // emerald-400
const REINSC_COLOR = '#fbbf24';   // amber-400

interface SedeSummary {
  IdSede: number;
  Sede: string;
  /** 1 = sede de clinics. */
  EsClinics: number;
  /** Activos DE LA TEMPORADA: pagaron al menos una mensualidad de sus meses. */
  Activos: number;
  ActivosKeepers: number;
  ActivosFutsal: number;
  ActivosClinicsFutsal: number;
  ActivosVentaPublico: number;
  /** Plantilla completa (Status 0). Es la base de la barra de avance de inscripción. */
  Plantilla: number;
  PlantillaVentaPublico: number;
  PlantillaClinicsFutsal: number;
  PlantillaKeepers: number;
  Inscritos: number;
  InscritosKeepers: number;
  InscritosFutsal: number;
  InscritosClinicsFutsal: number;
  /** De los inscritos, los que ya tenían inscripción en una temporada anterior. */
  Reinscritos: number;
  ReinscritosKeepers: number;
  ReinscritosFutsal: number;
  ReinscritosClinicsFutsal: number;
  Bajas: number;
  BajasKeepers: number;
  BajasFutsal: number;
  BajasClinicsFutsal: number;
  /** Pagaron mensualidad de los meses de la temporada pero no la inscripción */
  SinInscripcion: number;
  /** Activos de una sede keeper que NO son de categoría portero: error de captura. */
  FueraDeLugar: number;
  BecasDetail: string | null;
  /** Las mismas becas de BecasDetail, partidas por tipo de inscripción. */
  BecasNuevasDetail: string | null;
  BecasReinscDetail: string | null;
  /** Becados de cada tipo de inscripción por grupo; "sedes" se deduce restando. */
  BecadosNuevasKeepers: number;
  BecadosNuevasFutsal: number;
  BecadosNuevasClinicsFutsal: number;
  BecadosReinscKeepers: number;
  BecadosReinscFutsal: number;
  BecadosReinscClinicsFutsal: number;
}

/** Cuántos becados hay de cada porcentaje, ordenado de mayor a menor porcentaje. */
function becasPorPorcentaje(becasDetail: string | null): Array<[string, number]> {
  if (!becasDetail) return [];
  const counts: Record<string, number> = {};
  becasDetail.split(',').forEach(b => {
    const trimmed = b.trim();
    if (trimmed) {
      const pct = /^\d+$/.test(trimmed) ? `${trimmed}%` : trimmed;
      counts[pct] = (counts[pct] || 0) + 1;
    }
  });
  return Object.entries(counts).sort((a, b) => (parseInt(b[0]) || 0) - (parseInt(a[0]) || 0));
}

const textoBecas = (entradas: Array<[string, number]>) =>
  entradas.map(([porcentaje, cantidad]) => `${cantidad} de ${porcentaje}`).join(', ');

function formatBecasDetail(becasDetail: string | null): string {
  return textoBecas(becasPorPorcentaje(becasDetail));
}

/**
 * Junta el mismo desglose de becas de varias sedes en una sola cadena, para poder
 * formatearlo con formatBecasDetail. Cada sede devuelve su propio GROUP_CONCAT.
 */
function unirBecas(sedes: SedeSummary[], pick: (s: SedeSummary) => string | null): string | null {
  const partes = sedes.map(pick).filter((x): x is string => !!x && x.trim() !== '');
  return partes.length ? partes.join(',') : null;
}

interface Temporada {
  IdTemporada: number;
  Temporada: string;
  FechaInicio: string;
  EsActiva: boolean;
}

/**
 * Qué color le toca a cada nivel de beca.
 *
 * Se decide UNA vez con el desglose completo y se reutiliza en todas las donas (las
 * del KPI total y las de cada sede del modal). Si cada una eligiera sus niveles por
 * su cuenta, el color saldría de la posición en su propia lista y el mismo "Beca 50%"
 * podría verse claro en una y oscuro en otra.
 *
 * Solo se nombran los MAX_NIVELES niveles más numerosos, porque de un solo tono
 * únicamente se distinguen tres escalones; el resto comparte el color de "Otras becas".
 */
function coloresPorNivel(becasDetail: string | null): Map<string, string> {
  const niveles = becasPorPorcentaje(becasDetail);
  const masNumerosos = [...niveles].sort((a, b) => b[1] - a[1]).slice(0, MAX_NIVELES);
  // Ya elegidos por cantidad, la rampa se reparte de mayor a menor porcentaje de beca,
  // que es el orden que el color representa.
  const nombrados = niveles.filter((e) => masNumerosos.includes(e));
  return new Map(nombrados.map(([porcentaje], i) => [porcentaje, BECA_RAMPA[i]]));
}

/**
 * Arma las rebanadas de una dona: el resto sin beca más los niveles, agrupando en
 * "Otras becas" todo lo que no tenga color propio en el mapa.
 */
function rebanadasBecas(
  becasDetail: string | null, inscritos: number, colores: Map<string, string>,
): Rebanada[] {
  const niveles = becasPorPorcentaje(becasDetail);
  const totalBecados = niveles.reduce((s, [, n]) => s + n, 0);

  const nombrados = niveles.filter(([p]) => colores.has(p));
  const otras = totalBecados - nombrados.reduce((s, [, n]) => s + n, 0);

  return [
    { etiqueta: 'Sin beca', cantidad: Math.max(0, inscritos - totalBecados), color: SIN_BECA_COLOR },
    ...nombrados.map(([porcentaje, cantidad]) => ({
      etiqueta: `Beca ${porcentaje}`,
      cantidad,
      color: colores.get(porcentaje) as string,
    })),
    ...(otras > 0 ? [{ etiqueta: 'Otras becas', cantidad: otras, color: OTRAS_BECAS_COLOR }] : []),
  ];
}

/**
 * Arma un tipo de inscripción con su reparto y sus grupos.
 *
 * "Sedes" no viene de la base: se deduce restando keepers, futsal y clinics futsal
 * del total de becados, que es la misma aritmética con la que el KPI de arriba saca
 * los inscritos del grupo normal. Así las dos cifras no pueden discrepar.
 */
function grupoBecados(
  becasDetail: string | null,
  inscritos: number,
  colores: Map<string, string>,
  aparte: { keepers: number; futsal: number; clinicsFutsal: number },
): GrupoBecados {
  const rebanadas = rebanadasBecas(becasDetail, inscritos, colores);
  const total = rebanadas
    .filter((r) => r.etiqueta !== 'Sin beca')
    .reduce((s, r) => s + r.cantidad, 0);
  return {
    rebanadas,
    inscritos,
    sedes: Math.max(0, total - aparte.keepers - aparte.futsal - aparte.clinicsFutsal),
    keepers: aparte.keepers,
    futsal: aparte.futsal,
  };
}

/** Un tipo de inscripción (nuevas o reinscripciones) con su reparto y sus grupos. */
interface GrupoBecados {
  rebanadas: Rebanada[];
  inscritos: number;
  /** Becados del grupo normal: los que no son keeper, futsal ni clinics futsal. */
  sedes: number;
  keepers: number;
  futsal: number;
}

/**
 * Todas las cifras derivadas de un conjunto de sedes. Es la MISMA aritmética para el
 * KPI total (todas las sedes) y para cada tarjeta del modal (una sola sede), así que
 * el total y el desglose por sede no pueden discrepar.
 */
interface Agregados {
  activosSedes: number;
  activosKeepers: number;
  activosFutsal: number;
  activosClinicsFutsal: number;
  activosVentaPublico: number;
  activosClinics: number;
  inscritosSedes: number;
  inscritosKeepers: number;
  inscritosFutsal: number;
  inscritosClinicsFutsal: number;
  inscritosNormal: number;
  reinscritosSedes: number;
  reinscritosKeepers: number;
  reinscritosFutsal: number;
  reinscritosNormal: number;
  becasTotal: string | null;
  becasNuevas: string | null;
  becasReinsc: string | null;
  becadosNuevasKeepers: number;
  becadosNuevasFutsal: number;
  becadosNuevasClinicsFutsal: number;
  becadosReinscKeepers: number;
  becadosReinscFutsal: number;
  becadosReinscClinicsFutsal: number;
  plantillaElegible: number;
  plantillaKeepers: number;
  bajasNormal: number;
  bajasKeepers: number;
  bajasFutsal: number;
  bajasClinicsFutsal: number;
  sinInscripcion: number;
}

function calcularAgregados(lista: SedeSummary[]): Agregados {
  /* Plantilla activa separada por tipo de sede (clinics aparte). El avance de
     inscripción se mide solo sobre sedes normales: clinics no maneja inscripción,
     así que incluirlo hundiría el porcentaje sin significar nada. */
  const sumaPorTipo = (esClinics: number, pick: (s: SedeSummary) => number) =>
    lista.filter(s => (s.EsClinics || 0) === esClinics)
         .reduce((acc, s) => acc + (pick(s) || 0), 0);
  const sumTodos = (pick: (s: SedeSummary) => number) =>
    lista.reduce((acc, s) => acc + (pick(s) || 0), 0);

  // Plantilla no-clinics partida en normal / keepers / futsal / venta público / clinics futsal.
  const activosKeepers = sumaPorTipo(0, s => s.ActivosKeepers);
  const activosFutsal = sumaPorTipo(0, s => s.ActivosFutsal);
  const activosClinicsFutsal = sumTodos(s => s.ActivosClinicsFutsal);
  const activosVentaPublico = sumTodos(s => s.ActivosVentaPublico);
  /* Venta pública y clinics futsal son segmentos propios (sumTodos), así que cada uno
     se resta de la base de la que salió: lo de sedes normales sale de "Sedes" y lo de
     sedes de clinics sale de "Clinics". Restar los sumTodos completos de la base
     normal (la fórmula anterior) volvía negativo el segmento "Sedes" al reducir el
     cálculo a una sola sede de clinics, y contaba dos veces esos registros dentro de
     "Clinics". Con esto los seis segmentos son mutuamente excluyentes y su suma da el
     total, tanto en el KPI global como en la tarjeta de una sede del modal. */
  const activosSedes = sumaPorTipo(0, s => s.Activos) - activosKeepers - activosFutsal
    - sumaPorTipo(0, s => s.ActivosVentaPublico) - sumaPorTipo(0, s => s.ActivosClinicsFutsal);
  const activosClinics = sumaPorTipo(1, s => s.Activos)
    - sumaPorTipo(1, s => s.ActivosVentaPublico) - sumaPorTipo(1, s => s.ActivosClinicsFutsal);
  // Inscritos (keeper-aware, sin venta pública) separando keepers, futsal y clinics futsal.
  const inscritosSedes = sumaPorTipo(0, s => s.Inscritos);
  const inscritosKeepers = sumaPorTipo(0, s => s.InscritosKeepers);
  const inscritosFutsal = sumaPorTipo(0, s => s.InscritosFutsal);
  /* Los restandos se miden en el MISMO alcance que la base (sedes no-clinics). Con
     sumTodos se restaban clinics futsal de sedes de clinics, que la base nunca incluyó:
     al reducir el cálculo a una sola sede eso dejaba "Sedes" en negativo. */
  const inscritosClinicsFutsal = sumaPorTipo(0, s => s.InscritosClinicsFutsal);
  const inscritosNormal = inscritosSedes - inscritosKeepers - inscritosFutsal - inscritosClinicsFutsal;
  // Reinscritos por área (ya tenían inscripción antes); "nuevas" = inscritos - reinscritos.
  const reinscritosKeepers = sumaPorTipo(0, s => s.ReinscritosKeepers);
  const reinscritosFutsal = sumaPorTipo(0, s => s.ReinscritosFutsal);
  const reinscritosClinicsFutsal = sumaPorTipo(0, s => s.ReinscritosClinicsFutsal);
  const reinscritosSedes = sumaPorTipo(0, s => s.Reinscritos);
  const reinscritosNormal = reinscritosSedes - reinscritosKeepers - reinscritosFutsal - reinscritosClinicsFutsal;
  /* Becas del KPI: se juntan solo las de sedes normales, que es de donde salen las
     tres áreas de arriba. Incluir clinics metería becados que el KPI no está contando.
     El denominador del porcentaje es ese mismo universo (inscritosSedes), no el de un
     área suelta, para que becados y base cuenten a la misma gente. */
  const sedesNormales = lista.filter(s => (s.EsClinics || 0) === 0);
  const becasTotal = unirBecas(sedesNormales, s => s.BecasDetail);
  const becasNuevas = unirBecas(sedesNormales, s => s.BecasNuevasDetail);
  const becasReinsc = unirBecas(sedesNormales, s => s.BecasReinscDetail);
  // Becados por grupo, con el mismo alcance que las becas: solo sedes no-clinics.
  const becadosNuevasKeepers = sumaPorTipo(0, s => s.BecadosNuevasKeepers);
  const becadosNuevasFutsal = sumaPorTipo(0, s => s.BecadosNuevasFutsal);
  const becadosNuevasClinicsFutsal = sumaPorTipo(0, s => s.BecadosNuevasClinicsFutsal);
  const becadosReinscKeepers = sumaPorTipo(0, s => s.BecadosReinscKeepers);
  const becadosReinscFutsal = sumaPorTipo(0, s => s.BecadosReinscFutsal);
  const becadosReinscClinicsFutsal = sumaPorTipo(0, s => s.BecadosReinscClinicsFutsal);
  /* Base del avance de inscripción: la PLANTILLA elegible (no-clinics, sin venta
     pública ni clinics futsal), como antes de acotar "activos" a la temporada. Medir
     los inscritos contra los activos de la temporada no es un avance: alguien recién
     inscrito que aún no paga su primera mensualidad no cuenta como activo, y el
     cociente se pasaba de 100%. */
  const plantillaElegible = sumaPorTipo(0, s => s.Plantilla)
    - sumaPorTipo(0, s => s.PlantillaVentaPublico)
    - sumaPorTipo(0, s => s.PlantillaClinicsFutsal);
  const plantillaKeepers = sumaPorTipo(0, s => s.PlantillaKeepers);
  // Bajas separando keepers, futsal y clinics futsal.
  const bajasKeepers = sumTodos(s => s.BajasKeepers);
  const bajasFutsal = sumTodos(s => s.BajasFutsal);
  const bajasClinicsFutsal = sumTodos(s => s.BajasClinicsFutsal);
  const bajasNormal = sumTodos(s => s.Bajas) - bajasKeepers - bajasFutsal - bajasClinicsFutsal;

  return {
    activosSedes, activosKeepers, activosFutsal, activosClinicsFutsal, activosVentaPublico, activosClinics,
    inscritosSedes, inscritosKeepers, inscritosFutsal, inscritosClinicsFutsal, inscritosNormal,
    reinscritosSedes, reinscritosKeepers, reinscritosFutsal, reinscritosNormal,
    becasTotal, becasNuevas, becasReinsc,
    becadosNuevasKeepers, becadosNuevasFutsal, becadosNuevasClinicsFutsal,
    becadosReinscKeepers, becadosReinscFutsal, becadosReinscClinicsFutsal,
    plantillaElegible, plantillaKeepers,
    bajasNormal, bajasKeepers, bajasFutsal, bajasClinicsFutsal,
    sinInscripcion: sumTodos(s => s.SinInscripcion),
  };
}

/**
 * KPI de becados: la dona con el reparto y, al lado, la lista con número, barra y
 * porcentaje de cada rebanada.
 *
 * La lista no es decoración: en una dona los ángulos parecidos no se comparan bien,
 * así que el valor exacto va escrito y el color solo acompaña. También es lo que
 * mantiene legible el gráfico para quien no distingue los tonos.
 */
function BecadosKpi({
  rebanadas, inscritos, nuevas, reinsc, detalleCompleto, onRebanada, onNuevas, onReinsc, pie,
}: {
  rebanadas: Rebanada[];
  inscritos: number;
  /** Reparto de los inscritos NUEVOS, con los mismos colores que la dona grande. */
  nuevas: GrupoBecados;
  /** Reparto de los REINSCRITOS. */
  reinsc: GrupoBecados;
  detalleCompleto: string | null;
  onRebanada: (etiqueta: string) => void;
  onNuevas: () => void;
  onReinsc: () => void;
  pie?: React.ReactNode;
}) {
  const sumaBecados = (r: Rebanada[]) =>
    r.filter((x) => x.etiqueta !== 'Sin beca').reduce((s, x) => s + x.cantidad, 0);
  const becados = sumaBecados(rebanadas);
  const pct = (n: number, base = inscritos) => (base > 0 ? Math.round((n / base) * 100) : 0);

  /**
   * Dona chica de un subgrupo. No lleva leyenda propia: los colores significan lo
   * mismo que arriba, así que la de la dona grande sirve para las tres.
   */
  const subgrupo = (
    etiqueta: string, grupo: GrupoBecados, titulo: string, onClick: () => void,
  ) => {
    const becadosGrupo = sumaBecados(grupo.rebanadas);
    return (
      <button
        type="button"
        onClick={onClick}
        title={`${titulo}: ${becadosGrupo} becados de ${grupo.inscritos} (${pct(becadosGrupo, grupo.inscritos)}%)`}
        className="flex items-center gap-3 bg-white/5 hover:bg-white/10 border border-white/10 hover:border-purple-500/40 rounded-xl px-3 py-2.5 text-left transition-all"
      >
        <div className="relative flex-shrink-0">
          <BecasDonut rebanadas={grupo.rebanadas} total={grupo.inscritos} tamano={48} />
        </div>
        <div className="min-w-0">
          <p className="text-[10px] uppercase font-black text-slate-400 tracking-wider leading-none">{etiqueta}</p>
          <p className="text-2xl font-black text-purple-200 leading-tight tabular-nums">{becadosGrupo}</p>
          <p className="text-[10px] font-bold text-slate-500 leading-none">
            {pct(becadosGrupo, grupo.inscritos)}% de {grupo.inscritos}
          </p>
        </div>
      </button>
    );
  };

  /**
   * Los becados de cada tipo de inscripción, repartidos por grupo.
   *
   * Va como tabla de dos columnas y no como dos bloques aparte porque la pregunta
   * real es comparativa: si el futsal trae más beca al reinscribirse que al entrar,
   * eso solo se ve con las dos cifras en el mismo renglón.
   */
  const filaGrupo = (etiqueta: string, color: string, nuevo: number, reinscrito: number) => (
    <div className="flex items-center gap-2 px-1">
      <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
      <span className="text-[11px] font-bold text-slate-300 flex-1">{etiqueta}</span>
      <span className="text-xs font-black text-white tabular-nums w-10 text-right">{nuevo}</span>
      <span className="text-xs font-black text-white tabular-nums w-10 text-right">{reinscrito}</span>
    </div>
  );

  return (
    <div className="h-full bg-purple-500/10 border border-purple-500/20 rounded-2xl p-5 flex flex-col">
      <PanelHeader
        icono={<GraduationCap size={20} className="text-purple-300" />}
        iconoClase="bg-purple-500/20 border-purple-500/30"
        titulo="Becados"
        tituloClase="text-purple-300"
        subtitulo="Inscritos con algún nivel de beca"
        valor={becados}
        nota={`${pct(becados)}% de ${inscritos} inscritos`}
        notaClase="text-purple-300/80"
      />

      {/* Dona grande + leyenda con barras: el reparto por nivel de beca. */}
      <div className="flex items-center gap-5 mt-5">
        <div className="relative flex-shrink-0">
          <BecasDonut rebanadas={rebanadas} total={inscritos} tamano={132} />
          {/* El número vive en el hueco: es el dato que la dona está contando. */}
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
            <span className="text-2xl font-black text-purple-200 leading-none tabular-nums">{becados}</span>
            <span className="text-[10px] font-bold text-slate-400 leading-none mt-1">{pct(becados)}%</span>
          </div>
        </div>

        <div className="min-w-0 flex-1 space-y-1">
          {rebanadas.filter((r) => r.cantidad > 0).map((r) => (
            <button
              key={r.etiqueta}
              type="button"
              onClick={() => onRebanada(r.etiqueta)}
              title={r.etiqueta === 'Otras becas' && detalleCompleto
                ? `Otras becas · ${formatBecasDetail(detalleCompleto)}`
                : `${r.etiqueta}: ${r.cantidad} de ${inscritos} inscritos`}
              className="w-full flex items-center gap-2 text-left rounded-lg px-1.5 py-1 hover:bg-white/10 transition-colors"
            >
              <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ backgroundColor: r.color }} />
              <span className="text-[11px] font-bold text-slate-300 truncate w-20">{r.etiqueta}</span>
              <span className="flex-1 h-1.5 rounded-full bg-white/5 overflow-hidden">
                <span className="block h-full rounded-full" style={{ width: `${pct(r.cantidad)}%`, backgroundColor: r.color }} />
              </span>
              <span className="text-xs font-black text-white tabular-nums">{r.cantidad}</span>
              <span className="text-[10px] text-slate-500 tabular-nums w-8 text-right">{pct(r.cantidad)}%</span>
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 mt-4">
        {subgrupo('Nuevas', nuevas,
          'Becados cuya inscripción de esta temporada es su primera inscripción histórica', onNuevas)}
        {subgrupo('Reinsc.', reinsc,
          'Becados que ya tenían inscripción en una temporada anterior', onReinsc)}
      </div>

      <div className="mt-4 pt-3 border-t border-white/10 space-y-1.5 flex-1">
        <div className="flex items-center gap-2 px-1">
          <span className="text-[9px] uppercase font-black text-slate-500 tracking-wider flex-1">Becados por grupo</span>
          <span className="text-[9px] uppercase font-black text-slate-500 tracking-wider w-10 text-right">Nuev.</span>
          <span className="text-[9px] uppercase font-black text-slate-500 tracking-wider w-10 text-right">Reins.</span>
        </div>
        {filaGrupo('Sedes', GRUPO_COLOR.sedes, nuevas.sedes, reinsc.sedes)}
        {filaGrupo('Keepers', GRUPO_COLOR.keepers, nuevas.keepers, reinsc.keepers)}
        {filaGrupo('Futsal', GRUPO_COLOR.futsal, nuevas.futsal, reinsc.futsal)}
      </div>
      {pie}
    </div>
  );
}

/** Área de inscritos: cifra grande, reparto Nuevas/Reinscripciones con barra, y avance. */
function AreaInscritos({ label, color, total, nuevas, reinsc, pctDelTotal, barra, onTotal, onNuevas, onReinsc }: {
  label: string;
  color: string;
  total: number;
  nuevas: number;
  reinsc: number;
  /** Peso del área dentro del total del KPI (0-100). */
  pctDelTotal?: number;
  /** Avance del área contra su propia plantilla; solo algunas lo llevan. */
  barra?: { base: number; sufijo: string };
  onTotal: () => void;
  onNuevas: () => void;
  onReinsc: () => void;
}) {
  const den = nuevas + reinsc;
  const pct = (n: number) => (den > 0 ? Math.round((n / den) * 100) : 0);
  return (
    <div className="bg-white/5 border border-white/10 rounded-xl p-3.5 flex flex-col gap-2.5">
      <button type="button" onClick={onTotal} className="text-left group">
        <span className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
          <span className="text-[10px] uppercase font-black text-slate-400 tracking-wider group-hover:text-slate-200 transition-colors">{label}</span>
        </span>
        <span className="flex items-baseline gap-2 mt-1.5">
          <span className="text-3xl font-black text-white tabular-nums leading-none">{total}</span>
          {pctDelTotal !== undefined && <span className="text-[10px] font-bold text-slate-500 tabular-nums">{pctDelTotal}% del total</span>}
        </span>
      </button>
      {/* Reparto nuevas/reinscripciones: el pastel y las dos cifras cuentan lo mismo.
          El pastel da la proporción de un vistazo y los botones el valor exacto. */}
      <div className="flex items-center gap-2.5">
        <GraficaPastel
          tamano={46}
          unidad={`inscritos de ${label}`}
          total={den}
          rebanadas={[
            { etiqueta: 'Nuevas', cantidad: nuevas, color: NUEVAS_COLOR },
            { etiqueta: 'Reinscripciones', cantidad: reinsc, color: REINSC_COLOR },
          ]}
        />
        <div className="grid grid-cols-2 gap-1.5 flex-1 min-w-0">
          <button
            type="button"
            onClick={onNuevas}
            title={`Inscripciones nuevas de ${label}: es la primera inscripción histórica del jugador. ${nuevas} de ${den} (${pct(nuevas)}%).`}
            className="bg-emerald-500/10 hover:bg-emerald-500/25 border border-emerald-500/20 rounded-lg px-2 py-1 text-left transition-all overflow-hidden"
          >
            <p className="text-[9px] uppercase font-black text-emerald-300/80 tracking-wider leading-none">Nuevas</p>
            <p className="text-lg font-black text-emerald-300 leading-tight tabular-nums">{nuevas}</p>
          </button>
          <button
            type="button"
            onClick={onReinsc}
            title={`Reinscripciones de ${label}: el jugador ya tenía inscripción en una temporada anterior. ${reinsc} de ${den} (${pct(reinsc)}%).`}
            className="bg-amber-500/10 hover:bg-amber-500/25 border border-amber-500/20 rounded-lg px-2 py-1 text-left transition-all overflow-hidden"
          >
            <p className="text-[9px] uppercase font-black text-amber-300/80 tracking-wider leading-none">Reinsc.</p>
            <p className="text-lg font-black text-amber-300 leading-tight tabular-nums">{reinsc}</p>
          </button>
        </div>
      </div>
      {barra && (
        <Meter size="xs" valor={total} total={barra.base} etiqueta={`de ${barra.base} ${barra.sufijo}`} />
      )}
    </div>
  );
}

type Abrir = (cfg: PlayersModalConfig) => void;

/** Panel de Jugadores Activos: total, composición y un tile por grupo de plantilla. */
function TarjetaActivos({ a, abrir, verSedes }: { a: Agregados; abrir: Abrir; verSedes?: () => void }) {
  const partes: { label: string; valor: number; color: string; title?: string; cfg: PlayersModalConfig }[] = [
    { label: 'Sedes', valor: a.activosSedes, color: GRUPO_COLOR.sedes, cfg: { title: 'Jugadores Activos · Sedes', filtro: 'activos', clinics: 0, grupo: 'normal' } },
    { label: 'Keepers', valor: a.activosKeepers, color: GRUPO_COLOR.keepers, title: 'Keepers y porteros', cfg: { title: 'Jugadores Activos · Keepers/Porteros', filtro: 'activos', clinics: 0, grupo: 'keepers' } },
    { label: 'Futsal', valor: a.activosFutsal, color: GRUPO_COLOR.futsal, title: 'Sedes de futsal / categorías futsal (cuentan como sede normal)', cfg: { title: 'Jugadores Activos · Futsal', filtro: 'activos', clinics: 0, grupo: 'futsal' } },
    { label: 'Clinics F.', valor: a.activosClinicsFutsal, color: GRUPO_COLOR.clinicsFutsal, title: 'Clinics Futsal (sede futsal + categoría clinics)', cfg: { title: 'Jugadores Activos · Clinics Futsal', filtro: 'activos', grupo: 'clinicsfutsal' } },
    { label: 'Venta púb.', valor: a.activosVentaPublico, color: GRUPO_COLOR.ventaPublico, title: 'Registros de venta al público (no cuentan en el total de sedes)', cfg: { title: 'Jugadores Activos · Venta al Público', filtro: 'activos', grupo: 'ventapublico' } },
    { label: 'Clinics', valor: a.activosClinics, color: GRUPO_COLOR.clinics, cfg: { title: 'Jugadores Activos · Clinics', filtro: 'activos', clinics: 1 } },
  ];
  const total = partes.reduce((s, p) => s + p.valor, 0);
  const pctDe = (n: number) => (total > 0 ? Math.round((n / total) * 100) : 0);
  return (
    <div className="h-full bg-sky-500/10 border border-sky-500/20 rounded-2xl p-5 flex flex-col">
      <PanelHeader
        icono={<Users size={20} className="text-sky-400" />}
        iconoClase="bg-sky-500/20 border-sky-500/30"
        titulo="Jugadores Activos"
        tituloClase="text-sky-400"
        subtitulo="Pagaron al menos una mensualidad de la temporada"
        valor={total}
        nota="jugadores"
      />
      <BarraComposicion
        className="mt-4"
        partes={partes.map((p) => ({ etiqueta: p.label, cantidad: p.valor, color: p.color }))}
      />
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 mt-3 flex-1 content-start">
        {partes.map((p) => (
          <TileGrupo key={p.label} label={p.label} valor={p.valor} color={p.color} pct={pctDe(p.valor)} title={p.title} onClick={() => abrir(p.cfg)} />
        ))}
      </div>
      {verSedes && <VerSedesBtn onClick={verSedes} />}
    </div>
  );
}

/** Panel de Total Inscritos: la cifra protagonista, el avance y las tres áreas. */
function TarjetaInscritos({ a, abrir, verSedes }: { a: Agregados; abrir: Abrir; verSedes?: () => void }) {
  const total = a.inscritosSedes;
  const pctDe = (n: number) => (total > 0 ? Math.round((n / total) * 100) : 0);
  const avance = a.plantillaElegible > 0 ? Math.round((total / a.plantillaElegible) * 100) : 0;

  /* Las tres áreas alimentan a la vez el pastel de composición, su leyenda y las
     tarjetas de abajo. Al salir de una sola lista, las tres vistas no pueden discrepar. */
  const areas: {
    label: string; color: string; total: number; nuevas: number; reinsc: number;
    barra?: { base: number; sufijo: string };
    cfgTotal: PlayersModalConfig; cfgNuevas: PlayersModalConfig; cfgReinsc: PlayersModalConfig;
  }[] = [
    {
      label: 'Sedes', color: GRUPO_COLOR.sedes,
      total: a.inscritosNormal,
      nuevas: a.inscritosNormal - a.reinscritosNormal,
      reinsc: a.reinscritosNormal,
      cfgTotal: { title: 'Inscritos · Sedes', filtro: 'inscritos', clinics: 0, grupo: 'normal' },
      cfgNuevas: { title: 'Inscripciones Nuevas · Sedes', filtro: 'inscritos', clinics: 0, grupo: 'normal', tipoInscripcion: 'nueva' },
      cfgReinsc: { title: 'Reinscripciones · Sedes', filtro: 'inscritos', clinics: 0, grupo: 'normal', tipoInscripcion: 'reinscripcion' },
    },
    {
      label: 'Keepers', color: GRUPO_COLOR.keepers,
      total: a.inscritosKeepers,
      nuevas: a.inscritosKeepers - a.reinscritosKeepers,
      reinsc: a.reinscritosKeepers,
      barra: { base: a.plantillaKeepers, sufijo: 'keepers' },
      cfgTotal: { title: 'Inscritos · Keepers/Porteros', filtro: 'inscritos', clinics: 0, grupo: 'keepers' },
      cfgNuevas: { title: 'Inscripciones Nuevas · Keepers/Porteros', filtro: 'inscritos', clinics: 0, grupo: 'keepers', tipoInscripcion: 'nueva' },
      cfgReinsc: { title: 'Reinscripciones · Keepers/Porteros', filtro: 'inscritos', clinics: 0, grupo: 'keepers', tipoInscripcion: 'reinscripcion' },
    },
    {
      label: 'Futsal', color: GRUPO_COLOR.futsal,
      total: a.inscritosFutsal,
      nuevas: a.inscritosFutsal - a.reinscritosFutsal,
      reinsc: a.reinscritosFutsal,
      cfgTotal: { title: 'Inscritos · Futsal', filtro: 'inscritos', clinics: 0, grupo: 'futsal' },
      cfgNuevas: { title: 'Inscripciones Nuevas · Futsal', filtro: 'inscritos', clinics: 0, grupo: 'futsal', tipoInscripcion: 'nueva' },
      cfgReinsc: { title: 'Reinscripciones · Futsal', filtro: 'inscritos', clinics: 0, grupo: 'futsal', tipoInscripcion: 'reinscripcion' },
    },
  ];

  /* Rebanadas del pastel: las tres áreas más el resto que el panel no detalla (los
     clinics futsal, que quedan fuera del adeudo). Sin ese cuarto pedazo el pastel
     mostraría un hueco sin explicación, porque las tres áreas no suman el total. */
  const composicion: { label: string; color: string; total: number; cfg: PlayersModalConfig }[] = [
    ...areas.map((x) => ({ label: x.label, color: x.color, total: x.total, cfg: x.cfgTotal })),
    ...(a.inscritosClinicsFutsal > 0
      ? [{
          label: 'Clinics F.',
          color: GRUPO_COLOR.clinicsFutsal,
          total: a.inscritosClinicsFutsal,
          /* clinics: 0 no es opcional aquí: la cifra solo cuenta sedes no-clinics, así
             que sin él el listado abriría un universo más amplio que el que el pastel
             está repartiendo. Sus tres hermanas ya lo llevan. */
          cfg: { title: 'Inscritos · Clinics Futsal', filtro: 'inscritos' as const, clinics: 0 as const, grupo: 'clinicsfutsal' as const },
        }]
      : []),
  ];

  return (
    <div className="h-full bg-emerald-500/10 border border-emerald-500/20 rounded-2xl p-5 flex flex-col">
      <PanelHeader
        icono={<UserCheck size={20} className="text-emerald-400" />}
        iconoClase="bg-emerald-500/20 border-emerald-500/30"
        titulo="Total Inscritos"
        tituloClase="text-emerald-400"
        subtitulo="Pagaron la inscripción de la temporada · incluye becados"
        valor={total}
        nota={`${avance}% de la plantilla`}
        notaClase="text-emerald-300/80"
      />

      {/* Avance de inscripción sobre la plantilla elegible (normal + keepers + futsal). */}
      <div className="mt-4">
        <Meter
          valor={total}
          total={a.plantillaElegible}
          etiqueta={`${total} de ${a.plantillaElegible} en plantilla`}
        />
      </div>

      {/* Composición del total por área. Va en pastel y no en barra porque son tres
          segmentos y la pregunta es de reparto; el número exacto y el porcentaje van
          escritos al lado, que es donde se comparan los valores parecidos. */}
      <div className="flex items-center gap-4 mt-4">
        <GraficaPastel
          tamano={104}
          unidad="inscritos"
          total={total}
          rebanadas={composicion.map((x) => ({ etiqueta: x.label, cantidad: x.total, color: x.color }))}
        />
        <div className="min-w-0 flex-1 space-y-1">
          {composicion.map((x) => (
            <button
              key={x.label}
              type="button"
              onClick={() => abrir(x.cfg)}
              title={`${x.label}: ${x.total} de ${total} inscritos (${pctDe(x.total)}%). Clic para ver a los jugadores.`}
              className="w-full flex items-center gap-2 text-left rounded-lg px-1.5 py-1 hover:bg-white/10 transition-colors"
            >
              <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ backgroundColor: x.color }} />
              <span className="text-[11px] font-bold text-slate-300 truncate w-16">{x.label}</span>
              <span className="flex-1 h-1.5 rounded-full bg-white/5 overflow-hidden">
                <span className="block h-full rounded-full" style={{ width: `${pctDe(x.total)}%`, backgroundColor: x.color }} />
              </span>
              <span className="text-xs font-black text-white tabular-nums">{x.total}</span>
              <span className="text-[10px] text-slate-500 tabular-nums w-8 text-right">{pctDe(x.total)}%</span>
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-3 flex-1 content-start">
        {areas.map((x) => (
          <AreaInscritos
            key={x.label}
            label={x.label}
            color={x.color}
            total={x.total}
            nuevas={x.nuevas}
            reinsc={x.reinsc}
            pctDelTotal={pctDe(x.total)}
            barra={x.barra}
            onTotal={() => abrir(x.cfgTotal)}
            onNuevas={() => abrir(x.cfgNuevas)}
            onReinsc={() => abrir(x.cfgReinsc)}
          />
        ))}
      </div>
      {verSedes && <VerSedesBtn onClick={verSedes} />}
    </div>
  );
}

/** KPI de Becados armado desde los agregados, con los colores compartidos. */
function TarjetaBecados({ a, colores, abrir, verSedes }: {
  a: Agregados; colores: Map<string, string>; abrir: Abrir; verSedes?: () => void;
}) {
  return (
    <BecadosKpi
      rebanadas={rebanadasBecas(a.becasTotal, a.inscritosSedes, colores)}
      inscritos={a.inscritosSedes}
      nuevas={grupoBecados(a.becasNuevas, a.inscritosSedes - a.reinscritosSedes, colores, {
        keepers: a.becadosNuevasKeepers,
        futsal: a.becadosNuevasFutsal,
        clinicsFutsal: a.becadosNuevasClinicsFutsal,
      })}
      reinsc={grupoBecados(a.becasReinsc, a.reinscritosSedes, colores, {
        keepers: a.becadosReinscKeepers,
        futsal: a.becadosReinscFutsal,
        clinicsFutsal: a.becadosReinscClinicsFutsal,
      })}
      detalleCompleto={a.becasTotal}
      onRebanada={(etiqueta) => abrir({
        title: etiqueta === 'Sin beca' ? 'Inscritos sin beca' : `Becados · ${etiqueta}`,
        filtro: etiqueta === 'Sin beca' ? 'inscritos' : 'becados',
        clinics: 0,
      })}
      onNuevas={() => abrir({ title: 'Becados · Inscripciones Nuevas', filtro: 'becados', clinics: 0, tipoInscripcion: 'nueva' })}
      onReinsc={() => abrir({ title: 'Becados · Reinscripciones', filtro: 'becados', clinics: 0, tipoInscripcion: 'reinscripcion' })}
      pie={verSedes ? <VerSedesBtn onClick={verSedes} /> : undefined}
    />
  );
}

/** Panel de Total Bajas: total, composición y un tile por grupo. */
function TarjetaBajas({ a, abrir, verSedes }: { a: Agregados; abrir: Abrir; verSedes?: () => void }) {
  const partes: { label: string; valor: number; color: string; title?: string; cfg: PlayersModalConfig }[] = [
    { label: 'Sedes', valor: a.bajasNormal, color: GRUPO_COLOR.sedes, cfg: { title: 'Bajas · Sedes', filtro: 'bajas', grupo: 'normal' } },
    { label: 'Keepers', valor: a.bajasKeepers, color: GRUPO_COLOR.keepers, title: 'Keepers/porteros dados de baja', cfg: { title: 'Bajas · Keepers/Porteros', filtro: 'bajas', grupo: 'keepers' } },
    { label: 'Futsal', valor: a.bajasFutsal, color: GRUPO_COLOR.futsal, title: 'Futsal dados de baja', cfg: { title: 'Bajas · Futsal', filtro: 'bajas', grupo: 'futsal' } },
    { label: 'Clinics F.', valor: a.bajasClinicsFutsal, color: GRUPO_COLOR.clinicsFutsal, title: 'Clinics Futsal dados de baja', cfg: { title: 'Bajas · Clinics Futsal', filtro: 'bajas', grupo: 'clinicsfutsal' } },
  ];
  const total = partes.reduce((s, p) => s + p.valor, 0);
  const pctDe = (n: number) => (total > 0 ? Math.round((n / total) * 100) : 0);
  return (
    <div className="h-full bg-rose-500/10 border border-rose-500/20 rounded-2xl p-5 flex flex-col">
      <PanelHeader
        icono={<Users size={20} className="text-rose-400" />}
        iconoClase="bg-rose-500/20 border-rose-500/30"
        titulo="Total Bajas"
        tituloClase="text-rose-400"
        subtitulo="Jugadores dados de baja en la temporada"
        valor={total}
        nota="jugadores"
      />
      <BarraComposicion
        className="mt-4"
        partes={partes.map((p) => ({ etiqueta: p.label, cantidad: p.valor, color: p.color }))}
      />
      <div className="grid grid-cols-2 gap-2.5 mt-3 flex-1 content-start">
        {partes.map((p) => (
          <TileGrupo key={p.label} label={p.label} valor={p.valor} color={p.color} pct={pctDe(p.valor)} title={p.title} onClick={() => abrir(p.cfg)} />
        ))}
      </div>
      {verSedes && <VerSedesBtn onClick={verSedes} />}
    </div>
  );
}

/** Panel de Con Pagos sin Inscripción: la alerta operativa de la página. */
function TarjetaSinInscripcion({ a, abrir, verSedes }: { a: Agregados; abrir: Abrir; verSedes?: () => void }) {
  return (
    <div className="h-full bg-amber-500/10 border border-amber-500/25 rounded-2xl p-5 flex flex-col">
      <button
        type="button"
        onClick={() => abrir({ title: 'Con Pagos sin Inscripción', filtro: 'sin-inscripcion' })}
        title="Pagaron mensualidad de los meses de la temporada pero no la inscripción"
        className="flex-1 text-left group"
      >
        <div className="flex items-center gap-3">
          <div className="bg-amber-500/20 border border-amber-500/30 p-2.5 rounded-xl flex-shrink-0">
            <AlertTriangle size={20} className="text-amber-400" />
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-widest text-amber-400 font-black">Sin Inscripción</p>
            <p className="text-xs text-slate-400 leading-snug">Pagaron mensualidad pero no la inscripción</p>
          </div>
        </div>
        <p className="text-5xl font-black text-amber-300 tabular-nums leading-none mt-5 group-hover:text-amber-200 transition-colors">{a.sinInscripcion}</p>
        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mt-1.5">jugadores por regularizar</p>
      </button>
      {verSedes && <VerSedesBtn onClick={verSedes} />}
    </div>
  );
}

/** KPIs que saben desglosarse por sede en el modal. */
type KpiClave = 'activos' | 'inscritos' | 'becados' | 'bajas' | 'sin-inscripcion';

/* Inscritos y Becados solo cuentan sedes normales (igual que sus KPIs), así que las
   sedes de clinics no entran en esos desgloses: su tarjeta saldría vacía. Las demás
   sedes se listan TODAS, incluso en cero (atenuadas): son la única puerta que queda
   hacia "Ver Categorías" de una sede que apenas arranca la temporada. */
const KPI_INFO: Record<KpiClave, { titulo: string; medida: (s: SedeSummary) => number; incluye: (s: SedeSummary) => boolean }> = {
  activos: { titulo: 'Jugadores Activos', medida: (s) => s.Activos || 0, incluye: () => true },
  inscritos: { titulo: 'Total Inscritos', medida: (s) => s.Inscritos || 0, incluye: (s) => (s.EsClinics || 0) === 0 },
  becados: { titulo: 'Becados', medida: (s) => (s.BecasDetail ? s.BecasDetail.split(',').filter(Boolean).length : 0), incluye: (s) => (s.EsClinics || 0) === 0 },
  bajas: { titulo: 'Total Bajas', medida: (s) => s.Bajas || 0, incluye: () => true },
  'sin-inscripcion': { titulo: 'Sin Inscripción', medida: (s) => s.SinInscripcion || 0, incluye: () => true },
};

export default function InscripcionesSedesPage() {
  const router = useRouter();
  const { user, isInitialized } = useUser();
  const [sedes, setSedes] = useState<SedeSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [temporadas, setTemporadas] = useState<Temporada[]>([]);
  const [temporadaId, setTemporadaId] = useState<number | null>(null);
  const [modal, setModal] = useState<PlayersModalConfig | null>(null);
  // KPI abierto en el modal de desglose por sedes (null = cerrado).
  const [detalleKpi, setDetalleKpi] = useState<KpiClave | null>(null);

  // Check if user is logged in
  useEffect(() => {
    if (isInitialized && !user) {
      router.push('/login');
    }
  }, [user, isInitialized, router]);

  // silent: refresco en segundo plano (tras editar un pago desde el modal) sin
  // mostrar los skeletons detrás de la ventana abierta.
  const fetchSedes = async (temporada: number | null, silent = false) => {
    if (!silent) setIsLoading(true);
    try {
      const qs = temporada ? `?temporadaId=${temporada}` : '';
      // no-store: evita que el navegador sirva una respuesta previa sin los campos nuevos.
      const response = await fetch(`/api/inscripciones/sedes${qs}`, { cache: 'no-store' });
      const data = await response.json();
      if (data.success) {
        setSedes(data.data);
      } else {
        console.error('Error fetching sedes:', data.message);
      }
    } catch (error) {
      console.error('Error fetching sedes:', error);
    } finally {
      if (!silent) setIsLoading(false);
    }
  };

  // Carga las temporadas y arranca en la temporada activa (default).
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
      fetchSedes(temporadaId);
    }
  }, [isInitialized, user, temporadaId]);

  const temporadaNombre = temporadas.find(t => t.IdTemporada === temporadaId)?.Temporada;
  /* En la temporada en curso el área de "Jugadores Activos" se oculta: apenas van uno o
     dos meses cobrados, así que el número queda muy por debajo de la plantilla y se
     presta a leerse como una caída. Se usa la marca EsActiva de la base y no "la más
     reciente por fecha", porque cuál es la temporada en curso lo decide ese campo. */
  const esTemporadaActiva = temporadas.some(t => t.IdTemporada === temporadaId && t.EsActiva);

  const totales = calcularAgregados(sedes);
  /* Los colores salen del desglose COMPLETO y se comparten con las donas de cada
     sede del modal, para que un mismo nivel de beca se vea igual en todas. */
  const coloresBeca = coloresPorNivel(totales.becasTotal);
  const fueraDeLugar = sedes.filter(s => (s.FueraDeLugar || 0) > 0);

  const categoriaHref = (sede: SedeSummary) =>
    `/inscripciones/${sede.IdSede}${temporadaId ? `?temporada=${temporadaId}` : ''}`;

  const abrirGlobal: Abrir = (cfg) => setModal({ subtitle: temporadaNombre, ...cfg });
  /* El mismo corte, pero acotado a una sede: es lo que abren las tarjetas del modal
     de desglose. El PlayersModal (z-150) se pinta ENCIMA del desglose (z-120), así
     que al cerrarlo se regresa al desglose sin perderlo. */
  const abrirSede = (sede: SedeSummary): Abrir => (cfg) => setModal({
    subtitle: [sede.Sede, temporadaNombre].filter(Boolean).join(' · '),
    sedeId: sede.IdSede,
    /* La vista por categorías se arma con los inscritos, así que la liga no
       corresponde para el corte de "sin inscripción". */
    categoriaHref: cfg.filtro === 'sin-inscripcion' ? undefined : categoriaHref(sede),
    ...cfg,
  });

  /** La tarjeta del KPI pedido, con los agregados que se le den (total o una sede). */
  const tarjetaDe = (kpi: KpiClave, a: Agregados, abrir: Abrir, verSedes?: () => void) => {
    switch (kpi) {
      case 'activos': return <TarjetaActivos a={a} abrir={abrir} verSedes={verSedes} />;
      case 'inscritos': return <TarjetaInscritos a={a} abrir={abrir} verSedes={verSedes} />;
      case 'becados': return <TarjetaBecados a={a} colores={coloresBeca} abrir={abrir} verSedes={verSedes} />;
      case 'bajas': return <TarjetaBajas a={a} abrir={abrir} verSedes={verSedes} />;
      case 'sin-inscripcion': return <TarjetaSinInscripcion a={a} abrir={abrir} verSedes={verSedes} />;
    }
  };

  // Sedes del modal: todas las elegibles, de mayor a menor; las que están en cero
  // se pintan atenuadas al final en vez de ocultarse.
  const sedesDetalle = detalleKpi
    ? sedes
        .filter(KPI_INFO[detalleKpi].incluye)
        .sort((a, b) => KPI_INFO[detalleKpi].medida(b) - KPI_INFO[detalleKpi].medida(a))
    : [];

  return (
    <DashboardLayout>
      <main className="overflow-y-auto flex-1 text-white p-6 md:p-8 relative">
        <div className="w-full">

          <div className="mb-8 flex flex-col md:flex-row md:items-end md:justify-between gap-5">
            <div>
              <h1 className="text-3xl font-black text-white mb-2">Inscripciones</h1>
              <p className="text-slate-400">Indicadores totales de la temporada · el desglose por campus vive en «Ver detalle por sedes»</p>
            </div>
            <div>
              <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Temporada</label>
              <div className="relative">
                <CalendarRange size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-blue-400 pointer-events-none" />
                <select
                  value={temporadaId ?? ''}
                  onChange={(e) => setTemporadaId(e.target.value ? Number(e.target.value) : null)}
                  /* [color-scheme:dark] hace que el desplegable nativo se pinte oscuro;
                     sin él las opciones salen en blanco sobre blanco. */
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

          {/* ── KPIs a pantalla completa (el desglose por sede se abre desde cada panel) ── */}
          {isLoading ? (
            <div className="space-y-5">
              <div className="grid grid-cols-1 xl:grid-cols-12 gap-5">
                <div className="xl:col-span-7 h-96 bg-white/5 rounded-2xl animate-pulse border border-white/10" />
                <div className="xl:col-span-5 h-96 bg-white/5 rounded-2xl animate-pulse border border-white/10" />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-12 gap-5">
                <div className="md:col-span-2 xl:col-span-5 h-72 bg-white/5 rounded-2xl animate-pulse border border-white/10" />
                <div className="xl:col-span-4 h-72 bg-white/5 rounded-2xl animate-pulse border border-white/10" />
                <div className="xl:col-span-3 h-72 bg-white/5 rounded-2xl animate-pulse border border-white/10" />
              </div>
            </div>
          ) : (
            <div className="space-y-5">
              {/* Fila protagonista: inscritos (la pregunta principal) y su reparto de becas. */}
              <div className="grid grid-cols-1 xl:grid-cols-12 gap-5">
                <div className="xl:col-span-7">
                  <TarjetaInscritos a={totales} abrir={abrirGlobal} verSedes={() => setDetalleKpi('inscritos')} />
                </div>
                <div className="xl:col-span-5">
                  <TarjetaBecados a={totales} colores={coloresBeca} abrir={abrirGlobal} verSedes={() => setDetalleKpi('becados')} />
                </div>
              </div>
              {/* Segunda fila: plantilla activa, bajas y la alerta de sin inscripción.
                  "Activos" se oculta en la temporada en curso (ver `esTemporadaActiva`)
                  y las otras dos tarjetas se ensanchan para ocupar su lugar. */}
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-12 gap-5">
                {!esTemporadaActiva && (
                  <div className="md:col-span-2 xl:col-span-5">
                    <TarjetaActivos a={totales} abrir={abrirGlobal} verSedes={() => setDetalleKpi('activos')} />
                  </div>
                )}
                <div className={esTemporadaActiva ? 'xl:col-span-7' : 'xl:col-span-4'}>
                  <TarjetaBajas a={totales} abrir={abrirGlobal} verSedes={() => setDetalleKpi('bajas')} />
                </div>
                <div className={esTemporadaActiva ? 'xl:col-span-5' : 'xl:col-span-3'}>
                  <TarjetaSinInscripcion a={totales} abrir={abrirGlobal} verSedes={() => setDetalleKpi('sin-inscripcion')} />
                </div>
              </div>
            </div>
          )}

          {/* Solo aparece si hay algo mal capturado: una sede de keepers no debería
              tener a nadie que no sea portero. Estos quedan fuera de los conteos de
              arriba, así que sin este aviso serían invisibles. */}
          {!isLoading && fueraDeLugar.length > 0 && (
            <div className="mt-6 bg-red-500/10 border border-red-500/40 rounded-2xl px-4 py-3">
              <p className="text-xs text-red-300 font-black uppercase tracking-wider flex items-center gap-2 mb-2">
                <AlertTriangle size={14} className="text-red-400" />
                No son porteros
              </p>
              <p className="text-[11px] text-slate-400 mb-2">
                Dados de alta en una sede de keepers con categoría que no es de portero. No se cuentan en ningún indicador.
              </p>
              <div className="flex flex-wrap gap-2">
                {fueraDeLugar.map((s) => (
                  <button
                    key={s.IdSede}
                    type="button"
                    onClick={() => setModal({
                      title: 'No son porteros',
                      subtitle: [s.Sede, temporadaNombre].filter(Boolean).join(' · '),
                      filtro: 'fuera-de-lugar',
                      sedeId: s.IdSede,
                      categoriaHref: categoriaHref(s),
                    })}
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
                    <h3 className="text-lg font-black text-white">{KPI_INFO[detalleKpi].titulo} · Detalle por sedes</h3>
                    <p className="text-xs text-slate-400">{temporadaNombre}</p>
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
                      <div
                        key={sede.IdSede}
                        className={`bg-white/5 border border-white/10 rounded-2xl p-4 ${
                          KPI_INFO[detalleKpi].medida(sede) === 0 ? 'opacity-50 hover:opacity-100 transition-opacity' : ''
                        }`}
                      >
                        <div className="flex items-center justify-between gap-3 mb-3">
                          <div className="flex items-center gap-2.5 min-w-0">
                            <div className="bg-blue-500/10 text-blue-400 p-2 rounded-xl border border-blue-500/10 flex-shrink-0">
                              <MapPin size={15} />
                            </div>
                            <h4 className="text-sm font-black text-white truncate">{sede.Sede}</h4>
                            {(sede.EsClinics || 0) === 1 && (
                              <span className="text-[9px] font-black uppercase tracking-widest text-sky-300 bg-sky-500/10 border border-sky-500/25 px-2 py-0.5 rounded-md flex-shrink-0">Clinics</span>
                            )}
                          </div>
                          <Link
                            href={categoriaHref(sede)}
                            className="flex items-center gap-1 text-blue-400 hover:text-blue-300 transition-colors flex-shrink-0"
                          >
                            <span className="text-[9px] font-black uppercase tracking-widest">Ver Categorías</span>
                            <ChevronRight size={13} />
                          </Link>
                        </div>
                        {tarjetaDe(detalleKpi, calcularAgregados([sede]), abrirSede(sede))}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Footer */}
              <div className="p-4 bg-white/5 border-t border-white/5 flex justify-between items-center text-[11px] text-slate-500 px-6">
                <p>{sedesDetalle.length} sede(s) · clic en cualquier cifra para ver a los jugadores</p>
                <p>Las sedes sin registros de este indicador aparecen atenuadas al final</p>
              </div>
            </div>
          </div>
        )}

        <PlayersModal
          config={modal}
          temporadaId={temporadaId}
          temporadaNombre={temporadaNombre}
          onClose={() => setModal(null)}
          onDataChanged={() => fetchSedes(temporadaId, true)}
        />
      </main>
    </DashboardLayout>
  );
}
