"use client";
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Search, MapPin, UserCheck, UserMinus, ChevronRight, ChevronDown, CalendarRange, History, CalendarClock, Brain,
  AlertTriangle,
} from 'lucide-react';
import { useUser } from '@/contexts/user-context';
import DashboardLayout from '@/components/DashboardLayout';
import AdeudosModal, { type AdeudosModalConfig } from '@/components/AdeudosModal';
import AnalisisProfundoModal from '@/components/AnalisisProfundoModal';

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

export default function AdeudosSedePage() {
  const router = useRouter();
  const { user, isInitialized } = useUser();
  const [sedes, setSedes] = useState<SedeSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [temporadas, setTemporadas] = useState<Temporada[]>([]);
  const [temporadaId, setTemporadaId] = useState<number | null>(null);
  const [actual, setActual] = useState<TemporadaInfo | null>(null);
  const [anterior, setAnterior] = useState<TemporadaInfo | null>(null);
  const [modal, setModal] = useState<AdeudosModalConfig | null>(null);
  const [analisisOpen, setAnalisisOpen] = useState(false);
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

  const filteredSedes = sedes.filter(sede =>
    sede.Sede.toLowerCase().includes(searchQuery.toLowerCase())
  );
  const sedesWithActivos = filteredSedes.filter(sede => sede.Activos > 0);
  const sedesWithoutActivos = filteredSedes.filter(sede => sede.Activos === 0);

  const sum = (pick: (s: SedeSummary) => number) => sedes.reduce((acc, s) => acc + (pick(s) || 0), 0);
  // Plantilla partida en grupos mutuamente excluyentes (normal / keepers / venta
  // pública / excluido[clinics+futsal]). Los conteos vienen ya calculados del backend.
  const activosSedes = sum(s => s.ActivosNormal);
  const activosKeepers = sum(s => s.ActivosKeepers);
  const activosFutsal = sum(s => s.ActivosFutsal);
  const activosVentaPublico = sum(s => s.ActivosVentaPublico);
  const activosClinics = sum(s => s.ActivosExcluido);
  const activosClinicsFutsal = sum(s => s.ActivosClinicsFutsal);
  const bajasSedes = sum(s => s.BajasNormal);
  const bajasKeepers = sum(s => s.BajasKeepers);
  const bajasFutsal = sum(s => s.BajasFutsal);
  const bajasClinics = sum(s => s.BajasExcluido);
  const bajasClinicsFutsal = sum(s => s.BajasClinicsFutsal);
  const totalActualDebe = sum(s => s.ActualDebe);
  const totalActualAlCorriente = sum(s => s.ActualAlCorriente);
  const totalActualKeepers = sum(s => s.ActualKeepers);
  const totalActualKeepersDebe = sum(s => s.ActualKeepersDebe);
  const totalActualFutsalSinPagos = sum(s => s.ActualFutsalSinPagos);
  const totalActualFutsal1Mes = sum(s => s.ActualFutsal1Mes);
  const totalActualFutsal2Meses = sum(s => s.ActualFutsal2Meses);
  const totalActualFutsal3Mas = sum(s => s.ActualFutsal3Mas);

  const totalAnteriorDebe = sum(s => s.AnteriorDebe);
  const totalAnteriorAlCorriente = sum(s => s.AnteriorAlCorriente);
  const totalAnteriorKeepers = sum(s => s.AnteriorKeepers);
  const totalAnteriorKeepersDebe = sum(s => s.AnteriorKeepersDebe);
  const totalAnteriorFutsalSinPagos = sum(s => s.AnteriorFutsalSinPagos);
  const totalAnteriorFutsal1Mes = sum(s => s.AnteriorFutsal1Mes);
  const totalAnteriorFutsal2Meses = sum(s => s.AnteriorFutsal2Meses);
  const totalAnteriorFutsal3Mas = sum(s => s.AnteriorFutsal3Mas);

  // Desglose global: se suman los conteos por mes de todas las sedes.
  const sumaMeses = (pick: (s: SedeSummary) => DebeMes[]): DebeMes[] => {
    const acc = new Map<number, number>();
    for (const s of sedes) {
      for (const m of pick(s) ?? []) acc.set(m.mes, (acc.get(m.mes) ?? 0) + m.cantidad);
    }
    return [...acc.entries()]
      .map(([mes, cantidad]) => ({ mes, cantidad }))
      .sort((a, b) => a.mes - b.mes);
  };
  const totalActualSinInsc = sum(s => s.ActualSinInscripcion);
  const totalActualMeses = sumaMeses(s => s.ActualDebeMeses);
  const totalAnteriorInsc = sum(s => s.AnteriorDebeInscripcion);
  const totalAnteriorMeses = sumaMeses(s => s.AnteriorDebeMeses);
  const totalActualBecadosSinInsc = sum(s => s.ActualBecadosSinInscripcion);
  const totalAnteriorBecadosSinInsc = sum(s => s.AnteriorBecadosSinInscripcion);
  const totalAnteriorPosiblesBajas = sum(s => s.AnteriorPosiblesBajas);

  // Cortes de la temporada anterior: el modal debe consultar ESA temporada.
  const scopeAnterior = anterior
    ? { temporadaId: anterior.seasonId, temporadaNombre: anterior.temporadaNombre, descartarPB }
    : {};
  /* Cortes de esta temporada: solo los inscritos generan adeudo, así que el modal
     debe aplicar la misma regla que las tarjetas. */
  const scopeActual = { soloInscritos: true } as const;

  return (
    <DashboardLayout>
      <main className="overflow-y-auto flex-1 text-white p-6 md:p-8 relative">
        <div className="max-w-7xl mx-auto">

          <div className="mb-10 flex flex-col md:flex-row md:items-end md:justify-between gap-5">
            <div>
              <h1 className="text-3xl font-black text-white mb-2">Adeudos por Sede</h1>
              <p className="text-slate-400">Monitoreo financiero segmentado por campus</p>
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

          {/* ── KPIs ── */}
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 mb-8">
            <KpiSplit
              label="Jugadores Activos"
              icon={<UserCheck size={18} className="text-emerald-400" />}
              tone="emerald"
              segments={[
                { label: 'Sedes', value: activosSedes, onClick: () => setModal({ title: 'Jugadores Activos · Sedes', subtitle: actual?.temporadaNombre, filtro: 'activos', grupo: 'normal' }) },
                { label: 'Keepers', value: activosKeepers, onClick: () => setModal({ title: 'Jugadores Activos · Keepers/Porteros', subtitle: actual?.temporadaNombre, filtro: 'activos', grupo: 'keepers' }) },
                { label: 'Futsal', value: activosFutsal, title: 'Futsal: cuenta en los adeudos como sede normal', onClick: () => setModal({ title: 'Jugadores Activos · Futsal', subtitle: actual?.temporadaNombre, filtro: 'activos', grupo: 'futsal' }) },
                { label: 'Venta público', value: activosVentaPublico, muted: true, title: 'Venta al público: no entra en los adeudos', onClick: () => setModal({ title: 'Jugadores Activos · Venta al Público', subtitle: actual?.temporadaNombre, filtro: 'activos', grupo: 'ventapublico' }) },
                { label: 'Clinics', value: activosClinics, muted: true, title: 'Clinics no entra en los adeudos', onClick: () => setModal({ title: 'Jugadores Activos · Clinics', subtitle: actual?.temporadaNombre, filtro: 'activos', grupo: 'excluido' }) },
                { label: 'Clinics F.', value: activosClinicsFutsal, muted: true, title: 'Clinics Futsal no entra en los adeudos', onClick: () => setModal({ title: 'Jugadores Activos · Clinics Futsal', subtitle: actual?.temporadaNombre, filtro: 'activos', grupo: 'clinicsfutsal' }) },
              ]}
            />
            <KpiSplit
              label="Jugadores Bajas"
              icon={<UserMinus size={18} className="text-rose-400" />}
              tone="rose"
              segments={[
                { label: 'Sedes', value: bajasSedes, onClick: () => setModal({ title: 'Jugadores Baja · Sedes', subtitle: actual?.temporadaNombre, filtro: 'bajas', grupo: 'normal' }) },
                { label: 'Keepers', value: bajasKeepers, onClick: () => setModal({ title: 'Jugadores Baja · Keepers/Porteros', subtitle: actual?.temporadaNombre, filtro: 'bajas', grupo: 'keepers' }) },
                { label: 'Futsal', value: bajasFutsal, title: 'Futsal: cuenta en los adeudos como sede normal', onClick: () => setModal({ title: 'Jugadores Baja · Futsal', subtitle: actual?.temporadaNombre, filtro: 'bajas', grupo: 'futsal' }) },
                { label: 'Clinics', value: bajasClinics, muted: true, title: 'Clinics no entra en los adeudos', onClick: () => setModal({ title: 'Jugadores Baja · Clinics', subtitle: actual?.temporadaNombre, filtro: 'bajas', grupo: 'excluido' }) },
                { label: 'Clinics F.', value: bajasClinicsFutsal, muted: true, title: 'Clinics Futsal no entra en los adeudos', onClick: () => setModal({ title: 'Jugadores Baja · Clinics Futsal', subtitle: actual?.temporadaNombre, filtro: 'bajas', grupo: 'clinicsfutsal' }) },
              ]}
            />
            <KpiDual
              label="Adeudos Temporada Anterior"
              caption={anterior?.temporadaNombre ?? 'Sin temporada anterior'}
              icon={<History size={18} className="text-amber-400" />}
              tone="amber"
              debe={totalAnteriorDebe}
              alCorriente={totalAnteriorAlCorriente}
              keepers={totalAnteriorKeepers}
              keepersDebe={totalAnteriorKeepersDebe}
              becadosSinInsc={totalAnteriorBecadosSinInsc}
              futsalSinPagos={totalAnteriorFutsalSinPagos}
              futsal1Mes={totalAnteriorFutsal1Mes}
              futsal2Meses={totalAnteriorFutsal2Meses}
              futsal3Mas={totalAnteriorFutsal3Mas}
              disabled={!anterior}
              onDebe={() => setModal({ title: 'Con Adeudo · Temporada Anterior', subtitle: anterior?.temporadaNombre, filtro: 'debe', ...scopeAnterior })}
              onAlCorriente={() => setModal({ title: 'Al Corriente · Temporada Anterior', subtitle: anterior?.temporadaNombre, filtro: 'al-corriente', ...scopeAnterior })}
              onKeepersDebe={() => setModal({ title: 'Porteros con Adeudo · Temporada Anterior', subtitle: anterior?.temporadaNombre, filtro: 'keepers-debe', ...scopeAnterior })}
              onKeepersCorriente={() => setModal({ title: 'Porteros al Corriente · Temporada Anterior', subtitle: anterior?.temporadaNombre, filtro: 'keepers-corriente', ...scopeAnterior })}
              onBecados={() => setModal({ title: 'Becados 100% sin Inscripción · Temporada Anterior', subtitle: anterior?.temporadaNombre, filtro: 'becado-sin-inscripcion', ...scopeAnterior })}
              onFutsalSinPagos={() => setModal({ title: 'Futsal Sin Pagos · Temporada Anterior', subtitle: anterior?.temporadaNombre, filtro: 'futsal-sin-pagos', ...scopeAnterior })}
              onFutsal1Mes={() => setModal({ title: 'Futsal 1 Mes · Temporada Anterior', subtitle: anterior?.temporadaNombre, filtro: 'futsal-1-mes', ...scopeAnterior })}
              onFutsal2Meses={() => setModal({ title: 'Futsal 2 Meses · Temporada Anterior', subtitle: anterior?.temporadaNombre, filtro: 'futsal-2-meses', ...scopeAnterior })}
              onFutsal3Mas={() => setModal({ title: 'Futsal 3+ Meses · Temporada Anterior', subtitle: anterior?.temporadaNombre, filtro: 'futsal-3-mas', ...scopeAnterior })}
              posiblesBajas={totalAnteriorPosiblesBajas}
              onPosiblesBajas={() => setModal({ title: 'Posibles Bajas · Temporada Anterior', subtitle: anterior?.temporadaNombre, filtro: 'posible-baja', ...scopeAnterior })}
              descartarPB={descartarPB}
              onToggleDescartar={anterior ? toggleDescartarPB : undefined}
              desglose={
                <DesgloseAdeudo
                  inscripcion={totalAnteriorInsc}
                  meses={totalAnteriorMeses}
                  onInscripcion={() => setModal({ title: 'Deben Inscripción · Temporada Anterior', subtitle: anterior?.temporadaNombre, filtro: 'pendiente-inscripcion', ...scopeAnterior })}
                  onMes={(mes) => setModal({ title: `Deben ${MESES_CORTOS[mes - 1]} · Temporada Anterior`, subtitle: anterior?.temporadaNombre, filtro: 'debe-mes', mes, ...scopeAnterior })}
                />
              }
            />
            <KpiDual
              label="Adeudos Esta Temporada"
              caption={actual?.temporadaNombre ?? ''}
              icon={<CalendarClock size={18} className="text-blue-400" />}
              tone="blue"
              debe={totalActualDebe}
              alCorriente={totalActualAlCorriente}
              keepers={totalActualKeepers}
              keepersDebe={totalActualKeepersDebe}
              becadosSinInsc={totalActualBecadosSinInsc}
              futsalSinPagos={totalActualFutsalSinPagos}
              futsal1Mes={totalActualFutsal1Mes}
              futsal2Meses={totalActualFutsal2Meses}
              futsal3Mas={totalActualFutsal3Mas}
              onDebe={() => setModal({ title: 'Con Adeudo · Esta Temporada', subtitle: actual?.temporadaNombre, filtro: 'debe', ...scopeActual })}
              onAlCorriente={() => setModal({ title: 'Al Corriente · Esta Temporada', subtitle: actual?.temporadaNombre, filtro: 'al-corriente', ...scopeActual })}
              onKeepersDebe={() => setModal({ title: 'Porteros con Adeudo · Esta Temporada', subtitle: actual?.temporadaNombre, filtro: 'keepers-debe', ...scopeActual })}
              onKeepersCorriente={() => setModal({ title: 'Porteros al Corriente · Esta Temporada', subtitle: actual?.temporadaNombre, filtro: 'keepers-corriente', ...scopeActual })}
              onBecados={() => setModal({ title: 'Becados 100% sin Inscripción · Esta Temporada', subtitle: actual?.temporadaNombre, filtro: 'becado-sin-inscripcion', ...scopeActual })}
              onFutsalSinPagos={() => setModal({ title: 'Futsal Sin Pagos · Esta Temporada', subtitle: actual?.temporadaNombre, filtro: 'futsal-sin-pagos', ...scopeActual })}
              onFutsal1Mes={() => setModal({ title: 'Futsal 1 Mes · Esta Temporada', subtitle: actual?.temporadaNombre, filtro: 'futsal-1-mes', ...scopeActual })}
              onFutsal2Meses={() => setModal({ title: 'Futsal 2 Meses · Esta Temporada', subtitle: actual?.temporadaNombre, filtro: 'futsal-2-meses', ...scopeActual })}
              onFutsal3Mas={() => setModal({ title: 'Futsal 3+ Meses · Esta Temporada', subtitle: actual?.temporadaNombre, filtro: 'futsal-3-mas', ...scopeActual })}
              sinInscripcion={totalActualSinInsc}
              onSinInscripcion={() => setModal({ title: 'Sin Inscripción · Esta Temporada', subtitle: actual?.temporadaNombre, filtro: 'pendiente-inscripcion', ...scopeActual })}
              desglose={
                <DesgloseAdeudo
                  meses={totalActualMeses}
                  onMes={(mes) => setModal({ title: `Deben ${MESES_CORTOS[mes - 1]} · Esta Temporada`, subtitle: actual?.temporadaNombre, filtro: 'debe-mes', mes, ...scopeActual })}
                />
              }
            />
          </div>

          <div className="mb-8">
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
          </div>

          {isLoading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {[...Array(8)].map((_, i) => (
                <div key={i} className="h-64 bg-white/5 rounded-2xl animate-pulse border border-white/10" />
              ))}
            </div>
          ) : filteredSedes.length > 0 ? (
            <div className="space-y-12">
              {sedesWithActivos.length > 0 && (
                <div>
                  <div className="flex items-center gap-4 mb-8">
                    <h2 className="text-[10px] font-black uppercase tracking-[0.3em] text-blue-400/80 bg-blue-500/10 px-3 py-1 rounded-full border border-blue-500/20">Sedes Activas</h2>
                    <div className="h-px flex-1 bg-gradient-to-r from-blue-500/20 to-transparent" />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                    {sedesWithActivos.map((sede) => (
                      <SedeCard key={sede.IdSede} sede={sede} temporadaId={temporadaId} actual={actual} anterior={anterior} descartarPB={descartarPB} onOpenPlayers={setModal} />
                    ))}
                  </div>
                </div>
              )}

              {sedesWithoutActivos.length > 0 && (
                <div className="pt-8">
                  <div className="flex items-center gap-4 mb-8">
                    <h2 className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-500/80 bg-white/5 px-3 py-1 rounded-full border border-white/10">Sin Jugadores Activos</h2>
                    <div className="h-px flex-1 bg-gradient-to-r from-white/10 to-transparent" />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 opacity-50 hover:opacity-100 transition-all duration-500">
                    {sedesWithoutActivos.map((sede) => (
                      <SedeCard key={sede.IdSede} sede={sede} temporadaId={temporadaId} actual={actual} anterior={anterior} descartarPB={descartarPB} onOpenPlayers={setModal} />
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

const TONES: Record<string, { bg: string; border: string; hover: string; text: string }> = {
  emerald: { bg: 'bg-emerald-500/10', border: 'border-emerald-500/20', hover: 'hover:bg-emerald-500/20 hover:border-emerald-500/40', text: 'text-emerald-400' },
  rose: { bg: 'bg-rose-500/10', border: 'border-rose-500/20', hover: 'hover:bg-rose-500/20 hover:border-rose-500/40', text: 'text-rose-400' },
  amber: { bg: 'bg-amber-500/10', border: 'border-amber-500/20', hover: '', text: 'text-amber-400' },
  blue: { bg: 'bg-blue-500/10', border: 'border-blue-500/20', hover: '', text: 'text-blue-400' },
};

interface KpiSegment {
  label: string;
  value: number;
  onClick: () => void;
  /** Texto atenuado (para grupos que no entran a adeudos: clinics, venta público). */
  muted?: boolean;
  title?: string;
}

/** KPI de plantilla partido en segmentos (normal / keepers / venta público / clinics). */
function KpiSplit({ label, icon, tone, segments }: {
  label: string; icon: React.ReactNode; tone: string; segments: KpiSegment[];
}) {
  const t = TONES[tone];
  return (
    <div className={`${t.bg} ${t.border} border px-4 py-3 rounded-2xl`}>
      <div className="flex items-center gap-2 mb-2">
        <div className={`${t.bg} p-1.5 rounded-lg`}>{icon}</div>
        <p className={`text-[10px] uppercase tracking-wider ${t.text} font-bold`}>{label}</p>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {segments.map((s) => (
          <button
            key={s.label}
            type="button"
            onClick={s.onClick}
            title={s.title}
            className="bg-white/5 hover:bg-white/15 border border-white/10 rounded-xl px-2 py-1.5 text-left transition-all"
          >
            <p className="text-[8px] uppercase font-black text-slate-400 tracking-wider">{s.label}</p>
            <p className={`text-lg font-black ${s.muted ? 'text-slate-300' : t.text}`}>{s.value}</p>
          </button>
        ))}
      </div>
    </div>
  );
}

/** KPI con cifras clicables: con adeudo, al corriente, porteros, becados y desglose futsal. */
function KpiDual({ label, caption, icon, tone, debe, alCorriente, keepers, keepersDebe, becadosSinInsc, futsalSinPagos, futsal1Mes, futsal2Meses, futsal3Mas, onDebe, onAlCorriente, onKeepersDebe, onKeepersCorriente, onBecados, onFutsalSinPagos, onFutsal1Mes, onFutsal2Meses, onFutsal3Mas, disabled, desglose, sinInscripcion, onSinInscripcion, posiblesBajas, onPosiblesBajas, descartarPB, onToggleDescartar }: {
  label: string; caption: string; icon: React.ReactNode; tone: string;
  debe: number; alCorriente: number; keepers: number; keepersDebe: number; becadosSinInsc: number;
  futsalSinPagos: number; futsal1Mes: number; futsal2Meses: number; futsal3Mas: number;
  onDebe: () => void; onAlCorriente: () => void; onKeepersDebe: () => void; onKeepersCorriente: () => void; onBecados: () => void;
  onFutsalSinPagos: () => void; onFutsal1Mes: () => void; onFutsal2Meses: () => void; onFutsal3Mas: () => void;
  disabled?: boolean; desglose?: React.ReactNode;
  /** Sin inscripción: solo la tarjeta de la temporada en curso, donde el no inscrito
   *  queda fuera del adeudo. */
  sinInscripcion?: number; onSinInscripcion?: () => void;
  /** Solo se muestra si se provee (temporadas ya transcurridas). */
  posiblesBajas?: number; onPosiblesBajas?: () => void;
  /** Check "descartar" de posibles bajas (solo la tarjeta de temporada anterior). */
  descartarPB?: boolean; onToggleDescartar?: () => void;
}) {
  const t = TONES[tone];
  return (
    <div className={`${t.bg} ${t.border} border px-4 py-3 rounded-2xl`}>
      <div className="flex items-center gap-2 mb-2">
        <div className={`${t.bg} p-1.5 rounded-lg`}>{icon}</div>
        <div className="min-w-0">
          <p className={`text-[10px] uppercase tracking-wider ${t.text} font-bold leading-tight`}>{label}</p>
          <p className="text-[9px] text-slate-500 truncate">{caption}</p>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2 items-start">
        {/* Columna de deudas: "Con adeudo" (normal, con su desglose). */}
        <div className="space-y-2">
          <div className="bg-rose-500/10 border border-rose-500/20 rounded-xl overflow-hidden">
            <button
              type="button"
              onClick={onDebe}
              disabled={disabled}
              className="w-full px-2 py-1.5 text-left hover:bg-rose-500/20 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <p className="text-[8px] uppercase font-black text-rose-400/80 tracking-wider">Con adeudo</p>
              <p className="text-lg font-black text-rose-400">{debe}</p>
            </button>
            {!disabled && desglose && <div className="px-2 pb-2">{desglose}</div>}
          </div>
          {/* Sin inscripción: no generan adeudo en la temporada en curso. */}
          {sinInscripcion !== undefined && onSinInscripcion && (
            <button
              type="button"
              onClick={onSinInscripcion}
              disabled={disabled}
              title="Activos que no se han inscrito en esta temporada: quedan fuera del cálculo de adeudo"
              className="w-full bg-amber-500/10 hover:bg-amber-500/25 border border-amber-500/25 rounded-xl px-2 py-1.5 text-left transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <p className="text-[8px] uppercase font-black text-amber-300/80 tracking-wider leading-tight">Sin inscripción</p>
              <p className="text-lg font-black text-amber-300">{sinInscripcion}</p>
            </button>
          )}
        </div>
        <div className="space-y-2">
          <button
            type="button"
            onClick={onAlCorriente}
            disabled={disabled}
            title="Al corriente, sin contar keepers/porteros"
            className="w-full bg-teal-500/10 hover:bg-teal-500/25 border border-teal-500/20 rounded-xl px-2 py-1.5 text-left transition-all disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <p className="text-[8px] uppercase font-black text-teal-400/80 tracking-wider">Al corriente</p>
            <p className="text-lg font-black text-teal-400">{alCorriente}</p>
          </button>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={onKeepersDebe}
              disabled={disabled}
              title="Porteros con adeudo: sin inscripción (regla de portero) o con meses vencidos"
              className="bg-rose-500/10 hover:bg-rose-500/25 border border-rose-500/20 rounded-xl px-2 py-1.5 text-left transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <p className="text-[8px] uppercase font-black text-rose-400/80 tracking-wider leading-tight">Porteros c/adeudo</p>
              <p className="text-lg font-black text-rose-400">{keepersDebe}</p>
            </button>
            <button
              type="button"
              onClick={onKeepersCorriente}
              disabled={disabled}
              title="Porteros al corriente: inscritos (regla de portero) y sin meses vencidos"
              className="bg-cyan-500/10 hover:bg-cyan-500/25 border border-cyan-500/20 rounded-xl px-2 py-1.5 text-left transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <p className="text-[8px] uppercase font-black text-cyan-300/80 tracking-wider leading-tight">Porteros al corr.</p>
              <p className="text-lg font-black text-cyan-300">{keepers - keepersDebe}</p>
            </button>
          </div>
          <button
            type="button"
            onClick={onBecados}
            disabled={disabled}
            title="Beca 100% sin pago de inscripción: no deben, pero no están inscritos"
            className="w-full bg-purple-500/10 hover:bg-purple-500/25 border border-purple-500/20 rounded-xl px-2 py-1.5 text-left transition-all disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <p className="text-[8px] uppercase font-black text-purple-300/80 tracking-wider leading-tight">
              Becados 100% s/inscripción
            </p>
            <p className="text-lg font-black text-purple-300">{becadosSinInsc}</p>
          </button>
        </div>
      </div>

      {/* Bloque Futsal */}
      <div className="mt-2 bg-fuchsia-500/10 border border-fuchsia-500/20 rounded-xl p-1.5">
        <p className="text-[8px] uppercase font-black text-fuchsia-300/90 tracking-wider mb-1">
          Futsal (Meses pagados)
        </p>
        <div className="grid grid-cols-4 gap-1">
          <button
            type="button"
            onClick={onFutsalSinPagos}
            disabled={disabled}
            title="Futsal sin pagos realizados"
            className="bg-white/5 hover:bg-fuchsia-500/25 border border-white/10 rounded-lg p-1 text-left transition-all disabled:opacity-40"
          >
            <p className="text-[7px] uppercase font-black text-slate-400">Sin pagos</p>
            <p className="text-sm font-black text-fuchsia-300">{futsalSinPagos}</p>
          </button>
          <button
            type="button"
            onClick={onFutsal1Mes}
            disabled={disabled}
            title="Futsal con 1 mes pagado"
            className="bg-white/5 hover:bg-fuchsia-500/25 border border-white/10 rounded-lg p-1 text-left transition-all disabled:opacity-40"
          >
            <p className="text-[7px] uppercase font-black text-slate-400">1 mes</p>
            <p className="text-sm font-black text-fuchsia-300">{futsal1Mes}</p>
          </button>
          <button
            type="button"
            onClick={onFutsal2Meses}
            disabled={disabled}
            title="Futsal con 2 meses pagados"
            className="bg-white/5 hover:bg-fuchsia-500/25 border border-white/10 rounded-lg p-1 text-left transition-all disabled:opacity-40"
          >
            <p className="text-[7px] uppercase font-black text-slate-400">2 meses</p>
            <p className="text-sm font-black text-fuchsia-300">{futsal2Meses}</p>
          </button>
          <button
            type="button"
            onClick={onFutsal3Mas}
            disabled={disabled}
            title="Futsal con 3 o más meses pagados"
            className="bg-white/5 hover:bg-fuchsia-500/25 border border-white/10 rounded-lg p-1 text-left transition-all disabled:opacity-40"
          >
            <p className="text-[7px] uppercase font-black text-slate-400">3+</p>
            <p className="text-sm font-black text-fuchsia-300">{futsal3Mas}</p>
          </button>
        </div>
      </div>

      {/* Posibles bajas: deben la inscripción y todos los meses vencidos. El check
          "descartar" vive dentro del propio cuadro. */}
      {posiblesBajas !== undefined && onPosiblesBajas && (
        <div className="mt-2 bg-red-600/15 border border-red-600/30 rounded-xl px-2 py-1.5 flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={onPosiblesBajas}
            disabled={disabled}
            title="No pagaron la inscripción ni un solo mes vencido de esa temporada"
            className="flex items-center gap-1.5 text-left transition-all hover:opacity-80 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <UserMinus size={13} className="text-red-300" />
            <span className="text-[9px] uppercase font-black text-red-300 tracking-wider">Posibles bajas</span>
            <span className="text-lg font-black text-red-300 ml-1">{posiblesBajas}</span>
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
  );
}

function SedeCard({ sede, temporadaId, actual, anterior, descartarPB, onOpenPlayers }: {
  sede: SedeSummary;
  temporadaId: number | null;
  actual: TemporadaInfo | null;
  anterior: TemporadaInfo | null;
  descartarPB: boolean;
  onOpenPlayers: (config: AdeudosModalConfig) => void;
}) {
  const categoriaHref = `/adeudos/sede/${sede.IdSede}${temporadaId ? `?temporada=${temporadaId}` : ''}`;
  const base = { sedeId: sede.IdSede };
  const scopeAnterior = anterior
    ? { temporadaId: anterior.seasonId, temporadaNombre: anterior.temporadaNombre, descartarPB }
    : {};
  // Esta temporada: el modal aplica la misma regla que las tarjetas (solo inscritos).
  const scopeActual = { soloInscritos: true } as const;

  const open = (cfg: Omit<AdeudosModalConfig, 'subtitle'> & { subtitle?: string }) =>
    onOpenPlayers({ ...cfg, subtitle: cfg.subtitle ?? sede.Sede });

  const rowBtn = 'w-full text-left bg-white/[0.03] hover:bg-white/[0.08] p-2 rounded-lg border border-white/5 hover:border-white/15 transition-all cursor-pointer';
  const miniBtn = 'p-2 rounded-lg border text-left transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed';

  return (
    <div className="group relative bg-white/5 hover:bg-white/[0.08] border border-white/10 hover:border-blue-500/30 rounded-2xl transition-all duration-300 hover:shadow-[0_20px_50px_rgba(0,0,0,0.3)] overflow-hidden h-full backdrop-blur-sm">
      <div className="absolute -inset-24 bg-blue-600/5 blur-3xl opacity-0 group-hover:opacity-100 transition-opacity duration-700 pointer-events-none"></div>

      <div className="p-4 relative z-10 h-full flex flex-col">
        <Link href={categoriaHref} className="block">
          <div className="mb-3 flex justify-between items-center">
            <div className="bg-blue-500/10 text-blue-400 group-hover:bg-blue-500 group-hover:text-white p-2 rounded-xl transition-all duration-500 group-hover:scale-110 border border-blue-500/10">
              <MapPin size={16} />
            </div>
            <div className={`text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-md border ${
              sede.EsClinics
                ? 'text-sky-300 bg-sky-500/10 border-sky-500/25'
                : 'text-slate-500 bg-white/5 border-white/5'
            }`}>
              {sede.EsClinics ? 'Clinics' : 'Campus'}
            </div>
          </div>
          <h3 className="text-sm font-black mb-3 text-slate-200 group-hover:text-white transition-colors line-clamp-1 tracking-tight">
            {sede.Sede}
          </h3>
        </Link>

        {/* Activos / Bajas */}
        <div className="grid grid-cols-2 gap-2">
          <button type="button" onClick={() => open({ ...base, title: 'Jugadores Activos', filtro: 'activos' })} className={rowBtn}>
            <p className="text-[8px] uppercase font-black text-slate-500 tracking-wider">Activos</p>
            <p className="text-base font-black text-emerald-400">{sede.Activos}</p>
          </button>
          <button type="button" onClick={() => open({ ...base, title: 'Jugadores Baja', filtro: 'bajas' })} className={rowBtn}>
            <p className="text-[8px] uppercase font-black text-slate-500 tracking-wider">Bajas</p>
            <p className="text-base font-black text-rose-400/80">{sede.Bajas}</p>
          </button>
        </div>

        {/* Solo sale si hay algo mal capturado. Estos quedan fuera de los conteos y del
            cálculo de adeudo, así que sin el aviso no aparecerían en ningún lado. */}
        {(sede.FueraDeLugar || 0) > 0 && (
          <button
            type="button"
            onClick={() => open({ ...base, title: 'No son porteros', filtro: 'fuera-de-lugar' })}
            title="Están en esta sede de keepers pero su categoría no es de portero. No entran en ningún conteo ni en el cálculo de adeudo."
            className="mt-2 w-full flex items-center justify-between gap-2 bg-red-500/10 hover:bg-red-500/20 border border-red-500/40 rounded-lg px-2 py-1.5 transition-all"
          >
            <span className="flex items-center gap-1.5 min-w-0">
              <AlertTriangle size={12} className="text-red-400 flex-shrink-0" />
              <span className="text-[9px] uppercase font-black text-red-300 tracking-wider truncate">No son porteros</span>
            </span>
            <span className="text-sm font-black text-red-400">{sede.FueraDeLugar}</span>
          </button>
        )}

        {/* Temporada anterior */}
        <p className="mt-3 mb-1 text-[8px] uppercase font-black text-amber-400/70 tracking-wider flex items-center gap-1">
          <History size={9} /> Temporada anterior
        </p>
        <div className="grid grid-cols-2 gap-2 items-start">
          <div className="space-y-2">
            <div className="bg-rose-500/5 border border-rose-500/10 rounded-lg overflow-hidden">
              <button
                type="button"
                disabled={!anterior}
                onClick={() => open({ ...base, ...scopeAnterior, title: 'Con Adeudo · Temporada Anterior', filtro: 'debe', subtitle: [sede.Sede, anterior?.temporadaNombre].filter(Boolean).join(' · ') })}
                className="w-full p-2 text-left hover:bg-rose-500/15 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <p className="text-[8px] uppercase font-black text-rose-400/70 tracking-wider">Con adeudo</p>
                <p className="text-sm font-black text-rose-400">{sede.AnteriorDebe}</p>
              </button>
              {anterior && (
                <div className="px-2 pb-2">
                  <DesgloseAdeudo
                    size="xs"
                    inscripcion={sede.AnteriorDebeInscripcion}
                    meses={sede.AnteriorDebeMeses ?? []}
                    onInscripcion={() => open({ ...base, ...scopeAnterior, title: 'Deben Inscripción · Temporada Anterior', filtro: 'pendiente-inscripcion', subtitle: [sede.Sede, anterior?.temporadaNombre].filter(Boolean).join(' · ') })}
                    onMes={(mes) => open({ ...base, ...scopeAnterior, title: `Deben ${MESES_CORTOS[mes - 1]} · Temporada Anterior`, filtro: 'debe-mes', mes, subtitle: [sede.Sede, anterior?.temporadaNombre].filter(Boolean).join(' · ') })}
                  />
                </div>
              )}
            </div>
          </div>
          <div className="space-y-2">
            <button
              type="button"
              disabled={!anterior}
              onClick={() => open({ ...base, ...scopeAnterior, title: 'Al Corriente · Temporada Anterior', filtro: 'al-corriente', subtitle: [sede.Sede, anterior?.temporadaNombre].filter(Boolean).join(' · ') })}
              className={`w-full ${miniBtn} bg-teal-500/5 border-teal-500/10 hover:bg-teal-500/15`}
            >
              <p className="text-[8px] uppercase font-black text-teal-400/70 tracking-wider">Al corriente</p>
              <p className="text-sm font-black text-teal-400">{sede.AnteriorAlCorriente}</p>
            </button>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                disabled={!anterior}
                title="Porteros con adeudo: sin inscripción (regla de portero) o con meses vencidos"
                onClick={() => open({ ...base, ...scopeAnterior, title: 'Porteros con Adeudo · Temporada Anterior', filtro: 'keepers-debe', subtitle: [sede.Sede, anterior?.temporadaNombre].filter(Boolean).join(' · ') })}
                className={`w-full ${miniBtn} bg-rose-500/5 border-rose-500/10 hover:bg-rose-500/15`}
              >
                <p className="text-[8px] uppercase font-black text-rose-400/70 tracking-wider leading-tight">Porteros c/adeudo</p>
                <p className="text-sm font-black text-rose-400">{sede.AnteriorKeepersDebe}</p>
              </button>
              <button
                type="button"
                disabled={!anterior}
                title="Porteros al corriente: inscritos (regla de portero) y sin meses vencidos"
                onClick={() => open({ ...base, ...scopeAnterior, title: 'Porteros al Corriente · Temporada Anterior', filtro: 'keepers-corriente', subtitle: [sede.Sede, anterior?.temporadaNombre].filter(Boolean).join(' · ') })}
                className={`w-full ${miniBtn} bg-cyan-500/5 border-cyan-500/10 hover:bg-cyan-500/15`}
              >
                <p className="text-[8px] uppercase font-black text-cyan-300/70 tracking-wider leading-tight">Porteros al corr.</p>
                <p className="text-sm font-black text-cyan-300">{sede.AnteriorKeepers - sede.AnteriorKeepersDebe}</p>
              </button>
            </div>
            <button
              type="button"
              disabled={!anterior}
              title="Beca 100% sin pago de inscripción"
              onClick={() => open({ ...base, ...scopeAnterior, title: 'Becados 100% sin Inscripción · Temporada Anterior', filtro: 'becado-sin-inscripcion', subtitle: [sede.Sede, anterior?.temporadaNombre].filter(Boolean).join(' · ') })}
              className={`w-full ${miniBtn} bg-purple-500/5 border-purple-500/10 hover:bg-purple-500/15`}
            >
              <p className="text-[8px] uppercase font-black text-purple-300/70 tracking-wider leading-tight">Becados 100% s/insc</p>
              <p className="text-sm font-black text-purple-300">{sede.AnteriorBecadosSinInscripcion}</p>
            </button>
          </div>
        </div>

        {/* Futsal Temporada Anterior */}
        <div className="mt-2 bg-fuchsia-500/5 border border-fuchsia-500/15 rounded-lg p-1.5">
          <p className="text-[8px] uppercase font-black text-fuchsia-300/80 tracking-wider mb-1">Futsal (Meses pagados)</p>
          <div className="grid grid-cols-4 gap-1 text-left">
            <button
              type="button"
              disabled={!anterior}
              onClick={() => open({ ...base, ...scopeAnterior, title: 'Futsal Sin Pagos · Temporada Anterior', filtro: 'futsal-sin-pagos', subtitle: [sede.Sede, anterior?.temporadaNombre].filter(Boolean).join(' · ') })}
              className="bg-white/5 hover:bg-fuchsia-500/20 p-1 rounded border border-white/5 text-left disabled:opacity-40"
            >
              <p className="text-[7px] font-bold text-slate-400">Sin pagos</p>
              <p className="text-xs font-black text-fuchsia-300">{sede.AnteriorFutsalSinPagos}</p>
            </button>
            <button
              type="button"
              disabled={!anterior}
              onClick={() => open({ ...base, ...scopeAnterior, title: 'Futsal 1 Mes · Temporada Anterior', filtro: 'futsal-1-mes', subtitle: [sede.Sede, anterior?.temporadaNombre].filter(Boolean).join(' · ') })}
              className="bg-white/5 hover:bg-fuchsia-500/20 p-1 rounded border border-white/5 text-left disabled:opacity-40"
            >
              <p className="text-[7px] font-bold text-slate-400">1 mes</p>
              <p className="text-xs font-black text-fuchsia-300">{sede.AnteriorFutsal1Mes}</p>
            </button>
            <button
              type="button"
              disabled={!anterior}
              onClick={() => open({ ...base, ...scopeAnterior, title: 'Futsal 2 Meses · Temporada Anterior', filtro: 'futsal-2-meses', subtitle: [sede.Sede, anterior?.temporadaNombre].filter(Boolean).join(' · ') })}
              className="bg-white/5 hover:bg-fuchsia-500/20 p-1 rounded border border-white/5 text-left disabled:opacity-40"
            >
              <p className="text-[7px] font-bold text-slate-400">2 meses</p>
              <p className="text-xs font-black text-fuchsia-300">{sede.AnteriorFutsal2Meses}</p>
            </button>
            <button
              type="button"
              disabled={!anterior}
              onClick={() => open({ ...base, ...scopeAnterior, title: 'Futsal 3+ Meses · Temporada Anterior', filtro: 'futsal-3-mas', subtitle: [sede.Sede, anterior?.temporadaNombre].filter(Boolean).join(' · ') })}
              className="bg-white/5 hover:bg-fuchsia-500/20 p-1 rounded border border-white/5 text-left disabled:opacity-40"
            >
              <p className="text-[7px] font-bold text-slate-400">3+</p>
              <p className="text-xs font-black text-fuchsia-300">{sede.AnteriorFutsal3Mas}</p>
            </button>
          </div>
        </div>

        {anterior && (
          <button
            type="button"
            title="No pagaron la inscripción ni un solo mes vencido de esa temporada"
            onClick={() => open({ ...base, ...scopeAnterior, title: 'Posibles Bajas · Temporada Anterior', filtro: 'posible-baja', subtitle: [sede.Sede, anterior?.temporadaNombre].filter(Boolean).join(' · ') })}
            className="mt-2 w-full bg-red-600/10 hover:bg-red-600/25 border border-red-600/25 rounded-lg px-2 py-1.5 flex items-center justify-between gap-2 transition-all"
          >
            <span className="text-[8px] uppercase font-black text-red-300 tracking-wider">Posibles bajas</span>
            <span className="text-sm font-black text-red-300">{sede.AnteriorPosiblesBajas}</span>
          </button>
        )}

        {/* Esta temporada */}
        <p className="mt-3 mb-1 text-[8px] uppercase font-black text-blue-400/70 tracking-wider flex items-center gap-1">
          <CalendarClock size={9} /> Esta temporada
        </p>
        <div className="grid grid-cols-2 gap-2 items-start">
          <div className="space-y-2">
            <div className="bg-rose-500/5 border border-rose-500/10 rounded-lg overflow-hidden">
              <button
                type="button"
                onClick={() => open({ ...base, ...scopeActual, title: 'Con Adeudo · Esta Temporada', filtro: 'debe', subtitle: [sede.Sede, actual?.temporadaNombre].filter(Boolean).join(' · ') })}
                className="w-full p-2 text-left hover:bg-rose-500/15 transition-all"
              >
                <p className="text-[8px] uppercase font-black text-rose-400/70 tracking-wider">Con adeudo</p>
                <p className="text-sm font-black text-rose-400">{sede.ActualDebe}</p>
              </button>
              <div className="px-2 pb-2">
                <DesgloseAdeudo
                  size="xs"
                  meses={sede.ActualDebeMeses ?? []}
                  onMes={(mes) => open({ ...base, ...scopeActual, title: `Deben ${MESES_CORTOS[mes - 1]} · Esta Temporada`, filtro: 'debe-mes', mes, subtitle: [sede.Sede, actual?.temporadaNombre].filter(Boolean).join(' · ') })}
                />
              </div>
            </div>
            {/* Sin inscripción: activos que no se han inscrito en esta temporada. */}
            <button
              type="button"
              title="Activos que no se han inscrito en esta temporada: quedan fuera del cálculo de adeudo"
              onClick={() => open({ ...base, ...scopeActual, title: 'Sin Inscripción · Esta Temporada', filtro: 'pendiente-inscripcion', subtitle: [sede.Sede, actual?.temporadaNombre].filter(Boolean).join(' · ') })}
              className={`w-full ${miniBtn} bg-amber-500/5 border-amber-500/15 hover:bg-amber-500/15`}
            >
              <p className="text-[8px] uppercase font-black text-amber-300/70 tracking-wider leading-tight">Sin inscripción</p>
              <p className="text-sm font-black text-amber-300">{sede.ActualSinInscripcion}</p>
            </button>
          </div>
          <div className="space-y-2">
            <button
              type="button"
              onClick={() => open({ ...base, ...scopeActual, title: 'Al Corriente · Esta Temporada', filtro: 'al-corriente', subtitle: [sede.Sede, actual?.temporadaNombre].filter(Boolean).join(' · ') })}
              className={`w-full ${miniBtn} bg-teal-500/5 border-teal-500/10 hover:bg-teal-500/15`}
            >
              <p className="text-[8px] uppercase font-black text-teal-400/70 tracking-wider">Al corriente</p>
              <p className="text-sm font-black text-teal-400">{sede.ActualAlCorriente}</p>
            </button>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                title="Porteros con adeudo: sin inscripción (regla de portero) o con meses vencidos"
                onClick={() => open({ ...base, ...scopeActual, title: 'Porteros con Adeudo · Esta Temporada', filtro: 'keepers-debe', subtitle: [sede.Sede, actual?.temporadaNombre].filter(Boolean).join(' · ') })}
                className={`w-full ${miniBtn} bg-rose-500/5 border-rose-500/10 hover:bg-rose-500/15`}
              >
                <p className="text-[8px] uppercase font-black text-rose-400/70 tracking-wider leading-tight">Porteros c/adeudo</p>
                <p className="text-sm font-black text-rose-400">{sede.ActualKeepersDebe}</p>
              </button>
              <button
                type="button"
                title="Porteros al corriente: inscritos (regla de portero) y sin meses vencidos"
                onClick={() => open({ ...base, ...scopeActual, title: 'Porteros al Corriente · Esta Temporada', filtro: 'keepers-corriente', subtitle: [sede.Sede, actual?.temporadaNombre].filter(Boolean).join(' · ') })}
                className={`w-full ${miniBtn} bg-cyan-500/5 border-cyan-500/10 hover:bg-cyan-500/15`}
              >
                <p className="text-[8px] uppercase font-black text-cyan-300/70 tracking-wider leading-tight">Porteros al corr.</p>
                <p className="text-sm font-black text-cyan-300">{sede.ActualKeepers - sede.ActualKeepersDebe}</p>
              </button>
            </div>
            <button
              type="button"
              title="Beca 100% sin pago de inscripción"
              onClick={() => open({ ...base, ...scopeActual, title: 'Becados 100% sin Inscripción · Esta Temporada', filtro: 'becado-sin-inscripcion', subtitle: [sede.Sede, actual?.temporadaNombre].filter(Boolean).join(' · ') })}
              className={`w-full ${miniBtn} bg-purple-500/5 border-purple-500/10 hover:bg-purple-500/15`}
            >
              <p className="text-[8px] uppercase font-black text-purple-300/70 tracking-wider leading-tight">Becados 100% s/insc</p>
              <p className="text-sm font-black text-purple-300">{sede.ActualBecadosSinInscripcion}</p>
            </button>
          </div>
        </div>

        {/* Futsal Esta Temporada */}
        <div className="mt-2 bg-fuchsia-500/5 border border-fuchsia-500/15 rounded-lg p-1.5">
          <p className="text-[8px] uppercase font-black text-fuchsia-300/80 tracking-wider mb-1">Futsal (Meses pagados)</p>
          <div className="grid grid-cols-4 gap-1 text-left">
            <button
              type="button"
              onClick={() => open({ ...base, ...scopeActual, title: 'Futsal Sin Pagos · Esta Temporada', filtro: 'futsal-sin-pagos', subtitle: [sede.Sede, actual?.temporadaNombre].filter(Boolean).join(' · ') })}
              className="bg-white/5 hover:bg-fuchsia-500/20 p-1 rounded border border-white/5 text-left"
            >
              <p className="text-[7px] font-bold text-slate-400">Sin pagos</p>
              <p className="text-xs font-black text-fuchsia-300">{sede.ActualFutsalSinPagos}</p>
            </button>
            <button
              type="button"
              onClick={() => open({ ...base, ...scopeActual, title: 'Futsal 1 Mes · Esta Temporada', filtro: 'futsal-1-mes', subtitle: [sede.Sede, actual?.temporadaNombre].filter(Boolean).join(' · ') })}
              className="bg-white/5 hover:bg-fuchsia-500/20 p-1 rounded border border-white/5 text-left"
            >
              <p className="text-[7px] font-bold text-slate-400">1 mes</p>
              <p className="text-xs font-black text-fuchsia-300">{sede.ActualFutsal1Mes}</p>
            </button>
            <button
              type="button"
              onClick={() => open({ ...base, ...scopeActual, title: 'Futsal 2 Meses · Esta Temporada', filtro: 'futsal-2-meses', subtitle: [sede.Sede, actual?.temporadaNombre].filter(Boolean).join(' · ') })}
              className="bg-white/5 hover:bg-fuchsia-500/20 p-1 rounded border border-white/5 text-left"
            >
              <p className="text-[7px] font-bold text-slate-400">2 meses</p>
              <p className="text-xs font-black text-fuchsia-300">{sede.ActualFutsal2Meses}</p>
            </button>
            <button
              type="button"
              onClick={() => open({ ...base, ...scopeActual, title: 'Futsal 3+ Meses · Esta Temporada', filtro: 'futsal-3-mas', subtitle: [sede.Sede, actual?.temporadaNombre].filter(Boolean).join(' · ') })}
              className="bg-white/5 hover:bg-fuchsia-500/20 p-1 rounded border border-white/5 text-left"
            >
              <p className="text-[7px] font-bold text-slate-400">3+</p>
              <p className="text-xs font-black text-fuchsia-300">{sede.ActualFutsal3Mas}</p>
            </button>
          </div>
        </div>

        <Link
          href={categoriaHref}
          className="mt-3 pt-3 border-t border-white/5 flex items-center justify-between text-blue-400 hover:text-blue-300 transition-colors"
        >
          <span className="text-[10px] font-black uppercase tracking-widest">Ver por Categoría</span>
          <ChevronRight size={14} />
        </Link>
      </div>

      <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-blue-500/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
    </div>
  );
}
