"use client";
import { useEffect, useState, use } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { ChevronLeft, Search, Users, ChevronRight, MapPin } from 'lucide-react';
import { useUser } from '@/contexts/user-context';
import DashboardLayout from '@/components/DashboardLayout';
import PlayersModal, { type PlayersModalConfig } from '@/components/PlayersModal';

interface CategoriaSummary {
  Categoria: string;
  Inscritos: number;
  Bajas: number;
  BecasDetail: string | null;
}

interface Temporada {
  IdTemporada: number;
  Temporada: string;
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

export default function InscripcionesSedePage({ params }: { params: Promise<{ sedeId: string }> }) {
  const resolvedParams = use(params);
  const sedeId = resolvedParams.sedeId;
  const router = useRouter();
  const searchParams = useSearchParams();
  // La temporada seleccionada viaja por la URL desde el listado de sedes.
  const temporada = searchParams.get('temporada');
  const temporadaQs = temporada ? `?temporada=${temporada}` : '';
  const { user, isInitialized } = useUser();
  const [categorias, setCategorias] = useState<CategoriaSummary[]>([]);
  const [sedeName, setSedeName] = useState(`Sede ${sedeId}`);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [temporadaNombre, setTemporadaNombre] = useState<string | undefined>(undefined);
  const [modal, setModal] = useState<PlayersModalConfig | null>(null);
  const temporadaId = temporada ? Number(temporada) : null;

  // Check if user is logged in
  useEffect(() => {
    if (isInitialized && !user) {
      router.push('/login');
    }
  }, [user, isInitialized, router]);

  const fetchCategorias = async () => {
    setIsLoading(true);
    try {
      const response = await fetch(
        `/api/inscripciones/categories?sedeId=${sedeId}${temporada ? `&temporadaId=${temporada}` : ''}`
      );
      const data = await response.json();
      if (data.success) {
        setCategorias(data.data);
        if (data.sedeName) {
          setSedeName(data.sedeName);
        }
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
    if (isInitialized && user) {
      fetchCategorias();
    }
  }, [isInitialized, user, sedeId]);

  // Nombre de la temporada seleccionada, para el subtítulo del modal.
  useEffect(() => {
    if (!isInitialized || !user || !temporadaId) return;
    (async () => {
      try {
        const res = await fetch('/api/inscripciones/temporadas');
        const json = await res.json();
        if (json.success) {
          const t = (json.data as Temporada[]).find((x) => x.IdTemporada === temporadaId);
          setTemporadaNombre(t?.Temporada);
        }
      } catch {
        /* el nombre es opcional; el modal degrada a "esta temporada" */
      }
    })();
  }, [isInitialized, user, temporadaId]);

  const sortedCategorias = [...categorias].sort((a, b) => b.Inscritos - a.Inscritos);

  const filteredCategorias = sortedCategorias.filter(cat => 
    cat.Categoria.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const categoriesWithInscritos = filteredCategorias.filter(cat => cat.Inscritos > 0);
  const categoriesWithoutInscritos = filteredCategorias.filter(cat => cat.Inscritos === 0);

  return (
    <DashboardLayout>
      <main className="overflow-y-auto flex-1 text-white relative">
        <div className="bg-white/5 backdrop-blur-xl border-b border-white/10 px-6 py-4 flex justify-between items-center shadow-lg sticky top-0 z-20">
          <div className="flex items-center gap-4">
            <Link href={`/inscripciones${temporadaQs}`} className="p-2 hover:bg-white/10 rounded-full transition-colors">
              <ChevronLeft size={24} />
            </Link>
            <div>
              <h1 className="text-xl font-bold flex items-center gap-2">
                <MapPin size={20} className="text-blue-400" />
                {sedeName}
              </h1>
              <p className="text-xs text-blue-200 uppercase tracking-widest font-black">Categorías de la sede</p>
            </div>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <div className="bg-emerald-500/20 px-4 py-1.5 rounded-xl border border-emerald-500/30">
              <span className="text-sm font-bold text-emerald-400">
                {categorias.reduce((acc, curr) => acc + curr.Inscritos, 0)} Inscritos Totales
              </span>
            </div>
            <div className="bg-rose-500/20 px-4 py-1.5 rounded-xl border border-rose-500/30">
              <span className="text-sm font-bold text-rose-400">
                {categorias.reduce((acc, curr) => acc + (curr.Bajas || 0), 0)} Bajas Totales
              </span>
            </div>
          </div>
        </div>

        <div className="max-w-7xl mx-auto p-6 md:p-8">
          
          {/* Search Section */}
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

          {/* Categorias Grid */}
          {isLoading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="h-40 bg-white/5 rounded-2xl animate-pulse border border-white/10" />
              ))}
            </div>
          ) : filteredCategorias.length > 0 ? (
            <div className="space-y-12">
              {/* Categorías con Jugadores */}
              {categoriesWithInscritos.length > 0 && (
                <div>
                  <div className="flex items-center gap-4 mb-8">
                    <h2 className="text-[10px] font-black uppercase tracking-[0.3em] text-blue-400/80 bg-blue-500/10 px-3 py-1 rounded-full border border-blue-500/20">Categorías con Jugadores</h2>
                    <div className="h-px flex-1 bg-gradient-to-r from-blue-500/20 to-transparent" />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                    {categoriesWithInscritos.map((cat) => (
                      <CategoriaCard key={cat.Categoria} categoria={cat} sedeName={sedeName} temporadaNombre={temporadaNombre} onOpenPlayers={setModal} sedeId={sedeId} />
                    ))}
                  </div>
                </div>
              )}

              {/* Categorías sin Jugadores */}
              {categoriesWithoutInscritos.length > 0 && (
                <div className="pt-8">
                  <div className="flex items-center gap-4 mb-8">
                    <h2 className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-500/80 bg-white/5 px-3 py-1 rounded-full border border-white/10">Sin Jugadores</h2>
                    <div className="h-px flex-1 bg-gradient-to-r from-white/10 to-transparent" />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 opacity-50 hover:opacity-100 transition-all duration-500">
                    {categoriesWithoutInscritos.map((cat) => (
                      <CategoriaCard key={cat.Categoria} categoria={cat} sedeName={sedeName} temporadaNombre={temporadaNombre} onOpenPlayers={setModal} sedeId={sedeId} />
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

        <PlayersModal
          config={modal}
          temporadaId={temporadaId}
          temporadaNombre={temporadaNombre}
          onClose={() => setModal(null)}
          onDataChanged={() => fetchCategorias()}
        />
      </main>
    </DashboardLayout>
  );
}

function CategoriaCard({
  categoria,
  sedeId,
  sedeName,
  temporadaNombre,
  onOpenPlayers,
}: {
  categoria: CategoriaSummary;
  sedeId: string;
  sedeName: string;
  temporadaNombre?: string;
  onOpenPlayers: (config: PlayersModalConfig) => void;
}) {
  const becados = categoria.BecasDetail ? categoria.BecasDetail.split(',').filter(Boolean).length : 0;

  /* Cada área abre el mismo modal que las tarjetas de sede, acotado a esta categoría.
     La tarjeta ya no navega a una página aparte, así que no puede ser un <Link>. */
  const open = (filtro: PlayersModalConfig['filtro'], title: string) =>
    onOpenPlayers({
      title,
      subtitle: [sedeName, categoria.Categoria, temporadaNombre].filter(Boolean).join(' · '),
      filtro,
      sedeId: Number(sedeId),
      categoria: categoria.Categoria,
    });

  const rowClass =
    'w-full text-left bg-white/[0.03] hover:bg-white/[0.07] p-3 rounded-lg border border-white/5 hover:border-white/15 transition-all cursor-pointer';

  return (
    <div className="group relative bg-white/5 hover:bg-white/[0.08] border border-white/10 hover:border-blue-500/30 rounded-2xl transition-all duration-300 hover:shadow-[0_20px_50px_rgba(0,0,0,0.3)] overflow-hidden h-full backdrop-blur-sm">
      <div className="absolute -inset-24 bg-blue-600/5 blur-3xl opacity-0 group-hover:opacity-100 transition-opacity duration-700 pointer-events-none"></div>

      <div className="p-5 relative z-10 h-full flex flex-col">
        <button type="button" onClick={() => open('inscritos', 'Jugadores Inscritos')} className="block text-left">
          <div className="mb-4 flex justify-between items-center">
            <div className="bg-blue-500/10 text-blue-400 group-hover:bg-blue-500 group-hover:text-white p-2.5 rounded-xl transition-all duration-500 group-hover:scale-110 border border-blue-500/10">
              <Users size={18} />
            </div>
            <div className="text-[9px] font-black text-slate-500 uppercase tracking-widest bg-white/5 px-2 py-0.5 rounded-md border border-white/5">
              Categoría
            </div>
          </div>

          <h3 className="text-lg font-black mb-4 text-slate-200 group-hover:text-white transition-colors line-clamp-1 tracking-tight">
            {categoria.Categoria}
          </h3>
        </button>

        <div className="space-y-2">
          <button type="button" onClick={() => open('inscritos', 'Jugadores Inscritos')} className={rowClass}>
            <div className="flex justify-between items-center">
              <span className="text-xs text-slate-400 flex items-center gap-2 font-medium uppercase tracking-wider">
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
                Jugadores Inscritos
              </span>
              <span className="text-xl font-black text-emerald-400">{categoria.Inscritos}</span>
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
            {categoria.BecasDetail && (
              <p className="text-[10px] text-purple-300/80 font-semibold mt-1 self-start ml-3.5 leading-tight">
                {formatBecasDetail(categoria.BecasDetail)}
              </p>
            )}
          </button>

          <button type="button" onClick={() => open('bajas', 'Jugadores Baja')} className={rowClass}>
            <div className="flex justify-between items-center">
              <span className="text-xs text-slate-400 flex items-center gap-2 font-medium uppercase tracking-wider">
                <div className="w-1.5 h-1.5 rounded-full bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.5)]" />
                Jugadores Baja
              </span>
              <span className="text-xl font-black text-rose-400">{categoria.Bajas || 0}</span>
            </div>
          </button>
        </div>

        <button
          type="button"
          onClick={() => open('inscritos', 'Jugadores Inscritos')}
          className="mt-4 pt-4 border-t border-white/5 flex items-center justify-between text-blue-400 hover:text-blue-300 transition-colors"
        >
          <span className="text-[10px] font-black uppercase tracking-widest">Ver Jugadores</span>
          <ChevronRight size={14} />
        </button>
      </div>

      <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-blue-500/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
    </div>
  );
}
