"use client";
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Search, MapPin, ChevronRight, ChevronDown, UserCheck, Users, CalendarRange, AlertTriangle } from 'lucide-react';
import { useUser } from '@/contexts/user-context';
import DashboardLayout from '@/components/DashboardLayout';
import PlayersModal, { type PlayersModalConfig } from '@/components/PlayersModal';

interface SedeSummary {
  IdSede: number;
  Sede: string;
  Inscritos: number;
  Bajas: number;
  /** Pagaron mensualidad de los meses de la temporada pero no la inscripción */
  SinInscripcion: number;
  BecasDetail: string | null;
}

function formatBecasDetail(becasDetail: string | null): string {
  if (!becasDetail) return '';
  const list = becasDetail.split(',');
  const counts: Record<string, number> = {};
  list.forEach(b => {
    const trimmed = b.trim();
    if (trimmed) {
      const pct = /^\d+$/.test(trimmed) ? `${trimmed}%` : trimmed;
      counts[pct] = (counts[pct] || 0) + 1;
    }
  });

  const entries = Object.entries(counts);
  if (entries.length === 0) return '';

  const sorted = entries.sort((a, b) => {
    const valA = parseInt(a[0]) || 0;
    const valB = parseInt(b[0]) || 0;
    return valB - valA;
  });

  return sorted.map(([percentage, count]) => `${count} de ${percentage}`).join(', ');
}

interface Temporada {
  IdTemporada: number;
  Temporada: string;
  EsActiva: boolean;
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
      const response = await fetch(`/api/inscripciones/sedes${qs}`);
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
              <button
                type="button"
                onClick={() => setModal({ title: 'Total Inscritos', subtitle: temporadaNombre, filtro: 'inscritos' })}
                className="flex-1 md:flex-none bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/20 hover:border-emerald-500/40 px-4 py-2 rounded-xl flex items-center gap-3 text-left transition-all cursor-pointer"
              >
                <div className="bg-emerald-500/20 p-2 rounded-lg">
                  <UserCheck size={18} className="text-emerald-400" />
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-emerald-400 font-bold">Total Inscritos</p>
                  <p className="text-xl font-bold">{sedes.reduce((acc, curr) => acc + curr.Inscritos, 0)}</p>
                </div>
              </button>
              <button
                type="button"
                onClick={() => setModal({ title: 'Total Bajas', subtitle: temporadaNombre, filtro: 'bajas' })}
                className="flex-1 md:flex-none bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 hover:border-rose-500/40 px-4 py-2 rounded-xl flex items-center gap-3 text-left transition-all cursor-pointer"
              >
                <div className="bg-rose-500/20 p-2 rounded-lg">
                  <Users size={18} className="text-rose-400" />
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-rose-400 font-bold">Total Bajas</p>
                  <p className="text-xl font-bold">{sedes.reduce((acc, curr) => acc + (curr.Bajas || 0), 0)}</p>
                </div>
              </button>
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
              <button
                type="button"
                onClick={() => setModal({ title: 'Todas las Sedes', subtitle: temporadaNombre, filtro: 'todos' })}
                className="flex-1 md:flex-none bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/20 hover:border-blue-500/40 px-4 py-2 rounded-xl flex items-center gap-3 text-left transition-all cursor-pointer"
              >
                <div className="bg-blue-500/20 p-2 rounded-lg">
                  <MapPin size={18} className="text-blue-400" />
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-blue-400 font-bold">Total Sedes</p>
                  <p className="text-xl font-bold">{sedes.length}</p>
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
                      <SedeCard key={sede.IdSede} sede={sede} temporadaId={temporadaId} temporadaNombre={temporadaNombre} onOpenPlayers={setModal} />
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
                      <SedeCard key={sede.IdSede} sede={sede} temporadaId={temporadaId} temporadaNombre={temporadaNombre} onOpenPlayers={setModal} />
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
  onOpenPlayers,
}: {
  sede: SedeSummary;
  temporadaId: number | null;
  temporadaNombre?: string;
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
          <button type="button" onClick={() => open('inscritos', 'Jugadores Inscritos')} className={rowClass}>
            <div className="flex justify-between items-center">
              <span className="text-xs text-slate-400 flex items-center gap-2 font-medium uppercase tracking-wider">
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
                Jugadores Inscritos
              </span>
              <span className="text-xl font-black text-emerald-400">{sede.Inscritos}</span>
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
