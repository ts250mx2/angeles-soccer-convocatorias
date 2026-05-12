"use client";
import { useEffect, useState, use } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ChevronLeft, Search, User, CheckCircle2, XCircle, Clock, CreditCard, FileDown } from 'lucide-react';
import { useUser } from '@/contexts/user-context';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

interface Player {
  IdJugador: number;
  Jugador: string;
  Categoria: string;
  Status: number;
  InscripcionPagada: number;
  MesesPagados: string;
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

export default function CategoryDetailPage({ params }: { params: Promise<{ categoria: string }> }) {
  const resolvedParams = use(params);
  const categoria = decodeURIComponent(resolvedParams.categoria);
  const router = useRouter();
  const { user, isInitialized } = useUser();
  const [players, setPlayers] = useState<Player[]>([]);
  const [config, setConfig] = useState<PageConfig | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState<'all' | 'activos' | 'bajas' | 'corriente' | 'adeudo'>('all');

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
      const response = await fetch(`/api/adeudos/players?categoria=${encodeURIComponent(categoria)}`);
      const data = await response.json();
      if (data.success) {
        setPlayers(data.data);
        setConfig(data.config);
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
  }, [isInitialized, user, categoria]);

  const filteredPlayers = players.filter(player => {
    const matchesSearch = player.Jugador.toLowerCase().includes(searchQuery.toLowerCase()) ||
      player.IdJugador.toString().includes(searchQuery);
    
    if (!matchesSearch) return false;
    if (activeFilter === 'all') return true;
    
    if (activeFilter === 'activos') return player.Status === 0;
    if (activeFilter === 'bajas') return player.Status === 2;

    // Check if player is al corriente
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
    const isAlCorriente = hasPaidInscripcion && allMonthsPaid;

    if (activeFilter === 'corriente') return player.Status === 0 && isAlCorriente;
    if (activeFilter === 'adeudo') return player.Status === 0 && !isAlCorriente;

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
    if (player.Status !== 0) return acc; // Only active players count for debt/current status
    
    const paidMonths = player.MesesPagados.split(',').map(m => parseInt(m.trim())).filter(m => !isNaN(m));
    const hasPaidInscripcion = !!player.InscripcionPagada;
    
    // Check if all months from startMonth to currentMonth are paid
    let allMonthsPaid = true;
    for (let m = config.startMonth; m <= config.currentMonth; m++) {
      if (!paidMonths.includes(m)) {
        allMonthsPaid = false;
        break;
      }
    }
    
    const isAlCorriente = hasPaidInscripcion && allMonthsPaid;
    
    if (isAlCorriente) {
      acc.alCorriente++;
    } else {
      acc.conAdeudo++;
    }
    
    return acc;
  }, { alCorriente: 0, conAdeudo: 0 });

  const handleExportPDF = () => {
    const doc = new jsPDF();
    
    // Header
    doc.setFontSize(18);
    doc.text(`Reporte de Adeudos - ${categoria}`, 14, 20);
    doc.setFontSize(10);
    doc.text(`Fecha de generación: ${new Date().toLocaleString('es-MX')}`, 14, 28);
    
    // Summary table
    autoTable(doc, {
      startY: 35,
      head: [['Resumen', 'Cantidad']],
      body: [
        ['Total Jugadores', players.length],
        ['Activos Al Corriente', stats.alCorriente],
        ['Activos Con Adeudo', stats.conAdeudo],
      ],
      theme: 'striped',
      headStyles: { fillColor: [59, 130, 246] }, // Blue-500
      margin: { left: 14 },
      tableWidth: 80
    });
    
    // Detailed Table
    const tableData = players.map(p => {
      const paidMonths = p.MesesPagados.split(',').map(m => parseInt(m.trim())).filter(m => !isNaN(m));
      let statusText = "AL CORRIENTE";
      let statusColor = [16, 185, 129]; // Emerald-500
      
      if (!p.InscripcionPagada) {
        statusText = "DEBE INSCRIPCION";
        statusColor = [244, 63, 94]; // Rose-500
      } else if (config) {
        const missing = [];
        for (let m = config.startMonth; m <= config.currentMonth; m++) {
          if (!paidMonths.includes(m)) {
            missing.push(getMonthName(m));
          }
        }
        if (missing.length > 0) {
          statusText = `DEBE: ${missing.join(', ')}`;
          statusColor = [244, 63, 94]; // Rose-500
        }
      }
      
      return [
        p.IdJugador,
        p.Jugador,
        p.InscripcionPagada ? 'SÍ' : 'NO',
        statusText
      ];
    });
    
    autoTable(doc, {
      startY: (doc as any).lastAutoTable.finalY + 15,
      head: [['ID', 'Jugador', 'Inscrip.', 'Estado de Mensualidades']],
      body: tableData,
      theme: 'grid',
      headStyles: { fillColor: [30, 41, 59] }, // Slate-800
      columnStyles: {
        0: { cellWidth: 20 },
        2: { cellWidth: 20 },
        3: { fontStyle: 'bold' }
      },
      didDrawCell: (data) => {
        if (data.section === 'body' && data.column.index === 3) {
          const text = data.cell.text[0];
          if (text.startsWith('DEBE')) {
            doc.setTextColor(244, 63, 94); // Rose-500
          } else if (text === 'AL CORRIENTE') {
            doc.setTextColor(16, 185, 129); // Emerald-500
          }
        }
      }
    });
    
    doc.save(`Adeudos_${categoria.replace(/\s+/g, '_')}.pdf`);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 text-white">
      {/* Header */}
      <nav className="bg-white/10 backdrop-blur-xl border-b border-white/20 px-6 py-4 flex justify-between items-center shadow-lg sticky top-0 z-50">
        <div className="flex items-center gap-4">
          <Link href="/adeudos" className="p-2 hover:bg-white/10 rounded-full transition-colors">
            <ChevronLeft size={24} />
          </Link>
          <div>
            <h1 className="text-xl font-bold">{categoria}</h1>
            <p className="text-xs text-blue-200">Listado de jugadores y estados</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button 
            onClick={handleExportPDF}
            className="flex items-center gap-2 px-4 py-2 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400 rounded-xl border border-emerald-500/30 transition-all font-bold text-sm"
          >
            <FileDown size={18} />
            <span className="hidden sm:inline">Mandar a PDF</span>
          </button>
          <div className="bg-blue-500/20 px-4 py-1.5 rounded-xl border border-blue-500/30">
            <span className="text-sm font-bold text-blue-300">{players.length} Jugadores</span>
          </div>
        </div>
      </nav>

      <main className="max-w-5xl mx-auto p-6 md:p-8">
        {/* Search */}
        <div className="mb-8 relative group max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-blue-400 transition-colors" size={18} />
          <input 
            type="text" 
            placeholder="Buscar por nombre o ID..." 
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-white/5 border border-white/10 rounded-xl pl-10 pr-4 py-3 outline-none focus:bg-white/10 focus:border-blue-500/50 transition-all text-white placeholder-slate-400"
          />
        </div>

        {/* Players List */}
        <div className="bg-white/5 border border-white/10 rounded-3xl overflow-hidden backdrop-blur-sm shadow-2xl">
          {isLoading ? (
            <div className="p-20 flex flex-col items-center justify-center gap-4">
              <div className="w-12 h-12 border-4 border-blue-500/20 border-t-blue-500 rounded-full animate-spin" />
              <p className="text-slate-400 font-medium">Cargando jugadores...</p>
            </div>
          ) : filteredPlayers.length > 0 ? (
            <div className="divide-y divide-white/5">
              {filteredPlayers.map((player) => (
                <div key={player.IdJugador} className="p-4 md:p-6 flex items-center justify-between hover:bg-white/5 transition-colors group">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-2xl bg-blue-500/10 flex items-center justify-center text-blue-400 group-hover:bg-blue-500/20 transition-colors border border-blue-500/20">
                      <User size={24} />
                    </div>
                    <div>
                      <h4 className="font-bold text-slate-200 group-hover:text-white transition-colors">{player.Jugador}</h4>
                      <p className="text-xs text-slate-500 font-mono">ID: {player.IdJugador}</p>
                    </div>
                  </div>
                  <div className="flex flex-col md:flex-row items-center gap-6">
                    {/* Inscripción Status */}
                    <div className="flex flex-col items-center gap-1">
                      <p className="text-[8px] uppercase font-bold text-slate-500">Inscrip.</p>
                      {player.InscripcionPagada ? (
                        <CheckCircle2 className="text-emerald-500" size={20} />
                      ) : (
                        <XCircle className="text-rose-500" size={20} />
                      )}
                    </div>

                    {/* Monthly Grid */}
                    <div className="flex flex-col items-start gap-1">
                      <p className="text-[8px] uppercase font-bold text-slate-500">Mensualidades</p>
                      <div className="flex gap-1">
                        {config && Array.from({ length: config.endMonth - config.startMonth + 1 }, (_, i) => config.startMonth + i).map(month => {
                          const isPaid = isMonthPaid(player.MesesPagados, month);
                          const isCurrent = month === config.currentMonth;
                          const isPast = month < config.currentMonth;
                          const isFuture = month > config.currentMonth;

                          return (
                            <div 
                              key={month}
                              title={`${getMonthName(month)}${isCurrent ? ' (Mes Actual)' : ''}`}
                              className={`w-6 h-6 rounded flex items-center justify-center text-[10px] font-bold transition-all border ${
                                isPaid 
                                  ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' 
                                  : isFuture
                                    ? 'bg-slate-500/5 text-slate-500 border-white/5'
                                    : 'bg-rose-500/10 text-rose-400 border-rose-500/20 shadow-[0_0_10px_rgba(244,63,94,0.1)]'
                              } ${isCurrent ? 'ring-2 ring-blue-500 ring-offset-2 ring-offset-slate-900 scale-110 z-10' : ''}`}
                            >
                              {getMonthName(month).substring(0, 1)}
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    <div className="text-right flex flex-col items-end gap-2">
                      {getStatusBadge(player.Status)}
                      <button 
                        onClick={() => fetchHistory(player)}
                        className="p-2 bg-blue-500/10 hover:bg-blue-500/20 rounded-lg text-blue-400 hover:text-blue-300 transition-all border border-blue-500/20 group-hover:translate-x-1"
                      >
                        <ChevronLeft size={18} className="rotate-180" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-20">
              <User size={48} className="mx-auto text-slate-500 mb-4 opacity-20" />
              <h3 className="text-xl font-bold text-slate-300">No hay jugadores</h3>
              <p className="text-slate-500 mt-2">No se encontraron resultados para "{searchQuery}"</p>
            </div>
          )}
        </div>

        {/* Summary Footer */}
        <div className="mt-8 grid grid-cols-2 sm:grid-cols-5 gap-4">
          <button 
            onClick={() => setActiveFilter('all')}
            className={`p-4 rounded-2xl text-center transition-all border ${
              activeFilter === 'all' 
                ? 'bg-slate-400/20 border-slate-400/40 shadow-lg scale-105' 
                : 'bg-slate-500/5 border-slate-500/10 hover:bg-slate-500/10'
            }`}
          >
            <p className="text-[10px] uppercase font-bold text-slate-400 mb-1 tracking-wider">Total Jugadores</p>
            <p className="text-2xl font-black text-white">{players.length}</p>
          </button>

          <button 
            onClick={() => setActiveFilter('activos')}
            className={`p-4 rounded-2xl text-center transition-all border ${
              activeFilter === 'activos' 
                ? 'bg-emerald-500/20 border-emerald-500/40 shadow-lg scale-105' 
                : 'bg-emerald-500/5 border-emerald-500/10 hover:bg-emerald-500/10'
            }`}
          >
            <p className="text-[10px] uppercase font-bold text-emerald-500/60 mb-1 tracking-wider">Activos</p>
            <p className="text-2xl font-black text-emerald-400">{players.filter(p => p.Status === 0).length}</p>
          </button>

          <button 
            onClick={() => setActiveFilter('bajas')}
            className={`p-4 rounded-2xl text-center transition-all border ${
              activeFilter === 'bajas' 
                ? 'bg-rose-500/20 border-rose-500/40 shadow-lg scale-105' 
                : 'bg-rose-500/5 border-rose-500/10 hover:bg-rose-500/10'
            }`}
          >
            <p className="text-[10px] uppercase font-bold text-rose-500/60 mb-1 tracking-wider">Bajas</p>
            <p className="text-2xl font-black text-rose-400">{players.filter(p => p.Status === 2).length}</p>
          </button>

          <button 
            onClick={() => setActiveFilter('corriente')}
            className={`p-4 rounded-2xl text-center transition-all border ${
              activeFilter === 'corriente' 
                ? 'bg-blue-500/20 border-blue-500/40 shadow-lg scale-105' 
                : 'bg-blue-500/5 border-blue-500/10 hover:bg-blue-500/10'
            }`}
          >
            <p className="text-[10px] uppercase font-bold text-blue-400/60 mb-1 tracking-wider">Al Corriente (Activos)</p>
            <p className="text-2xl font-black text-blue-400">{stats.alCorriente}</p>
          </button>

          <button 
            onClick={() => setActiveFilter('adeudo')}
            className={`p-4 rounded-2xl text-center transition-all border ${
              activeFilter === 'adeudo' 
                ? 'bg-amber-500/20 border-amber-500/40 shadow-lg scale-105' 
                : 'bg-amber-500/5 border-amber-500/10 hover:bg-amber-500/10'
            }`}
          >
            <p className="text-[10px] uppercase font-bold text-amber-400/60 mb-1 tracking-wider">Con Adeudo (Activos)</p>
            <p className="text-2xl font-black text-amber-400">{stats.conAdeudo}</p>
          </button>
        </div>
      </main>

      {/* Payment History Modal */}
      {isHistoryModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[100] p-4">
          <div className="bg-slate-900 border border-white/10 rounded-3xl w-full max-w-2xl max-h-[80vh] flex flex-col shadow-2xl animate-in zoom-in-95 duration-200">
            {/* Modal Header */}
            <div className="p-6 border-b border-white/5 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white/5 rounded-t-3xl">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-2xl bg-blue-500/20 flex items-center justify-center text-blue-400 border border-blue-500/20">
                  <User size={24} />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-white">{selectedPlayer?.Jugador}</h3>
                  <div className="flex flex-wrap gap-2 mt-1">
                    <label className={`flex items-center gap-2 px-2 py-1 rounded-lg border transition-all cursor-pointer ${showSeasonOnly ? 'bg-blue-500/20 border-blue-500/40 text-blue-300' : 'bg-white/5 border-white/10 text-slate-500 hover:border-white/20'}`}>
                      <input 
                        type="checkbox" 
                        className="hidden" 
                        checked={showSeasonOnly} 
                        onChange={(e) => {
                          setShowSeasonOnly(e.target.checked);
                          if (e.target.checked) setShowClothingOnly(false);
                        }} 
                      />
                      <CheckCircle2 size={12} className={showSeasonOnly ? 'opacity-100' : 'opacity-30'} />
                      <span className="text-[10px] font-bold uppercase">Solo Temporada</span>
                    </label>
                    <label className={`flex items-center gap-2 px-2 py-1 rounded-lg border transition-all cursor-pointer ${showClothingOnly ? 'bg-amber-500/20 border-amber-500/40 text-amber-300' : 'bg-white/5 border-white/10 text-slate-500 hover:border-white/20'}`}>
                      <input 
                        type="checkbox" 
                        className="hidden" 
                        checked={showClothingOnly} 
                        onChange={(e) => {
                          setShowClothingOnly(e.target.checked);
                          if (e.target.checked) setShowSeasonOnly(false);
                        }} 
                      />
                      <Clock size={12} className={showClothingOnly ? 'opacity-100' : 'opacity-30'} />
                      <span className="text-[10px] font-bold uppercase">Solo Ropa</span>
                    </label>
                  </div>
                </div>
              </div>
              <button 
                onClick={() => setIsHistoryModalOpen(false)}
                className="p-2 hover:bg-white/10 rounded-full text-slate-400 hover:text-white transition-colors self-end md:self-auto"
              >
                <XCircle size={24} />
              </button>
            </div>

            {/* Modal Body */}
            <div className="flex-1 overflow-y-auto p-6">
              {isLoadingHistory ? (
                <div className="h-60 flex flex-col items-center justify-center gap-4">
                  <div className="w-10 h-10 border-2 border-blue-500/20 border-t-blue-500 rounded-full animate-spin" />
                  <p className="text-slate-500 font-medium">Cargando historial...</p>
                </div>
              ) : paymentHistory.length > 0 ? (
                <div className="space-y-4">
                  {paymentHistory.filter(payment => {
                    const isRelevantMonth = payment.IdTipoProducto === 1 && config && payment.Mes >= config.startMonth && payment.Mes <= config.endMonth;
                    const isRelevantInscrip = payment.IdTipoProducto === 2;
                    const isSeason = isRelevantMonth || isRelevantInscrip;
                    const isClothing = payment.IdTipoProducto === 6;

                    if (showSeasonOnly) return isSeason;
                    if (showClothingOnly) return isClothing;
                    return true;
                  }).map((payment) => {
                    const isRelevantMonth = payment.IdTipoProducto === 1 && config && payment.Mes >= config.startMonth && payment.Mes <= config.endMonth;
                    const isRelevantInscrip = payment.IdTipoProducto === 2;
                    const isHighlighted = isRelevantMonth || isRelevantInscrip;

                    return (
                      <div 
                        key={payment.IdPago} 
                        className={`bg-white/5 border rounded-2xl p-4 hover:bg-white/10 transition-all flex items-center justify-between ${
                          isHighlighted ? 'border-blue-500/30 shadow-[0_0_15px_rgba(59,130,246,0.1)]' : 'border-white/5'
                        }`}
                      >
                        <div className="flex items-center gap-4">
                          <div className={`p-3 rounded-xl ${payment.IdTipoProducto === 2 ? 'bg-amber-500/20 text-amber-400 border border-amber-500/20' : 'bg-blue-500/20 text-blue-400 border border-blue-500/20'}`}>
                            <CreditCard size={20} />
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <p className="font-bold text-slate-200">{payment.Producto}</p>
                              {isHighlighted && (
                                <span className="text-[8px] px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-300 border border-blue-500/30 font-black uppercase tracking-tighter">
                                  Validado Temporada
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-2 text-xs text-slate-500">
                              <span>{new Date(payment.FechaPago).toLocaleDateString('es-MX')}</span>
                              {payment.Mes && (
                                <>
                                  <span className="text-slate-700">•</span>
                                  <span className={`font-bold ${isRelevantMonth ? 'text-blue-400' : 'text-slate-400'}`}>
                                    {getMonthName(payment.Mes)} {payment.Anio}
                                  </span>
                                </>
                              )}
                              {payment.Recibo && (
                                <>
                                  <span className="text-slate-700">•</span>
                                  <span className="text-slate-400 italic">Recibo: {payment.Recibo}</span>
                                </>
                              )}
                            </div>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-lg font-black text-emerald-400">
                            {new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(payment.Pago)}
                          </p>
                          {payment.Observaciones && (
                            <p className="text-[10px] text-slate-500 italic truncate max-w-[150px]" title={payment.Observaciones}>
                              {payment.Observaciones}
                            </p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="h-60 flex flex-col items-center justify-center gap-4 text-center">
                  <div className="bg-white/5 p-4 rounded-full">
                    <CreditCard size={32} className="text-slate-600" />
                  </div>
                  <div>
                    <h4 className="text-slate-400 font-bold">Sin pagos registrados</h4>
                    <p className="text-xs text-slate-600 mt-1">No se encontró historial para esta temporada</p>
                  </div>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-6 border-t border-white/5 flex justify-between items-center bg-white/5 rounded-b-3xl">
              <div>
                <p className="text-[10px] uppercase font-bold text-slate-500 tracking-widest mb-1">Total {showSeasonOnly ? 'Temporada' : showClothingOnly ? 'Ropa' : 'Filtrado'}</p>
                <p className="text-2xl font-black text-emerald-400">
                  {new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(paymentHistory.filter(payment => {
                    const isRelevantMonth = payment.IdTipoProducto === 1 && config && payment.Mes >= config.startMonth && payment.Mes <= config.endMonth;
                    const isRelevantInscrip = payment.IdTipoProducto === 2;
                    const isSeason = isRelevantMonth || isRelevantInscrip;
                    const isClothing = payment.IdTipoProducto === 6;

                    if (showSeasonOnly) return isSeason;
                    if (showClothingOnly) return isClothing;
                    return true;
                  }).reduce((acc, p) => acc + p.Pago, 0))}
                </p>
              </div>
              <button 
                onClick={() => setIsHistoryModalOpen(false)}
                className="px-6 py-2 bg-white/10 hover:bg-white/20 rounded-xl text-white font-bold transition-all border border-white/10"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
