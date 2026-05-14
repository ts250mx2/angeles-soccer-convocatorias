"use client";
import { useEffect, useState, use } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ChevronLeft, Search, User, CheckCircle2, XCircle, Clock, CreditCard, FileDown, MapPin } from 'lucide-react';
import { useUser } from '@/contexts/user-context';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import DashboardLayout from '@/components/DashboardLayout';

interface Player {
  IdJugador: number;
  Jugador: string;
  Categoria: string;
  Status: number;
  InscripcionPagada: number;
  MesesPagados: string;
  Beca: string | null;
  IdSede: number;
  SedeNombre: string;
}

interface PageConfig {
  startMonth: number;
  endMonth: number;
  currentMonth: number;
  seasonId: number;
}

interface PaymentRecord {
  IdPago: number;
  Pago: number;
  FechaPago: string;
  Mes: number;
  Anio: number;
  Producto: string;
  IdTipoProducto: number;
  Observaciones: string;
  Recibo: string;
}

export default function SedeDetailPage({ params }: { params: Promise<{ sedeId: string }> }) {
  const resolvedParams = use(params);
  const sedeId = resolvedParams.sedeId;
  const router = useRouter();
  const { user, isInitialized } = useUser();
  const [players, setPlayers] = useState<Player[]>([]);
  const [config, setConfig] = useState<PageConfig | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState<'all' | 'activos' | 'bajas' | 'corriente' | 'adeudo' | 'beca'>('all');
  const [sedeName, setSedeName] = useState('');

  // Modal State
  const [selectedPlayer, setSelectedPlayer] = useState<Player | null>(null);
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
  const [paymentHistory, setPaymentHistory] = useState<PaymentRecord[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  
  // Modal Filters
  const [showSeasonOnly, setShowSeasonOnly] = useState(false);
  const [showClothingOnly, setShowClothingOnly] = useState(false);

  // Check if user is logged in
  useEffect(() => {
    if (isInitialized && !user) {
      router.push('/login');
    }
  }, [user, isInitialized, router]);

  const fetchPlayers = async () => {
    setIsLoading(true);
    try {
      const response = await fetch(`/api/adeudos/players?sedeId=${sedeId}`);
      const data = await response.json();
      if (data.success) {
        setPlayers(data.data);
        setConfig(data.config);
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
  }, [isInitialized, user, sedeId]);

  const filteredPlayers = players.filter(player => {
    const matchesSearch = player.Jugador.toLowerCase().includes(searchQuery.toLowerCase()) ||
      player.IdJugador.toString().includes(searchQuery) ||
      player.Categoria.toLowerCase().includes(searchQuery.toLowerCase());
    
    if (!matchesSearch) return false;
    if (activeFilter === 'all') return true;
    
    if (activeFilter === 'activos') return player.Status === 0;
    if (activeFilter === 'bajas') return player.Status === 2;

    const paidMonths = player.MesesPagados.split(',').map(m => parseInt(m.trim())).filter(m => !isNaN(m));
    const hasPaidInscripcion = !!player.InscripcionPagada;
    let allMonthsPaid = true;
    if (config) {
      for (let m = config.startMonth; m <= config.currentMonth; m++) {
        if (!paidMonths.includes(m)) {
          allMonthsPaid = false;
          break;
        }
      }
    }
    
    const isBecado100 = player.Beca === '100' || String(player.Beca).includes('100');
    const isAlCorriente = isBecado100 || (hasPaidInscripcion && allMonthsPaid);

    if (activeFilter === 'corriente') return player.Status === 0 && isAlCorriente;
    if (activeFilter === 'adeudo') return player.Status === 0 && !isAlCorriente;
    if (activeFilter === 'beca') return player.Beca !== null && player.Beca !== undefined && player.Beca !== '' && String(player.Beca) !== '0';

    return true;
  });

  const fetchHistory = async (player: Player) => {
    if (!config) return;
    setSelectedPlayer(player);
    setIsHistoryModalOpen(true);
    setIsLoadingHistory(true);
    try {
      const response = await fetch(`/api/adeudos/history?playerId=${player.IdJugador}&seasonId=${config.seasonId}`);
      const data = await response.json();
      if (data.success) {
        setPaymentHistory(data.data);
      }
    } catch (error) {
      console.error('Error fetching history:', error);
    } finally {
      setIsLoadingHistory(false);
    }
  };

  const getMonthName = (month: number) => {
    const months = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
    return months[month - 1];
  };

  const isMonthPaid = (mesesPagados: string, month: number) => {
    const paid = mesesPagados.split(',').map(m => parseInt(m.trim()));
    return paid.includes(month);
  };

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

  const stats = players.reduce((acc, player) => {
    if (!config) return acc;
    if (player.Beca !== null && player.Beca !== undefined && player.Beca !== '' && String(player.Beca) !== '0') {
      acc.becados++;
    }
    if (player.Status !== 0) return acc;
    const paidMonths = player.MesesPagados.split(',').map(m => parseInt(m.trim())).filter(m => !isNaN(m));
    const hasPaidInscripcion = !!player.InscripcionPagada;
    let allMonthsPaid = true;
    for (let m = config.startMonth; m <= config.currentMonth; m++) {
      if (!paidMonths.includes(m)) {
        allMonthsPaid = false;
        break;
      }
    }
    const isBecado100 = player.Beca === '100' || String(player.Beca).includes('100');
    const isAlCorriente = isBecado100 || (hasPaidInscripcion && allMonthsPaid);
    if (isAlCorriente) acc.alCorriente++; else acc.conAdeudo++;
    return acc;
  }, { alCorriente: 0, conAdeudo: 0, becados: 0 });

  const handleExportPDF = () => {
    const doc = new jsPDF();
    doc.setFontSize(18);
    doc.text(`Reporte de Adeudos - Sede ${sedeName || sedeId}`, 14, 20);
    doc.setFontSize(10);
    doc.text(`Fecha de generación: ${new Date().toLocaleString('es-MX')}`, 14, 28);
    if (searchQuery) doc.text(`Filtro búsqueda: "${searchQuery}"`, 14, 34);
    if (activeFilter !== 'all') {
      const filterLabels = { all: 'Todos', activos: 'Activos', bajas: 'Bajas', corriente: 'Al Corriente', adeudo: 'Con Adeudo', beca: 'Becados' };
      doc.text(`Filtro estado: ${filterLabels[activeFilter]}`, 14, 40);
    }

    const filteredStats = filteredPlayers.reduce((acc, player) => {
      if (player.Beca !== null && player.Beca !== undefined && player.Beca !== '' && String(player.Beca) !== '0') acc.becados++;
      if (player.Status === 0) {
        const paidMonths = player.MesesPagados.split(',').map(m => parseInt(m.trim())).filter(m => !isNaN(m));
        let allMonthsPaid = true;
        if (config) {
          for (let m = config.startMonth; m <= config.currentMonth; m++) {
            if (!paidMonths.includes(m)) { allMonthsPaid = false; break; }
          }
        }
        const isBecado100 = player.Beca === '100' || String(player.Beca).includes('100');
        if (isBecado100 || (!!player.InscripcionPagada && allMonthsPaid)) acc.alCorriente++; else acc.conAdeudo++;
      }
      return acc;
    }, { alCorriente: 0, conAdeudo: 0, becados: 0 });

    autoTable(doc, {
      startY: 45,
      head: [['Resumen Filtrado', 'Cantidad']],
      body: [
        ['Total Jugadores', filteredPlayers.length],
        ['Activos Al Corriente', filteredStats.alCorriente],
        ['Activos Con Adeudo', filteredStats.conAdeudo],
        ['Jugadores con Beca', filteredStats.becados],
      ],
      theme: 'striped',
      headStyles: { fillColor: [59, 130, 246] },
      margin: { left: 14 },
      tableWidth: 80
    });

    const tableData = filteredPlayers.map(p => {
      const paidMonths = p.MesesPagados.split(',').map(m => parseInt(m.trim())).filter(m => !isNaN(m));
      const isBecado100 = p.Beca === '100' || String(p.Beca).includes('100');
      let statusText = "AL CORRIENTE";
      if (isBecado100) statusText = "AL CORRIENTE (BECA 100%)";
      else if (!p.InscripcionPagada) statusText = "DEBE INSCRIPCION";
      else if (config) {
        const missing = [];
        for (let m = config.startMonth; m <= config.currentMonth; m++) {
          if (!paidMonths.includes(m)) missing.push(getMonthName(m));
        }
        if (missing.length > 0) statusText = `DEBE: ${missing.join(', ')}`;
      }
      return [p.Categoria, p.IdJugador, p.Jugador, p.Beca && String(p.Beca) !== '0' ? `SÍ (${p.Beca})` : 'NO', statusText];
    });

    autoTable(doc, {
      startY: (doc as any).lastAutoTable.finalY + 15,
      head: [['Categoría', 'ID', 'Jugador', 'Beca', 'Estado']],
      body: tableData,
      theme: 'grid',
      headStyles: { fillColor: [30, 41, 59] },
      didDrawCell: (data) => {
        if (data.section === 'body' && data.column.index === 4) {
          const text = data.cell.text[0];
          if (text.startsWith('DEBE')) doc.setTextColor(244, 63, 94);
          else if (text.startsWith('AL CORRIENTE')) doc.setTextColor(16, 185, 129);
        }
      }
    });

    doc.save(`Adeudos_Sede_${sedeName || sedeId}.pdf`);
  };

  return (
    <DashboardLayout>
      <main className="overflow-y-auto flex-1 text-white">
        <div className="bg-white/5 backdrop-blur-xl border-b border-white/10 px-6 py-4 flex justify-between items-center shadow-lg sticky top-0 z-20">
          <div className="flex items-center gap-4">
            <Link href="/adeudos/sede" className="p-2 hover:bg-white/10 rounded-full transition-colors">
              <ChevronLeft size={24} />
            </Link>
            <div>
              <h1 className="text-xl font-bold flex items-center gap-2">
                <MapPin size={20} className="text-blue-400" />
                {sedeName || `Sede ${sedeId}`}
              </h1>
              <p className="text-xs text-blue-200 uppercase tracking-widest font-black">Detalle de jugadores por sede</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button onClick={handleExportPDF} className="flex items-center gap-2 px-4 py-2 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400 rounded-xl border border-emerald-500/30 transition-all font-bold text-sm">
              <FileDown size={18} /><span className="hidden sm:inline">Mandar a PDF</span>
            </button>
            <div className="bg-blue-500/20 px-4 py-1.5 rounded-xl border border-blue-500/30">
              <span className="text-sm font-bold text-blue-300">{players.length} Jugadores</span>
            </div>
          </div>
        </div>

        <div className="max-w-6xl mx-auto p-6 md:p-8">
          <div className="mb-8 relative group max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-blue-400 transition-colors" size={18} />
            <input type="text" placeholder="Buscar por nombre, ID o categoría..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-xl pl-10 pr-4 py-3 outline-none focus:bg-white/10 focus:border-blue-500/50 transition-all text-white placeholder-slate-400" />
          </div>

          <div className="mb-8 flex flex-wrap gap-2 items-stretch">
            {[
              { id: 'all', label: 'Total', val: players.length, color: 'slate' },
              { id: 'activos', label: 'Activos', val: players.filter(p => p.Status === 0).length, color: 'emerald' },
              { id: 'bajas', label: 'Bajas', val: players.filter(p => p.Status === 2).length, color: 'rose' },
              { id: 'corriente', label: 'Al Corriente', val: stats.alCorriente, color: 'blue' },
              { id: 'adeudo', label: 'Con Adeudo', val: stats.conAdeudo, color: 'amber' },
              { id: 'beca', label: 'Becados', val: stats.becados, color: 'purple' },
            ].map(f => (
              <button key={f.id} onClick={() => setActiveFilter(f.id as any)}
                className={`flex-1 min-w-[110px] p-3 rounded-2xl text-center transition-all border ${activeFilter === f.id ? `bg-${f.color}-500/20 border-${f.color}-500/40 shadow-lg scale-[1.02]` : `bg-white/5 border-white/10 hover:bg-white/10`}`}>
                <p className={`text-[9px] uppercase font-bold text-${f.color}-400 mb-1 tracking-wider whitespace-nowrap`}>{f.label}</p>
                <p className="text-xl font-black text-white">{f.val}</p>
              </button>
            ))}
          </div>

          <div className="space-y-10">
            {isLoading ? (
              <div className="p-20 flex flex-col items-center justify-center gap-4">
                <div className="w-12 h-12 border-4 border-blue-500/20 border-t-blue-500 rounded-full animate-spin" />
                <p className="text-slate-400 font-medium">Cargando jugadores...</p>
              </div>
            ) : filteredPlayers.length > 0 ? (
              // Group players by category
              Object.entries(
                filteredPlayers.reduce((acc, player) => {
                  if (!acc[player.Categoria]) acc[player.Categoria] = [];
                  acc[player.Categoria].push(player);
                  return acc;
                }, {} as Record<string, Player[]>)
              ).map(([categoryName, categoryPlayers]) => (
                <div key={categoryName} className="space-y-4">
                  {/* Category Group Header */}
                  <div className="flex items-center gap-4 sticky top-[72px] z-10 bg-slate-900/80 backdrop-blur-md py-2">
                    <h2 className="text-[10px] font-black uppercase tracking-[0.2em] text-blue-400 bg-blue-500/10 px-4 py-1.5 rounded-xl border border-blue-500/20 shadow-lg">
                      Categoría: {categoryName}
                    </h2>
                    <div className="h-px flex-1 bg-gradient-to-r from-blue-500/30 to-transparent" />
                    <span className="text-[10px] font-black text-slate-500 bg-white/5 px-3 py-1 rounded-lg border border-white/10">
                      {categoryPlayers.length} JUGADORES
                    </span>
                  </div>

                  {/* Category Players List */}
                  <div className="bg-white/5 border border-white/10 rounded-3xl overflow-hidden shadow-2xl divide-y divide-white/5">
                    {categoryPlayers.map((player) => (
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
                        <div className="flex flex-col md:flex-row items-center gap-6">
                          <div className="flex flex-col items-center gap-1">
                            <p className="text-[8px] uppercase font-bold text-slate-500">Inscrip.</p>
                            {(player.InscripcionPagada || (player.Beca && String(player.Beca).includes('100'))) ? (
                              <CheckCircle2 className="text-emerald-500" size={20} />
                            ) : (
                              <XCircle className="text-rose-500" size={20} />
                            )}
                          </div>
                          <div className="flex flex-col items-start gap-1">
                            <p className="text-[8px] uppercase font-bold text-slate-500">Mensualidades</p>
                            <div className="flex gap-1">
                              {config && Array.from({ length: config.endMonth - config.startMonth + 1 }, (_, i) => config.startMonth + i).map(month => {
                                const isBecado100 = player.Beca === '100' || String(player.Beca).includes('100');
                                const isPaid = isBecado100 || isMonthPaid(player.MesesPagados, month);
                                const isCurrent = month === config.currentMonth;
                                const isFuture = month > config.currentMonth;
                                return (
                                  <div key={month} title={`${getMonthName(month)}`} className={`w-6 h-6 rounded flex items-center justify-center text-[10px] font-bold border transition-all ${isPaid ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' : isFuture ? 'bg-slate-500/5 text-slate-500' : 'bg-rose-500/10 text-rose-400 border-rose-500/20'} ${isCurrent ? 'ring-2 ring-blue-500 ring-offset-2 ring-offset-slate-900 scale-110 z-10' : ''}`}>
                                    {getMonthName(month).substring(0, 1)}
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                          <div className="text-right flex flex-col items-end gap-2">
                            {getStatusBadge(player.Status)}
                            <button onClick={() => fetchHistory(player)} className="p-2 bg-blue-500/10 hover:bg-blue-500/20 rounded-lg text-blue-400 border border-blue-500/20 group-hover:translate-x-1 transition-all">
                              <ChevronLeft size={18} className="rotate-180" />
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))
            ) : (
              <div className="text-center py-20">
                <User size={48} className="mx-auto text-slate-500 mb-4 opacity-20" />
                <h3 className="text-xl font-bold text-slate-300">No hay jugadores</h3>
                <p className="text-slate-500 mt-2">No se encontraron resultados para "{searchQuery}"</p>
              </div>
            )}
          </div>

        </div>
      </main>

      {/* Payment History Modal */}
      {isHistoryModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[100] p-4">
          <div className="bg-slate-900 border border-white/10 rounded-3xl w-full max-w-2xl max-h-[80vh] flex flex-col shadow-2xl animate-in zoom-in-95">
            <div className="p-6 border-b border-white/5 flex justify-between items-center bg-white/5 rounded-t-3xl">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-2xl bg-blue-500/20 flex items-center justify-center text-blue-400 border border-blue-500/20"><User size={24} /></div>
                <div><h3 className="text-xl font-bold text-white">{selectedPlayer?.Jugador}</h3><p className="text-xs text-slate-500">Historial de pagos</p></div>
              </div>
              <button onClick={() => setIsHistoryModalOpen(false)} className="p-2 hover:bg-white/10 rounded-full text-slate-400 hover:text-white transition-colors"><XCircle size={24} /></button>
            </div>
            <div className="flex-1 overflow-y-auto p-6">
              {isLoadingHistory ? <div className="h-60 flex flex-col items-center justify-center gap-4"><div className="w-10 h-10 border-2 border-blue-500/20 border-t-blue-500 rounded-full animate-spin" /><p className="text-slate-500">Cargando...</p></div> : paymentHistory.length > 0 ? (
                <div className="space-y-4">
                  {paymentHistory.map((p) => (
                    <div key={p.IdPago} className="bg-white/5 border border-white/5 rounded-2xl p-4 flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <div className="p-3 rounded-xl bg-blue-500/20 text-blue-400 border border-blue-500/20"><CreditCard size={20} /></div>
                        <div><p className="font-bold text-slate-200">{p.Producto}</p><p className="text-xs text-slate-500">{new Date(p.FechaPago).toLocaleDateString('es-MX')} • {p.Mes ? getMonthName(p.Mes) : ''} {p.Anio}</p></div>
                      </div>
                      <p className="text-lg font-black text-emerald-400">{new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(p.Pago)}</p>
                    </div>
                  ))}
                </div>
              ) : <div className="h-60 flex flex-col items-center justify-center text-slate-500">Sin historial</div>}
            </div>
            <div className="p-6 border-t border-white/5 bg-white/5 rounded-b-3xl flex justify-end">
              <button onClick={() => setIsHistoryModalOpen(false)} className="px-6 py-2 bg-white/10 hover:bg-white/20 rounded-xl text-white font-bold transition-all border border-white/10">Cerrar</button>
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
