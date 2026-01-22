"use client";
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { LogOut } from 'lucide-react';
import { useUser } from '@/contexts/user-context';
import { useEffect, useState } from 'react';

interface ConvocatoriaSummary {
  IdTemporada: number;
  IdLiga: number;
  Categoria: string;
  Liga: string;
  FechaInicio: string;
  FechaFin: string;
  Cerrada: number;
  JugadoresConvocados: number;
  Total: number;
}

export default function Home() {
  const router = useRouter();
  const { user, season, seasonId, setSeason, isInitialized } = useUser();
  const [convocatorias, setConvocatorias] = useState<ConvocatoriaSummary[]>([]);
  const [leagues, setLeagues] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [filters, setFilters] = useState({
    liga: '',
    categoria: '',
    fechaInicio: '',
    fechaFin: '',
    cerrada: '',
    jugadoresConvocados: '',
    total: ''
  });

  // Create Modal State
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [newConvocatoria, setNewConvocatoria] = useState({
    leagueId: '',
    categoria: '',
    fechaInicio: '',
    fechaFin: ''
  });

  // Players Modal State
  const [isPlayersModalOpen, setIsPlayersModalOpen] = useState(false);
  const [selectedConvocatoria, setSelectedConvocatoria] = useState<ConvocatoriaSummary | null>(null);
  const [players, setPlayers] = useState<any[]>([]);
  const [totalPrice, setTotalPrice] = useState<number>(0);
  const [recordCount, setRecordCount] = useState<number>(0);
  const [isLoadingPlayers, setIsLoadingPlayers] = useState(false);
  const [playerFilters, setPlayerFilters] = useState({
    idJugador: '',
    jugador: '',
    categoria: '',
    precio: '',
    estado: ''
  });
  const [playerSortConfig, setPlayerSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' } | null>(null);

  // Invite Modal State
  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);
  const [availablePlayers, setAvailablePlayers] = useState<any[]>([]);
  const [isLoadingAvailablePlayers, setIsLoadingAvailablePlayers] = useState(false);
  const [selectedPlayerId, setSelectedPlayerId] = useState<string>('');
  const [playerSearchQuery, setPlayerSearchQuery] = useState<string>('');
  const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' } | null>(null);

  // Check if user is logged in, redirect to login if not
  useEffect(() => {
    if (isInitialized && !user) {
      router.push('/login');
    }
  }, [user, isInitialized, router]);


  // Fetch convocatorias summary
  const fetchConvocatorias = async () => {
    setIsLoading(true);
    try {
      const response = await fetch('/api/convocatorias/summary');
      const data = await response.json();
      if (data.success) {
        setConvocatorias(data.data);
      } else {
        console.error('Error fetching convocatorias:', data.message);
        alert('Error al cargar convocatorias: ' + data.message);
      }
    } catch (error) {
      console.error('Error invoking API:', error);
      alert('Ocurrió un error al cargar los datos.');
    } finally {
      setIsLoading(false);
    }
  };

  // Fetch convocatorias summary on mount
  useEffect(() => {
    if (isInitialized) {
      fetchConvocatorias();
    }
  }, [isInitialized]);

  // Fetch current season and leagues
  useEffect(() => {
    fetch('/api/season')
      .then(res => res.json())
      .then(data => {
        if (data.success && data.season) {
          setSeason(data.season.Temporada, data.season.IdTemporada);
        }
      })
      .catch(err => console.error('Error fetching season:', err));

    fetch('/api/leagues')
      .then(res => res.json())
      .then(data => {
        if (data.success) {
          setLeagues(data.leagues);
        }
      })
      .catch(err => console.error('Error fetching leagues:', err));
  }, [setSeason]);

  const handleSort = (key: string) => {
    let direction: 'asc' | 'desc' = 'asc';
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  const filteredConvocatorias = convocatorias.filter((item) => {
    return (
      item.Liga.toLowerCase().includes(filters.liga.toLowerCase()) &&
      item.Categoria.toLowerCase().includes(filters.categoria.toLowerCase()) &&
      (filters.fechaInicio === '' || item.FechaInicio?.includes(filters.fechaInicio)) &&
      (filters.fechaFin === '' || item.FechaFin?.includes(filters.fechaFin)) &&
      (filters.cerrada === '' || (item.Cerrada ? 'sí' : 'no').includes(filters.cerrada.toLowerCase())) &&
      item.JugadoresConvocados.toString().includes(filters.jugadoresConvocados) &&
      item.Total.toString().includes(filters.total)
    );
  });

  const sortedConvocatorias = [...filteredConvocatorias].sort((a, b) => {
    if (!sortConfig) return 0;
    const { key, direction } = sortConfig;
    const aValue = a[key as keyof ConvocatoriaSummary];
    const bValue = b[key as keyof ConvocatoriaSummary];

    if (aValue < bValue) {
      return direction === 'asc' ? -1 : 1;
    }
    if (aValue > bValue) {
      return direction === 'asc' ? 1 : -1;
    }
    return 0;
  });

  const formatDate = (dateString: string | null) => {
    if (!dateString) return '-';
    const date = new Date(dateString);
    return date.toLocaleDateString('es-MX', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  const handleCreateConvocatoria = async () => {
    if (!seasonId || !newConvocatoria.leagueId || !newConvocatoria.categoria || !newConvocatoria.fechaInicio || !newConvocatoria.fechaFin) {
      alert('Por favor complete todos los campos');
      return;
    }

    try {
      const response = await fetch('/api/convocatorias/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          seasonId,
          leagueId: newConvocatoria.leagueId,
          categoria: newConvocatoria.categoria,
          fechaInicio: newConvocatoria.fechaInicio,
          fechaFin: newConvocatoria.fechaFin
        })
      });

      const data = await response.json();
      if (data.success) {
        alert('Convocatoria creada exitosamente');
        setIsCreateModalOpen(false);
        setNewConvocatoria({
          leagueId: '',
          categoria: '',
          fechaInicio: '',
          fechaFin: ''
        });
        // Refresh the list
        const refreshResponse = await fetch('/api/convocatorias/summary');
        const refreshData = await refreshResponse.json();
        if (refreshData.success) {
          setConvocatorias(refreshData.data);
        }
      } else {
        alert('Error al crear convocatoria: ' + data.message);
      }
    } catch (error) {
      console.error('Error creating convocatoria:', error);
      alert('Error al procesar la solicitud');
    }
  };

  const handleCloseConvocatoria = async (item: ConvocatoriaSummary) => {
    const confirmClose = confirm(`¿Está seguro de cerrar la convocatoria de ${item.Liga} - ${item.Categoria}?`);
    if (!confirmClose) return;

    try {
      const response = await fetch('/api/convocatorias/close', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          seasonId: item.IdTemporada,
          leagueId: item.IdLiga,
          categoria: item.Categoria
        })
      });

      const data = await response.json();
      if (data.success) {
        alert('Convocatoria cerrada exitosamente');
        // Refresh the list
        const refreshResponse = await fetch('/api/convocatorias/summary');
        const refreshData = await refreshResponse.json();
        if (refreshData.success) {
          setConvocatorias(refreshData.data);
        }
      } else {
        alert('Error al cerrar convocatoria: ' + data.message);
      }
    } catch (error) {
      console.error('Error closing convocatoria:', error);
      alert('Error al procesar la solicitud');
    }
  };

  const handleNavigateToConvocatoria = async (item: ConvocatoriaSummary) => {
    setSelectedConvocatoria(item);
    setIsPlayersModalOpen(true);
    setIsLoadingPlayers(true);

    try {
      const response = await fetch(
        `/api/convocatorias/players?seasonId=${item.IdTemporada}&leagueId=${item.IdLiga}&categoria=${encodeURIComponent(item.Categoria)}`
      );
      const data = await response.json();
      if (data.success) {
        setPlayers(data.data);
        setTotalPrice(data.total || 0);
        setRecordCount(data.count || 0);
      } else {
        alert('Error al cargar jugadores: ' + data.message);
      }
    } catch (error) {
      console.error('Error loading players:', error);
      alert('Error al cargar jugadores');
    } finally {
      setIsLoadingPlayers(false);
    }
  };

  const handleConvocarPlayer = async (player: any) => {
    if (!selectedConvocatoria) return;

    try {
      const response = await fetch('/api/convocatorias/convoke', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          seasonId: selectedConvocatoria.IdTemporada,
          leagueId: selectedConvocatoria.IdLiga,
          playerId: player.IdJugador,
          categoria: selectedConvocatoria.Categoria
        })
      });

      const data = await response.json();
      if (data.success) {
        // Refresh players list
        await handleNavigateToConvocatoria(selectedConvocatoria);
      } else {
        alert('Error al convocar: ' + data.message);
      }
    } catch (error) {
      console.error('Error convocando jugador:', error);
      alert('Error al procesar la solicitud');
    }
  };

  const handleQuitarPlayer = async (player: any) => {
    if (!selectedConvocatoria) return;

    const confirmRemove = confirm(`¿Está seguro de quitar a ${player.Jugador}?`);
    if (!confirmRemove) return;

    try {
      const response = await fetch('/api/convocatorias/remove', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          seasonId: selectedConvocatoria.IdTemporada,
          leagueId: selectedConvocatoria.IdLiga,
          playerId: player.IdJugador,
          categoria: selectedConvocatoria.Categoria
        })
      });

      const data = await response.json();
      if (data.success) {
        // Refresh players list
        await handleNavigateToConvocatoria(selectedConvocatoria);
      } else {
        alert('Error al quitar: ' + data.message);
      }
    } catch (error) {
      console.error('Error quitando jugador:', error);
      alert('Error al procesar la solicitud');
    }
  };

  const handleEliminarPlayer = async (player: any) => {
    if (!selectedConvocatoria) return;

    const confirmEliminar = confirm(`¿Está seguro de eliminar a ${player.Jugador}? Esta acción marcará al jugador como eliminado.`);
    if (!confirmEliminar) return;

    try {
      const response = await fetch('/api/convocatorias/remove', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          seasonId: selectedConvocatoria.IdTemporada,
          leagueId: selectedConvocatoria.IdLiga,
          playerId: player.IdJugador,
          categoria: selectedConvocatoria.Categoria
        })
      });

      const data = await response.json();
      if (data.success) {
        // Refresh players list
        await handleNavigateToConvocatoria(selectedConvocatoria);
      } else {
        alert('Error al eliminar: ' + data.message);
      }
    } catch (error) {
      console.error('Error eliminando jugador:', error);
      alert('Error al procesar la solicitud');
    }
  };

  // Filter and sort players
  const filteredPlayers = players.filter((player) => {
    return (
      player.IdJugador.toString().includes(playerFilters.idJugador) &&
      player.Jugador.toLowerCase().includes(playerFilters.jugador.toLowerCase()) &&
      player.Categoria.toLowerCase().includes(playerFilters.categoria.toLowerCase()) &&
      player.Precio.toString().includes(playerFilters.precio) &&
      (playerFilters.estado === '' ||
        (playerFilters.estado.toLowerCase() === 'convocado' && player.EsConvocado) ||
        (playerFilters.estado.toLowerCase() === 'eliminado' && player.EsEliminado) ||
        (playerFilters.estado.toLowerCase() === 'disponible' && !player.EsConvocado && !player.EsEliminado)
      )
    );
  });

  const sortedPlayers = [...filteredPlayers].sort((a, b) => {
    if (!playerSortConfig) return 0;
    const { key, direction } = playerSortConfig;

    let aValue = a[key];
    let bValue = b[key];

    // Handle Estado sorting
    if (key === 'Estado') {
      aValue = a.EsConvocado ? 'Convocado' : a.EsEliminado ? 'Eliminado' : 'Disponible';
      bValue = b.EsConvocado ? 'Convocado' : b.EsEliminado ? 'Eliminado' : 'Disponible';
    }

    if (aValue < bValue) {
      return direction === 'asc' ? -1 : 1;
    }
    if (aValue > bValue) {
      return direction === 'asc' ? 1 : -1;
    }
    return 0;
  });

  const handlePlayerSort = (key: string) => {
    let direction: 'asc' | 'desc' = 'asc';
    if (playerSortConfig && playerSortConfig.key === key && playerSortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setPlayerSortConfig({ key, direction });
  };

  const handleUpdatePrice = async (player: any) => {
    if (!selectedConvocatoria) return;

    const newPrice = prompt(`Ingrese el nuevo precio para ${player.Jugador}:`, player.Precio.toString());
    if (newPrice === null) return;

    const precio = Number(newPrice);
    if (isNaN(precio) || precio < 0) {
      alert('Por favor ingrese un precio válido');
      return;
    }

    try {
      const response = await fetch('/api/convocatorias/update-price', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          seasonId: selectedConvocatoria.IdTemporada,
          leagueId: selectedConvocatoria.IdLiga,
          playerId: player.IdJugador,
          categoria: selectedConvocatoria.Categoria,
          precio
        })
      });

      const data = await response.json();
      if (data.success) {
        // Refresh players list
        await handleNavigateToConvocatoria(selectedConvocatoria);
      } else {
        alert('Error al actualizar precio: ' + data.message);
      }
    } catch (error) {
      console.error('Error actualizando precio:', error);
      alert('Error al procesar la solicitud');
    }
  };

  const handleOpenInviteModal = async () => {
    if (!selectedConvocatoria) return;

    setIsInviteModalOpen(true);
    setIsLoadingAvailablePlayers(true);

    try {
      const response = await fetch(
        `/api/convocatorias/available-players?seasonId=${selectedConvocatoria.IdTemporada}&leagueId=${selectedConvocatoria.IdLiga}&categoria=${encodeURIComponent(selectedConvocatoria.Categoria)}`
      );
      const data = await response.json();
      if (data.success) {
        setAvailablePlayers(data.data);
      } else {
        alert('Error al cargar jugadores disponibles: ' + data.message);
      }
    } catch (error) {
      console.error('Error loading available players:', error);
      alert('Error al cargar jugadores disponibles');
    } finally {
      setIsLoadingAvailablePlayers(false);
    }
  };

  const handleInvitePlayer = async () => {
    if (!selectedConvocatoria || !selectedPlayerId) {
      alert('Por favor seleccione un jugador');
      return;
    }

    try {
      const response = await fetch('/api/convocatorias/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          seasonId: selectedConvocatoria.IdTemporada,
          leagueId: selectedConvocatoria.IdLiga,
          playerId: selectedPlayerId,
          categoria: selectedConvocatoria.Categoria
        })
      });

      const data = await response.json();
      if (data.success) {
        alert('Jugador invitado exitosamente');
        setIsInviteModalOpen(false);
        setSelectedPlayerId('');
        // Refresh players list
        await handleNavigateToConvocatoria(selectedConvocatoria);
      } else {
        alert('Error al invitar jugador: ' + data.message);
      }
    } catch (error) {
      console.error('Error invitando jugador:', error);
      alert('Error al procesar la solicitud');
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900">
      <nav className="bg-white/10 backdrop-blur-xl border-b border-white/20 px-6 py-4 flex justify-between items-center shadow-lg">
        <div>
          <h1 className="text-xl font-bold text-white">Convocatorias Angeles Soccer</h1>
          {user && (
            <p className="text-sm text-blue-200 mt-0.5 flex items-center gap-2">
              <span>Hola, {user.Usuario}</span>
              {user.AdminConvocatorias !== undefined && (
                <span title={user.AdminConvocatorias >= 2 ? "Acceso completo" : "Acceso restringido"}>
                  {user.AdminConvocatorias >= 2 ? (
                    <svg className="w-4 h-4 text-green-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 11V7a4 4 0 118 0m-4 8v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2z" />
                    </svg>
                  ) : (
                    <svg className="w-4 h-4 text-red-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                    </svg>
                  )}
                </span>
              )}
              {season && <span className="font-medium text-blue-300 ml-1">| {season}</span>}
            </p>
          )}
        </div>
        <div className="flex gap-4">
          <Link href="/login" className="flex items-center text-blue-200 hover:text-white transition-colors">
            <LogOut size={18} className="mr-2" />
            Salir
          </Link>
        </div>
      </nav>
      <main className="p-8">
        <div className="max-w-7xl mx-auto">
          <div className="bg-white/95 backdrop-blur-sm rounded-xl shadow-2xl p-8 border border-white/20">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-3xl font-bold text-slate-800">Resumen de Convocatorias</h2>
              <button
                onClick={() => setIsCreateModalOpen(true)}
                disabled={!user || (user.AdminConvocatorias ?? 0) < 2}
                className="bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-700 hover:to-blue-600 text-white font-bold py-3 px-6 rounded-lg shadow-md hover:shadow-lg transition-all duration-200 transform hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none disabled:hover:shadow-md"
                title={!user || (user.AdminConvocatorias ?? 0) < 2 ? "No tienes permisos para crear convocatorias" : ""}
              >
                + Nueva Convocatoria
              </button>
            </div>

            <div className="mt-8">
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-2xl font-bold text-slate-800">
                  {isLoading ? 'Cargando...' : `${sortedConvocatorias.length} Convocatorias`}
                </h3>
              </div>

              <div className="overflow-x-auto shadow-xl rounded-xl border border-slate-200">
                <table className="min-w-full bg-white">
                  <thead>
                    <tr className="bg-gradient-to-r from-slate-700 to-slate-800 text-white">
                      <th
                        className="py-4 px-6 text-left font-semibold text-sm uppercase tracking-wider cursor-pointer hover:bg-slate-600 transition-colors select-none"
                        onClick={() => handleSort('Liga')}
                      >
                        <div className="flex items-center gap-2">
                          Liga
                          {sortConfig?.key === 'Liga' && (
                            <span className="text-blue-300">{sortConfig.direction === 'asc' ? '↑' : '↓'}</span>
                          )}
                        </div>
                      </th>
                      <th
                        className="py-4 px-6 text-left font-semibold text-sm uppercase tracking-wider cursor-pointer hover:bg-slate-600 transition-colors select-none"
                        onClick={() => handleSort('Categoria')}
                      >
                        <div className="flex items-center gap-2">
                          Categoría
                          {sortConfig?.key === 'Categoria' && (
                            <span className="text-blue-300">{sortConfig.direction === 'asc' ? '↑' : '↓'}</span>
                          )}
                        </div>
                      </th>
                      <th
                        className="py-4 px-6 text-left font-semibold text-sm uppercase tracking-wider cursor-pointer hover:bg-slate-600 transition-colors select-none"
                        onClick={() => handleSort('FechaInicio')}
                      >
                        <div className="flex items-center gap-2">
                          Fecha Inicio
                          {sortConfig?.key === 'FechaInicio' && (
                            <span className="text-blue-300">{sortConfig.direction === 'asc' ? '↑' : '↓'}</span>
                          )}
                        </div>
                      </th>
                      <th
                        className="py-4 px-6 text-left font-semibold text-sm uppercase tracking-wider cursor-pointer hover:bg-slate-600 transition-colors select-none"
                        onClick={() => handleSort('FechaFin')}
                      >
                        <div className="flex items-center gap-2">
                          Fecha Fin
                          {sortConfig?.key === 'FechaFin' && (
                            <span className="text-blue-300">{sortConfig.direction === 'asc' ? '↑' : '↓'}</span>
                          )}
                        </div>
                      </th>
                      <th
                        className="py-4 px-6 text-center font-semibold text-sm uppercase tracking-wider cursor-pointer hover:bg-slate-600 transition-colors select-none"
                        onClick={() => handleSort('Cerrada')}
                      >
                        <div className="flex items-center justify-center gap-2">
                          Cerrada
                          {sortConfig?.key === 'Cerrada' && (
                            <span className="text-blue-300">{sortConfig.direction === 'asc' ? '↑' : '↓'}</span>
                          )}
                        </div>
                      </th>
                      <th
                        className="py-4 px-6 text-center font-semibold text-sm uppercase tracking-wider cursor-pointer hover:bg-slate-600 transition-colors select-none"
                        onClick={() => handleSort('JugadoresConvocados')}
                      >
                        <div className="flex items-center justify-center gap-2">
                          Jugadores
                          {sortConfig?.key === 'JugadoresConvocados' && (
                            <span className="text-blue-300">{sortConfig.direction === 'asc' ? '↑' : '↓'}</span>
                          )}
                        </div>
                      </th>
                      <th
                        className="py-4 px-6 text-center font-semibold text-sm uppercase tracking-wider cursor-pointer hover:bg-slate-600 transition-colors select-none"
                        onClick={() => handleSort('Total')}
                      >
                        <div className="flex items-center justify-center gap-2">
                          Total
                          {sortConfig?.key === 'Total' && (
                            <span className="text-blue-300">{sortConfig.direction === 'asc' ? '↑' : '↓'}</span>
                          )}
                        </div>
                      </th>
                      <th className="py-4 px-6 text-center font-semibold text-sm uppercase tracking-wider">Acciones</th>
                    </tr>
                    {/* Filter Row */}
                    <tr className="bg-slate-100 border-b-2 border-slate-300">
                      <th className="p-3">
                        <input
                          type="text"
                          value={filters.liga}
                          onChange={(e) => setFilters(prev => ({ ...prev, liga: e.target.value }))}
                          className="w-full text-sm border-2 border-slate-300 rounded-lg px-3 py-2 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 focus:outline-none transition-all"
                          placeholder="Filtro..."
                        />
                      </th>
                      <th className="p-3">
                        <input
                          type="text"
                          value={filters.categoria}
                          onChange={(e) => setFilters(prev => ({ ...prev, categoria: e.target.value }))}
                          className="w-full text-sm border-2 border-slate-300 rounded-lg px-3 py-2 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 focus:outline-none transition-all"
                          placeholder="Filtro..."
                        />
                      </th>
                      <th className="p-3">
                        <input
                          type="text"
                          value={filters.fechaInicio}
                          onChange={(e) => setFilters(prev => ({ ...prev, fechaInicio: e.target.value }))}
                          className="w-full text-sm border-2 border-slate-300 rounded-lg px-3 py-2 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 focus:outline-none transition-all"
                          placeholder="Filtro..."
                        />
                      </th>
                      <th className="p-3">
                        <input
                          type="text"
                          value={filters.fechaFin}
                          onChange={(e) => setFilters(prev => ({ ...prev, fechaFin: e.target.value }))}
                          className="w-full text-sm border-2 border-slate-300 rounded-lg px-3 py-2 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 focus:outline-none transition-all"
                          placeholder="Filtro..."
                        />
                      </th>
                      <th className="p-3">
                        <input
                          type="text"
                          value={filters.cerrada}
                          onChange={(e) => setFilters(prev => ({ ...prev, cerrada: e.target.value }))}
                          className="w-full text-sm border-2 border-slate-300 rounded-lg px-3 py-2 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 focus:outline-none transition-all"
                          placeholder="Sí/No"
                        />
                      </th>
                      <th className="p-3">
                        <input
                          type="text"
                          value={filters.jugadoresConvocados}
                          onChange={(e) => setFilters(prev => ({ ...prev, jugadoresConvocados: e.target.value }))}
                          className="w-full text-sm border-2 border-slate-300 rounded-lg px-3 py-2 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 focus:outline-none transition-all"
                          placeholder="Filtro..."
                        />
                      </th>
                      <th className="p-3">
                        <input
                          type="text"
                          value={filters.total}
                          onChange={(e) => setFilters(prev => ({ ...prev, total: e.target.value }))}
                          className="w-full text-sm border-2 border-slate-300 rounded-lg px-3 py-2 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 focus:outline-none transition-all"
                          placeholder="Filtro..."
                        />
                      </th>
                      <th className="p-3"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {isLoading ? (
                      <tr>
                        <td colSpan={7} className="py-12 text-center text-slate-500">
                          <div className="flex items-center justify-center gap-2">
                            <svg className="animate-spin h-5 w-5 text-blue-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                            </svg>
                            <span className="font-medium">Cargando convocatorias...</span>
                          </div>
                        </td>
                      </tr>
                    ) : sortedConvocatorias.length > 0 ? (
                      sortedConvocatorias.map((item, index) => (
                        <tr
                          key={`${item.IdTemporada}-${item.IdLiga}-${item.Categoria}-${index}`}
                          className="hover:bg-slate-50 hover:shadow-sm transition-all duration-200"
                        >
                          <td className="py-4 px-6 text-sm font-medium">{item.Liga}</td>
                          <td className="py-4 px-6 text-sm font-semibold">{item.Categoria}</td>
                          <td className="py-4 px-6 text-sm">{formatDate(item.FechaInicio)}</td>
                          <td className="py-4 px-6 text-sm">{formatDate(item.FechaFin)}</td>
                          <td className="py-4 px-6 text-center text-sm">
                            {item.Cerrada ? (
                              <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-bold bg-red-100 text-red-800">
                                ✓ Sí
                              </span>
                            ) : (
                              <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                                No
                              </span>
                            )}
                          </td>
                          <td className="py-4 px-6 text-center text-sm font-bold text-blue-700">
                            {item.JugadoresConvocados}
                          </td>
                          <td className="py-4 px-6 text-center text-sm font-bold text-green-700">
                            {new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(item.Total || 0)}
                          </td>
                          <td className="py-4 px-6 text-center">
                            {item.Cerrada === 0 ? (
                              <div className="flex gap-2 justify-center">
                                <button
                                  onClick={() => handleNavigateToConvocatoria(item)}
                                  className="bg-gradient-to-r from-green-600 to-green-500 hover:from-green-700 hover:to-green-600 text-white text-xs font-bold py-2 px-4 rounded-lg shadow-md hover:shadow-lg transition-all duration-200 transform hover:scale-105"
                                >
                                  Convocar
                                </button>
                                <button
                                  onClick={() => handleCloseConvocatoria(item)}
                                  disabled={!user || (user.AdminConvocatorias ?? 0) < 2}
                                  className="bg-gradient-to-r from-red-600 to-red-500 hover:from-red-700 hover:to-red-600 text-white text-xs font-bold py-2 px-4 rounded-lg shadow-md hover:shadow-lg transition-all duration-200 transform hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none disabled:hover:shadow-md"
                                  title={!user || (user.AdminConvocatorias ?? 0) < 2 ? "No tienes permisos para cerrar convocatorias" : ""}
                                >
                                  Cerrar
                                </button>
                              </div>
                            ) : (
                              <span className="text-slate-400 text-xs font-medium">Cerrada</span>
                            )}
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={8} className="py-12 text-center text-slate-500">
                          No se encontraron convocatorias.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Create Convocatoria Modal */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-30 flex items-center justify-center z-50">
          <div className="bg-white/95 backdrop-blur-sm rounded-lg p-6 w-[500px] shadow-lg">
            <h3 className="text-xl font-bold mb-4 text-slate-800">Nueva Convocatoria</h3>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Liga o Torneo</label>
                <select
                  value={newConvocatoria.leagueId}
                  onChange={(e) => setNewConvocatoria(prev => ({ ...prev, leagueId: e.target.value }))}
                  className="w-full appearance-none bg-white border border-slate-300 text-slate-700 py-2 px-3 rounded-lg leading-tight focus:outline-none focus:border-blue-500"
                >
                  <option value="">Seleccione una liga</option>
                  {leagues.map((league) => (
                    <option key={league.IdLiga} value={league.IdLiga}>
                      {league.Liga}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Categoría</label>
                <input
                  type="text"
                  value={newConvocatoria.categoria}
                  onChange={(e) => setNewConvocatoria(prev => ({ ...prev, categoria: e.target.value }))}
                  className="w-full appearance-none bg-white border border-slate-300 text-slate-700 py-2 px-3 rounded-lg leading-tight focus:outline-none focus:border-blue-500"
                  placeholder="Ej: Sub-17, Varonil, etc."
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Fecha Inicio</label>
                <input
                  type="date"
                  value={newConvocatoria.fechaInicio}
                  onChange={(e) => setNewConvocatoria(prev => ({ ...prev, fechaInicio: e.target.value }))}
                  className="w-full appearance-none bg-white border border-slate-300 text-slate-700 py-2 px-3 rounded-lg leading-tight focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Fecha Fin</label>
                <input
                  type="date"
                  value={newConvocatoria.fechaFin}
                  onChange={(e) => setNewConvocatoria(prev => ({ ...prev, fechaFin: e.target.value }))}
                  className="w-full appearance-none bg-white border border-slate-300 text-slate-700 py-2 px-3 rounded-lg leading-tight focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 mt-6">
              <button
                onClick={() => {
                  setIsCreateModalOpen(false);
                  setNewConvocatoria({
                    leagueId: '',
                    categoria: '',
                    fechaInicio: '',
                    fechaFin: ''
                  });
                }}
                className="bg-slate-200 hover:bg-slate-300 text-slate-800 font-bold py-2 px-4 rounded transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleCreateConvocatoria}
                className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded transition-colors"
              >
                Guardar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Players Modal */}
      {isPlayersModalOpen && selectedConvocatoria && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white/95 backdrop-blur-sm rounded-lg w-full max-w-6xl max-h-[90vh] overflow-hidden shadow-lg flex flex-col">
            <div className="p-6 border-b border-slate-200">
              <div className="flex justify-between items-center">
                <div>
                  <h3 className="text-2xl font-bold text-slate-800">
                    {selectedConvocatoria.Liga} - {selectedConvocatoria.Categoria}
                  </h3>
                  <p className="text-sm text-slate-600 mt-1">
                    {formatDate(selectedConvocatoria.FechaInicio)} - {formatDate(selectedConvocatoria.FechaFin)}
                  </p>
                </div>
                <button
                  onClick={async () => {
                    setIsPlayersModalOpen(false);
                    setSelectedConvocatoria(null);
                    setPlayers([]);
                    // Refresh the main summary table
                    await fetchConvocatorias();
                  }}
                  className="text-slate-400 hover:text-slate-600 transition-colors"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <div className="flex gap-6 items-center mt-4">
                <div className="text-base font-medium text-slate-600 bg-slate-100 px-4 py-2 rounded-lg">
                  Convocados: <span className="text-slate-800 font-semibold">{recordCount}</span>
                </div>
                <div className="text-base font-medium text-slate-600 bg-blue-50 px-4 py-2 rounded-lg">
                  Total: <span className="text-blue-700 font-bold">{new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(totalPrice)}</span>
                </div>
                <button
                  onClick={handleOpenInviteModal}
                  className="ml-auto bg-gradient-to-r from-purple-600 to-purple-500 hover:from-purple-700 hover:to-purple-600 text-white font-bold py-2 px-4 rounded-lg shadow-md hover:shadow-lg transition-all duration-200 transform hover:scale-105"
                >
                  + Invitar Jugador
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-auto p-6">
              {isLoadingPlayers ? (
                <div className="flex items-center justify-center py-12">
                  <svg className="animate-spin h-8 w-8 text-blue-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                </div>
              ) : (
                <table className="min-w-full bg-white">
                  <thead className="sticky top-0 bg-white">
                    <tr className="bg-gradient-to-r from-slate-700 to-slate-800 text-white">
                      <th
                        className="py-3 px-4 text-left font-semibold text-sm uppercase tracking-wider cursor-pointer hover:bg-slate-600 transition-colors"
                        onClick={() => handlePlayerSort('IdJugador')}
                      >
                        <div className="flex items-center gap-2">
                          ID
                          {playerSortConfig?.key === 'IdJugador' && (
                            <span className="text-blue-300">{playerSortConfig.direction === 'asc' ? '↑' : '↓'}</span>
                          )}
                        </div>
                      </th>
                      <th
                        className="py-3 px-4 text-left font-semibold text-sm uppercase tracking-wider cursor-pointer hover:bg-slate-600 transition-colors"
                        onClick={() => handlePlayerSort('Jugador')}
                      >
                        <div className="flex items-center gap-2">
                          Jugador
                          {playerSortConfig?.key === 'Jugador' && (
                            <span className="text-blue-300">{playerSortConfig.direction === 'asc' ? '↑' : '↓'}</span>
                          )}
                        </div>
                      </th>
                      <th
                        className="py-3 px-4 text-left font-semibold text-sm uppercase tracking-wider cursor-pointer hover:bg-slate-600 transition-colors"
                        onClick={() => handlePlayerSort('Categoria')}
                      >
                        <div className="flex items-center gap-2">
                          Categoría
                          {playerSortConfig?.key === 'Categoria' && (
                            <span className="text-blue-300">{playerSortConfig.direction === 'asc' ? '↑' : '↓'}</span>
                          )}
                        </div>
                      </th>
                      <th
                        className="py-3 px-4 text-left font-semibold text-sm uppercase tracking-wider cursor-pointer hover:bg-slate-600 transition-colors"
                        onClick={() => handlePlayerSort('Precio')}
                      >
                        <div className="flex items-center gap-2">
                          Precio
                          {playerSortConfig?.key === 'Precio' && (
                            <span className="text-blue-300">{playerSortConfig.direction === 'asc' ? '↑' : '↓'}</span>
                          )}
                        </div>
                      </th>
                      <th
                        className="py-3 px-4 text-center font-semibold text-sm uppercase tracking-wider cursor-pointer hover:bg-slate-600 transition-colors"
                        onClick={() => handlePlayerSort('Estado')}
                      >
                        <div className="flex items-center justify-center gap-2">
                          Estado
                          {playerSortConfig?.key === 'Estado' && (
                            <span className="text-blue-300">{playerSortConfig.direction === 'asc' ? '↑' : '↓'}</span>
                          )}
                        </div>
                      </th>
                      <th className="py-3 px-4 text-center font-semibold text-sm uppercase tracking-wider">Acciones</th>
                    </tr>
                    {/* Filter Row */}
                    <tr className="bg-slate-100 border-b-2 border-slate-300">
                      <th className="p-2">
                        <input
                          type="text"
                          value={playerFilters.idJugador}
                          onChange={(e) => setPlayerFilters(prev => ({ ...prev, idJugador: e.target.value }))}
                          className="w-full text-xs border-2 border-slate-300 rounded-lg px-2 py-1 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 focus:outline-none transition-all"
                          placeholder="Filtro..."
                        />
                      </th>
                      <th className="p-2">
                        <input
                          type="text"
                          value={playerFilters.jugador}
                          onChange={(e) => setPlayerFilters(prev => ({ ...prev, jugador: e.target.value }))}
                          className="w-full text-xs border-2 border-slate-300 rounded-lg px-2 py-1 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 focus:outline-none transition-all"
                          placeholder="Filtro..."
                        />
                      </th>
                      <th className="p-2">
                        <input
                          type="text"
                          value={playerFilters.categoria}
                          onChange={(e) => setPlayerFilters(prev => ({ ...prev, categoria: e.target.value }))}
                          className="w-full text-xs border-2 border-slate-300 rounded-lg px-2 py-1 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 focus:outline-none transition-all"
                          placeholder="Filtro..."
                        />
                      </th>
                      <th className="p-2">
                        <input
                          type="text"
                          value={playerFilters.precio}
                          onChange={(e) => setPlayerFilters(prev => ({ ...prev, precio: e.target.value }))}
                          className="w-full text-xs border-2 border-slate-300 rounded-lg px-2 py-1 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 focus:outline-none transition-all"
                          placeholder="Filtro..."
                        />
                      </th>
                      <th className="p-2">
                        <input
                          type="text"
                          value={playerFilters.estado}
                          onChange={(e) => setPlayerFilters(prev => ({ ...prev, estado: e.target.value }))}
                          className="w-full text-xs border-2 border-slate-300 rounded-lg px-2 py-1 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 focus:outline-none transition-all"
                          placeholder="Filtro..."
                        />
                      </th>
                      <th className="p-2"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {sortedPlayers.map((player) => (
                      <tr
                        key={player.IdJugador}
                        className={`transition-all duration-200 ${player.EsConvocado
                          ? 'bg-green-50'
                          : player.EsEliminado
                            ? 'bg-red-50 opacity-60'
                            : player.EsInvitado
                              ? 'bg-yellow-50'
                              : 'hover:bg-slate-50'
                          }`}
                      >
                        <td className="py-3 px-4 text-sm font-medium">{player.IdJugador}</td>
                        <td className="py-3 px-4 text-sm font-medium">
                          <div className="flex items-center gap-2">
                            {player.Jugador}
                            {player.EsInvitado === 1 && (
                              <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-bold bg-yellow-200 text-yellow-800" title="Jugador invitado de otra categoría">
                                ⚠️ Invitado
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="py-3 px-4 text-sm">{player.Categoria}</td>
                        <td className="py-3 px-4 text-sm">
                          {user && (user.AdminConvocatorias ?? 0) >= 2 ? (
                            <button
                              onClick={() => handleUpdatePrice(player)}
                              className="font-semibold text-blue-600 hover:text-blue-800 hover:underline transition-colors cursor-pointer"
                            >
                              {new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(player.Precio)}
                            </button>
                          ) : (
                            <span className="font-semibold text-slate-600">
                              {new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(player.Precio)}
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-center text-sm">
                          {player.EsConvocado ? (
                            <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-bold bg-green-100 text-green-800">
                              Convocado
                            </span>
                          ) : player.EsEliminado ? (
                            <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800">
                              Eliminado
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-slate-100 text-slate-600">
                              Disponible
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-center">
                          <div className="flex gap-2 justify-center">
                            {!player.EsConvocado && (
                              <button
                                onClick={() => handleConvocarPlayer(player)}
                                className="bg-gradient-to-r from-green-600 to-green-500 hover:from-green-700 hover:to-green-600 text-white text-xs font-bold py-1 px-3 rounded-lg shadow-md hover:shadow-lg transition-all duration-200"
                              >
                                Convocar
                              </button>
                            )}
                            {player.EsConvocado && (
                              <button
                                onClick={() => handleQuitarPlayer(player)}
                                className="bg-gradient-to-r from-red-600 to-red-500 hover:from-red-700 hover:to-red-600 text-white text-xs font-bold py-1 px-3 rounded-lg shadow-md hover:shadow-lg transition-all duration-200"
                              >
                                Quitar
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Invite Player Modal */}
      {isInviteModalOpen && selectedConvocatoria && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white/95 backdrop-blur-sm rounded-lg w-full max-w-md shadow-lg">
            <div className="p-6 border-b border-slate-200">
              <div className="flex justify-between items-center">
                <h3 className="text-xl font-bold text-slate-800">Invitar Jugador</h3>
                <button
                  onClick={() => {
                    setIsInviteModalOpen(false);
                    setSelectedPlayerId('');
                  }}
                  className="text-slate-400 hover:text-slate-600 transition-colors"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            <div className="p-6">
              {isLoadingAvailablePlayers ? (
                <div className="flex items-center justify-center py-8">
                  <svg className="animate-spin h-8 w-8 text-blue-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                </div>
              ) : availablePlayers.length === 0 ? (
                <p className="text-center text-slate-600 py-8">No hay jugadores disponibles para invitar</p>
              ) : (
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Buscar jugador</label>
                  <input
                    type="text"
                    value={playerSearchQuery}
                    onChange={(e) => setPlayerSearchQuery(e.target.value)}
                    placeholder="Escribe para buscar..."
                    className="w-full mb-4 appearance-none bg-white border border-slate-300 text-slate-700 py-2 px-3 rounded-lg leading-tight focus:outline-none focus:border-blue-500"
                  />
                  <label className="block text-sm font-medium text-slate-700 mb-2">Seleccione un jugador</label>
                  <select
                    value={selectedPlayerId}
                    onChange={(e) => setSelectedPlayerId(e.target.value)}
                    size={8}
                    className="w-full appearance-none bg-white border border-slate-300 text-slate-700 py-2 px-3 rounded-lg leading-tight focus:outline-none focus:border-blue-500"
                  >
                    <option value="">-- Seleccione --</option>
                    {availablePlayers
                      .filter(player =>
                        player.Jugador.toLowerCase().includes(playerSearchQuery.toLowerCase()) ||
                        player.Categoria.toLowerCase().includes(playerSearchQuery.toLowerCase())
                      )
                      .map((player) => (
                        <option key={player.IdJugador} value={player.IdJugador}>
                          {player.Jugador} ({player.Categoria})
                        </option>
                      ))}
                  </select>
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 p-6 border-t border-slate-200">
              <button
                onClick={() => {
                  setIsInviteModalOpen(false);
                  setSelectedPlayerId('');
                  setPlayerSearchQuery('');
                }}
                className="bg-slate-200 hover:bg-slate-300 text-slate-800 font-bold py-2 px-4 rounded transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleInvitePlayer}
                disabled={!selectedPlayerId}
                className="bg-purple-600 hover:bg-purple-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white font-bold py-2 px-4 rounded transition-colors"
              >
                Invitar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
