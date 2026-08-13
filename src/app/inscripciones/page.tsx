"use client";
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Search, MapPin, ChevronRight, ChevronDown, UserCheck, Users, CalendarRange, AlertTriangle, GraduationCap } from 'lucide-react';
import { useUser } from '@/contexts/user-context';
import DashboardLayout from '@/components/DashboardLayout';
import PlayersModal, { type PlayersModalConfig } from '@/components/PlayersModal';
import Meter from '@/components/Meter';
import BecasDonut, {
  SIN_BECA_COLOR, BECA_RAMPA, OTRAS_BECAS_COLOR, MAX_NIVELES, type Rebanada,
} from '@/components/BecasDonut';

interface SedeSummary {
  IdSede: number;
  Sede: string;
  /** 1 = sede de clinics. */
  EsClinics: number;
  /** Plantilla completa (Status 0), sin acotar a la temporada. */
  Activos: number;
  ActivosKeepers: number;
  ActivosFutsal: number;
  ActivosClinicsFutsal: number;
  ActivosVentaPublico: number;
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
 * Id de la temporada más reciente: la de FechaInicio mayor, con IdTemporada como
 * desempate. Se resuelve por fecha y no por id a secas porque los ids no
 * necesariamente van en orden cronológico.
 */
function idUltimaTemporada(temporadas: Temporada[]): number | null {
  let ultima: Temporada | null = null;
  for (const t of temporadas) {
    if (!ultima) { ultima = t; continue; }
    const fecha = new Date(t.FechaInicio).getTime();
    const fechaUltima = new Date(ultima.FechaInicio).getTime();
    if (fecha > fechaUltima || (fecha === fechaUltima && t.IdTemporada > ultima.IdTemporada)) {
      ultima = t;
    }
  }
  return ultima ? ultima.IdTemporada : null;
}

/**
 * Qué color le toca a cada nivel de beca.
 *
 * Se decide UNA vez con el desglose completo y se reutiliza en las tres donas. Si
 * cada una eligiera sus niveles por su cuenta, el color saldría de la posición en su
 * propia lista y el mismo "Beca 50%" podría verse claro en una y oscuro en otra.
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
 * KPI de becados: la dona con el reparto y, al lado, la lista con número y
 * porcentaje de cada rebanada.
 *
 * La lista no es decoración: en una dona los ángulos parecidos no se comparan bien,
 * así que el valor exacto va escrito y el color solo acompaña. También es lo que
 * mantiene legible el gráfico para quien no distingue los tonos.
 */
function BecadosKpi({
  rebanadas, inscritos, nuevas, reinsc, detalleCompleto, onRebanada, onNuevas, onReinsc,
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
        className="flex items-center gap-2 bg-white/5 hover:bg-white/15 border border-white/10 rounded px-1.5 py-1 text-left transition-all"
      >
        <div className="relative flex-shrink-0">
          <BecasDonut rebanadas={grupo.rebanadas} total={grupo.inscritos} tamano={38} />
        </div>
        <div className="min-w-0">
          <p className="text-[7px] uppercase font-black text-slate-400 tracking-wider leading-none">{etiqueta}</p>
          <p className="text-sm font-black text-purple-200 leading-tight">{becadosGrupo}</p>
          <p className="text-[7px] font-bold text-slate-500 leading-none">
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
  const filaGrupo = (etiqueta: string, tono: string, nuevo: number, reinscrito: number) => (
    <div className="flex items-center gap-2 px-1">
      <span className={`text-[9px] font-bold flex-1 ${tono}`}>{etiqueta}</span>
      <span className="text-[9px] font-black text-white tabular-nums w-8 text-right">{nuevo}</span>
      <span className="text-[9px] font-black text-white tabular-nums w-8 text-right">{reinscrito}</span>
    </div>
  );

  return (
    <div className="flex-1 md:flex-none bg-purple-500/10 border border-purple-500/20 px-4 py-2 rounded-xl min-w-[260px]">
      <div className="flex items-center gap-2 mb-1.5">
        <div className="bg-purple-500/20 p-1.5 rounded-lg">
          <GraduationCap size={16} className="text-purple-300" />
        </div>
        <p className="text-[10px] uppercase tracking-wider text-purple-300 font-bold">Becados</p>
        <span className="text-[9px] text-slate-500 italic">sobre inscritos</span>
      </div>

      <div className="flex items-center gap-3">
        <div className="relative flex-shrink-0">
          <BecasDonut rebanadas={rebanadas} total={inscritos} tamano={84} />
          {/* El número vive en el hueco: es el dato que la dona está contando. */}
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
            <span className="text-base font-black text-purple-200 leading-none">{becados}</span>
            <span className="text-[8px] font-bold text-slate-400 leading-none mt-0.5">{pct(becados)}%</span>
          </div>
        </div>

        <div className="min-w-0 flex-1 space-y-0.5">
          {rebanadas.filter((r) => r.cantidad > 0).map((r) => (
            <button
              key={r.etiqueta}
              type="button"
              onClick={() => onRebanada(r.etiqueta)}
              title={r.etiqueta === 'Otras becas' && detalleCompleto
                ? `Otras becas · ${formatBecasDetail(detalleCompleto)}`
                : `${r.etiqueta}: ${r.cantidad} de ${inscritos} inscritos`}
              className="w-full flex items-center gap-1.5 text-left rounded px-1 py-0.5 hover:bg-white/10 transition-colors"
            >
              <span className="w-2 h-2 rounded-sm flex-shrink-0" style={{ backgroundColor: r.color }} />
              <span className="text-[9px] font-bold text-slate-300 truncate flex-1">{r.etiqueta}</span>
              <span className="text-[9px] font-black text-white tabular-nums">{r.cantidad}</span>
              <span className="text-[9px] text-slate-500 tabular-nums w-7 text-right">{pct(r.cantidad)}%</span>
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-1 mt-2 pt-2 border-t border-white/10">
        {subgrupo('Nuevas', nuevas,
          'Becados cuya inscripción de esta temporada es su primera inscripción histórica', onNuevas)}
        {subgrupo('Reinsc.', reinsc,
          'Becados que ya tenían inscripción en una temporada anterior', onReinsc)}
      </div>

      <div className="mt-1.5 pt-1.5 border-t border-white/5 space-y-0.5">
        <div className="flex items-center gap-2 px-1">
          <span className="text-[7px] uppercase font-black text-slate-500 tracking-wider flex-1">Becados por grupo</span>
          <span className="text-[7px] uppercase font-black text-slate-500 tracking-wider w-8 text-right">Nuev.</span>
          <span className="text-[7px] uppercase font-black text-slate-500 tracking-wider w-8 text-right">Reins.</span>
        </div>
        {filaGrupo('Sedes', 'text-emerald-300', nuevas.sedes, reinsc.sedes)}
        {filaGrupo('Keepers', 'text-cyan-300', nuevas.keepers, reinsc.keepers)}
        {filaGrupo('Futsal', 'text-fuchsia-300', nuevas.futsal, reinsc.futsal)}
      </div>
    </div>
  );
}

/** Celda de un área de inscritos con el total y su desglose Nuevas / Reinscripciones. */
function AreaInscritos({ label, tone, total, nuevas, reinsc, onTotal, onNuevas, onReinsc }: {
  label: string;
  tone: string;
  total: number;
  nuevas: number;
  reinsc: number;
  onTotal: () => void;
  onNuevas: () => void;
  onReinsc: () => void;
}) {
  return (
    <div className="bg-white/5 border border-white/10 rounded-lg px-2 py-1">
      <button type="button" onClick={onTotal} className="w-full text-left hover:opacity-80 transition-opacity">
        <p className="text-[8px] uppercase font-black text-slate-400 tracking-wider">{label}</p>
        <p className={`text-lg font-black ${tone}`}>{total}</p>
      </button>
      <div className="grid grid-cols-2 gap-1 mt-1">
        <button
          type="button"
          onClick={onNuevas}
          title="Inscripciones nuevas: es la primera inscripción histórica del jugador"
          className="bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/20 rounded px-1.5 py-0.5 text-left transition-all"
        >
          <p className="text-[7px] uppercase font-black text-emerald-300/80 tracking-wider leading-none">Nuevas</p>
          <p className="text-sm font-black text-emerald-300 leading-tight">{nuevas}</p>
        </button>
        <button
          type="button"
          onClick={onReinsc}
          title="Reinscripciones: el jugador ya tenía inscripción en una temporada anterior"
          className="bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/20 rounded px-1.5 py-0.5 text-left transition-all"
        >
          <p className="text-[7px] uppercase font-black text-amber-300/80 tracking-wider leading-none">Reinsc.</p>
          <p className="text-sm font-black text-amber-300 leading-tight">{reinsc}</p>
        </button>
      </div>
    </div>
  );
}

export default function InscripcionesSedesPage() {
  const router = useRouter();
  const { user, isInitialized } = useUser();
  const [sedes, setSedes] = useState<SedeSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [temporadas, setTemporadas] = useState<Temporada[]>([]);
  const [temporadaId, setTemporadaId] = useState<number | null>(null);
  const [modal, setModal] = useState<PlayersModalConfig | null>(null);

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

  const filteredSedes = sedes.filter(sede => 
    sede.Sede.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const sedesWithInscritos = filteredSedes.filter(sede => sede.Inscritos > 0);
  const sedesWithoutInscritos = filteredSedes.filter(sede => sede.Inscritos === 0);

  const temporadaNombre = temporadas.find(t => t.IdTemporada === temporadaId)?.Temporada;

  /* En la última temporada la inscripción apenas va en curso y la plantilla activa
     todavía corresponde a la temporada previa, así que el área de "Jugadores Activos"
     se oculta (en el total y en cada sede) para no leerse como referencia de ésta. */
  const ocultarActivos = temporadaId !== null && temporadaId === idUltimaTemporada(temporadas);

  /* Plantilla activa separada por tipo de sede (clinics aparte). El avance de
     inscripción se mide solo sobre sedes normales: clinics no maneja inscripción,
     así que incluirlo hundiría el porcentaje sin significar nada. */
  const sumaPorTipo = (esClinics: number, pick: (s: SedeSummary) => number) =>
    sedes.filter(s => (s.EsClinics || 0) === esClinics)
         .reduce((acc, s) => acc + (pick(s) || 0), 0);
  const sumTodos = (pick: (s: SedeSummary) => number) =>
    sedes.reduce((acc, s) => acc + (pick(s) || 0), 0);

  // Plantilla no-clinics partida en normal / keepers / futsal / venta público / clinics futsal.
  const activosKeepers = sumaPorTipo(0, s => s.ActivosKeepers);
  const activosFutsal = sumaPorTipo(0, s => s.ActivosFutsal);
  const activosClinicsFutsal = sumTodos(s => s.ActivosClinicsFutsal);
  const activosVentaPublico = sumTodos(s => s.ActivosVentaPublico);
  const activosSedes = sumaPorTipo(0, s => s.Activos) - activosKeepers - activosFutsal - activosVentaPublico - activosClinicsFutsal;
  const activosClinics = sumaPorTipo(1, s => s.Activos);
  // Inscritos (keeper-aware, sin venta pública) separando keepers, futsal y clinics futsal.
  const inscritosSedes = sumaPorTipo(0, s => s.Inscritos);
  const inscritosKeepers = sumaPorTipo(0, s => s.InscritosKeepers);
  const inscritosFutsal = sumaPorTipo(0, s => s.InscritosFutsal);
  const inscritosClinicsFutsal = sumTodos(s => s.InscritosClinicsFutsal);
  const inscritosNormal = inscritosSedes - inscritosKeepers - inscritosFutsal - inscritosClinicsFutsal;
  // Reinscritos por área (ya tenían inscripción antes); "nuevas" = inscritos - reinscritos.
  const reinscritosKeepers = sumaPorTipo(0, s => s.ReinscritosKeepers);
  const reinscritosFutsal = sumaPorTipo(0, s => s.ReinscritosFutsal);
  const reinscritosClinicsFutsal = sumTodos(s => s.ReinscritosClinicsFutsal);
  const reinscritosSedes = sumaPorTipo(0, s => s.Reinscritos);
  const reinscritosNormal = reinscritosSedes - reinscritosKeepers - reinscritosFutsal - reinscritosClinicsFutsal;
  /* Becas del KPI: se juntan solo las de sedes normales, que es de donde salen las
     tres áreas de arriba. Incluir clinics metería becados que el KPI no está contando.
     El denominador del porcentaje es ese mismo universo (inscritosSedes), no el de un
     área suelta, para que becados y base cuenten a la misma gente. */
  const sedesNormales = sedes.filter(s => (s.EsClinics || 0) === 0);
  const becasTotal = unirBecas(sedesNormales, s => s.BecasDetail);
  const becasNuevas = unirBecas(sedesNormales, s => s.BecasNuevasDetail);
  const becasReinsc = unirBecas(sedesNormales, s => s.BecasReinscDetail);
  /* Los colores salen del desglose COMPLETO y se pasan a las tres donas, para que un
     mismo nivel de beca se vea igual en todas. */
  const coloresBeca = coloresPorNivel(becasTotal);
  // Becados por grupo, con el mismo alcance que las becas: solo sedes no-clinics.
  const becadosNuevasKeepers = sumaPorTipo(0, s => s.BecadosNuevasKeepers);
  const becadosNuevasFutsal = sumaPorTipo(0, s => s.BecadosNuevasFutsal);
  const becadosNuevasClinicsFutsal = sumaPorTipo(0, s => s.BecadosNuevasClinicsFutsal);
  const becadosReinscKeepers = sumaPorTipo(0, s => s.BecadosReinscKeepers);
  const becadosReinscFutsal = sumaPorTipo(0, s => s.BecadosReinscFutsal);
  const becadosReinscClinicsFutsal = sumaPorTipo(0, s => s.BecadosReinscClinicsFutsal);
  // Base del avance: plantilla elegible (no-clinics, sin venta pública) = normal + keepers + futsal.
  const activosElegibles = activosSedes + activosKeepers + activosFutsal;
  // Bajas separando keepers, futsal y clinics futsal.
  const bajasKeepers = sumTodos(s => s.BajasKeepers);
  const bajasFutsal = sumTodos(s => s.BajasFutsal);
  const bajasClinicsFutsal = sumTodos(s => s.BajasClinicsFutsal);
  const bajasTotal = sumTodos(s => s.Bajas);
  const bajasNormal = bajasTotal - bajasKeepers - bajasFutsal - bajasClinicsFutsal;

  return (
    <DashboardLayout>
      <main className="overflow-y-auto flex-1 text-white p-6 md:p-8 relative">
        <div className="max-w-7xl mx-auto">
          
          <div className="mb-12 flex flex-col md:flex-row md:items-end md:justify-between gap-5">
            <div>
              <h1 className="text-3xl font-black text-white mb-2">Inscripciones por Sede</h1>
              <p className="text-slate-400">Monitoreo de jugadores inscritos segmentado por campus</p>
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

          {/* Search and Stats Section */}
          <div className="mb-8 flex flex-col md:flex-row gap-6 items-start md:items-center justify-between">
            <div className="relative w-full md:w-96 group">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-blue-400 transition-colors" size={18} />
              <input 
                type="text" 
                placeholder="Buscar sede..." 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-xl pl-10 pr-4 py-3 outline-none focus:bg-white/10 focus:border-blue-500/50 transition-all text-white placeholder-slate-400"
              />
            </div>

            <div className="flex gap-4 w-full md:w-auto flex-wrap">
              {/* Plantilla activa partida en normal / keepers / venta público / clinics.
                  Se oculta en la última temporada (ver `ocultarActivos`). */}
              {!ocultarActivos && (
              <div className="flex-1 md:flex-none bg-sky-500/10 border border-sky-500/20 px-4 py-2 rounded-xl">
                <div className="flex items-center gap-2 mb-1.5">
                  <div className="bg-sky-500/20 p-1.5 rounded-lg">
                    <Users size={16} className="text-sky-400" />
                  </div>
                  <p className="text-[10px] uppercase tracking-wider text-sky-400 font-bold">Jugadores Activos</p>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { label: 'Sedes', value: activosSedes, tone: 'text-sky-400', title: undefined as string | undefined, cfg: { title: 'Jugadores Activos · Sedes', filtro: 'activos' as const, clinics: 0 as const, grupo: 'normal' as const } },
                    { label: 'Keepers', value: activosKeepers, tone: 'text-cyan-300', title: 'Keepers y porteros', cfg: { title: 'Jugadores Activos · Keepers/Porteros', filtro: 'activos' as const, clinics: 0 as const, grupo: 'keepers' as const } },
                    { label: 'Futsal', value: activosFutsal, tone: 'text-fuchsia-300', title: 'Sedes de futsal / categorías futsal (cuentan como sede normal)', cfg: { title: 'Jugadores Activos · Futsal', filtro: 'activos' as const, clinics: 0 as const, grupo: 'futsal' as const } },
                    { label: 'Clinics F.', value: activosClinicsFutsal, tone: 'text-slate-300', title: 'Clinics Futsal (sede futsal + categoría clinics)', cfg: { title: 'Jugadores Activos · Clinics Futsal', filtro: 'activos' as const, grupo: 'clinicsfutsal' as const } },
                    { label: 'Venta púb.', value: activosVentaPublico, tone: 'text-slate-300', title: 'Registros de venta al público (no cuentan en el total de sedes)', cfg: { title: 'Jugadores Activos · Venta al Público', filtro: 'activos' as const, grupo: 'ventapublico' as const } },
                    { label: 'Clinics', value: activosClinics, tone: 'text-slate-300', title: undefined, cfg: { title: 'Jugadores Activos · Clinics', filtro: 'activos' as const, clinics: 1 as const } },
                  ].map((seg) => (
                    <button
                      key={seg.label}
                      type="button"
                      title={seg.title}
                      onClick={() => setModal({ subtitle: temporadaNombre, ...seg.cfg })}
                      className="bg-white/5 hover:bg-white/15 border border-white/10 rounded-lg px-2 py-1 text-left transition-all"
                    >
                      <p className="text-[8px] uppercase font-black text-slate-400 tracking-wider">{seg.label}</p>
                      <p className={`text-lg font-black ${seg.tone}`}>{seg.value}</p>
                    </button>
                  ))}
                </div>
              </div>
              )}
              <div className="flex-1 md:flex-none bg-emerald-500/10 border border-emerald-500/20 px-4 py-2 rounded-xl min-w-[210px]">
                <div className="flex items-center gap-2 mb-1.5">
                  <div className="bg-emerald-500/20 p-1.5 rounded-lg">
                    <UserCheck size={16} className="text-emerald-400" />
                  </div>
                  <p className="text-[10px] uppercase tracking-wider text-emerald-400 font-bold">Total Inscritos</p>
                  <span className="text-[9px] text-slate-500 italic">incluye becados</span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <AreaInscritos
                    label="Sedes"
                    tone="text-emerald-400"
                    total={inscritosNormal}
                    nuevas={inscritosNormal - reinscritosNormal}
                    reinsc={reinscritosNormal}
                    onTotal={() => setModal({ title: 'Inscritos · Sedes', subtitle: temporadaNombre, filtro: 'inscritos', clinics: 0, grupo: 'normal' })}
                    onNuevas={() => setModal({ title: 'Inscripciones Nuevas · Sedes', subtitle: temporadaNombre, filtro: 'inscritos', clinics: 0, grupo: 'normal', tipoInscripcion: 'nueva' })}
                    onReinsc={() => setModal({ title: 'Reinscripciones · Sedes', subtitle: temporadaNombre, filtro: 'inscritos', clinics: 0, grupo: 'normal', tipoInscripcion: 'reinscripcion' })}
                  />
                  <AreaInscritos
                    label="Keepers"
                    tone="text-cyan-300"
                    total={inscritosKeepers}
                    nuevas={inscritosKeepers - reinscritosKeepers}
                    reinsc={reinscritosKeepers}
                    onTotal={() => setModal({ title: 'Inscritos · Keepers/Porteros', subtitle: temporadaNombre, filtro: 'inscritos', clinics: 0, grupo: 'keepers' })}
                    onNuevas={() => setModal({ title: 'Inscripciones Nuevas · Keepers/Porteros', subtitle: temporadaNombre, filtro: 'inscritos', clinics: 0, grupo: 'keepers', tipoInscripcion: 'nueva' })}
                    onReinsc={() => setModal({ title: 'Reinscripciones · Keepers/Porteros', subtitle: temporadaNombre, filtro: 'inscritos', clinics: 0, grupo: 'keepers', tipoInscripcion: 'reinscripcion' })}
                  />
                  <AreaInscritos
                    label="Futsal"
                    tone="text-fuchsia-300"
                    total={inscritosFutsal}
                    nuevas={inscritosFutsal - reinscritosFutsal}
                    reinsc={reinscritosFutsal}
                    onTotal={() => setModal({ title: 'Inscritos · Futsal', subtitle: temporadaNombre, filtro: 'inscritos', clinics: 0, grupo: 'futsal' })}
                    onNuevas={() => setModal({ title: 'Inscripciones Nuevas · Futsal', subtitle: temporadaNombre, filtro: 'inscritos', clinics: 0, grupo: 'futsal', tipoInscripcion: 'nueva' })}
                    onReinsc={() => setModal({ title: 'Reinscripciones · Futsal', subtitle: temporadaNombre, filtro: 'inscritos', clinics: 0, grupo: 'futsal', tipoInscripcion: 'reinscripcion' })}
                  />
                </div>
                {/* Avance de inscripción sobre la plantilla elegible (normal + keepers + futsal). */}
                <div className="mt-2">
                  <Meter
                    valor={inscritosSedes}
                    total={activosElegibles}
                    etiqueta={`${inscritosSedes} de ${activosElegibles} activos`}
                  />
                </div>
              </div>
              <BecadosKpi
                rebanadas={rebanadasBecas(becasTotal, inscritosSedes, coloresBeca)}
                inscritos={inscritosSedes}
                nuevas={grupoBecados(becasNuevas, inscritosSedes - reinscritosSedes, coloresBeca, {
                  keepers: becadosNuevasKeepers,
                  futsal: becadosNuevasFutsal,
                  clinicsFutsal: becadosNuevasClinicsFutsal,
                })}
                reinsc={grupoBecados(becasReinsc, reinscritosSedes, coloresBeca, {
                  keepers: becadosReinscKeepers,
                  futsal: becadosReinscFutsal,
                  clinicsFutsal: becadosReinscClinicsFutsal,
                })}
                detalleCompleto={becasTotal}
                onRebanada={(etiqueta) => setModal({
                  title: etiqueta === 'Sin beca' ? 'Inscritos sin beca' : `Becados · ${etiqueta}`,
                  subtitle: temporadaNombre,
                  filtro: etiqueta === 'Sin beca' ? 'inscritos' : 'becados',
                  clinics: 0,
                })}
                onNuevas={() => setModal({ title: 'Becados · Inscripciones Nuevas', subtitle: temporadaNombre, filtro: 'becados', clinics: 0, tipoInscripcion: 'nueva' })}
                onReinsc={() => setModal({ title: 'Becados · Reinscripciones', subtitle: temporadaNombre, filtro: 'becados', clinics: 0, tipoInscripcion: 'reinscripcion' })}
              />
              <div className="flex-1 md:flex-none bg-rose-500/10 border border-rose-500/20 px-4 py-2 rounded-xl">
                <div className="flex items-center gap-2 mb-1.5">
                  <div className="bg-rose-500/20 p-1.5 rounded-lg">
                    <Users size={16} className="text-rose-400" />
                  </div>
                  <p className="text-[10px] uppercase tracking-wider text-rose-400 font-bold">Total Bajas</p>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setModal({ title: 'Bajas · Sedes', subtitle: temporadaNombre, filtro: 'bajas', grupo: 'normal' })}
                    className="bg-white/5 hover:bg-white/15 border border-white/10 rounded-lg px-2 py-1 text-left transition-all"
                  >
                    <p className="text-[8px] uppercase font-black text-slate-400 tracking-wider">Sedes</p>
                    <p className="text-lg font-black text-rose-400">{bajasNormal}</p>
                  </button>
                  <button
                    type="button"
                    title="Keepers/porteros dados de baja"
                    onClick={() => setModal({ title: 'Bajas · Keepers/Porteros', subtitle: temporadaNombre, filtro: 'bajas', grupo: 'keepers' })}
                    className="bg-white/5 hover:bg-white/15 border border-white/10 rounded-lg px-2 py-1 text-left transition-all"
                  >
                    <p className="text-[8px] uppercase font-black text-slate-400 tracking-wider">Keepers</p>
                    <p className="text-lg font-black text-cyan-300">{bajasKeepers}</p>
                  </button>
                    <button
                      type="button"
                      title="Futsal dados de baja"
                      onClick={() => setModal({ title: 'Bajas · Futsal', subtitle: temporadaNombre, filtro: 'bajas', grupo: 'futsal' })}
                      className="bg-white/5 hover:bg-white/15 border border-white/10 rounded-lg px-2 py-1 text-left transition-all"
                    >
                      <p className="text-[8px] uppercase font-black text-slate-400 tracking-wider">Futsal</p>
                      <p className="text-lg font-black text-fuchsia-300">{bajasFutsal}</p>
                    </button>
                    <button
                      type="button"
                      title="Clinics Futsal dados de baja"
                      onClick={() => setModal({ title: 'Bajas · Clinics Futsal', subtitle: temporadaNombre, filtro: 'bajas', grupo: 'clinicsfutsal' })}
                      className="bg-white/5 hover:bg-white/15 border border-white/10 rounded-lg px-2 py-1 text-left transition-all"
                    >
                      <p className="text-[8px] uppercase font-black text-slate-400 tracking-wider">Clinics F.</p>
                      <p className="text-lg font-black text-rose-300">{bajasClinicsFutsal}</p>
                    </button>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setModal({ title: 'Con Pagos sin Inscripción', subtitle: temporadaNombre, filtro: 'sin-inscripcion' })}
                title="Pagaron mensualidad de los meses de la temporada pero no la inscripción"
                className="flex-1 md:flex-none bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/20 hover:border-amber-500/40 px-4 py-2 rounded-xl flex items-center gap-3 text-left transition-all cursor-pointer"
              >
                <div className="bg-amber-500/20 p-2 rounded-lg">
                  <AlertTriangle size={18} className="text-amber-400" />
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-amber-400 font-bold">Sin Inscripción</p>
                  <p className="text-xl font-bold">{sedes.reduce((acc, curr) => acc + (curr.SinInscripcion || 0), 0)}</p>
                </div>
              </button>
            </div>
          </div>

          {/* Sedes Grid */}
          {isLoading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {[...Array(8)].map((_, i) => (
                <div key={i} className="h-40 bg-white/5 rounded-2xl animate-pulse border border-white/10" />
              ))}
            </div>
          ) : filteredSedes.length > 0 ? (
            <div className="space-y-12">
              {/* Active Sedes */}
              {sedesWithInscritos.length > 0 && (
                <div>
                  <div className="flex items-center gap-4 mb-8">
                    <h2 className="text-[10px] font-black uppercase tracking-[0.3em] text-blue-400/80 bg-blue-500/10 px-3 py-1 rounded-full border border-blue-500/20">Sedes con Jugadores</h2>
                    <div className="h-px flex-1 bg-gradient-to-r from-blue-500/20 to-transparent" />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                    {sedesWithInscritos.map((sede) => (
                      <SedeCard key={sede.IdSede} sede={sede} temporadaId={temporadaId} temporadaNombre={temporadaNombre} ocultarActivos={ocultarActivos} onOpenPlayers={setModal} />
                    ))}
                  </div>
                </div>
              )}

              {/* Inactive Sedes */}
              {sedesWithoutInscritos.length > 0 && (
                <div className="pt-8">
                  <div className="flex items-center gap-4 mb-8">
                    <h2 className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-500/80 bg-white/5 px-3 py-1 rounded-full border border-white/10">Sin Jugadores</h2>
                    <div className="h-px flex-1 bg-gradient-to-r from-white/10 to-transparent" />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 opacity-50 hover:opacity-100 transition-all duration-500">
                    {sedesWithoutInscritos.map((sede) => (
                      <SedeCard key={sede.IdSede} sede={sede} temporadaId={temporadaId} temporadaNombre={temporadaNombre} ocultarActivos={ocultarActivos} onOpenPlayers={setModal} />
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="text-center py-20 bg-white/5 rounded-3xl border border-dashed border-white/20">
              <MapPin size={48} className="mx-auto text-slate-500 mb-4 opacity-20" />
              <h3 className="text-xl font-bold text-slate-300">No se encontraron sedes</h3>
              <p className="text-slate-500 mt-2">Prueba con un término de búsqueda diferente</p>
            </div>
          )}
        </div>

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

function SedeCard({
  sede,
  temporadaId,
  temporadaNombre,
  ocultarActivos,
  onOpenPlayers,
}: {
  sede: SedeSummary;
  temporadaId: number | null;
  temporadaNombre?: string;
  /** En la última temporada no se muestra la fila de plantilla activa. */
  ocultarActivos: boolean;
  onOpenPlayers: (config: PlayersModalConfig) => void;
}) {
  const categoriaHref = `/inscripciones/${sede.IdSede}${temporadaId ? `?temporada=${temporadaId}` : ''}`;
  const becados = sede.BecasDetail ? sede.BecasDetail.split(',').filter(Boolean).length : 0;
  const sinInscripcion = sede.SinInscripcion || 0;

  /* Las tres filas abren el modal, así que la tarjeta ya no puede ser un <Link>
     envolvente (no se pueden anidar botones dentro de un enlace). El acceso al
     drill-down por categorías queda en el encabezado y en el pie. */
  const open = (filtro: PlayersModalConfig['filtro'], title: string) =>
    onOpenPlayers({
      title,
      subtitle: [sede.Sede, temporadaNombre].filter(Boolean).join(' · '),
      filtro,
      sedeId: sede.IdSede,
      /* La vista por categorías se arma con los inscritos, así que la liga no
         corresponde para el corte de "sin inscripción". */
      categoriaHref: filtro === 'sin-inscripcion' ? undefined : categoriaHref,
    });

  const rowClass =
    'w-full text-left bg-white/[0.03] hover:bg-white/[0.07] p-3 rounded-lg border border-white/5 hover:border-white/15 transition-all cursor-pointer';

  return (
    <div className="group relative bg-white/5 hover:bg-white/[0.08] border border-white/10 hover:border-blue-500/30 rounded-2xl transition-all duration-300 hover:shadow-[0_20px_50px_rgba(0,0,0,0.3)] overflow-hidden h-full backdrop-blur-sm">
      <div className="absolute -inset-24 bg-blue-600/5 blur-3xl opacity-0 group-hover:opacity-100 transition-opacity duration-700 pointer-events-none"></div>

      <div className="p-5 relative z-10 h-full flex flex-col">
        <Link href={categoriaHref} className="block">
          <div className="mb-4 flex justify-between items-center">
            <div className="bg-blue-500/10 text-blue-400 group-hover:bg-blue-500 group-hover:text-white p-2.5 rounded-xl transition-all duration-500 group-hover:scale-110 border border-blue-500/10">
              <MapPin size={18} />
            </div>
            <div className="text-[9px] font-black text-slate-500 uppercase tracking-widest bg-white/5 px-2 py-0.5 rounded-md border border-white/5">
              Sede
            </div>
          </div>

          <h3 className="text-lg font-black mb-4 text-slate-200 group-hover:text-white transition-colors line-clamp-1 tracking-tight">
            {sede.Sede}
          </h3>
        </Link>

        <div className="space-y-2">
          {!ocultarActivos && (
            <button type="button" onClick={() => open('activos', 'Jugadores Activos')} className={rowClass}>
              <div className="flex justify-between items-center">
                <span className="text-xs text-slate-400 flex items-center gap-2 font-medium uppercase tracking-wider">
                  <div className="w-1.5 h-1.5 rounded-full bg-sky-500 shadow-[0_0_8px_rgba(56,189,248,0.5)]" />
                  Jugadores Activos
                </span>
                <span className="text-xl font-black text-sky-400">{sede.Activos}</span>
              </div>
            </button>
          )}

          <button type="button" onClick={() => open('inscritos', 'Jugadores Inscritos')} className={rowClass}>
            <div className="flex justify-between items-center">
              <span className="text-xs text-slate-400 flex items-center gap-2 font-medium uppercase tracking-wider">
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
                Jugadores Inscritos
              </span>
              <span className="text-xl font-black text-emerald-400">{sede.Inscritos}</span>
            </div>
            <p className="text-[9px] text-slate-500 italic mt-0.5 ml-3.5 leading-tight">incluye becados</p>
            {/* Avance de inscripción de esta sede sobre su plantilla activa */}
            <div className="mt-2">
              <Meter size="xs" valor={sede.Inscritos} total={sede.Activos} etiqueta={`de ${sede.Activos} activos`} />
            </div>
          </button>

          <button type="button" onClick={() => open('becados', 'Jugadores Becados')} className={`${rowClass} flex flex-col`}>
            <div className="w-full flex justify-between items-center">
              <span className="text-xs text-slate-400 flex items-center gap-2 font-medium uppercase tracking-wider">
                <div className="w-1.5 h-1.5 rounded-full bg-purple-500 shadow-[0_0_8px_rgba(168,85,247,0.5)]" />
                Jugadores Becados
              </span>
              <span className="text-xl font-black text-purple-400">{becados}</span>
            </div>
            {sede.BecasDetail && (
              <p className="text-[10px] text-purple-300/80 font-semibold mt-1 self-start ml-3.5 leading-tight">
                {formatBecasDetail(sede.BecasDetail)}
              </p>
            )}
          </button>

          <button type="button" onClick={() => open('bajas', 'Jugadores Baja')} className={rowClass}>
            <div className="flex justify-between items-center">
              <span className="text-xs text-slate-400 flex items-center gap-2 font-medium uppercase tracking-wider">
                <div className="w-1.5 h-1.5 rounded-full bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.5)]" />
                Jugadores Baja
              </span>
              <span className="text-xl font-black text-rose-400">{sede.Bajas || 0}</span>
            </div>
          </button>

          <button
            type="button"
            onClick={() => open('sin-inscripcion', 'Con Pagos sin Inscripción')}
            title="Pagaron mensualidad de los meses de la temporada pero no la inscripción"
            className={`${rowClass} ${sinInscripcion > 0 ? 'ring-1 ring-amber-500/25' : ''}`}
          >
            <div className="flex justify-between items-center">
              <span className="text-xs text-slate-400 flex items-center gap-2 font-medium uppercase tracking-wider">
                <div className="w-1.5 h-1.5 rounded-full bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.5)]" />
                Con Pagos sin Inscripción
              </span>
              <span className="text-xl font-black text-amber-400">{sinInscripcion}</span>
            </div>
          </button>
        </div>

        <Link
          href={categoriaHref}
          className="mt-4 pt-4 border-t border-white/5 flex items-center justify-between text-blue-400 hover:text-blue-300 transition-colors"
        >
          <span className="text-[10px] font-black uppercase tracking-widest">Ver Categorías</span>
          <ChevronRight size={14} />
        </Link>
      </div>

      <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-blue-500/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
    </div>
  );
}
