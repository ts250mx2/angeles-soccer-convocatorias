"use client";
import { useEffect, useState, use } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { ChevronLeft, Search, Users, MapPin, History, CalendarClock } from 'lucide-react';
import { useUser } from '@/contexts/user-context';
import DashboardLayout from '@/components/DashboardLayout';
import AdeudosModal, { type AdeudosModalConfig } from '@/components/AdeudosModal';

interface DebeMes {
  mes: number;
  cantidad: number;
}

interface CategoriaSummary {
  Categoria: string;
  Activos: number;
  Bajas: number;
  ActualDebe: number;
  ActualAlCorriente: number;
  ActualBecadosSinInscripcion: number;
  ActualDebeInscripcion: number;
  ActualDebeMeses: DebeMes[];
  AnteriorDebe: number;
  AnteriorAlCorriente: number;
  AnteriorBecadosSinInscripcion: number;
  AnteriorPosiblesBajas: number;
  AnteriorDebeInscripcion: number;
  AnteriorDebeMeses: DebeMes[];
}

const MESES_CORTOS = [
  'Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun',
  'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic',
];

/** Desglose del adeudo por concepto (inscripción y cada mes vencido). */
function DesgloseAdeudo({ inscripcion, meses, onInscripcion, onMes }: {
  inscripcion: number;
  meses: DebeMes[];
  onInscripcion: () => void;
  onMes: (mes: number) => void;
}) {
  const conAdeudo = meses.filter((m) => m.cantidad > 0);
  if (inscripcion === 0 && conAdeudo.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-1 mt-1.5">
      {inscripcion > 0 && (
        <button
          type="button"
          onClick={onInscripcion}
          title={`${inscripcion} deben la inscripción`}
          className="px-1.5 py-0.5 text-[9px] rounded-md font-black bg-amber-500/15 text-amber-300 border border-amber-500/30 hover:bg-amber-500/30 transition-colors"
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
          className="px-1.5 py-0.5 text-[9px] rounded-md font-black bg-orange-500/15 text-orange-300 border border-orange-500/30 hover:bg-orange-500/30 transition-colors"
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

export default function AdeudosSedeCategoriasPage({ params }: { params: Promise<{ sedeId: string }> }) {
  const resolvedParams = use(params);
  const sedeId = resolvedParams.sedeId;
  const router = useRouter();
  const searchParams = useSearchParams();
  const temporada = searchParams.get('temporada');
  const temporadaQs = temporada ? `?temporada=${temporada}` : '';
  const temporadaId = temporada ? Number(temporada) : null;
  const { user, isInitialized } = useUser();
  const [categorias, setCategorias] = useState<CategoriaSummary[]>([]);
  const [sedeName, setSedeName] = useState(`Sede ${sedeId}`);
  const [actual, setActual] = useState<TemporadaInfo | null>(null);
  const [anterior, setAnterior] = useState<TemporadaInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [modal, setModal] = useState<AdeudosModalConfig | null>(null);

  useEffect(() => {
    if (isInitialized && !user) router.push('/login');
  }, [user, isInitialized, router]);

  const fetchCategorias = async () => {
    setIsLoading(true);
    try {
      const response = await fetch(
        `/api/adeudos/categories?sedeId=${sedeId}${temporada ? `&temporadaId=${temporada}` : ''}`,
        { cache: 'no-store' }
      );
      const data = await response.json();
      if (data.success) {
        setCategorias(data.data);
        setActual(data.config?.actual ?? null);
        setAnterior(data.config?.anterior ?? null);
        if (data.sedeName) setSedeName(data.sedeName);
      } else {
        console.error('Error fetching categories:', data.message);
      }
    } catch (error) {
      console.error('Error fetching categories:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isInitialized && user) fetchCategorias();
  }, [isInitialized, user, sedeId]);

  const sorted = [...categorias].sort((a, b) => b.Activos - a.Activos);
  const filtered = sorted.filter(cat => cat.Categoria.toLowerCase().includes(searchQuery.toLowerCase()));
  const withActivos = filtered.filter(cat => cat.Activos > 0);
  const withoutActivos = filtered.filter(cat => cat.Activos === 0);

  const sum = (pick: (c: CategoriaSummary) => number) =>
    categorias.reduce((acc, c) => acc + (pick(c) || 0), 0);

  return (
    <DashboardLayout>
      <main className="overflow-y-auto flex-1 text-white relative">
        <div className="bg-white/5 backdrop-blur-xl border-b border-white/10 px-6 py-4 flex justify-between items-center shadow-lg sticky top-0 z-20 flex-wrap gap-3">
          <div className="flex items-center gap-4">
            <Link href={`/adeudos/sede${temporadaQs}`} className="p-2 hover:bg-white/10 rounded-full transition-colors">
              <ChevronLeft size={24} />
            </Link>
            <div>
              <h1 className="text-xl font-bold flex items-center gap-2">
                <MapPin size={20} className="text-blue-400" />
                {sedeName}
              </h1>
              <p className="text-xs text-blue-200 uppercase tracking-widest font-black">
                Adeudos por categoría{actual?.temporadaNombre ? ` · ${actual.temporadaNombre}` : ''}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="bg-emerald-500/20 px-3 py-1.5 rounded-xl border border-emerald-500/30 text-sm font-bold text-emerald-400">
              {sum(c => c.Activos)} activos
            </span>
            <span className="bg-rose-500/20 px-3 py-1.5 rounded-xl border border-rose-500/30 text-sm font-bold text-rose-400">
              {sum(c => c.ActualDebe)} con adeudo
            </span>
            <span className="bg-teal-500/20 px-3 py-1.5 rounded-xl border border-teal-500/30 text-sm font-bold text-teal-400">
              {sum(c => c.ActualAlCorriente)} al corriente
            </span>
          </div>
        </div>

        <div className="max-w-7xl mx-auto p-6 md:p-8">
          <div className="mb-8">
            <div className="relative w-full md:w-96 group">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-blue-400 transition-colors" size={18} />
              <input
                type="text"
                placeholder="Buscar categoría..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-xl pl-10 pr-4 py-3 outline-none focus:bg-white/10 focus:border-blue-500/50 transition-all text-white placeholder-slate-400"
              />
            </div>
          </div>

          {isLoading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="h-64 bg-white/5 rounded-2xl animate-pulse border border-white/10" />
              ))}
            </div>
          ) : filtered.length > 0 ? (
            <div className="space-y-12">
              {withActivos.length > 0 && (
                <div>
                  <div className="flex items-center gap-4 mb-8">
                    <h2 className="text-[10px] font-black uppercase tracking-[0.3em] text-blue-400/80 bg-blue-500/10 px-3 py-1 rounded-full border border-blue-500/20">Categorías con Jugadores</h2>
                    <div className="h-px flex-1 bg-gradient-to-r from-blue-500/20 to-transparent" />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                    {withActivos.map((cat) => (
                      <CategoriaCard key={cat.Categoria} categoria={cat} sedeId={sedeId} sedeName={sedeName} actual={actual} anterior={anterior} onOpenPlayers={setModal} />
                    ))}
                  </div>
                </div>
              )}

              {withoutActivos.length > 0 && (
                <div className="pt-8">
                  <div className="flex items-center gap-4 mb-8">
                    <h2 className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-500/80 bg-white/5 px-3 py-1 rounded-full border border-white/10">Sin Jugadores</h2>
                    <div className="h-px flex-1 bg-gradient-to-r from-white/10 to-transparent" />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 opacity-50 hover:opacity-100 transition-all duration-500">
                    {withoutActivos.map((cat) => (
                      <CategoriaCard key={cat.Categoria} categoria={cat} sedeId={sedeId} sedeName={sedeName} actual={actual} anterior={anterior} onOpenPlayers={setModal} />
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="text-center py-20 bg-white/5 rounded-3xl border border-dashed border-white/20">
              <Users size={48} className="mx-auto text-slate-500 mb-4 opacity-20" />
              <h3 className="text-xl font-bold text-slate-300">No se encontraron categorías</h3>
              <p className="text-slate-500 mt-2">Prueba con un término de búsqueda diferente o la sede está vacía</p>
            </div>
          )}
        </div>

        <AdeudosModal
          config={modal}
          temporadaId={temporadaId}
          temporadaNombre={actual?.temporadaNombre}
          onClose={() => setModal(null)}
          onDataChanged={() => fetchCategorias()}
        />
      </main>
    </DashboardLayout>
  );
}

function CategoriaCard({ categoria, sedeId, sedeName, actual, anterior, onOpenPlayers }: {
  categoria: CategoriaSummary;
  sedeId: string;
  sedeName: string;
  actual: TemporadaInfo | null;
  anterior: TemporadaInfo | null;
  onOpenPlayers: (config: AdeudosModalConfig) => void;
}) {
  const base = { sedeId: Number(sedeId), categoria: categoria.Categoria };
  const scopeAnterior = anterior
    ? { temporadaId: anterior.seasonId, temporadaNombre: anterior.temporadaNombre }
    : {};
  const label = (extra?: string) => [sedeName, categoria.Categoria, extra].filter(Boolean).join(' · ');

  const rowBtn = 'w-full text-left bg-white/[0.03] hover:bg-white/[0.08] p-2 rounded-lg border border-white/5 hover:border-white/15 transition-all cursor-pointer';
  const miniBtn = 'p-2 rounded-lg border text-left transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed';

  return (
    <div className="group relative bg-white/5 hover:bg-white/[0.08] border border-white/10 hover:border-blue-500/30 rounded-2xl transition-all duration-300 hover:shadow-[0_20px_50px_rgba(0,0,0,0.3)] overflow-hidden h-full backdrop-blur-sm">
      <div className="absolute -inset-24 bg-blue-600/5 blur-3xl opacity-0 group-hover:opacity-100 transition-opacity duration-700 pointer-events-none"></div>

      <div className="p-4 relative z-10 h-full flex flex-col">
        <button
          type="button"
          onClick={() => onOpenPlayers({ ...base, title: 'Jugadores Activos', filtro: 'activos', subtitle: label(actual?.temporadaNombre) })}
          className="block text-left"
        >
          <div className="mb-3 flex justify-between items-center">
            <div className="bg-blue-500/10 text-blue-400 group-hover:bg-blue-500 group-hover:text-white p-2 rounded-xl transition-all duration-500 group-hover:scale-110 border border-blue-500/10">
              <Users size={16} />
            </div>
            <div className="text-[9px] font-black text-slate-500 uppercase tracking-widest bg-white/5 px-2 py-0.5 rounded-md border border-white/5">
              Categoría
            </div>
          </div>
          <h3 className="text-base font-black mb-3 text-slate-200 group-hover:text-white transition-colors line-clamp-1 tracking-tight">
            {categoria.Categoria}
          </h3>
        </button>

        <div className="grid grid-cols-2 gap-2">
          <button type="button" onClick={() => onOpenPlayers({ ...base, title: 'Jugadores Activos', filtro: 'activos', subtitle: label() })} className={rowBtn}>
            <p className="text-[8px] uppercase font-black text-slate-500 tracking-wider">Activos</p>
            <p className="text-base font-black text-emerald-400">{categoria.Activos}</p>
          </button>
          <button type="button" onClick={() => onOpenPlayers({ ...base, title: 'Jugadores Baja', filtro: 'bajas', subtitle: label() })} className={rowBtn}>
            <p className="text-[8px] uppercase font-black text-slate-500 tracking-wider">Bajas</p>
            <p className="text-base font-black text-rose-400/80">{categoria.Bajas}</p>
          </button>
        </div>

        <p className="mt-3 mb-1 text-[8px] uppercase font-black text-amber-400/70 tracking-wider flex items-center gap-1">
          <History size={9} /> Temporada anterior
        </p>
        <div className="grid grid-cols-2 gap-2 items-start">
          <div className="bg-rose-500/5 border border-rose-500/10 rounded-lg overflow-hidden">
            <button
              type="button"
              disabled={!anterior}
              onClick={() => onOpenPlayers({ ...base, ...scopeAnterior, title: 'Con Adeudo · Temporada Anterior', filtro: 'debe', subtitle: label(anterior?.temporadaNombre) })}
              className="w-full p-2 text-left hover:bg-rose-500/15 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <p className="text-[8px] uppercase font-black text-rose-400/70 tracking-wider">Con adeudo</p>
              <p className="text-sm font-black text-rose-400">{categoria.AnteriorDebe}</p>
            </button>
            {anterior && (
              <div className="px-2 pb-2">
                <DesgloseAdeudo
                  inscripcion={categoria.AnteriorDebeInscripcion}
                  meses={categoria.AnteriorDebeMeses ?? []}
                  onInscripcion={() => onOpenPlayers({ ...base, ...scopeAnterior, title: 'Deben Inscripción · Temporada Anterior', filtro: 'pendiente-inscripcion', subtitle: label(anterior?.temporadaNombre) })}
                  onMes={(mes) => onOpenPlayers({ ...base, ...scopeAnterior, title: `Deben ${MESES_CORTOS[mes - 1]} · Temporada Anterior`, filtro: 'debe-mes', mes, subtitle: label(anterior?.temporadaNombre) })}
                />
              </div>
            )}
          </div>
          <div className="space-y-2">
            <button
              type="button"
              disabled={!anterior}
              onClick={() => onOpenPlayers({ ...base, ...scopeAnterior, title: 'Al Corriente · Temporada Anterior', filtro: 'al-corriente', subtitle: label(anterior?.temporadaNombre) })}
              className={`w-full ${miniBtn} bg-teal-500/5 border-teal-500/10 hover:bg-teal-500/15`}
            >
              <p className="text-[8px] uppercase font-black text-teal-400/70 tracking-wider">Al corriente</p>
              <p className="text-sm font-black text-teal-400">{categoria.AnteriorAlCorriente}</p>
            </button>
            <button
              type="button"
              disabled={!anterior}
              title="Beca 100% sin pago de inscripción"
              onClick={() => onOpenPlayers({ ...base, ...scopeAnterior, title: 'Becados 100% sin Inscripción · Temporada Anterior', filtro: 'becado-sin-inscripcion', subtitle: label(anterior?.temporadaNombre) })}
              className={`w-full ${miniBtn} bg-purple-500/5 border-purple-500/10 hover:bg-purple-500/15`}
            >
              <p className="text-[8px] uppercase font-black text-purple-300/70 tracking-wider leading-tight">Becados 100% s/insc</p>
              <p className="text-sm font-black text-purple-300">{categoria.AnteriorBecadosSinInscripcion}</p>
            </button>
          </div>
        </div>
        {anterior && (
          <button
            type="button"
            title="No pagaron la inscripción ni un solo mes vencido de esa temporada"
            onClick={() => onOpenPlayers({ ...base, ...scopeAnterior, title: 'Posibles Bajas · Temporada Anterior', filtro: 'posible-baja', subtitle: label(anterior?.temporadaNombre) })}
            className="mt-2 w-full bg-red-600/10 hover:bg-red-600/25 border border-red-600/25 rounded-lg px-2 py-1.5 flex items-center justify-between gap-2 transition-all"
          >
            <span className="text-[8px] uppercase font-black text-red-300 tracking-wider">Posibles bajas</span>
            <span className="text-sm font-black text-red-300">{categoria.AnteriorPosiblesBajas}</span>
          </button>
        )}

        <p className="mt-3 mb-1 text-[8px] uppercase font-black text-blue-400/70 tracking-wider flex items-center gap-1">
          <CalendarClock size={9} /> Esta temporada
        </p>
        <div className="grid grid-cols-2 gap-2 items-start">
          <div className="bg-rose-500/5 border border-rose-500/10 rounded-lg overflow-hidden">
            <button
              type="button"
              onClick={() => onOpenPlayers({ ...base, title: 'Con Adeudo · Esta Temporada', filtro: 'debe', subtitle: label(actual?.temporadaNombre) })}
              className="w-full p-2 text-left hover:bg-rose-500/15 transition-all"
            >
              <p className="text-[8px] uppercase font-black text-rose-400/70 tracking-wider">Con adeudo</p>
              <p className="text-sm font-black text-rose-400">{categoria.ActualDebe}</p>
            </button>
            <div className="px-2 pb-2">
              <DesgloseAdeudo
                inscripcion={categoria.ActualDebeInscripcion}
                meses={categoria.ActualDebeMeses ?? []}
                onInscripcion={() => onOpenPlayers({ ...base, title: 'Deben Inscripción · Esta Temporada', filtro: 'pendiente-inscripcion', subtitle: label(actual?.temporadaNombre) })}
                onMes={(mes) => onOpenPlayers({ ...base, title: `Deben ${MESES_CORTOS[mes - 1]} · Esta Temporada`, filtro: 'debe-mes', mes, subtitle: label(actual?.temporadaNombre) })}
              />
            </div>
          </div>
          <div className="space-y-2">
            <button
              type="button"
              onClick={() => onOpenPlayers({ ...base, title: 'Al Corriente · Esta Temporada', filtro: 'al-corriente', subtitle: label(actual?.temporadaNombre) })}
              className={`w-full ${miniBtn} bg-teal-500/5 border-teal-500/10 hover:bg-teal-500/15`}
            >
              <p className="text-[8px] uppercase font-black text-teal-400/70 tracking-wider">Al corriente</p>
              <p className="text-sm font-black text-teal-400">{categoria.ActualAlCorriente}</p>
            </button>
            <button
              type="button"
              title="Beca 100% sin pago de inscripción"
              onClick={() => onOpenPlayers({ ...base, title: 'Becados 100% sin Inscripción · Esta Temporada', filtro: 'becado-sin-inscripcion', subtitle: label(actual?.temporadaNombre) })}
              className={`w-full ${miniBtn} bg-purple-500/5 border-purple-500/10 hover:bg-purple-500/15`}
            >
              <p className="text-[8px] uppercase font-black text-purple-300/70 tracking-wider leading-tight">Becados 100% s/insc</p>
              <p className="text-sm font-black text-purple-300">{categoria.ActualBecadosSinInscripcion}</p>
            </button>
          </div>
        </div>
      </div>

      <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-blue-500/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
    </div>
  );
}
