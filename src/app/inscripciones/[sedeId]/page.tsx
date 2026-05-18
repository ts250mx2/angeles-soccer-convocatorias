"use client";
import { useEffect, useState, use } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ChevronLeft, Search, Users, ChevronRight, MapPin } from 'lucide-react';
import { useUser } from '@/contexts/user-context';
import DashboardLayout from '@/components/DashboardLayout';

interface CategoriaSummary {
  Categoria: string;
  Inscritos: number;
}

export default function InscripcionesSedePage({ params }: { params: Promise<{ sedeId: string }> }) {
  const resolvedParams = use(params);
  const sedeId = resolvedParams.sedeId;
  const router = useRouter();
  const { user, isInitialized } = useUser();
  const [categorias, setCategorias] = useState<CategoriaSummary[]>([]);
  const [sedeName, setSedeName] = useState(`Sede ${sedeId}`);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  // Check if user is logged in
  useEffect(() => {
    if (isInitialized && !user) {
      router.push('/login');
    }
  }, [user, isInitialized, router]);

  const fetchCategorias = async () => {
    setIsLoading(true);
    try {
      const response = await fetch(`/api/inscripciones/categories?sedeId=${sedeId}`);
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

  const filteredCategorias = categorias.filter(cat => 
    cat.Categoria.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <DashboardLayout>
      <main className="overflow-y-auto flex-1 text-white relative">
        <div className="bg-white/5 backdrop-blur-xl border-b border-white/10 px-6 py-4 flex justify-between items-center shadow-lg sticky top-0 z-20">
          <div className="flex items-center gap-4">
            <Link href="/inscripciones" className="p-2 hover:bg-white/10 rounded-full transition-colors">
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
          <div className="flex items-center gap-3">
            <div className="bg-emerald-500/20 px-4 py-1.5 rounded-xl border border-emerald-500/30">
              <span className="text-sm font-bold text-emerald-400">
                {categorias.reduce((acc, curr) => acc + curr.Inscritos, 0)} Inscritos Totales
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
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {filteredCategorias.map((cat) => (
                <CategoriaCard key={cat.Categoria} categoria={cat} sedeId={sedeId} />
              ))}
            </div>
          ) : (
            <div className="text-center py-20 bg-white/5 rounded-3xl border border-dashed border-white/20">
              <Users size={48} className="mx-auto text-slate-500 mb-4 opacity-20" />
              <h3 className="text-xl font-bold text-slate-300">No se encontraron categorías</h3>
              <p className="text-slate-500 mt-2">Prueba con un término de búsqueda diferente o la sede está vacía</p>
            </div>
          )}
        </div>
      </main>
    </DashboardLayout>
  );
}

function CategoriaCard({ categoria, sedeId }: { categoria: CategoriaSummary, sedeId: string }) {
  return (
    <Link 
      href={`/inscripciones/${sedeId}/${encodeURIComponent(categoria.Categoria)}`}
      className="group relative bg-white/5 hover:bg-white/[0.08] border border-white/10 hover:border-blue-500/30 rounded-2xl transition-all duration-300 hover:shadow-[0_20px_50px_rgba(0,0,0,0.3)] overflow-hidden h-full block backdrop-blur-sm"
    >
      <div className="absolute -inset-24 bg-blue-600/5 blur-3xl opacity-0 group-hover:opacity-100 transition-opacity duration-700 pointer-events-none"></div>
      
      <div className="p-5 block relative z-10 h-full">
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

        <div className="space-y-2">
          <div className="flex justify-between items-center bg-white/[0.03] p-3 rounded-lg border border-white/5">
            <span className="text-xs text-slate-400 flex items-center gap-2 font-medium uppercase tracking-wider">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
              Jugadores Inscritos
            </span>
            <span className="text-xl font-black text-emerald-400">{categoria.Inscritos}</span>
          </div>
        </div>

        <div className="mt-4 pt-4 border-t border-white/5 flex items-center justify-between text-blue-400 opacity-0 group-hover:opacity-100 transition-all translate-y-2 group-hover:translate-y-0">
          <span className="text-[10px] font-black uppercase tracking-widest">Ver Jugadores</span>
          <ChevronRight size={14} />
        </div>
      </div>

      <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-blue-500/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
    </Link>
  );
}
