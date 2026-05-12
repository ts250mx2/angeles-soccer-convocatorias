"use client";
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ChevronLeft, Search, Users, UserMinus, UserCheck, CreditCard } from 'lucide-react';
import { useUser } from '@/contexts/user-context';

interface CategorySummary {
  Categoria: string;
  Activos: number;
  Bajas: number;
  PendientesInscripcion: number;
  PendientesMensualidad: number;
}

interface PageConfig {
  startMonth: number;
  currentMonth: number;
  numMonthsExpected: number;
}

export default function AdeudosPage() {
  const router = useRouter();
  const { user, isInitialized } = useUser();
  const [categories, setCategories] = useState<CategorySummary[]>([]);
  const [config, setConfig] = useState<PageConfig | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  // Check if user is logged in
  useEffect(() => {
    if (isInitialized && !user) {
      router.push('/login');
    }
  }, [user, isInitialized, router]);

  const fetchCategories = async () => {
    setIsLoading(true);
    try {
      const response = await fetch('/api/adeudos/categories');
      const data = await response.json();
      if (data.success) {
        setCategories(data.data);
        setConfig(data.config);
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
      fetchCategories();
    }
  }, [isInitialized, user]);

  const filteredCategories = categories.filter(cat => 
    cat.Categoria.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const categoriesWithActivos = filteredCategories.filter(cat => cat.Activos > 0);
  const categoriesWithoutActivos = filteredCategories.filter(cat => cat.Activos === 0);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 text-white">
      {/* Header */}
      <nav className="bg-white/10 backdrop-blur-xl border-b border-white/20 px-6 py-4 flex justify-between items-center shadow-lg sticky top-0 z-50">
        <div className="flex items-center gap-4">
          <Link href="/" className="p-2 hover:bg-white/10 rounded-full transition-colors">
            <ChevronLeft size={24} />
          </Link>
          <div>
            <h1 className="text-xl font-bold">Adeudos por Categoría</h1>
            <p className="text-xs text-blue-200">Gestiona y visualiza el estado de los jugadores</p>
          </div>
        </div>
        <div className="flex items-center gap-2 px-3 py-1 bg-white/10 rounded-full border border-white/20">
          <CreditCard size={16} className="text-blue-300" />
          <span className="text-sm font-medium">{categories.length} Categorías</span>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto p-6 md:p-8">
        {/* Search and Stats Section */}
        <div className="mb-8 flex flex-col md:flex-row gap-6 items-start md:items-center justify-between">
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

          <div className="flex gap-4 w-full md:w-auto">
            <div className="flex-1 md:flex-none bg-emerald-500/10 border border-emerald-500/20 px-4 py-2 rounded-xl flex items-center gap-3">
              <div className="bg-emerald-500/20 p-2 rounded-lg">
                <UserCheck size={18} className="text-emerald-400" />
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wider text-emerald-400 font-bold">Total Activos</p>
                <p className="text-xl font-bold">{categories.reduce((acc, curr) => acc + curr.Activos, 0)}</p>
              </div>
            </div>
            <div className="flex-1 md:flex-none bg-rose-500/10 border border-rose-500/20 px-4 py-2 rounded-xl flex items-center gap-3">
              <div className="bg-rose-500/20 p-2 rounded-lg">
                <UserMinus size={18} className="text-rose-400" />
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wider text-rose-400 font-bold">Total Bajas</p>
                <p className="text-xl font-bold">{categories.reduce((acc, curr) => acc + curr.Bajas, 0)}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Categories Grid */}
        {isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {[...Array(8)].map((_, i) => (
              <div key={i} className="h-48 bg-white/5 rounded-2xl animate-pulse border border-white/10" />
            ))}
          </div>
        ) : filteredCategories.length > 0 ? (
          <div className="space-y-12">
            {/* Active Categories */}
            {categoriesWithActivos.length > 0 && (
              <div>
                <div className="flex items-center gap-3 mb-6">
                  <div className="h-px flex-1 bg-white/10" />
                  <h2 className="text-sm font-black uppercase tracking-[0.2em] text-blue-400/60">Categorías Activas</h2>
                  <div className="h-px flex-1 bg-white/10" />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                  {categoriesWithActivos.map((cat) => (
                    <CategoryCard key={cat.Categoria} cat={cat} />
                  ))}
                </div>
              </div>
            )}

            {/* Inactive Categories (No Active Players) */}
            {categoriesWithoutActivos.length > 0 && (
              <div>
                <div className="flex items-center gap-3 mb-6">
                  <div className="h-px flex-1 bg-white/10" />
                  <h2 className="text-sm font-black uppercase tracking-[0.2em] text-slate-500/60">Categorías sin Jugadores Activos</h2>
                  <div className="h-px flex-1 bg-white/10" />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 opacity-60 hover:opacity-100 transition-opacity">
                  {categoriesWithoutActivos.map((cat) => (
                    <CategoryCard key={cat.Categoria} cat={cat} />
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="text-center py-20 bg-white/5 rounded-3xl border border-dashed border-white/20">
            <Users size={48} className="mx-auto text-slate-500 mb-4 opacity-20" />
            <h3 className="text-xl font-bold text-slate-300">No se encontraron categorías</h3>
            <p className="text-slate-500 mt-2">Prueba con un término de búsqueda diferente</p>
          </div>
        )}
      </main>
    </div>
  );
}

function CategoryCard({ cat }: { cat: CategorySummary }) {
  return (
    <Link 
      href={`/adeudos/${encodeURIComponent(cat.Categoria)}`}
      className="group relative bg-white/5 hover:bg-white/10 border border-white/10 hover:border-blue-500/50 rounded-2xl p-6 transition-all duration-300 hover:shadow-2xl hover:shadow-blue-500/10 hover:-translate-y-1 overflow-hidden h-full block"
    >
      {/* Decorative background circle */}
      <div className="absolute -right-8 -top-8 w-32 h-32 bg-blue-600/5 rounded-full group-hover:bg-blue-600/10 transition-colors" />
      
      <div className="relative z-10">
        <div className="mb-6 flex justify-between items-start">
          <div className="bg-blue-500/20 p-3 rounded-xl group-hover:bg-blue-500/30 transition-colors">
            <Users size={24} className="text-blue-400" />
          </div>
          <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest bg-white/5 px-2 py-1 rounded-md">
            Cat.
          </div>
        </div>

        <h3 className="text-lg font-bold mb-4 group-hover:text-blue-300 transition-colors line-clamp-1">
          {cat.Categoria}
        </h3>

        <div className="space-y-3">
          <div className="flex justify-between items-center bg-white/5 p-2 rounded-lg">
            <span className="text-xs text-slate-400 flex items-center gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              Activos
            </span>
            <span className="text-sm font-bold text-emerald-400">{cat.Activos}</span>
          </div>
          <div className="flex justify-between items-center bg-white/5 p-2 rounded-lg">
            <span className="text-xs text-slate-400 flex items-center gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-rose-500" />
              Bajas
            </span>
            <span className="text-sm font-bold text-rose-400">{cat.Bajas}</span>
          </div>
          
          <div className="grid grid-cols-2 gap-2 mt-4">
            <div className={`p-2 rounded-lg border ${cat.PendientesInscripcion > 0 ? 'bg-amber-500/10 border-amber-500/20 text-amber-400' : 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'}`}>
              <p className="text-[8px] uppercase font-bold mb-0.5">Inscripción</p>
              <p className="text-xs font-black">{cat.PendientesInscripcion > 0 ? `${cat.PendientesInscripcion} Pend.` : 'Al día'}</p>
            </div>
            <div className={`p-2 rounded-lg border ${cat.PendientesMensualidad > 0 ? 'bg-rose-500/10 border-rose-500/20 text-rose-400' : 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'}`}>
              <p className="text-[8px] uppercase font-bold mb-0.5">Mensualidad</p>
              <p className="text-xs font-black">{cat.PendientesMensualidad > 0 ? `${cat.PendientesMensualidad} Pend.` : 'Al día'}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Progress Bar (Visual only) */}
      <div className="absolute bottom-0 left-0 h-1 bg-gradient-to-r from-blue-600 to-indigo-600 w-0 group-hover:w-full transition-all duration-500" />
    </Link>
  );
}
