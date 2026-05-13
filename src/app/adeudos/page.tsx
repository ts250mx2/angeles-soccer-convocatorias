"use client";
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Search, Users, UserMinus, UserCheck, CheckCircle2, ChevronRight, X } from 'lucide-react';
import { useUser } from '@/contexts/user-context';
import DashboardLayout from '@/components/DashboardLayout';

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
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);

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

  const toggleCategory = (catName: string) => {
    setSelectedCategories(prev => 
      prev.includes(catName) 
        ? prev.filter(c => c !== catName) 
        : [...prev, catName]
    );
  };

  const filteredCategories = categories.filter(cat => 
    cat.Categoria.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const categoriesWithActivos = filteredCategories.filter(cat => cat.Activos > 0);
  const categoriesWithoutActivos = filteredCategories.filter(cat => cat.Activos === 0);

  const handleVerDetalleMulti = () => {
    if (selectedCategories.length === 0) return;
    const encoded = encodeURIComponent(selectedCategories.join(','));
    router.push(`/adeudos/multi?categories=${encoded}`);
  };

  return (
    <DashboardLayout>
      <main className="overflow-y-auto flex-1 text-white p-6 md:p-8 relative">
        <div className="max-w-7xl mx-auto">
          
          {/* Multi-select Banner */}
          {selectedCategories.length > 0 && (
            <div className="mb-8 p-4 bg-blue-600 rounded-2xl flex items-center justify-between shadow-[0_10px_30px_rgba(37,99,235,0.3)] animate-in slide-in-from-top-4 duration-300">
              <div className="flex items-center gap-4">
                <div className="bg-white/20 p-2 rounded-xl">
                  <CheckCircle2 size={24} className="text-white" />
                </div>
                <div>
                  <h3 className="text-lg font-black text-white">{selectedCategories.length} categorías seleccionadas</h3>
                  <p className="text-xs text-blue-100 font-bold opacity-80">{selectedCategories.join(', ')}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button 
                  onClick={() => setSelectedCategories([])}
                  className="px-4 py-2 text-xs font-black text-blue-100 hover:text-white hover:bg-white/10 rounded-xl transition-all"
                >
                  Limpiar Selección
                </button>
                <button 
                  onClick={handleVerDetalleMulti}
                  className="bg-white text-blue-600 px-6 py-2.5 rounded-xl text-xs font-black hover:bg-blue-50 transition-all flex items-center gap-2 shadow-lg"
                >
                  Ver Detalle Combinado
                  <ChevronRight size={14} />
                </button>
              </div>
            </div>
          )}

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
                  <div className="flex items-center gap-4 mb-8">
                    <h2 className="text-[10px] font-black uppercase tracking-[0.3em] text-blue-400/80 bg-blue-500/10 px-3 py-1 rounded-full border border-blue-500/20">Categorías Activas</h2>
                    <div className="h-px flex-1 bg-gradient-to-r from-blue-500/20 to-transparent" />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                    {categoriesWithActivos.map((cat) => (
                      <CategoryCard 
                        key={cat.Categoria} 
                        cat={cat} 
                        isSelected={selectedCategories.includes(cat.Categoria)}
                        onToggle={() => toggleCategory(cat.Categoria)}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Inactive Categories (No Active Players) */}
              {categoriesWithoutActivos.length > 0 && (
                <div className="pt-8">
                  <div className="flex items-center gap-4 mb-8">
                    <h2 className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-500/80 bg-white/5 px-3 py-1 rounded-full border border-white/10">Sin Jugadores Activos</h2>
                    <div className="h-px flex-1 bg-gradient-to-r from-white/10 to-transparent" />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 opacity-50 hover:opacity-100 transition-all duration-500">
                    {categoriesWithoutActivos.map((cat) => (
                      <CategoryCard 
                        key={cat.Categoria} 
                        cat={cat} 
                        isSelected={selectedCategories.includes(cat.Categoria)}
                        onToggle={() => toggleCategory(cat.Categoria)}
                      />
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
        </div>
      </main>
    </DashboardLayout>
  );
}

function CategoryCard({ cat, isSelected, onToggle }: { cat: CategorySummary, isSelected: boolean, onToggle: () => void }) {
  return (
    <div 
      className={`group relative bg-white/5 hover:bg-white/[0.08] border ${isSelected ? 'border-blue-500 ring-2 ring-blue-500/20 scale-[1.02]' : 'border-white/10 hover:border-blue-500/30'} rounded-2xl transition-all duration-300 hover:shadow-[0_20px_50px_rgba(0,0,0,0.3)] overflow-hidden h-full block backdrop-blur-sm`}
    >
      {/* Subtle Gradient Glow */}
      <div className={`absolute -inset-24 bg-blue-600/5 blur-3xl ${isSelected ? 'opacity-100' : 'opacity-0'} group-hover:opacity-100 transition-opacity duration-700 pointer-events-none`}></div>
      
      {/* Selection Toggle (Checkbox-like) */}
      <button 
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onToggle();
        }}
        className={`absolute top-4 right-4 z-20 w-6 h-6 rounded-full border-2 transition-all flex items-center justify-center shadow-lg
          ${isSelected 
            ? 'bg-blue-500 border-blue-400 text-white scale-110' 
            : 'bg-white/5 border-white/20 text-transparent hover:border-blue-500/50 hover:bg-white/10'}`}
      >
        <CheckCircle2 size={14} className={isSelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-20'} />
      </button>

      {/* Main Content - Navigates to Detail */}
      <Link 
        href={`/adeudos/${encodeURIComponent(cat.Categoria)}`}
        className="p-5 block relative z-10 h-full"
      >
        <div className="mb-4 flex justify-between items-center">
          <div className={`${isSelected ? 'bg-blue-500 text-white' : 'bg-blue-500/10 text-blue-400 group-hover:bg-blue-500/20'} p-2.5 rounded-xl transition-all duration-500 group-hover:scale-110 border border-blue-500/10`}>
            <Users size={18} />
          </div>
          <div className="text-[9px] font-black text-slate-500 uppercase tracking-widest bg-white/5 px-2 py-0.5 rounded-md border border-white/5 mr-8">
            Categoría
          </div>
        </div>

        <h3 className="text-sm font-black mb-4 text-slate-200 group-hover:text-white transition-colors line-clamp-1 tracking-tight">
          {cat.Categoria}
        </h3>

        <div className="space-y-2">
          <div className="flex justify-between items-center bg-white/[0.03] p-2 rounded-lg border border-white/5">
            <span className="text-[10px] text-slate-400 flex items-center gap-2 font-medium">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
              Activos
            </span>
            <span className="text-xs font-black text-emerald-400">{cat.Activos}</span>
          </div>
          <div className="flex justify-between items-center bg-white/[0.03] p-2 rounded-lg border border-white/5">
            <span className="text-[10px] text-slate-400 flex items-center gap-2 font-medium">
              <div className="w-1.5 h-1.5 rounded-full bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.5)]" />
              Bajas
            </span>
            <span className="text-xs font-bold text-rose-400/80">{cat.Bajas}</span>
          </div>
          
          <div className="grid grid-cols-2 gap-2 mt-4">
            <div className={`p-2 rounded-lg border transition-colors ${cat.PendientesInscripcion > 0 ? 'bg-amber-500/5 border-amber-500/10 text-amber-400/80' : 'bg-emerald-500/5 border-emerald-500/10 text-emerald-400/80'}`}>
              <p className="text-[7px] uppercase font-black mb-0.5 tracking-tighter opacity-60">Inscripción</p>
              <p className="text-[10px] font-black">{cat.PendientesInscripcion > 0 ? `${cat.PendientesInscripcion} Pend.` : '✓ OK'}</p>
            </div>
            <div className={`p-2 rounded-lg border transition-colors ${cat.PendientesMensualidad > 0 ? 'bg-rose-500/5 border-rose-500/10 text-rose-400/80' : 'bg-emerald-500/5 border-emerald-500/10 text-emerald-400/80'}`}>
              <p className="text-[7px] uppercase font-black mb-0.5 tracking-tighter opacity-60">Mensualidad</p>
              <p className="text-[10px] font-black">{cat.PendientesMensualidad > 0 ? `${cat.PendientesMensualidad} Pend.` : '✓ OK'}</p>
            </div>
          </div>
        </div>
      </Link>

      {/* Decorative Accent */}
      <div className={`absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-blue-500/20 to-transparent ${isSelected ? 'opacity-100' : 'opacity-0'} group-hover:opacity-100 transition-opacity`} />
    </div>
  );
}
