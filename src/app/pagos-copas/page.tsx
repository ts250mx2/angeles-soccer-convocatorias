"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useUser } from "@/contexts/user-context";
import DashboardLayout from "@/components/DashboardLayout";
import {
  Trophy, Search, Users, ChevronRight, X, CreditCard,
  Target, Calendar, RefreshCw, BarChart3, TrendingUp, User, FileDown, AlertTriangle
} from "lucide-react";
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

interface Deudor {
  IdJugador: number;
  Jugador: string;
  Categoria: string;
  Sede: string;
  MesesDebe: number;
  Inscrito: boolean;
  /** Torneos que pagó en la temporada del filtro. */
  Torneos: string[];
}

interface PagoTorneo {
  IdPago: number;
  Producto: string;
  TipoProducto: string;
  Fecha: string;
  Recibo: string;
  FormaPago: string;
  Sede: string;
  Pago: number;
}

interface Temporada {
  IdTemporada: number;
  Temporada: string;
  EsActiva: boolean;
}

interface ProductSummary {
  IdProducto: number;
  Producto: string;
  IdTipoProducto: number;
  TipoProducto: string;
  TotalRecaudado: number;
  CantidadPagos: number;
  CantidadJugadores: number;
  /** Pagaron este torneo y hoy deben algo en la temporada en curso. */
  JugadoresConAdeudo: number;
  Deudores: Deudor[];
}

interface CategoryBreakdown {
  Categoria: string;
  Total: number;
  Pagos: number;
  Jugadores: number;
}

interface PaymentDetail {
  IdPago: number;
  Pago: number;
  FechaPago: string;
  Recibo: string;
  Jugador: string;
  Categoria: string;
}

const fmt = (n: number) =>
  new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(n);
const fmtC = (n: number) =>
  new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", notation: "compact", maximumFractionDigits: 1 }).format(n);

export default function PagosCopasPage() {
  const router = useRouter();
  const { user, isInitialized, season } = useUser();
  const [products, setProducts] = useState<ProductSummary[]>([]);
  const [temporadas, setTemporadas] = useState<Temporada[]>([]);
  const [temporadaId, setTemporadaId] = useState<number | null>(null);
  const [alerta, setAlerta] = useState<{ jugadores: number; deudores: Deudor[] }>({ jugadores: 0, deudores: [] });
  const [temporadaAdeudos, setTemporadaAdeudos] = useState<string>("");
  // Lista de deudores abierta: la global o la de un torneo.
  const [deudoresAbiertos, setDeudoresAbiertos] = useState<{ titulo: string; lista: Deudor[] } | null>(null);
  // Deudor cuyo detalle de pago se está viendo.
  const [pagoDeudor, setPagoDeudor] = useState<Deudor | null>(null);
  const [pagosDeudor, setPagosDeudor] = useState<PagoTorneo[]>([]);
  const [isLoadingPagos, setIsLoadingPagos] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  // Category Modal State
  const [selectedProduct, setSelectedProduct] = useState<ProductSummary | null>(null);
  const [categories, setCategories] = useState<CategoryBreakdown[]>([]);
  const [isLoadingCategories, setIsLoadingCategories] = useState(false);

  // Detail Modal State
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [details, setDetails] = useState<PaymentDetail[]>([]);
  const [isLoadingDetails, setIsLoadingDetails] = useState(false);

  useEffect(() => {
    if (isInitialized && !user) router.push("/login");
  }, [user, isInitialized, router]);

  // Catálogo de temporadas para el filtro; se comparte con Inscripciones.
  useEffect(() => {
    if (!isInitialized || !user) return;
    (async () => {
      try {
        const res = await fetch("/api/inscripciones/temporadas");
        const json = await res.json();
        if (json.success) {
          setTemporadas(json.data);
          setTemporadaId((prev) => prev ?? json.temporadaActiva ?? null);
        }
      } catch (e) { console.error(e); }
    })();
  }, [isInitialized, user]);

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try {
      const qs = temporadaId ? `?temporada=${temporadaId}` : "";
      const res = await fetch(`/api/pagos-copas/summary${qs}`, { cache: "no-store" });
      const json = await res.json();
      if (json.success) {
        setProducts(json.data);
        setAlerta(json.alerta ?? { jugadores: 0, deudores: [] });
        setTemporadaAdeudos(json.temporadaAdeudos?.Temporada ?? "");
        setLastUpdated(new Date());
      }
    } catch (e) { console.error(e); }
    finally { setIsLoading(false); }
  }, [temporadaId]);

  useEffect(() => {
    if (isInitialized && user && temporadaId !== null) fetchData();
  }, [isInitialized, user, temporadaId, fetchData]);

  const fetchCategories = async (product: ProductSummary) => {
    setSelectedProduct(product);
    setIsLoadingCategories(true);
    setCategories([]);
    try {
      const res = await fetch(`/api/pagos-copas/categories?idProducto=${product.IdProducto}&temporada=${temporadaId ?? ""}`);
      const json = await res.json();
      if (json.success) setCategories(json.data);
    } catch (e) { console.error(e); }
    finally { setIsLoadingCategories(false); }
  };

  const fetchDetails = async (categoria: string) => {
    if (!selectedProduct) return;
    setSelectedCategory(categoria);
    setIsLoadingDetails(true);
    setDetails([]);
    try {
      const res = await fetch(`/api/pagos-copas/details?idProducto=${selectedProduct.IdProducto}&categoria=${encodeURIComponent(categoria)}&temporada=${temporadaId ?? ""}`);
      const json = await res.json();
      if (json.success) setDetails(json.data);
    } catch (e) { console.error(e); }
    finally { setIsLoadingDetails(false); }
  };

  // Detalle de lo que ese jugador pagó de copas y ligas en la temporada del filtro.
  useEffect(() => {
    if (!pagoDeudor) return;
    let vivo = true;
    setIsLoadingPagos(true);
    setPagosDeudor([]);
    (async () => {
      try {
        const res = await fetch(
          `/api/pagos-copas/jugador?idJugador=${pagoDeudor.IdJugador}&temporada=${temporadaId ?? ""}`,
          { cache: "no-store" },
        );
        const json = await res.json();
        if (vivo && json.success) setPagosDeudor(json.data);
      } catch (e) { console.error(e); }
      finally { if (vivo) setIsLoadingPagos(false); }
    })();
    return () => { vivo = false; };
  }, [pagoDeudor, temporadaId]);

  const handleExportDetailsPDF = () => {
    if (!selectedProduct || !selectedCategory || details.length === 0) return;

    const doc = new jsPDF();
    
    // Header
    doc.setFontSize(18);
    doc.text(`Reporte de Pagos - ${selectedProduct.Producto}`, 14, 20);
    doc.setFontSize(12);
    doc.text(`Categoría: ${selectedCategory}`, 14, 28);
    doc.setFontSize(10);
    doc.text(`Fecha de generación: ${new Date().toLocaleString('es-MX')}`, 14, 34);
    
    // Table
    const tableData = details.map(d => [
      new Date(d.FechaPago).toLocaleDateString("es-MX"),
      d.Jugador,
      d.Recibo || 'N/A',
      fmt(d.Pago)
    ]);

    autoTable(doc, {
      startY: 40,
      head: [['Fecha', 'Jugador', 'Recibo', 'Monto']],
      body: tableData,
      theme: 'grid',
      headStyles: { fillColor: [59, 130, 246] }, // Blue-500
      foot: [['', 'TOTAL RECAUDADO', '', fmt(details.reduce((acc, curr) => acc + curr.Pago, 0))]],
      footStyles: { fillColor: [241, 245, 249], textColor: [30, 41, 59], fontStyle: 'bold' }
    });

    doc.save(`Pagos_${selectedProduct.Producto.replace(/\s+/g, '_')}_${selectedCategory.replace(/\s+/g, '_')}.pdf`);
  };

  const filteredProducts = products.filter(p => 
    p.Producto.toLowerCase().includes(searchQuery.toLowerCase()) ||
    p.TipoProducto.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <DashboardLayout>
      <main className="overflow-y-auto flex-1 text-white">
        {/* Header */}
        <div className="bg-white/5 backdrop-blur-xl border-b border-white/10 px-6 py-4 flex justify-between items-center sticky top-0 z-20">
          <div className="flex items-center gap-4">
            <div className="bg-blue-600/20 p-2.5 rounded-xl border border-blue-500/20">
              <Trophy size={20} className="text-blue-400" />
            </div>
            <div>
              <h1 className="text-xl font-black">Pagos de Copas y Ligas</h1>
              <p className="text-xs text-blue-300">{season ? `Temporada ${season}` : "Gestión de torneos"}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {lastUpdated && <span className="text-[10px] text-slate-500">Act. {lastUpdated.toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" })}</span>}
            <button onClick={fetchData} disabled={isLoading} className="p-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-slate-400 hover:text-white transition-all">
              <RefreshCw size={15} className={isLoading ? "animate-spin" : ""} />
            </button>
          </div>
        </div>

        <div className="p-6 md:p-8 max-w-7xl mx-auto space-y-8">
          {/* Search and Stats */}
          <div className="flex flex-col md:flex-row gap-6 items-start md:items-center justify-between">
            <div className="relative w-full md:w-96 group">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-blue-400 transition-colors" size={18} />
              <input 
                type="text" 
                placeholder="Buscar copa o liga..." 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-xl pl-10 pr-4 py-3 outline-none focus:bg-white/10 focus:border-blue-500/50 transition-all text-white placeholder-slate-400"
              />
            </div>
            <div className="flex flex-wrap gap-4 items-center">
              <div>
                <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Temporada</label>
                <select
                  value={temporadaId ?? ""}
                  onChange={(e) => setTemporadaId(Number(e.target.value))}
                  className="bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-white text-sm font-bold outline-none focus:border-blue-500/60 cursor-pointer hover:bg-white/10 transition-all [color-scheme:dark]"
                >
                  {temporadas.map((t) => (
                    <option key={t.IdTemporada} value={t.IdTemporada} className="bg-slate-900">
                      {t.Temporada}{t.EsActiva ? " · activa" : ""}
                    </option>
                  ))}
                </select>
              </div>
              <div className="bg-white/5 border border-white/10 px-4 py-2 rounded-xl">
                <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Total Temporada</p>
                <p className="text-lg font-black text-emerald-400">{fmtC(products.reduce((acc, p) => acc + p.TotalRecaudado, 0))}</p>
              </div>
            </div>
          </div>

          {/* Alerta de cobranza. El adeudo se mide contra la temporada EN CURSO aunque
              estés viendo una temporada pasada: la pregunta es a quién cobrarle hoy. */}
          {!isLoading && alerta.jugadores > 0 && (
            <button
              type="button"
              onClick={() => setDeudoresAbiertos({ titulo: "Pagaron un torneo y tienen adeudo", lista: alerta.deudores })}
              className="w-full text-left flex items-start gap-3 bg-amber-500/10 hover:bg-amber-500/15 border border-amber-500/30 rounded-2xl px-5 py-4 transition-all"
            >
              <div className="bg-amber-500/20 p-2 rounded-xl border border-amber-500/20 flex-shrink-0">
                <AlertTriangle size={18} className="text-amber-400" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-black text-amber-200">
                  {alerta.jugadores} jugador{alerta.jugadores === 1 ? "" : "es"} pagó copas o ligas y tiene adeudo
                </p>
                <p className="text-xs text-amber-300/70 mt-0.5">
                  Adeudo medido contra {temporadaAdeudos || "la temporada en curso"}: mensualidades vencidas sin pagar o inscripción pendiente. Toca para ver la lista.
                </p>
              </div>
              <ChevronRight size={18} className="text-amber-400/60 flex-shrink-0 mt-1" />
            </button>
          )}

          {/* Cards Grid */}
          {isLoading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {[...Array(4)].map((_, i) => <div key={i} className="h-48 bg-white/5 rounded-2xl animate-pulse border border-white/10" />)}
            </div>
          ) : filteredProducts.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {filteredProducts.map((p) => (
                <div 
                  key={p.IdProducto}
                  onClick={() => fetchCategories(p)}
                  className="group relative bg-white/5 hover:bg-white/[0.08] border border-white/10 hover:border-blue-500/30 rounded-2xl p-6 transition-all duration-300 cursor-pointer overflow-hidden shadow-lg hover:-translate-y-1"
                >
                  <div className="absolute -inset-24 bg-blue-600/5 blur-3xl opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
                  
                  <div className="relative z-10">
                    <div className="flex justify-between items-start mb-4">
                      <div className={`p-2.5 rounded-xl border shadow-sm ${p.IdTipoProducto === 3 ? 'bg-amber-500/10 border-amber-500/20 text-amber-400' : 'bg-blue-500/10 border-blue-500/20 text-blue-400'}`}>
                        <Trophy size={20} />
                      </div>
                      <span className="text-[9px] font-black uppercase tracking-[0.15em] bg-white/5 px-2 py-1 rounded-md border border-white/10 text-slate-400">
                        {p.TipoProducto}
                      </span>
                    </div>

                    <h3 className="text-base font-black text-white mb-4 line-clamp-2 leading-tight group-hover:text-blue-300 transition-colors">
                      {p.Producto}
                    </h3>

                    <div className="space-y-3">
                      <div className="flex justify-between items-end">
                        <div>
                          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-0.5">Recaudado</p>
                          <p className="text-2xl font-black text-emerald-400 leading-none">{fmtC(p.TotalRecaudado)}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-0.5">Pagos</p>
                          <p className="text-sm font-black text-white">{p.CantidadPagos}</p>
                        </div>
                      </div>
                      <div className="h-1 bg-white/5 rounded-full overflow-hidden">
                        <div className="h-full bg-gradient-to-r from-blue-600 to-blue-400 w-full" />
                      </div>
                      <div className="flex justify-between items-center text-[10px] text-slate-400 font-bold">
                        <span>{p.CantidadJugadores} Jugadores</span>
                        <ChevronRight size={14} className="group-hover:translate-x-1 transition-transform" />
                      </div>
                      {p.JugadoresConAdeudo > 0 && (
                        <div
                          role="button"
                          tabIndex={0}
                          onClick={(e) => {
                            e.stopPropagation();
                            setDeudoresAbiertos({ titulo: p.Producto, lista: p.Deudores });
                          }}
                          onKeyDown={(e) => {
                            if (e.key !== "Enter" && e.key !== " ") return;
                            e.preventDefault();
                            e.stopPropagation();
                            setDeudoresAbiertos({ titulo: p.Producto, lista: p.Deudores });
                          }}
                          title="Ver quiénes son"
                          className="flex items-center gap-1.5 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 rounded-lg px-2 py-1.5 transition-all"
                        >
                          <AlertTriangle size={12} className="text-amber-400 flex-shrink-0" />
                          <span className="text-[10px] font-black text-amber-200">
                            {p.JugadoresConAdeudo} con adeudo
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-20 bg-white/5 rounded-3xl border border-dashed border-white/10">
              <BarChart3 size={48} className="mx-auto text-slate-600 mb-4" />
              <h3 className="text-xl font-bold text-slate-300">No hay registros</h3>
              <p className="text-slate-500 mt-2">No se encontraron pagos de copas o ligas en esta temporada.</p>
            </div>
          )}
        </div>

        {/* Detalle de los pagos de torneo de un deudor */}
        {pagoDeudor && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center z-[130] p-4" onClick={() => setPagoDeudor(null)}>
            <div
              className="bg-[#0f172a] border border-white/15 rounded-3xl w-full max-w-xl max-h-[80vh] flex flex-col shadow-2xl overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="p-5 border-b border-white/10 bg-white/5 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="text-base font-black text-white truncate">{pagoDeudor.Jugador}</h3>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    {pagoDeudor.Categoria || "—"} · {pagoDeudor.Sede || "—"}
                  </p>
                  <p className="text-[11px] mt-1.5">
                    {pagoDeudor.Inscrito ? (
                      <span className="text-rose-300 font-bold">
                        Debe {pagoDeudor.MesesDebe} mes{pagoDeudor.MesesDebe === 1 ? "" : "es"} en {temporadaAdeudos || "la temporada en curso"}
                      </span>
                    ) : (
                      <span className="text-amber-300 font-bold">
                        Sin inscripción en {temporadaAdeudos || "la temporada en curso"}
                      </span>
                    )}
                  </p>
                </div>
                <button onClick={() => setPagoDeudor(null)} className="p-2 rounded-xl hover:bg-white/10 text-slate-400 hover:text-white transition-all flex-shrink-0">
                  <X size={18} />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-5">
                {isLoadingPagos ? (
                  <div className="h-32 flex flex-col items-center justify-center gap-3 text-slate-400">
                    <RefreshCw size={22} className="animate-spin text-blue-500" />
                    <p className="text-xs font-bold">Cargando pagos...</p>
                  </div>
                ) : pagosDeudor.length === 0 ? (
                  <div className="h-32 flex flex-col items-center justify-center gap-2 text-slate-500">
                    <CreditCard size={32} className="opacity-20" />
                    <p className="text-sm font-bold">Sin pagos de torneo en esta temporada</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {pagosDeudor.map((pg) => (
                      <div key={pg.IdPago} className="bg-white/5 border border-white/10 rounded-2xl p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-sm font-bold text-white leading-tight">{pg.Producto}</p>
                            <span className="inline-block mt-1 text-[9px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded-md bg-white/5 text-slate-400 border border-white/10">
                              {pg.TipoProducto}
                            </span>
                          </div>
                          <p className="text-base font-black text-emerald-400 whitespace-nowrap flex-shrink-0">{fmt(pg.Pago)}</p>
                        </div>
                        <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 mt-3 pt-3 border-t border-white/5">
                          <div>
                            <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Fecha</p>
                            <p className="text-[11px] text-slate-300">{pg.Fecha}</p>
                          </div>
                          <div>
                            <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Recibo</p>
                            <p className="text-[11px] text-slate-300">{pg.Recibo}</p>
                          </div>
                          <div>
                            <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Forma de pago</p>
                            <p className="text-[11px] text-slate-300">{pg.FormaPago}</p>
                          </div>
                          <div>
                            <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Sede</p>
                            <p className="text-[11px] text-slate-300">{pg.Sede}</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="p-4 px-5 bg-white/5 border-t border-white/10 flex items-center justify-between gap-3">
                <p className="text-[11px] text-slate-500">
                  {isLoadingPagos ? "—" : `${pagosDeudor.length} pago(s) de torneo`}
                </p>
                <div className="text-right">
                  <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Total pagado</p>
                  <p className="text-lg font-black text-emerald-400">
                    {fmt(pagosDeudor.reduce((s, pg) => s + pg.Pago, 0))}
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Lista de deudores: la global de la alerta o la de un torneo */}
        {deudoresAbiertos && (
          <div className="fixed inset-0 bg-black/70 backdrop-blur-md flex items-center justify-center z-[120] p-4" onClick={() => setDeudoresAbiertos(null)}>
            <div
              className="bg-[#0f172a] border border-amber-500/25 rounded-3xl w-full max-w-2xl max-h-[80vh] flex flex-col shadow-2xl overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="p-5 border-b border-white/10 bg-amber-500/10 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="text-base font-black text-white flex items-center gap-2">
                    <AlertTriangle size={16} className="text-amber-400 flex-shrink-0" />
                    <span className="truncate">{deudoresAbiertos.titulo}</span>
                  </h3>
                  <p className="text-[11px] text-amber-300/70 mt-0.5">
                    {deudoresAbiertos.lista.length} jugador{deudoresAbiertos.lista.length === 1 ? "" : "es"} con adeudo en {temporadaAdeudos || "la temporada en curso"}
                  </p>
                </div>
                <button onClick={() => setDeudoresAbiertos(null)} className="p-2 rounded-xl hover:bg-white/10 text-slate-400 hover:text-white transition-all flex-shrink-0">
                  <X size={18} />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-5">
                <div className="bg-white/5 border border-white/10 rounded-2xl divide-y divide-white/5 overflow-hidden">
                  {deudoresAbiertos.lista.map((d) => (
                    <button
                      key={d.IdJugador}
                      type="button"
                      onClick={() => setPagoDeudor(d)}
                      title="Ver el detalle de lo que pagó"
                      className="w-full text-left px-4 py-3 flex items-center justify-between gap-3 hover:bg-white/[0.06] transition-colors"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-slate-200 truncate">{d.Jugador}</p>
                        <p className="text-[10px] text-slate-500 mt-0.5">
                          {d.Categoria || "—"} · {d.Sede || "—"}
                        </p>
                        {/* Qué torneo pagó: es lo que conecta la deuda con esta pantalla. */}
                        {d.Torneos.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-1.5">
                            {d.Torneos.map((t) => (
                              <span key={t} className="text-[9px] font-bold px-1.5 py-0.5 rounded-md bg-blue-500/15 text-blue-300 border border-blue-500/25">
                                {t}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {d.Inscrito ? (
                          <span className="text-[10px] font-black px-2 py-1 rounded-lg bg-rose-500/15 text-rose-300 border border-rose-500/25 whitespace-nowrap">
                            {d.MesesDebe} mes{d.MesesDebe === 1 ? "" : "es"}
                          </span>
                        ) : (
                          <span className="text-[10px] font-black px-2 py-1 rounded-lg bg-amber-500/15 text-amber-300 border border-amber-500/25 whitespace-nowrap">
                            Sin inscripción
                          </span>
                        )}
                        <ChevronRight size={14} className="text-slate-600" />
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              <div className="p-4 px-5 bg-white/5 border-t border-white/10 flex justify-end">
                <button onClick={() => setDeudoresAbiertos(null)} className="px-6 py-2 bg-white/5 hover:bg-white/10 rounded-xl text-white text-xs font-black border border-white/10 transition-all">
                  Cerrar
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Categories Modal */}
        {selectedProduct && (
          <div className="fixed inset-0 bg-black/70 backdrop-blur-md flex items-center justify-center z-[100] p-4">
            <div className="bg-[#0f172a] border border-white/10 rounded-3xl w-full max-w-4xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden animate-in zoom-in-95">
              <div className="p-6 border-b border-white/5 flex items-center justify-between bg-white/5">
                <div className="flex items-center gap-4">
                  <div className="bg-blue-600/20 p-3 rounded-2xl border border-blue-500/20">
                    <TrendingUp size={24} className="text-blue-400" />
                  </div>
                  <div>
                    <h3 className="text-xl font-black text-white">{selectedProduct.Producto}</h3>
                    <p className="text-xs text-slate-400 uppercase font-bold tracking-widest">Desglose por Categoría</p>
                  </div>
                </div>
                <button onClick={() => setSelectedProduct(null)} className="p-2 rounded-xl hover:bg-white/10 text-slate-400 hover:text-white transition-all">
                  <X size={20} />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-6">
                {isLoadingCategories ? (
                  <div className="h-60 flex flex-col items-center justify-center gap-4">
                    <RefreshCw className="animate-spin text-blue-500" size={32} />
                    <p className="text-sm text-slate-500 font-bold">Cargando categorías...</p>
                  </div>
                ) : categories.length === 0 ? (
                  <div className="h-60 flex flex-col items-center justify-center text-slate-500">
                    <Search size={48} className="opacity-10 mb-2" />
                    <p className="font-bold">Sin datos por categoría</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {categories.map((c) => (
                      <div 
                        key={c.Categoria}
                        onClick={() => fetchDetails(c.Categoria)}
                        className="group bg-white/5 border border-white/10 hover:border-blue-500/40 rounded-2xl p-5 cursor-pointer transition-all hover:bg-white/[0.08]"
                      >
                        <div className="flex justify-between items-center mb-4">
                          <h4 className="font-black text-white group-hover:text-blue-300 transition-colors">{c.Categoria}</h4>
                          <ChevronRight size={16} className="text-slate-600 group-hover:text-blue-400 group-hover:translate-x-1 transition-all" />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                          <div className="bg-white/5 p-2 rounded-xl">
                            <p className="text-[9px] uppercase font-bold text-slate-500 mb-1">Recaudado</p>
                            <p className="text-lg font-black text-emerald-400">{fmtC(c.Total)}</p>
                          </div>
                          <div className="bg-white/5 p-2 rounded-xl">
                            <p className="text-[9px] uppercase font-bold text-slate-500 mb-1">Pagos / Jugadores</p>
                            <p className="text-sm font-black text-white">{c.Pagos} <span className="text-slate-500 text-[10px]">({c.Jugadores})</span></p>
                          </div>
                        </div>
                        <div className="mt-4 h-1 bg-white/5 rounded-full overflow-hidden">
                          <div 
                            className="h-full bg-gradient-to-r from-blue-600 to-blue-400" 
                            style={{ width: `${(c.Total / Math.max(...categories.map(cat => cat.Total))) * 100}%` }} 
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="p-4 bg-white/5 border-t border-white/5 flex justify-between items-center px-8">
                <span className="text-xs text-slate-500 font-bold">Total Producto: <span className="text-white">{fmt(selectedProduct.TotalRecaudado)}</span></span>
                <button onClick={() => setSelectedProduct(null)} className="px-6 py-2 bg-white/5 hover:bg-white/10 rounded-xl text-white text-xs font-black border border-white/10 transition-all">Cerrar</button>
              </div>
            </div>
          </div>
        )}

        {/* Details Modal */}
        {selectedCategory && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center z-[110] p-4">
            <div className="bg-[#0f172a] border border-white/15 rounded-3xl w-full max-w-2xl max-h-[75vh] flex flex-col shadow-2xl overflow-hidden animate-in zoom-in-95">
              <div className="p-6 border-b border-white/10 flex items-center justify-between bg-white/5">
                <div className="flex items-center gap-4">
                  <div className="bg-purple-600/20 p-2.5 rounded-xl border border-purple-500/20">
                    <User size={20} className="text-purple-400" />
                  </div>
                  <div>
                    <h3 className="text-lg font-black text-white">{selectedCategory}</h3>
                    <p className="text-[10px] text-slate-400 uppercase font-bold tracking-widest">{selectedProduct?.Producto}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <button 
                    onClick={handleExportDetailsPDF}
                    disabled={details.length === 0}
                    className="flex items-center gap-2 px-3 py-1.5 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 rounded-xl border border-emerald-500/30 transition-all font-bold text-[10px] uppercase tracking-widest disabled:opacity-50"
                  >
                    <FileDown size={14} />
                    Exportar PDF
                  </button>
                  <button onClick={() => setSelectedCategory(null)} className="p-2 rounded-xl hover:bg-white/10 text-slate-400 hover:text-white transition-all">
                    <X size={18} />
                  </button>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-6">
                {isLoadingDetails ? (
                  <div className="h-40 flex flex-col items-center justify-center gap-4">
                    <RefreshCw className="animate-spin text-purple-500" size={24} />
                    <p className="text-xs text-slate-500 font-bold">Obteniendo jugadores...</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {details.map((d) => (
                      <div key={d.IdPago} className="bg-white/5 border border-white/5 rounded-2xl p-4 flex items-center justify-between group hover:bg-white/[0.08] transition-all">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-full bg-slate-800 flex items-center justify-center text-xs font-black text-slate-400 border border-white/5 group-hover:border-purple-500/30 group-hover:text-purple-400 transition-all">
                            {d.Jugador.charAt(0)}
                          </div>
                          <div>
                            <p className="text-sm font-bold text-white">{d.Jugador}</p>
                            <div className="flex items-center gap-2 text-[10px] text-slate-500">
                              <span>{new Date(d.FechaPago).toLocaleDateString("es-MX")}</span>
                              <span>•</span>
                              <span>Recibo: {d.Recibo || "N/A"}</span>
                            </div>
                          </div>
                        </div>
                        <p className="text-base font-black text-emerald-400">{fmt(d.Pago)}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="p-4 bg-white/5 border-t border-white/5 flex justify-end px-8">
                <button onClick={() => setSelectedCategory(null)} className="px-6 py-2 bg-purple-600 hover:bg-purple-500 rounded-xl text-white text-xs font-black shadow-lg shadow-purple-500/20 transition-all">Entendido</button>
              </div>
            </div>
          </div>
        )}
      </main>
    </DashboardLayout>
  );
}
