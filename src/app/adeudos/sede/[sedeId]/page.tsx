"use client";
import { useEffect, useState, use } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { ChevronLeft, Search, Users, ChevronRight, MapPin } from 'lucide-react';
import { useUser } from '@/contexts/user-context';
import DashboardLayout from '@/components/DashboardLayout';
import AdeudosModal, { type AdeudosModalConfig } from '@/components/AdeudosModal';

interface CategoriaSummary {
  Categoria: string;
  Activos: number;
  Bajas: number;
  PendientesInscripcion: number;
  PendientesMensualidad: number;
  AlCorriente: number;
  Debe: number;
}

interface Temporada {
  IdTemporada: number;
  Temporada: string;
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
  const [temporadaNombre, setTemporadaNombre] = useState<string | undefined>(undefined);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [modal, setModal] = useState<AdeudosModalConfig | null>(null);

  useEffect(() => {
    if (isInitialized && !user) {
      router.push('/login');
    }
  }, [user, isInitialized, router]);

  const fetchCategorias = async () => {
    setIsLoading(true);
    try {
      const response = await fetch(
        `/api/adeudos/categories?sedeId=${sedeId}${temporada ? `&temporadaId=${temporada}` : ''}`
      );
      const data = await response.json();
      if (data.success) {
        setCategorias(data.data);
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
        /* opcional */
      }
    })();
  }, [isInitialized, user, temporadaId]);

  const sortedCategorias = [...categorias].sort((a, b) => b.Activos - a.Activos);
  const filteredCategorias = sortedCategorias.filter(cat =>
    cat.Categoria.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const categoriesWithActivos = filteredCategorias.filter(cat => cat.Activos > 0);
  const categoriesWithoutActivos = filteredCategorias.filter(cat => cat.Activos === 0);

  return (
    <DashboardLayout>
      <main className="overflow-y-auto flex-1 text-white relative">
        <div className="bg-white/5 backdrop-blur-xl border-b border-white/10 px-6 py-4 flex justify-between items-center shadow-lg sticky top-0 z-20">
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
                Adeudos por categoría{temporadaNombre ? ` · ${temporadaNombre}` : ''}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <div className="bg-emerald-500/20 px-4 py-1.5 rounded-xl border border-emerald-500/30">
              <span className="text-sm font-bold text-emerald-400">
                {categorias.reduce((acc, curr) => acc + curr.Activos, 0)} Activos
              </span>
            </div>
            <div className="bg-teal-500/20 px-4 py-1.5 rounded-xl border border-teal-500/30">
              <span className="text-sm font-bold text-teal-400">
                {categorias.reduce((acc, curr) => acc + (Number(curr.AlCorriente) || 0), 0)} al corriente
              </span>
            </div>
            <div className="bg-amber-500/20 px-4 py-1.5 rounded-xl border border-amber-500/30">
              <span className="text-sm font-bold text-amber-400">
                {categorias.reduce((acc, curr) => acc + (Number(curr.PendientesInscripcion) || 0), 0)} sin inscripción
              </span>
            </div>
            <div className="bg-orange-500/20 px-4 py-1.5 rounded-xl border border-orange-500/30">
              <span className="text-sm font-bold text-orange-400">
                {categorias.reduce((acc, curr) => acc + (Number(curr.PendientesMensualidad) || 0), 0)} deben mensualidad
              </span>
            </div>
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
                <div key={i} className="h-48 bg-white/5 rounded-2xl animate-pulse border border-white/10" />
              ))}
            </div>
          ) : filteredCategorias.length > 0 ? (
            <div className="space-y-12">
              {categoriesWithActivos.length > 0 && (
                <div>
                  <div className="flex items-center gap-4 mb-8">
                    <h2 className="text-[10px] font-black uppercase tracking-[0.3em] text-blue-400/80 bg-blue-500/10 px-3 py-1 rounded-full border border-blue-500/20">Categorías con Jugadores</h2>
                    <div className="h-px flex-1 bg-gradient-to-r from-blue-500/20 to-transparent" />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                    {categoriesWithActivos.map((cat) => (
                      <CategoriaCard key={cat.Categoria} categoria={cat} sedeId={sedeId} sedeName={sedeName} temporadaNombre={temporadaNombre} onOpenPlayers={setModal} />
                    ))}
                  </div>
                </div>
              )}

              {categoriesWithoutActivos.length > 0 && (
                <div className="pt-8">
                  <div className="flex items-center gap-4 mb-8">
                    <h2 className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-500/80 bg-white/5 px-3 py-1 rounded-full border border-white/10">Sin Jugadores</h2>
                    <div className="h-px flex-1 bg-gradient-to-r from-white/10 to-transparent" />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 opacity-50 hover:opacity-100 transition-all duration-500">
                    {categoriesWithoutActivos.map((cat) => (
                      <CategoriaCard key={cat.Categoria} categoria={cat} sedeId={sedeId} sedeName={sedeName} temporadaNombre={temporadaNombre} onOpenPlayers={setModal} />
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
  onOpenPlayers: (config: AdeudosModalConfig) => void;
}) {
  const open = (filtro: AdeudosModalConfig['filtro'], title: string) =>
    onOpenPlayers({
      title,
      subtitle: [sedeName, categoria.Categoria, temporadaNombre].filter(Boolean).join(' · '),
      filtro,
      sedeId: Number(sedeId),
      categoria: categoria.Categoria,
    });

  const statBtn = 'w-full text-left bg-white/[0.03] hover:bg-white/[0.07] p-2 rounded-lg border border-white/5 hover:border-white/15 transition-all cursor-pointer';

  return (
    <div className="group relative bg-white/5 hover:bg-white/[0.08] border border-white/10 hover:border-blue-500/30 rounded-2xl transition-all duration-300 hover:shadow-[0_20px_50px_rgba(0,0,0,0.3)] overflow-hidden h-full backdrop-blur-sm">
      <div className="absolute -inset-24 bg-blue-600/5 blur-3xl opacity-0 group-hover:opacity-100 transition-opacity duration-700 pointer-events-none"></div>

      <div className="p-5 relative z-10 h-full flex flex-col">
        <button type="button" onClick={() => open('activos', 'Jugadores Activos')} className="block text-left">
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
          <button type="button" onClick={() => open('activos', 'Jugadores Activos')} className={statBtn}>
            <div className="flex justify-between items-center">
              <span className="text-[10px] text-slate-400 flex items-center gap-2 font-medium">
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
                Activos
              </span>
              <span className="text-xs font-black text-emerald-400">{categoria.Activos}</span>
            </div>
          </button>
          <button type="button" onClick={() => open('al-corriente', 'Al Corriente')} className={statBtn}>
            <div className="flex justify-between items-center">
              <span className="text-[10px] text-slate-400 flex items-center gap-2 font-medium">
                <div className="w-1.5 h-1.5 rounded-full bg-teal-500 shadow-[0_0_8px_rgba(20,184,166,0.5)]" />
                Al Corriente
              </span>
              <span className="text-xs font-black text-teal-400">{categoria.AlCorriente}</span>
            </div>
          </button>
          <button type="button" onClick={() => open('debe', 'Con Adeudo')} className={statBtn}>
            <div className="flex justify-between items-center">
              <span className="text-[10px] text-slate-400 flex items-center gap-2 font-medium">
                <div className="w-1.5 h-1.5 rounded-full bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.5)]" />
                Debe
              </span>
              <span className="text-xs font-black text-rose-400">{categoria.Debe}</span>
            </div>
          </button>
          <button type="button" onClick={() => open('bajas', 'Jugadores Baja')} className={statBtn}>
            <div className="flex justify-between items-center">
              <span className="text-[10px] text-slate-400 flex items-center gap-2 font-medium">
                <div className="w-1.5 h-1.5 rounded-full bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.5)]" />
                Bajas
              </span>
              <span className="text-xs font-bold text-rose-400/80">{categoria.Bajas || 0}</span>
            </div>
          </button>

          <div className="grid grid-cols-2 gap-2 mt-4">
            <button
              type="button"
              onClick={() => open('pendiente-inscripcion', 'Sin Inscripción')}
              className={`p-2 rounded-lg border transition-colors text-left cursor-pointer ${categoria.PendientesInscripcion > 0 ? 'bg-amber-500/5 border-amber-500/10 text-amber-400/80 hover:bg-amber-500/15' : 'bg-emerald-500/5 border-emerald-500/10 text-emerald-400/80 hover:bg-emerald-500/15'}`}
            >
              <p className="text-[7px] uppercase font-black mb-0.5 tracking-tighter opacity-60">Sin Inscripción</p>
              <p className="text-[10px] font-black">{categoria.PendientesInscripcion > 0 ? `${categoria.PendientesInscripcion} deben` : '✓ Al día'}</p>
            </button>
            <button
              type="button"
              onClick={() => open('pendiente-mensualidad', 'Deben Mensualidad')}
              className={`p-2 rounded-lg border transition-colors text-left cursor-pointer ${categoria.PendientesMensualidad > 0 ? 'bg-rose-500/5 border-rose-500/10 text-rose-400/80 hover:bg-rose-500/15' : 'bg-emerald-500/5 border-emerald-500/10 text-emerald-400/80 hover:bg-emerald-500/15'}`}
            >
              <p className="text-[7px] uppercase font-black mb-0.5 tracking-tighter opacity-60">Mensualidad</p>
              <p className="text-[10px] font-black">{categoria.PendientesMensualidad > 0 ? `${categoria.PendientesMensualidad} deben` : '✓ Al día'}</p>
            </button>
          </div>
        </div>

        <button
          type="button"
          onClick={() => open('activos', 'Jugadores Activos')}
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
