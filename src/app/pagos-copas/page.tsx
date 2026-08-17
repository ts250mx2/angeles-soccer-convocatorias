"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { useUser } from "@/contexts/user-context";
import DashboardLayout from "@/components/DashboardLayout";
import { useDialogoModal } from "@/components/useDialogoModal";
import {
  Trophy, Search, Users, ChevronRight, X, CreditCard,
  Target, Calendar, RefreshCw, BarChart3, TrendingUp, User, FileDown, AlertTriangle, History
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
  /** Escudo del torneo. Vive en la liga, así que varios conceptos lo comparten. */
  IdLiga: number | null;
  TieneFoto: number;
  /** Sello para romper el caché del navegador cuando la foto cambia. */
  FotoVersion: string | null;
}

/** URL del escudo del torneo, o null si su copa o liga no tiene foto cargada. */
const fotoTorneo = (p: Pick<ProductSummary, 'IdLiga' | 'TieneFoto' | 'FotoVersion'>): string | null =>
  p.TieneFoto === 1 && p.IdLiga ? `/api/copas-ligas/foto/${p.IdLiga}?v=${p.FotoVersion ?? '0'}` : null;

/** Torneo que el servidor cree que pertenece a la temporada anterior. */
interface SugerenciaProducto {
  IdProducto: number;
  Producto: string;
  IdTipoProducto: number;
  TipoProducto: string;
  CantidadPagos: number;
  TotalRecaudado: number;
  /** Motivos legibles de la sospecha; se muestran tal cual. */
  Razones: string[];
}

interface Sugerencias {
  temporadaAnterior: { IdTemporada: number; Temporada: string };
  productos: SugerenciaProducto[];
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

/**
 * Liga y Copa se distinguen por color de fondo, no solo por la etiqueta: en una
 * cuadrícula de 97 tarjetas leer el texto de cada una para saber qué es resulta lento.
 *
 * El tinte va sobre una base slate-950 y no directamente sobre la página. El fondo de
 * la app es un degradado que pasa por blue-900, y un tinte translúcido puesto encima
 * se lo comía: en la zona azul la tarjeta de Copa quedaba casi igual que el fondo.
 * Con la base oscura las dos se separan del fondo y entre sí en toda la pantalla.
 *
 * Ámbar y violeta se eligieron porque no chocan con el verde de lo recaudado ni con
 * el rojo de la alerta de cobranza.
 */
const ESTILO_TIPO = {
  liga: {
    borde: "border-amber-500/30 hover:border-amber-500/60",
    tinte: "bg-amber-500/[0.12] group-hover:bg-amber-500/[0.18]",
    halo: "bg-amber-500/10",
    icono: "bg-amber-500/15 border-amber-500/25 text-amber-400",
    chip: "bg-amber-500/15 text-amber-300 border-amber-500/30",
    titulo: "group-hover:text-amber-200",
    barra: "from-amber-600 to-amber-400",
  },
  copa: {
    borde: "border-violet-500/30 hover:border-violet-500/60",
    tinte: "bg-violet-500/[0.12] group-hover:bg-violet-500/[0.18]",
    halo: "bg-violet-500/10",
    icono: "bg-violet-500/15 border-violet-500/25 text-violet-400",
    chip: "bg-violet-500/15 text-violet-300 border-violet-500/30",
    titulo: "group-hover:text-violet-200",
    barra: "from-violet-600 to-violet-400",
  },
} as const;

/** IdTipoProducto 3 = Liga, 4 = Copa. */
const estiloDe = (idTipoProducto: number) =>
  idTipoProducto === 3 ? ESTILO_TIPO.liga : ESTILO_TIPO.copa;

const fmt = (n: number) =>
  new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(n);
const fmtC = (n: number) =>
  new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", notation: "compact", maximumFractionDigits: 1 }).format(n);

/**
 * Clave para casar la categoría de una tarjeta con la de un deudor. Las dos salen de
 * J.Categoria, pero MySQL agrupa sin distinguir mayúsculas ni espacios finales y el
 * texto de la tarjeta puede no coincidir letra por letra con el del jugador.
 *
 * También se quitan los acentos: la columna es latin1_swedish_ci, que agrupa "PEQUEÑOS"
 * y "PEQUENOS" en una sola tarjeta. Hoy ninguna categoría capturada lleva acentos —así
 * que esto no mueve ningún número—, pero sin la normalización el día que alguien
 * capture una, su deudor se perdería de la insignia en silencio.
 */
const claveCategoria = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toUpperCase();

export default function PagosCopasPage() {
  const router = useRouter();
  const { user, isInitialized, season } = useUser();
  const [products, setProducts] = useState<ProductSummary[]>([]);
  const [temporadas, setTemporadas] = useState<Temporada[]>([]);
  const [temporadaId, setTemporadaId] = useState<number | null>(null);
  /* Apagado por defecto: la vista normal es la de copas y ligas que NO son clinics. */
  const [soloClinics, setSoloClinics] = useState(false);
  const [alerta, setAlerta] = useState<{ jugadores: number; deudores: Deudor[] }>({ jugadores: 0, deudores: [] });
  const [temporadaAdeudos, setTemporadaAdeudos] = useState<string>("");
  // Torneos que parecen de la temporada anterior y el flujo para mandarlos allá.
  const [sugerencias, setSugerencias] = useState<Sugerencias | null>(null);
  const [sugerenciasAbiertas, setSugerenciasAbiertas] = useState(false);
  // Torneo en confirmación de envío / en envío. Uno a la vez: el envío es irreversible
  // desde esta pantalla y confirmar en dos pasos evita mandar un torneo por accidente.
  const [confirmarEnvioId, setConfirmarEnvioId] = useState<number | null>(null);
  const [enviandoId, setEnviandoId] = useState<number | null>(null);
  const [avisoEnvio, setAvisoEnvio] = useState<{ ok: boolean; texto: string } | null>(null);
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
      const qs = new URLSearchParams();
      if (temporadaId) qs.set("temporada", String(temporadaId));
      if (soloClinics) qs.set("clinics", "1");
      const res = await fetch(`/api/pagos-copas/summary?${qs}`, { cache: "no-store" });
      const json = await res.json();
      if (json.success) {
        setProducts(json.data);
        setAlerta(json.alerta ?? { jugadores: 0, deudores: [] });
        setTemporadaAdeudos(json.temporadaAdeudos?.Temporada ?? "");
        setSugerencias(json.sugerencias ?? null);
        setLastUpdated(new Date());
      }
    } catch (e) { console.error(e); }
    finally { setIsLoading(false); }
  }, [temporadaId, soloClinics]);

  useEffect(() => {
    if (isInitialized && user && temporadaId !== null) fetchData();
  }, [isInitialized, user, temporadaId, soloClinics, fetchData]);

  /* Torneo cuya petición de categorías es la vigente. Sin esto, abrir un torneo lento
     y luego otro rápido deja las categorías del primero junto al encabezado y las
     insignias de deudores del segundo: dos fuentes que dejarían de cuadrar. */
  const torneoEnCurso = useRef<number | null>(null);

  const fetchCategories = async (product: ProductSummary) => {
    torneoEnCurso.current = product.IdProducto;
    setSelectedProduct(product);
    setIsLoadingCategories(true);
    setCategories([]);
    try {
      const res = await fetch(`/api/pagos-copas/categories?idProducto=${product.IdProducto}&temporada=${temporadaId ?? ""}`);
      const json = await res.json();
      if (torneoEnCurso.current !== product.IdProducto) return;
      if (json.success) setCategories(json.data);
    } catch (e) { console.error(e); }
    finally {
      if (torneoEnCurso.current === product.IdProducto) setIsLoadingCategories(false);
    }
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

  // Manda TODOS los pagos vigentes del torneo a la temporada anterior. El servidor
  // vuelve a validar que el destino sea la inmediata anterior; aquí solo se propone.
  const reasignarATemporadaAnterior = async (s: SugerenciaProducto) => {
    if (!sugerencias || temporadaId === null) return;
    setEnviandoId(s.IdProducto);
    setAvisoEnvio(null);
    try {
      const res = await fetch("/api/pagos-copas/reasignar", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          idProducto: s.IdProducto,
          temporadaOrigen: temporadaId,
          temporadaDestino: sugerencias.temporadaAnterior.IdTemporada,
        }),
      });
      const json = await res.json();
      if (json.success) {
        setAvisoEnvio({
          ok: true,
          texto: `Se enviaron ${json.data.pagosMovidos} pago(s) de "${s.Producto}" a ${sugerencias.temporadaAnterior.Temporada}.`,
        });
        // El torneo desaparece de las tarjetas y de la lista de sugerencias.
        await fetchData();
      } else {
        setAvisoEnvio({ ok: false, texto: json.message || "No se pudieron mover los pagos." });
      }
    } catch (e) {
      console.error(e);
      setAvisoEnvio({ ok: false, texto: "Error de red al mover los pagos. Intenta de nuevo." });
    } finally {
      setEnviandoId(null);
      setConfirmarEnvioId(null);
    }
  };

  const cerrarSugerencias = () => {
    setSugerenciasAbiertas(false);
    setConfirmarEnvioId(null);
    setAvisoEnvio(null);
  };

  // Al cerrar el torneo se suelta la petición de categorías en vuelo: si llega tarde,
  // ya no debe repoblar la lista de un modal que el usuario cerró.
  const cerrarCategorias = () => {
    torneoEnCurso.current = null;
    setSelectedProduct(null);
  };

  /* Teclado de los modales, del más alto al más bajo. Escape cierra el de encima y el
     foco entra al diálogo al abrirlo; sin esto, quien abre un modal desde un control
     que queda tapado (la insignia de adeudo dentro del modal de categorías) se queda
     tabulando por detrás del overlay. */
  const refPagoDeudor = useDialogoModal<HTMLDivElement>(pagoDeudor !== null, () => setPagoDeudor(null));
  const refSugerencias = useDialogoModal<HTMLDivElement>(sugerenciasAbiertas, cerrarSugerencias);
  const refDeudores = useDialogoModal<HTMLDivElement>(deudoresAbiertos !== null, () => setDeudoresAbiertos(null));
  const refDetalles = useDialogoModal<HTMLDivElement>(selectedCategory !== null, () => setSelectedCategory(null));
  const refCategorias = useDialogoModal<HTMLDivElement>(selectedProduct !== null, cerrarCategorias);

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

  // Deudores del torneo abierto agrupados por categoría, para que cada tarjeta del
  // modal muestre los suyos. Se agrupa aquí (y no con otra consulta) porque el resumen
  // ya trae la lista completa del torneo; así la suma por categoría siempre cuadra
  // con el "N con adeudo" de la tarjeta del torneo.
  const deudoresPorCategoria = new Map<string, Deudor[]>();
  if (selectedProduct) {
    for (const d of selectedProduct.Deudores) {
      const clave = claveCategoria(d.Categoria);
      const lista = deudoresPorCategoria.get(clave);
      if (lista) lista.push(d);
      else deudoresPorCategoria.set(clave, [d]);
    }
  }

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
              <label className="flex items-center gap-2 bg-white/5 border border-white/10 px-4 py-2 rounded-xl cursor-pointer hover:bg-white/10 transition-all self-end"
                     title="Encendido muestra las copas y ligas de clinics; apagado, las que no lo son. Nunca se mezclan.">
                <input
                  type="checkbox"
                  className="sr-only peer"
                  checked={soloClinics}
                  onChange={(e) => setSoloClinics(e.target.checked)}
                />
                <div className="w-9 h-5 bg-slate-600 rounded-full peer peer-checked:bg-amber-500 after:content-[''] after:absolute after:w-4 after:h-4 after:bg-white after:rounded-full after:translate-x-0.5 peer-checked:after:translate-x-4 after:transition-all relative transition-colors" />
                <span className={`text-xs font-black uppercase tracking-widest ${soloClinics ? "text-amber-300" : "text-slate-400"}`}>
                  Clinics
                </span>
              </label>
              <div className="bg-white/5 border border-white/10 px-4 py-2 rounded-xl">
                <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Total Temporada</p>
                <p className="text-lg font-black text-emerald-400">{fmtC(products.reduce((acc, p) => acc + p.TotalRecaudado, 0))}</p>
              </div>
              {/* Leyenda: además de contar, enseña qué color es cada tipo. Lleva la
                  misma base oscura que las tarjetas para que el tinte no se lave. */}
              <div className="flex gap-2">
                <div className="relative bg-slate-950/70 border border-amber-500/30 px-3 py-2 rounded-xl overflow-hidden">
                  <div className="absolute inset-0 bg-amber-500/[0.12] pointer-events-none" />
                  <div className="relative">
                    <p className="text-[10px] font-black text-amber-400/80 uppercase tracking-widest">Ligas</p>
                    <p className="text-lg font-black text-amber-300 leading-none mt-0.5">
                      {products.filter((p) => p.IdTipoProducto === 3).length}
                    </p>
                  </div>
                </div>
                <div className="relative bg-slate-950/70 border border-violet-500/30 px-3 py-2 rounded-xl overflow-hidden">
                  <div className="absolute inset-0 bg-violet-500/[0.12] pointer-events-none" />
                  <div className="relative">
                    <p className="text-[10px] font-black text-violet-400/80 uppercase tracking-widest">Copas</p>
                    <p className="text-lg font-black text-violet-300 leading-none mt-0.5">
                      {products.filter((p) => p.IdTipoProducto === 4).length}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Alerta de cobranza. El adeudo se mide contra la temporada EN CURSO aunque
              estés viendo una temporada pasada: la pregunta es a quién cobrarle hoy. */}
          {!isLoading && alerta.jugadores > 0 && (
            <button
              type="button"
              onClick={() => setDeudoresAbiertos({ titulo: "Pagaron un torneo y tienen adeudo", lista: alerta.deudores })}
              className="group relative w-full text-left flex items-start gap-3 bg-slate-950/70 border border-red-500/40 hover:border-red-500/70 rounded-2xl px-5 py-4 transition-all overflow-hidden"
            >
              {/* Misma base oscura que las tarjetas: sobre la zona azul del degradado,
                  un rojo translúcido a secas se veía lavanda en vez de rojo. */}
              <div className="absolute inset-0 bg-red-500/[0.12] group-hover:bg-red-500/[0.18] transition-colors pointer-events-none" />
              <div className="relative bg-red-500/20 p-2 rounded-xl border border-red-500/25 flex-shrink-0">
                <AlertTriangle size={18} className="text-red-400" />
              </div>
              <div className="relative min-w-0 flex-1">
                <p className="text-sm font-black text-red-200">
                  {alerta.jugadores} jugador{alerta.jugadores === 1 ? "" : "es"} pagó copas o ligas y tiene adeudo
                </p>
                <p className="text-xs text-red-300/80 mt-0.5">
                  Adeudo medido contra {temporadaAdeudos || "la temporada en curso"}: mensualidades vencidas sin pagar o inscripción pendiente. Toca para ver la lista.
                </p>
              </div>
              <ChevronRight size={18} className="text-red-400/60 flex-shrink-0 mt-1" />
            </button>
          )}

          {/* Sugerencia: torneos que parecen de la temporada anterior. Mismo patrón
              visual que la alerta (base oscura + tinte), en azul cielo porque es una
              recomendación, no un problema de cobranza. */}
          {!isLoading && sugerencias && sugerencias.productos.length > 0 && (
            <button
              type="button"
              onClick={() => setSugerenciasAbiertas(true)}
              className="group relative w-full text-left flex items-start gap-3 bg-slate-950/70 border border-sky-500/40 hover:border-sky-500/70 rounded-2xl px-5 py-4 transition-all overflow-hidden"
            >
              <div className="absolute inset-0 bg-sky-500/[0.12] group-hover:bg-sky-500/[0.18] transition-colors pointer-events-none" />
              <div className="relative bg-sky-500/20 p-2 rounded-xl border border-sky-500/25 flex-shrink-0">
                <History size={18} className="text-sky-400" />
              </div>
              <div className="relative min-w-0 flex-1">
                <p className="text-sm font-black text-sky-200">
                  {sugerencias.productos.length === 1
                    ? "1 torneo parece de la temporada anterior"
                    : `${sugerencias.productos.length} torneos parecen de la temporada anterior`}
                </p>
                <p className="text-xs text-sky-300/80 mt-0.5">
                  Puedes mandar sus pagos a {sugerencias.temporadaAnterior.Temporada} para que salgan de esta temporada. Toca para revisar.
                </p>
              </div>
              <ChevronRight size={18} className="text-sky-400/60 flex-shrink-0 mt-1" />
            </button>
          )}

          {/* Cards Grid */}
          {isLoading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {[...Array(4)].map((_, i) => <div key={i} className="h-48 bg-white/5 rounded-2xl animate-pulse border border-white/10" />)}
            </div>
          ) : filteredProducts.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {filteredProducts.map((p) => {
                const estilo = estiloDe(p.IdTipoProducto);
                return (
                <div
                  key={p.IdProducto}
                  onClick={() => fetchCategories(p)}
                  className={`group relative bg-slate-950/70 border rounded-2xl p-6 transition-all duration-300 cursor-pointer overflow-hidden shadow-lg hover:-translate-y-1 ${estilo.borde}`}
                >
                  {/* El tinte del tipo, encima de la base oscura y debajo del contenido. */}
                  <div className={`absolute inset-0 transition-colors pointer-events-none ${estilo.tinte}`} />
                  <div className={`absolute -inset-24 blur-3xl opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none ${estilo.halo}`} />

                  <div className="relative z-10">
                    {/* Escudo grande a la izquierda y el nombre del torneo a su derecha.
                        Cuando no hay foto va el icono de siempre, del mismo tamaño, para
                        que la cuadrícula no se desalinee entre tarjetas con y sin ella. */}
                    <div className="flex items-start gap-3 mb-4">
                      {fotoTorneo(p) ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={fotoTorneo(p)!}
                          alt=""
                          className="w-[72px] h-[72px] rounded-xl object-contain bg-slate-950/60 border border-white/10 shadow-sm flex-shrink-0"
                        />
                      ) : (
                        <div className={`w-[72px] h-[72px] flex items-center justify-center rounded-xl border shadow-sm flex-shrink-0 ${estilo.icono}`}>
                          <Trophy size={30} />
                        </div>
                      )}

                      <div className="min-w-0 flex-1">
                        <span className={`inline-block text-[9px] font-black uppercase tracking-[0.15em] px-2 py-1 rounded-md border ${estilo.chip}`}>
                          {p.TipoProducto}
                        </span>
                        <h3 className={`text-base font-black text-white mt-1.5 line-clamp-3 leading-tight transition-colors ${estilo.titulo}`}>
                          {p.Producto}
                        </h3>
                      </div>
                    </div>

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
                      <div className="h-1 bg-black/20 rounded-full overflow-hidden">
                        <div className={`h-full bg-gradient-to-r w-full ${estilo.barra}`} />
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
                          className="flex items-center gap-1.5 bg-red-500/15 hover:bg-red-500/25 border border-red-500/40 rounded-lg px-2 py-1.5 transition-all"
                        >
                          <AlertTriangle size={12} className="text-red-400 flex-shrink-0" />
                          <span className="text-[10px] font-black text-red-200">
                            {p.JugadoresConAdeudo} con adeudo
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
                );
              })}
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
              ref={refPagoDeudor}
              tabIndex={-1}
              role="dialog"
              aria-modal="true"
              aria-label={`Pagos de torneo de ${pagoDeudor.Jugador}`}
              className="bg-[#0f172a] border border-white/15 rounded-3xl w-full max-w-xl max-h-[80vh] flex flex-col shadow-2xl overflow-hidden outline-none"
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
              ref={refDeudores}
              tabIndex={-1}
              role="dialog"
              aria-modal="true"
              aria-label={`Jugadores con adeudo: ${deudoresAbiertos.titulo}`}
              className="bg-[#0f172a] border border-red-500/30 rounded-3xl w-full max-w-2xl max-h-[80vh] flex flex-col shadow-2xl overflow-hidden outline-none"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="p-5 border-b border-white/10 bg-red-500/10 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="text-base font-black text-white flex items-center gap-2">
                    <AlertTriangle size={16} className="text-red-400 flex-shrink-0" />
                    <span className="truncate">{deudoresAbiertos.titulo}</span>
                  </h3>
                  <p className="text-[11px] text-red-300/80 mt-0.5">
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

        {/* Torneos sugeridos para la temporada anterior: revisión y envío */}
        {sugerenciasAbiertas && sugerencias && (
          <div className="fixed inset-0 bg-black/70 backdrop-blur-md flex items-center justify-center z-[140] p-4" onClick={cerrarSugerencias}>
            <div
              ref={refSugerencias}
              tabIndex={-1}
              role="dialog"
              aria-modal="true"
              aria-label="Torneos que parecen de la temporada anterior"
              className="bg-[#0f172a] border border-sky-500/30 rounded-3xl w-full max-w-2xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden outline-none"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="p-5 border-b border-white/10 bg-sky-500/10 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="text-base font-black text-white flex items-center gap-2">
                    <History size={16} className="text-sky-400 flex-shrink-0" />
                    <span className="truncate">Torneos que parecen de la temporada anterior</span>
                  </h3>
                  <p className="text-[11px] text-sky-300/80 mt-0.5">
                    Al mandar un torneo, TODOS sus pagos de esta temporada pasan a {sugerencias.temporadaAnterior.Temporada} y dejan de contar aquí.
                  </p>
                </div>
                <button onClick={cerrarSugerencias} className="p-2 rounded-xl hover:bg-white/10 text-slate-400 hover:text-white transition-all flex-shrink-0">
                  <X size={18} />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-5 space-y-4">
                {avisoEnvio && (
                  <div className={`rounded-2xl border px-4 py-3 text-xs font-bold ${avisoEnvio.ok
                    ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-300"
                    : "bg-red-500/10 border-red-500/40 text-red-300"}`}
                  >
                    {avisoEnvio.texto}
                  </div>
                )}

                {sugerencias.productos.length === 0 ? (
                  <div className="h-24 flex items-center justify-center text-slate-500 text-sm font-bold">
                    No quedan torneos por revisar.
                  </div>
                ) : (
                  sugerencias.productos.map((s) => {
                    const estilo = estiloDe(s.IdTipoProducto);
                    const confirmando = confirmarEnvioId === s.IdProducto;
                    const enviando = enviandoId === s.IdProducto;
                    return (
                      <div key={s.IdProducto} className="bg-white/5 border border-white/10 rounded-2xl p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-sm font-bold text-white leading-tight">{s.Producto}</p>
                            <span className={`inline-block mt-1 text-[9px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded-md border ${estilo.chip}`}>
                              {s.TipoProducto}
                            </span>
                          </div>
                          <div className="text-right flex-shrink-0">
                            <p className="text-base font-black text-emerald-400 whitespace-nowrap">{fmt(s.TotalRecaudado)}</p>
                            <p className="text-[10px] text-slate-500 font-bold">{s.CantidadPagos} pago{s.CantidadPagos === 1 ? "" : "s"}</p>
                          </div>
                        </div>

                        {/* El porqué de la sospecha, tal cual lo explica el servidor. */}
                        <ul className="mt-3 pt-3 border-t border-white/5 space-y-1">
                          {s.Razones.map((r) => (
                            <li key={r} className="text-[11px] text-sky-200/80 flex gap-1.5">
                              <span className="text-sky-400 flex-shrink-0">•</span>
                              <span>{r}</span>
                            </li>
                          ))}
                        </ul>

                        <div className="mt-3 flex flex-wrap justify-end items-center gap-2">
                          {enviando ? (
                            <span className="flex items-center gap-2 text-[11px] font-bold text-slate-400">
                              <RefreshCw size={13} className="animate-spin text-sky-400" />
                              Enviando pagos...
                            </span>
                          ) : confirmando ? (
                            <>
                              <span className="text-[11px] font-bold text-amber-300">
                                ¿Mandar {s.CantidadPagos} pago{s.CantidadPagos === 1 ? "" : "s"} a {sugerencias.temporadaAnterior.Temporada}?
                              </span>
                              <button
                                onClick={() => reasignarATemporadaAnterior(s)}
                                className="px-3 py-1.5 bg-sky-600 hover:bg-sky-500 rounded-lg text-white text-[11px] font-black transition-all"
                              >
                                Confirmar
                              </button>
                              <button
                                onClick={() => setConfirmarEnvioId(null)}
                                className="px-3 py-1.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-slate-300 text-[11px] font-black transition-all"
                              >
                                Cancelar
                              </button>
                            </>
                          ) : (
                            <button
                              onClick={() => { setConfirmarEnvioId(s.IdProducto); setAvisoEnvio(null); }}
                              disabled={enviandoId !== null}
                              className="flex items-center gap-1.5 px-3 py-1.5 bg-sky-500/10 hover:bg-sky-500/20 border border-sky-500/30 rounded-lg text-sky-300 text-[11px] font-black transition-all disabled:opacity-50"
                            >
                              <History size={13} />
                              Mandar a la temporada anterior
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              <div className="p-4 px-5 bg-white/5 border-t border-white/10 flex justify-end">
                <button onClick={cerrarSugerencias} className="px-6 py-2 bg-white/5 hover:bg-white/10 rounded-xl text-white text-xs font-black border border-white/10 transition-all">
                  Cerrar
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Categories Modal */}
        {selectedProduct && (
          <div className="fixed inset-0 bg-black/70 backdrop-blur-md flex items-center justify-center z-[100] p-4">
            <div
              ref={refCategorias}
              tabIndex={-1}
              role="dialog"
              aria-modal="true"
              aria-label={`Desglose por categoría de ${selectedProduct.Producto}`}
              className="bg-[#0f172a] border border-white/10 rounded-3xl w-full max-w-4xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden animate-in zoom-in-95 outline-none"
            >
              <div className="p-6 border-b border-white/5 flex items-center justify-between bg-white/5">
                <div className="flex items-center gap-4">
                  <div className={`p-3 rounded-2xl border ${estiloDe(selectedProduct.IdTipoProducto).icono}`}>
                    <TrendingUp size={24} />
                  </div>
                  <div>
                    <h3 className="text-xl font-black text-white">{selectedProduct.Producto}</h3>
                    <p className="text-xs text-slate-400 uppercase font-bold tracking-widest">
                      {selectedProduct.TipoProducto} · Desglose por Categoría
                    </p>
                  </div>
                </div>
                <button onClick={cerrarCategorias} className="p-2 rounded-xl hover:bg-white/10 text-slate-400 hover:text-white transition-all">
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
                    {categories.map((c) => {
                      // Deudores del torneo que hoy pertenecen a esta categoría.
                      const deudoresCat = deudoresPorCategoria.get(claveCategoria(String(c.Categoria ?? ""))) ?? [];
                      const abrirDeudoresCat = () => setDeudoresAbiertos({
                        titulo: `${selectedProduct.Producto} · ${c.Categoria || "Sin categoría"}`,
                        lista: deudoresCat,
                      });
                      return (
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
                        <div className="mt-4 h-1 bg-black/20 rounded-full overflow-hidden">
                          <div
                            className={`h-full bg-gradient-to-r ${estiloDe(selectedProduct.IdTipoProducto).barra}`}
                            style={{ width: `${(c.Total / Math.max(...categories.map(cat => cat.Total))) * 100}%` }}
                          />
                        </div>
                        {/* Quiénes de esta categoría pagaron el torneo y hoy deben algo.
                            Mismo aviso rojo que la tarjeta del torneo; abre la misma
                            lista de deudores, acotada a la categoría. */}
                        {deudoresCat.length > 0 && (
                          <div
                            role="button"
                            tabIndex={0}
                            onClick={(e) => {
                              e.stopPropagation();
                              abrirDeudoresCat();
                            }}
                            onKeyDown={(e) => {
                              if (e.key !== "Enter" && e.key !== " ") return;
                              e.preventDefault();
                              e.stopPropagation();
                              abrirDeudoresCat();
                            }}
                            title="Ver quiénes son"
                            className="mt-3 flex items-center gap-1.5 bg-red-500/15 hover:bg-red-500/25 border border-red-500/40 rounded-lg px-2 py-1.5 transition-all"
                          >
                            <AlertTriangle size={12} className="text-red-400 flex-shrink-0" />
                            <span className="text-[10px] font-black text-red-200">
                              {deudoresCat.length} con adeudo
                            </span>
                          </div>
                        )}
                      </div>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="p-4 bg-white/5 border-t border-white/5 flex justify-between items-center px-8">
                <span className="text-xs text-slate-500 font-bold">Total Producto: <span className="text-white">{fmt(selectedProduct.TotalRecaudado)}</span></span>
                <button onClick={cerrarCategorias} className="px-6 py-2 bg-white/5 hover:bg-white/10 rounded-xl text-white text-xs font-black border border-white/10 transition-all">Cerrar</button>
              </div>
            </div>
          </div>
        )}

        {/* Details Modal */}
        {selectedCategory && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center z-[110] p-4">
            <div
              ref={refDetalles}
              tabIndex={-1}
              role="dialog"
              aria-modal="true"
              aria-label={`Pagos de ${selectedCategory} en ${selectedProduct?.Producto ?? "el torneo"}`}
              className="bg-[#0f172a] border border-white/15 rounded-3xl w-full max-w-2xl max-h-[75vh] flex flex-col shadow-2xl overflow-hidden animate-in zoom-in-95 outline-none"
            >
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
