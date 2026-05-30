"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { useUser } from "@/contexts/user-context";
import DashboardLayout from "@/components/DashboardLayout";
import {
  ShoppingCart, Search, Plus, RefreshCw, Calendar, X,
  AlertCircle, Wallet, CreditCard, Receipt, MapPin,
  ChevronRight, Sparkles, TrendingUp, DollarSign,
  UserCheck, ArrowRight
} from "lucide-react";

type Period = "today" | "yesterday" | "week" | "month" | "all";

interface Sale {
  IdVenta: number;
  FechaVenta: string;
  IdJugador: number | null;
  Jugador: string;
  ConceptoVenta: string;
  IdFormaPago: number;
  Referencia: string;
  Subtotal: number;
  Iva: number;
  Total: number;
  Status: number;
  IdSede: number | null;
  Sede: string | null;
  FormaPago: string;
  Recibo: string;
}

interface Sede {
  IdSede: number;
  Sede: string;
}

interface Product {
  IdProducto: number;
  Producto: string;
  Precio: number;
}

interface Player {
  IdJugador: number;
  Jugador: string;
  Categoria: string;
  IdSede: number;
}

const fmt = (n: number) =>
  new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(n);

export default function VentasPage() {
  const router = useRouter();
  const { user, isInitialized, season } = useUser();

  // Sales List State
  const [sales, setSales] = useState<Sale[]>([]);
  const [sedes, setSedes] = useState<Sede[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  // Filters State
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedSedeFilter, setSelectedSedeFilter] = useState("");
  const [period, setPeriod] = useState<Period>("month");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [pendingFrom, setPendingFrom] = useState("");
  const [pendingTo, setPendingTo] = useState("");

  // Modal Registration State
  const [modalOpen, setModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [regError, setRegError] = useState<string | null>(null);

  // Registration Form Fields
  const [regSede, setRegSede] = useState("");
  const [buyerType, setBuyerType] = useState<"player" | "general">("player");
  const [regPlayerSearch, setRegPlayerSearch] = useState("");
  const [playersList, setPlayersList] = useState<Player[]>([]);
  const [selectedPlayer, setSelectedPlayer] = useState<Player | null>(null);
  const [regGeneralName, setRegGeneralName] = useState("");
  const [conceptType, setConceptType] = useState<"product" | "custom">("product");
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [regCustomConcept, setRegCustomConcept] = useState("");
  const [regTotal, setRegTotal] = useState<number | "">("");
  const [regFormaPago, setRegFormaPago] = useState("EFECTIVO");
  const [regReferencia, setRegReferencia] = useState("");
  const [regRecibo, setRegRecibo] = useState("");
  const [regFecha, setRegFecha] = useState("");

  // UI state for search dropdowns
  const [showPlayersDropdown, setShowPlayersDropdown] = useState(false);
  const playersDropdownRef = useRef<HTMLDivElement>(null);

  // Redirect non-admins
  useEffect(() => {
    if (isInitialized && !user) {
      router.push("/login");
    } else if (user && (user.AdminConvocatorias ?? 0) < 2) {
      router.push("/");
    }
  }, [user, isInitialized, router]);

  // Fetch Master Data (Sedes & Products)
  const fetchMasterData = useCallback(async () => {
    try {
      const [sedesRes, productsRes] = await Promise.all([
        fetch("/api/ventas/sedes"),
        fetch("/api/ventas/products")
      ]);
      const sedesJson = await sedesRes.json();
      const productsJson = await productsRes.json();

      if (sedesJson.success) setSedes(sedesJson.data);
      if (productsJson.success) setProducts(productsJson.data);
    } catch (e) {
      console.error("Error loading master data:", e);
    }
  }, []);

  // Fetch Sales History
  const fetchSales = useCallback(async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams({ period });
      if (selectedSedeFilter) params.set("idSede", selectedSedeFilter);
      if (searchQuery) params.set("q", searchQuery);
      if (period === "all" && dateFrom && dateTo) {
        params.set("dateFrom", dateFrom);
        params.set("dateTo", dateTo);
      }

      const res = await fetch(`/api/ventas?${params}`);
      const json = await res.json();
      if (json.success) {
        setSales(json.data);
        setLastUpdated(new Date());
      }
    } catch (e) {
      console.error("Error loading sales history:", e);
    } finally {
      setIsLoading(false);
    }
  }, [period, selectedSedeFilter, searchQuery, dateFrom, dateTo]);

  useEffect(() => {
    if (user && (user.AdminConvocatorias ?? 0) >= 2) {
      fetchMasterData();
      fetchSales();
    }
  }, [user, fetchSales, fetchMasterData]);

  // Player search autocomplete
  useEffect(() => {
    if (buyerType !== "player" || !regPlayerSearch.trim()) {
      setPlayersList([]);
      return;
    }

    const delayDebounce = setTimeout(async () => {
      try {
        const res = await fetch(`/api/ventas/players?q=${encodeURIComponent(regPlayerSearch)}`);
        const json = await res.json();
        if (json.success) {
          setPlayersList(json.data);
          setShowPlayersDropdown(true);
        }
      } catch (e) {
        console.error("Error fetching autocomplete players:", e);
      }
    }, 300);

    return () => clearTimeout(delayDebounce);
  }, [regPlayerSearch, buyerType]);

  // Handle outside click to close players dropdown
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (playersDropdownRef.current && !playersDropdownRef.current.contains(event.target as Node)) {
        setShowPlayersDropdown(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Sync pricing when product selected
  useEffect(() => {
    if (conceptType === "product" && selectedProduct) {
      setRegTotal(selectedProduct.Precio);
    }
  }, [selectedProduct, conceptType]);

  const handlePeriodChange = (p: Period) => {
    if (p === "all") {
      setPendingFrom(dateFrom || new Date().toISOString().split("T")[0]);
      setPendingTo(dateTo || new Date().toISOString().split("T")[0]);
      setShowDatePicker(true);
      return;
    }
    setPeriod(p);
  };

  const applyCustomDates = () => {
    setDateFrom(pendingFrom);
    setDateTo(pendingTo);
    setPeriod("all");
    setShowDatePicker(false);
    fetchSales();
  };

  const handleRegisterSale = async (e: React.FormEvent) => {
    e.preventDefault();
    setRegError(null);
    setIsSubmitting(true);

    try {
      const totalAmount = Number(regTotal);
      if (isNaN(totalAmount) || totalAmount <= 0) {
        throw new Error("El monto total debe ser un número mayor a cero.");
      }

      const comprador = buyerType === "player"
        ? selectedPlayer?.Jugador
        : regGeneralName;

      if (!comprador) {
        throw new Error("Debe seleccionar un alumno o ingresar un comprador genérico.");
      }

      const concepto = conceptType === "product"
        ? selectedProduct?.Producto
        : regCustomConcept;

      if (!concepto) {
        throw new Error("Debe seleccionar un producto o ingresar un concepto personalizado.");
      }

      const payload = {
        idSede: parseInt(regSede),
        idJugador: buyerType === "player" ? selectedPlayer?.IdJugador : null,
        jugador: comprador,
        conceptoVenta: concepto,
        idFormaPago: regFormaPago === "EFECTIVO" ? 1 : regFormaPago === "TARJETA" ? 2 : 4, // 1: Efvo, 2: Tarjeta, 4: Transferencia
        formaPago: regFormaPago,
        referencia: regReferencia,
        recibo: regRecibo,
        total: totalAmount,
        fechaVenta: regFecha || null
      };

      const res = await fetch("/api/ventas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      const json = await res.json();
      if (json.success) {
        setModalOpen(false);
        // Clear form
        setRegSede("");
        setSelectedPlayer(null);
        setRegPlayerSearch("");
        setRegGeneralName("");
        setSelectedProduct(null);
        setRegCustomConcept("");
        setRegTotal("");
        setRegReferencia("");
        setRegRecibo("");
        setRegFecha("");
        // Reload list
        fetchSales();
      } else {
        setRegError(json.message || "Error al registrar la venta");
      }
    } catch (err: any) {
      setRegError(err.message || "Error de validación");
    } finally {
      setIsSubmitting(false);
    }
  };

  // KPIs Calculations
  const totalRecaudado = sales.reduce((acc, s) => acc + s.Total, 0);
  const totalEfectivo = sales.filter(s => s.FormaPago === "EFECTIVO").reduce((acc, s) => acc + s.Total, 0);
  const totalTarjeta = sales.filter(s => s.FormaPago === "TARJETA").reduce((acc, s) => acc + s.Total, 0);
  const totalTransferencia = sales.filter(s => s.FormaPago === "TRANSFERENCIA").reduce((acc, s) => acc + s.Total, 0);

  return (
    <DashboardLayout>
      <main className="overflow-y-auto flex-1 text-white">
        
        {/* HEADER */}
        <div className="bg-white/5 backdrop-blur-xl border-b border-white/10 px-6 py-4 flex justify-between items-center sticky top-0 z-20">
          <div className="flex items-center gap-4">
            <div className="bg-blue-600/20 p-2.5 rounded-xl border border-blue-500/20">
              <ShoppingCart size={20} className="text-blue-400" />
            </div>
            <div>
              <h1 className="text-xl font-black">Historial de Ventas</h1>
              <p className="text-xs text-blue-300">{season ? `Temporada ${season}` : "Administración de Ventas"}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {lastUpdated && (
              <span className="text-[10px] text-slate-500">
                Act. {lastUpdated.toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" })}
              </span>
            )}
            <button
              onClick={fetchSales}
              disabled={isLoading}
              className="p-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-slate-400 hover:text-white transition-all"
            >
              <RefreshCw size={15} className={isLoading ? "animate-spin" : ""} />
            </button>
            <button
              onClick={() => setModalOpen(true)}
              className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 rounded-xl text-xs font-black shadow-lg shadow-blue-500/25 transition-all transform hover:scale-[1.02]"
            >
              <Plus size={15} />
              Registrar Venta
            </button>
          </div>
        </div>

        {/* CONTAINER */}
        <div className="p-6 md:p-8 max-w-7xl mx-auto space-y-8">
          
          {/* KPI CARDS */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { label: "Ventas Totales", value: fmt(totalRecaudado), desc: `${sales.length} transacciones`, icon: <TrendingUp size={16} className="text-emerald-400" />, bg: "bg-emerald-500/10 border-emerald-500/20" },
              { label: "Efectivo", value: fmt(totalEfectivo), desc: "Colección física", icon: <Wallet size={16} className="text-blue-400" />, bg: "bg-blue-500/10 border-blue-500/20" },
              { label: "Tarjeta", value: fmt(totalTarjeta), desc: "Pagos terminal", icon: <CreditCard size={16} className="text-purple-400" />, bg: "bg-purple-500/10 border-purple-500/20" },
              { label: "Transferencia", value: fmt(totalTransferencia), desc: "Depósitos bancarios", icon: <Receipt size={16} className="text-amber-400" />, bg: "bg-amber-500/10 border-amber-500/20" }
            ].map(kpi => (
              <div key={kpi.label} className="bg-white/5 border border-white/10 rounded-2xl p-4 flex items-start gap-3 relative overflow-hidden group">
                <div className="absolute -inset-10 bg-white/1 rounded-full blur-xl group-hover:scale-125 transition-transform duration-300 pointer-events-none" />
                <div className={`p-2 rounded-xl border flex-shrink-0 ${kpi.bg}`}>{kpi.icon}</div>
                <div>
                  <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{kpi.label}</p>
                  <p className="text-base font-black text-white mt-0.5 tabular-nums">{kpi.value}</p>
                  <p className="text-[10px] text-slate-400">{kpi.desc}</p>
                </div>
              </div>
            ))}
          </div>

          {/* FILTERS PANEL */}
          <div className="flex flex-col lg:flex-row gap-4 items-start lg:items-center justify-between">
            {/* Search Input & Sede */}
            <div className="flex flex-col sm:flex-row gap-3 w-full lg:w-auto">
              <div className="relative group flex-1 sm:w-80">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-blue-400 transition-colors" size={16} />
                <input
                  type="text"
                  placeholder="Buscar comprador (jugador)..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && fetchSales()}
                  className="w-full bg-white/5 border border-white/10 rounded-xl pl-10 pr-4 py-2.5 outline-none focus:bg-white/10 focus:border-blue-500/50 transition-all text-sm text-white placeholder-slate-400"
                />
              </div>
              <select
                value={selectedSedeFilter}
                onChange={e => setSelectedSedeFilter(e.target.value)}
                className="bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 outline-none focus:bg-white/10 focus:border-blue-500/50 text-sm text-slate-300 transition-all [color-scheme:dark]"
              >
                <option value="">Todas las Sedes</option>
                {sedes.map(s => (
                  <option key={s.IdSede} value={s.IdSede}>{s.Sede}</option>
                ))}
              </select>
            </div>

            {/* Quick Period Filters */}
            <div className="flex gap-1.5 bg-white/5 p-1 rounded-xl border border-white/10 flex-wrap">
              {[
                { key: "today", label: "Hoy" },
                { key: "yesterday", label: "Ayer" },
                { key: "week", label: "Esta Semana" },
                { key: "month", label: "Este Mes" },
                { key: "all", label: "Fechas..." }
              ].map(p => (
                <button
                  key={p.key}
                  onClick={() => handlePeriodChange(p.key as Period)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all duration-200 ${
                    period === p.key || (p.key === "all" && period === "all")
                      ? "bg-blue-600 text-white shadow shadow-blue-500/20"
                      : "text-slate-400 hover:text-white hover:bg-white/5"
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {/* DATE PICKER MODAL (FOR CUSTOM RANGE) */}
          {showDatePicker && (
            <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[130] p-4">
              <div className="bg-slate-900 border border-white/15 rounded-2xl p-6 w-full max-w-sm shadow-2xl animate-in zoom-in-95">
                <div className="flex items-center justify-between mb-5">
                  <h3 className="text-sm font-black text-white flex items-center gap-2">
                    <Calendar size={16} className="text-blue-400" />
                    Rango de Fechas
                  </h3>
                  <button onClick={() => setShowDatePicker(false)} className="p-1 rounded-lg text-slate-500 hover:text-white hover:bg-white/10 transition-all">
                    <X size={18} />
                  </button>
                </div>
                <div className="space-y-4">
                  <div>
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Desde</label>
                    <input type="date" value={pendingFrom} onChange={e => setPendingFrom(e.target.value)}
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-white text-sm outline-none focus:border-blue-500/60 focus:bg-white/10 transition-all [color-scheme:dark]" />
                  </div>
                  <div>
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Hasta</label>
                    <input type="date" value={pendingTo} onChange={e => setPendingTo(e.target.value)}
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-white text-sm outline-none focus:border-blue-500/60 focus:bg-white/10 transition-all [color-scheme:dark]" />
                  </div>
                </div>
                <div className="flex gap-3 mt-6">
                  <button onClick={() => setShowDatePicker(false)} className="flex-1 py-2.5 rounded-xl border border-white/10 text-slate-400 text-sm font-bold hover:bg-white/5 transition-all">Cancelar</button>
                  <button onClick={applyCustomDates} className="flex-1 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-black transition-all shadow-lg shadow-blue-500/20">Aplicar</button>
                </div>
              </div>
            </div>
          )}

          {/* HISTORY LIST TABLE */}
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-32 gap-4">
              <div className="w-10 h-10 rounded-full border-4 border-blue-500/20 border-t-blue-500 animate-spin" />
              <p className="text-xs font-bold text-slate-500 animate-pulse">Cargando historial de ventas...</p>
            </div>
          ) : sales.length === 0 ? (
            <div className="text-center py-20 bg-white/5 rounded-3xl border border-dashed border-white/10">
              <ShoppingCart size={40} className="mx-auto text-slate-600 mb-4" />
              <h3 className="text-base font-bold text-slate-300">No hay ventas registradas</h3>
              <p className="text-xs text-slate-500 mt-2">No se encontraron ventas para los filtros aplicados en este período.</p>
            </div>
          ) : (
            <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden shadow-2xl">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-white/5 text-[9px] uppercase font-black text-slate-500 tracking-widest border-b border-white/10">
                      <th className="px-5 py-4">Fecha</th>
                      <th className="px-5 py-4">Comprador</th>
                      <th className="px-5 py-4">Concepto / Producto</th>
                      <th className="px-5 py-4">Sede</th>
                      <th className="px-5 py-4">Pago</th>
                      <th className="px-5 py-4">Folio / Recibo</th>
                      <th className="px-5 py-4 text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5 text-slate-300">
                    {sales.map(s => (
                      <tr key={s.IdVenta} className="hover:bg-white/5 transition-colors">
                        <td className="px-5 py-3.5 text-xs whitespace-nowrap tabular-nums text-slate-400">
                          {new Date(s.FechaVenta).toLocaleDateString("es-MX", { day: "2-digit", month: "short", year: "numeric" })}
                          <span className="block text-[10px] text-slate-600 mt-0.5">
                            {new Date(s.FechaVenta).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" })}
                          </span>
                        </td>
                        <td className="px-5 py-3.5">
                          <p className="text-xs font-bold text-white truncate max-w-[200px]">{s.Jugador}</p>
                          <span className="text-[10px] text-slate-500">
                            {s.IdJugador ? `Alumno ID: #${s.IdJugador}` : "Venta Externa"}
                          </span>
                        </td>
                        <td className="px-5 py-3.5">
                          <p className="text-xs text-white line-clamp-1 max-w-[250px]">{s.ConceptoVenta}</p>
                        </td>
                        <td className="px-5 py-3.5 text-xs whitespace-nowrap">
                          <span className="flex items-center gap-1 text-slate-400">
                            <MapPin size={12} className="text-slate-600" />
                            {s.Sede || "—"}
                          </span>
                        </td>
                        <td className="px-5 py-3.5 text-xs">
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-black border tracking-wide whitespace-nowrap ${
                            s.FormaPago === "EFECTIVO"
                              ? "bg-blue-500/10 border-blue-500/20 text-blue-400"
                              : s.FormaPago === "TARJETA"
                                ? "bg-purple-500/10 border-purple-500/20 text-purple-400"
                                : "bg-amber-500/10 border-amber-500/20 text-amber-400"
                          }`}>
                            {s.FormaPago}
                          </span>
                        </td>
                        <td className="px-5 py-3.5 text-xs tabular-nums text-slate-400">
                          {s.Recibo ? `Recibo: ${s.Recibo}` : s.Referencia ? `Ref: ${s.Referencia}` : "—"}
                        </td>
                        <td className="px-5 py-3.5 text-right font-black text-emerald-400 text-xs tabular-nums whitespace-nowrap">
                          {fmt(s.Total)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* REGISTRATION MODAL */}
        {modalOpen && (
          <div className="fixed inset-0 bg-black/75 backdrop-blur-md flex items-center justify-center z-[110] p-4">
            <div className="bg-[#0f172a] border border-white/10 rounded-3xl w-full max-w-xl shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200">
              
              {/* Modal Header */}
              <div className="p-5 border-b border-white/5 flex items-center justify-between bg-white/5">
                <div className="flex items-center gap-3">
                  <div className="bg-blue-600/20 p-2.5 rounded-xl border border-blue-500/20">
                    <Sparkles size={18} className="text-blue-400" />
                  </div>
                  <div>
                    <h3 className="text-base font-black text-white">Registrar Nueva Venta</h3>
                    <p className="text-[10px] text-slate-400">Completa la información de la venta de productos</p>
                  </div>
                </div>
                <button onClick={() => setModalOpen(false)} className="p-2 rounded-xl hover:bg-white/10 text-slate-400 hover:text-white transition-all">
                  <X size={18} />
                </button>
              </div>

              {/* Modal Form */}
              <form onSubmit={handleRegisterSale} className="p-6 space-y-5">
                
                {regError && (
                  <div className="bg-rose-500/10 border border-rose-500/20 rounded-xl p-3 flex items-start gap-2.5 text-xs text-rose-300">
                    <AlertCircle size={15} className="flex-shrink-0 mt-0.5" />
                    <p className="font-semibold">{regError}</p>
                  </div>
                )}

                {/* Sede Selector */}
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Sede de la Venta *</label>
                  <select
                    required
                    value={regSede}
                    onChange={e => setRegSede(e.target.value)}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white text-sm outline-none focus:border-blue-500/60 focus:bg-white/10 transition-all [color-scheme:dark]"
                  >
                    <option value="">Selecciona Sede...</option>
                    {sedes.map(s => (
                      <option key={s.IdSede} value={s.IdSede}>{s.Sede}</option>
                    ))}
                  </select>
                </div>

                {/* Comprador Toggle Selector */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest">Tipo de Comprador *</label>
                    <div className="flex gap-2 bg-white/5 p-0.5 rounded-lg border border-white/10">
                      <button
                        type="button"
                        onClick={() => { setBuyerType("player"); setSelectedPlayer(null); }}
                        className={`px-2.5 py-1 rounded text-[10px] font-black transition-all ${
                          buyerType === "player" ? "bg-blue-600 text-white" : "text-slate-500 hover:text-slate-300"
                        }`}
                      >
                        Alumno
                      </button>
                      <button
                        type="button"
                        onClick={() => { setBuyerType("general"); setRegGeneralName(""); }}
                        className={`px-2.5 py-1 rounded text-[10px] font-black transition-all ${
                          buyerType === "general" ? "bg-blue-600 text-white" : "text-slate-500 hover:text-slate-300"
                        }`}
                      >
                        Público Gral.
                      </button>
                    </div>
                  </div>

                  {buyerType === "player" ? (
                    <div className="relative" ref={playersDropdownRef}>
                      <input
                        type="text"
                        placeholder={selectedPlayer ? selectedPlayer.Jugador : "Escribe nombre del alumno..."}
                        value={regPlayerSearch}
                        onChange={e => {
                          setRegPlayerSearch(e.target.value);
                          if (selectedPlayer) setSelectedPlayer(null);
                        }}
                        className={`w-full bg-white/5 border rounded-xl pl-4 pr-10 py-2.5 text-white text-sm outline-none focus:bg-white/10 transition-all ${
                          selectedPlayer ? "border-emerald-500/40 focus:border-emerald-500" : "border-white/10 focus:border-blue-500/60"
                        }`}
                      />
                      <Search className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
                      
                      {/* Search Autocomplete dropdown */}
                      {showPlayersDropdown && playersList.length > 0 && (
                        <div className="absolute left-0 right-0 mt-1 max-h-48 overflow-y-auto bg-slate-900 border border-white/15 rounded-xl shadow-2xl z-30 divide-y divide-white/5">
                          {playersList.map(p => (
                            <button
                              key={p.IdJugador}
                              type="button"
                              onClick={() => {
                                setSelectedPlayer(p);
                                setRegPlayerSearch(p.Jugador);
                                setShowPlayersDropdown(false);
                              }}
                              className="w-full text-left px-4 py-2.5 hover:bg-white/5 text-xs font-bold text-slate-300 hover:text-white flex items-center justify-between"
                            >
                              <span>{p.Jugador}</span>
                              <span className="text-[9px] font-black text-slate-500 uppercase bg-white/5 px-2 py-0.5 rounded border border-white/5">
                                Cat: {p.Categoria}
                              </span>
                            </button>
                          ))}
                        </div>
                      )}
                      {selectedPlayer && (
                        <div className="mt-1.5 flex items-center gap-1.5 text-[10px] text-emerald-400 font-bold">
                          <UserCheck size={12} />
                          Alumno vinculado con éxito.
                        </div>
                      )}
                    </div>
                  ) : (
                    <input
                      type="text"
                      required
                      placeholder="Escribe el nombre del comprador..."
                      value={regGeneralName}
                      onChange={e => setRegGeneralName(e.target.value)}
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white text-sm outline-none focus:border-blue-500/60 focus:bg-white/10 transition-all"
                    />
                  )}
                </div>

                {/* Concept Selector */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest">Concepto de Venta *</label>
                    <div className="flex gap-2 bg-white/5 p-0.5 rounded-lg border border-white/10">
                      <button
                        type="button"
                        onClick={() => { setConceptType("product"); setSelectedProduct(null); }}
                        className={`px-2.5 py-1 rounded text-[10px] font-black transition-all ${
                          conceptType === "product" ? "bg-blue-600 text-white" : "text-slate-500 hover:text-slate-300"
                        }`}
                      >
                        Catálogo
                      </button>
                      <button
                        type="button"
                        onClick={() => { setConceptType("custom"); setRegCustomConcept(""); }}
                        className={`px-2.5 py-1 rounded text-[10px] font-black transition-all ${
                          conceptType === "custom" ? "bg-blue-600 text-white" : "text-slate-500 hover:text-slate-300"
                        }`}
                      >
                        Manual
                      </button>
                    </div>
                  </div>

                  {conceptType === "product" ? (
                    <select
                      required
                      value={selectedProduct ? selectedProduct.IdProducto : ""}
                      onChange={e => {
                        const prod = products.find(p => p.IdProducto === parseInt(e.target.value));
                        setSelectedProduct(prod || null);
                      }}
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white text-sm outline-none focus:border-blue-500/60 focus:bg-white/10 transition-all [color-scheme:dark]"
                    >
                      <option value="">Selecciona Artículo...</option>
                      {products.map(p => (
                        <option key={p.IdProducto} value={p.IdProducto}>{p.Producto} ({fmt(p.Precio)})</option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type="text"
                      required
                      placeholder="Escribe el concepto de la venta..."
                      value={regCustomConcept}
                      onChange={e => setRegCustomConcept(e.target.value)}
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white text-sm outline-none focus:border-blue-500/60 focus:bg-white/10 transition-all"
                    />
                  )}
                </div>

                {/* Pricing Block */}
                <div className="grid grid-cols-3 gap-3 bg-white/[0.02] border border-white/5 rounded-2xl p-4">
                  <div>
                    <label className="block text-[9px] font-black text-slate-500 uppercase tracking-wider mb-1">Monto Total *</label>
                    <div className="relative">
                      <DollarSign className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" size={13} />
                      <input
                        type="number"
                        required
                        step="0.01"
                        placeholder="0.00"
                        value={regTotal}
                        onChange={e => setRegTotal(e.target.value !== "" ? Number(e.target.value) : "")}
                        disabled={conceptType === "product"}
                        className="w-full bg-white/5 border border-white/10 rounded-xl pl-6 pr-3 py-2 text-white text-sm font-black outline-none focus:border-blue-500/60 transition-all disabled:opacity-75"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-[9px] font-black text-slate-500 uppercase tracking-wider mb-1">Subtotal (16% desc)</label>
                    <p className="text-slate-300 text-sm font-bold py-2 tabular-nums">
                      {regTotal !== "" ? fmt(Number(regTotal) / 1.16) : "$0.00"}
                    </p>
                  </div>
                  <div>
                    <label className="block text-[9px] font-black text-slate-500 uppercase tracking-wider mb-1">IVA (Calculado)</label>
                    <p className="text-slate-300 text-sm font-bold py-2 tabular-nums">
                      {regTotal !== "" ? fmt(Number(regTotal) - (Number(regTotal) / 1.16)) : "$0.00"}
                    </p>
                  </div>
                </div>

                {/* Formas de Pago, Referencia, Recibo, Fecha */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Forma de Pago *</label>
                    <select
                      value={regFormaPago}
                      onChange={e => setRegFormaPago(e.target.value)}
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-white text-sm outline-none focus:border-blue-500/60 focus:bg-white/10 transition-all [color-scheme:dark]"
                    >
                      <option value="EFECTIVO">Efectivo</option>
                      <option value="TARJETA">Tarjeta</option>
                      <option value="TRANSFERENCIA">Transferencia</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Recibo / Folio</label>
                    <input
                      type="text"
                      placeholder="Número de recibo..."
                      value={regRecibo}
                      onChange={e => setRegRecibo(e.target.value)}
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-white text-sm outline-none focus:border-blue-500/60 focus:bg-white/10 transition-all"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Referencia</label>
                    <input
                      type="text"
                      placeholder="Opcional..."
                      value={regReferencia}
                      onChange={e => setRegReferencia(e.target.value)}
                      disabled={regFormaPago === "EFECTIVO"}
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-white text-sm outline-none focus:border-blue-500/60 focus:bg-white/10 transition-all disabled:opacity-50"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Fecha de Venta</label>
                    <input
                      type="datetime-local"
                      value={regFecha}
                      onChange={e => setRegFecha(e.target.value)}
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-1.5 text-white text-sm outline-none focus:border-blue-500/60 focus:bg-white/10 transition-all [color-scheme:dark]"
                    />
                  </div>
                </div>

                {/* Form Actions */}
                <div className="flex gap-3 mt-6 pt-5 border-t border-white/5">
                  <button
                    type="button"
                    onClick={() => setModalOpen(false)}
                    className="flex-1 py-2.5 rounded-xl border border-white/10 text-slate-400 text-xs font-black hover:bg-white/5 transition-all"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="flex-1 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-black transition-all shadow-lg shadow-blue-500/20 flex items-center justify-center gap-2"
                  >
                    {isSubmitting ? (
                      <>
                        <RefreshCw className="animate-spin" size={13} />
                        Registrando...
                      </>
                    ) : (
                      <>
                        <span>Registrar Venta</span>
                        <ArrowRight size={13} />
                      </>
                    )}
                  </button>
                </div>

              </form>

            </div>
          </div>
        )}

      </main>
    </DashboardLayout>
  );
}
