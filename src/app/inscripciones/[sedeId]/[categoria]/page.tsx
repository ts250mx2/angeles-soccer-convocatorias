"use client";
import { useEffect, useState, use } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ChevronLeft, Search, User, CheckCircle2, XCircle, Clock, MapPin, Users } from 'lucide-react';
import { useUser } from '@/contexts/user-context';
import DashboardLayout from '@/components/DashboardLayout';

interface Player {
  IdJugador: number;
  Jugador: string;
  Categoria: string;
  Status: number;
  Beca: string | null;
  IdSede: number;
  SedeNombre: string;
}

export default function InscripcionesJugadoresPage({ params }: { params: Promise<{ sedeId: string, categoria: string }> }) {
  const resolvedParams = use(params);
  const sedeId = resolvedParams.sedeId;
  const decodedCategoria = decodeURIComponent(resolvedParams.categoria);
  const router = useRouter();
  const { user, isInitialized } = useUser();
  const [players, setPlayers] = useState<Player[]>([]);
  const [sedeName, setSedeName] = useState(`Sede ${sedeId}`);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  type FilterOption = 'todos' | 'activos' | 'becados' | 'sin_beca' | 'bajas';
  const [activeFilter, setActiveFilter] = useState<FilterOption>('todos');

  // Check if user is logged in
  useEffect(() => {
    if (isInitialized && !user) {
      router.push('/login');
    }
  }, [user, isInitialized, router]);

  const fetchPlayers = async () => {
    setIsLoading(true);
    try {
      const response = await fetch(`/api/inscripciones/players?sedeId=${sedeId}&categoria=${encodeURIComponent(decodedCategoria)}`);
      const data = await response.json();
      if (data.success) {
        setPlayers(data.data);
        if (data.data.length > 0) {
          setSedeName(data.data[0].SedeNombre);
        }
      } else {
        console.error('Error fetching players:', data.message);
      }
    } catch (error) {
      console.error('Error fetching players:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isInitialized && user) {
      fetchPlayers();
    }
  }, [isInitialized, user, sedeId, decodedCategoria]);

  const countTodos = players.length;
  const countActivos = players.filter(p => p.Status === 0).length;
  const countBecados = players.filter(p => p.Beca !== null && p.Beca !== undefined && p.Beca !== '' && String(p.Beca) !== '0').length;
  const countSinBeca = players.filter(p => p.Status === 0 && (p.Beca === null || p.Beca === undefined || p.Beca === '' || String(p.Beca) === '0')).length;
  const countBajas = players.filter(p => p.Status === 2).length;

  const filteredPlayers = players.filter(player => {
    const matchesSearch = player.Jugador.toLowerCase().includes(searchQuery.toLowerCase()) ||
      player.IdJugador.toString().includes(searchQuery);
    
    if (!matchesSearch) return false;

    switch (activeFilter) {
      case 'activos':
        return player.Status === 0;
      case 'becados':
        return player.Beca !== null && player.Beca !== undefined && player.Beca !== '' && String(player.Beca) !== '0';
      case 'sin_beca':
        return player.Status === 0 && (player.Beca === null || player.Beca === undefined || player.Beca === '' || String(player.Beca) === '0');
      case 'bajas':
        return player.Status === 2;
      case 'todos':
      default:
        return true;
    }
  });

  const getStatusBadge = (status: number) => {
    switch (status) {
      case 0:
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
            <CheckCircle2 size={12} />
            ACTIVO
          </span>
        );
      case 2:
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-bold bg-rose-500/20 text-rose-400 border border-rose-500/30">
            <XCircle size={12} />
            BAJA
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-bold bg-slate-500/20 text-slate-400 border border-slate-500/30">
            <Clock size={12} />
            OTROS ({status})
          </span>
        );
    }
  };

  return (
    <DashboardLayout>
      <main className="overflow-y-auto flex-1 text-white relative">
        <div className="bg-white/5 backdrop-blur-xl border-b border-white/10 px-6 py-4 flex justify-between items-center shadow-lg sticky top-0 z-20">
          <div className="flex items-center gap-4">
            <Link href={`/inscripciones/${sedeId}`} className="p-2 hover:bg-white/10 rounded-full transition-colors">
              <ChevronLeft size={24} />
            </Link>
            <div>
              <h1 className="text-xl font-bold flex items-center gap-2">
                <Users size={20} className="text-blue-400" />
                {decodedCategoria}
              </h1>
              <p className="text-xs text-blue-200 uppercase tracking-widest font-black flex items-center gap-1">
                <MapPin size={10} /> {sedeName}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="bg-emerald-500/20 px-4 py-1.5 rounded-xl border border-emerald-500/30">
              <span className="text-sm font-bold text-emerald-400">{players.filter(p => p.Status === 0).length} Activos</span>
            </div>
            <div className="bg-blue-500/20 px-4 py-1.5 rounded-xl border border-blue-500/30">
              <span className="text-sm font-bold text-blue-300">{players.length} Total</span>
            </div>
          </div>
        </div>

        <div className="max-w-6xl mx-auto p-6 md:p-8">
          <div className="mb-8 relative group max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-blue-400 transition-colors" size={18} />
            <input type="text" placeholder="Buscar por nombre o ID..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-xl pl-10 pr-4 py-3 outline-none focus:bg-white/10 focus:border-blue-500/50 transition-all text-white placeholder-slate-400" />
          </div>

          {/* Filters Bar */}
          <div className="mb-8 flex gap-2 overflow-x-auto pb-2 flex-wrap">
            {[
              { id: 'todos', label: 'Todos', count: countTodos, color: 'text-blue-400 bg-blue-500/10 border-blue-500/20' },
              { id: 'activos', label: 'Activos', count: countActivos, color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20' },
              { id: 'becados', label: 'Becados', count: countBecados, color: 'text-amber-400 bg-amber-500/10 border-amber-500/20' },
              { id: 'sin_beca', label: 'Sin Beca', count: countSinBeca, color: 'text-purple-400 bg-purple-500/10 border-purple-500/20' },
              { id: 'bajas', label: 'Bajas', count: countBajas, color: 'text-rose-400 bg-rose-500/10 border-rose-500/20' },
            ].map(opt => {
              const isActive = activeFilter === opt.id;
              return (
                <button
                  key={opt.id}
                  onClick={() => setActiveFilter(opt.id as FilterOption)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all border cursor-pointer ${
                    isActive
                      ? 'bg-blue-600 border-blue-500 text-white shadow-lg shadow-blue-500/20 scale-[1.02]'
                      : 'bg-white/5 border-white/10 text-slate-400 hover:text-white hover:bg-white/10'
                  }`}
                >
                  <span>{opt.label}</span>
                  <span className={`px-1.5 py-0.5 rounded-md text-[9px] font-black ${
                    isActive ? 'bg-white/20 text-white' : opt.color
                  }`}>
                    {opt.count}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="space-y-4">
            {isLoading ? (
              <div className="p-20 flex flex-col items-center justify-center gap-4">
                <div className="w-12 h-12 border-4 border-blue-500/20 border-t-blue-500 rounded-full animate-spin" />
                <p className="text-slate-400 font-medium">Cargando jugadores...</p>
              </div>
            ) : filteredPlayers.length > 0 ? (
              <div className="bg-white/5 border border-white/10 rounded-3xl overflow-hidden shadow-2xl divide-y divide-white/5">
                {filteredPlayers.map((player) => (
                  <div key={player.IdJugador} className="p-4 md:p-6 flex items-center justify-between hover:bg-white/5 transition-colors group">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-2xl bg-blue-500/10 flex items-center justify-center text-blue-400 border border-blue-500/20">
                        <User size={24} />
                      </div>
                      <div>
                        <h4 className="font-bold text-slate-200 group-hover:text-white transition-colors flex items-center gap-2">
                          {player.Jugador}
                          {player.Beca && String(player.Beca) !== '0' && (
                            <span className="px-1.5 py-0.5 rounded-md bg-amber-500/20 text-amber-500 text-[9px] font-black border border-amber-500/30">
                              BECA: {player.Beca}
                            </span>
                          )}
                        </h4>
                        <div className="flex items-center gap-2">
                          <p className="text-xs text-slate-500 font-mono">ID: {player.IdJugador}</p>
                        </div>
                      </div>
                    </div>
                    <div className="text-right flex flex-col items-end gap-2">
                      {getStatusBadge(player.Status)}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-20 bg-white/5 rounded-3xl border border-dashed border-white/20">
                <User size={48} className="mx-auto text-slate-500 mb-4 opacity-20" />
                <h3 className="text-xl font-bold text-slate-300">No hay jugadores</h3>
                <p className="text-slate-500 mt-2">No se encontraron resultados para "{searchQuery}"</p>
              </div>
            )}
          </div>

        </div>
      </main>
    </DashboardLayout>
  );
}
