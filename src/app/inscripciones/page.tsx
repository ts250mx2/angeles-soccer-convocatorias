"use client";
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Search, MapPin, ChevronRight, UserCheck } from 'lucide-react';
import { useUser } from '@/contexts/user-context';
import DashboardLayout from '@/components/DashboardLayout';

interface SedeSummary {
  IdSede: number;
  Sede: string;
  Inscritos: number;
}

export default function InscripcionesSedesPage() {
  const router = useRouter();
  const { user, isInitialized } = useUser();
  const [sedes, setSedes] = useState<SedeSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  // Check if user is logged in
  useEffect(() => {
    if (isInitialized && !user) {
      router.push('/login');
    }
  }, [user, isInitialized, router]);

  const fetchSedes = async () => {
    setIsLoading(true);
    try {
      const response = await fetch('/api/inscripciones/sedes');
      const data = await response.json();
      if (data.success) {
        setSedes(data.data);
      } else {
        console.error('Error fetching sedes:', data.message);
      }
    } catch (error) {
      console.error('Error fetching sedes:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isInitialized && user) {
      fetchSedes();
    }
  }, [isInitialized, user]);

  const filteredSedes = sedes.filter(sede => 
    sede.Sede.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const sedesWithInscritos = filteredSedes.filter(sede => sede.Inscritos > 0);
  const sedesWithoutInscritos = filteredSedes.filter(sede => sede.Inscritos === 0);

  return (
    <DashboardLayout>
      <main className="overflow-y-auto flex-1 text-white p-6 md:p-8 relative">
        <div className="max-w-7xl mx-auto">
          
          <div className="mb-12">
            <h1 className="text-3xl font-black text-white mb-2">Inscripciones por Sede</h1>
            <p className="text-slate-400">Monitoreo de jugadores inscritos segmentado por campus</p>
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

            <div className="flex gap-4 w-full md:w-auto">
              <div className="flex-1 md:flex-none bg-emerald-500/10 border border-emerald-500/20 px-4 py-2 rounded-xl flex items-center gap-3">
                <div className="bg-emerald-500/20 p-2 rounded-lg">
                  <UserCheck size={18} className="text-emerald-400" />
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-emerald-400 font-bold">Total Inscritos</p>
                  <p className="text-xl font-bold">{sedes.reduce((acc, curr) => acc + curr.Inscritos, 0)}</p>
                </div>
              </div>
              <div className="flex-1 md:flex-none bg-blue-500/10 border border-blue-500/20 px-4 py-2 rounded-xl flex items-center gap-3">
                <div className="bg-blue-500/20 p-2 rounded-lg">
                  <MapPin size={18} className="text-blue-400" />
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-blue-400 font-bold">Total Sedes</p>
                  <p className="text-xl font-bold">{sedes.length}</p>
                </div>
              </div>
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
                      <SedeCard key={sede.IdSede} sede={sede} />
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
                      <SedeCard key={sede.IdSede} sede={sede} />
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
      </main>
    </DashboardLayout>
  );
}

function SedeCard({ sede }: { sede: SedeSummary }) {
  return (
    <Link 
      href={`/inscripciones/${sede.IdSede}`}
      className="group relative bg-white/5 hover:bg-white/[0.08] border border-white/10 hover:border-blue-500/30 rounded-2xl transition-all duration-300 hover:shadow-[0_20px_50px_rgba(0,0,0,0.3)] overflow-hidden h-full block backdrop-blur-sm"
    >
      <div className="absolute -inset-24 bg-blue-600/5 blur-3xl opacity-0 group-hover:opacity-100 transition-opacity duration-700 pointer-events-none"></div>
      
      <div className="p-5 block relative z-10 h-full">
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

        <div className="space-y-2">
          <div className="flex justify-between items-center bg-white/[0.03] p-3 rounded-lg border border-white/5">
            <span className="text-xs text-slate-400 flex items-center gap-2 font-medium uppercase tracking-wider">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
              Jugadores Inscritos
            </span>
            <span className="text-xl font-black text-emerald-400">{sede.Inscritos}</span>
          </div>
        </div>

        <div className="mt-4 pt-4 border-t border-white/5 flex items-center justify-between text-blue-400 opacity-0 group-hover:opacity-100 transition-all translate-y-2 group-hover:translate-y-0">
          <span className="text-[10px] font-black uppercase tracking-widest">Ver Categorías</span>
          <ChevronRight size={14} />
        </div>
      </div>

      <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-blue-500/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
    </Link>
  );
}
