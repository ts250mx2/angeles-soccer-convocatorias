"use client";

/*
 * El catalogo, compartido por sus tres rutas: todo (/copas-ligas), solo copas y solo
 * ligas. La pantalla ya tenia el filtro por tipo; con la ruta acotada ese filtro queda
 * fijo y su selector desaparece, porque elegir "ligas" dentro de "Catalogo de Copas"
 * seria una contradiccion.
 */

import { acentoDe, type TipoTorneo } from '@/lib/acento-torneo';
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useUser, usePuedeVer } from "@/contexts/user-context";
import DashboardLayout from "@/components/DashboardLayout";
import FotoUploader from "@/components/FotoUploader";
import {
    Trophy, Search, RefreshCw, X, AlertCircle, Plus, Loader2, Check,
    Boxes, Pencil, ImageOff, Ban, RotateCcw, ClipboardList,
} from "lucide-react";
import {
    type CopaLigaRow, type ProductoCopaLiga, TIPO_COPA, TIPO_LIGA, VIGENTE, BAJA,
    etiquetaTipo, esCopa, money,
} from "@/lib/copas-ligas";

/**
 * Catálogo de Copas y Ligas.
 *
 * Cada tarjeta es una copa o liga de tblLigas; dentro viven sus conceptos cobrables
 * (tblProductos), que son los que llevan el precio. Ver @/lib/copas-ligas para por qué
 * el precio no es un solo campo.
 */

type FiltroTipo = "todos" | "copas" | "ligas";
type FiltroEstatus = "vigentes" | "bajas" | "todos";

const SELECT =
    "appearance-none bg-white/5 border border-white/15 text-slate-200 text-xs py-2 pl-3 pr-8 rounded-lg leading-tight focus:outline-none focus:border-blue-500";
const CAMPO =
    "w-full bg-white/5 border border-white/15 rounded-lg px-3 py-2 text-sm text-slate-100 outline-none focus:border-blue-500 transition-colors";
const ETIQUETA = "block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5";

/** URL de la foto guardada. El sello rompe el caché cuando la imagen cambia. */
const urlFoto = (c: CopaLigaRow): string | null =>
    c.TieneFoto === 1 ? `/api/copas-ligas/foto/${c.IdLiga}?v=${c.FotoVersion ?? "0"}` : null;

export default function CatalogoCopasLigasPantalla({ tipo }: { tipo?: TipoTorneo }) {
    /* Ámbar las copas, azul las ligas: las dos mitades son la misma pantalla. */
    const acento = acentoDe(tipo);
    const router = useRouter();
    const { user, isInitialized } = useUser();
    const puedeVer = usePuedeVer("/copas-ligas");

    const [filas, setFilas] = useState<CopaLigaRow[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const [busqueda, setBusqueda] = useState("");
    /* Con la ruta acotada el tipo ya está decidido y su selector no se pinta. */
    const [tipoFiltro, setTipoFiltro] = useState<FiltroTipo>(
        tipo === 'copa' ? 'copas' : tipo === 'liga' ? 'ligas' : 'todos',
    );
    const [estatusFiltro, setEstatusFiltro] = useState<FiltroEstatus>("vigentes");

    const [editando, setEditando] = useState<CopaLigaRow | null>(null);
    const [creando, setCreando] = useState(false);

    useEffect(() => {
        if (isInitialized && !user) router.push("/login");
    }, [user, isInitialized, router]);

    const cargar = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        try {
            const res = await fetch("/api/copas-ligas");
            const json = await res.json();
            if (json.success) setFilas(json.data);
            else setError(json.message ?? "Error al cargar el catálogo");
        } catch {
            setError("Error de conexión");
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        if (user && puedeVer) cargar();
    }, [user, puedeVer, cargar]);

    /* Al recargar hay que volver a apuntar el modal a la fila fresca: si siguiera con la
       copia vieja, el precio recién guardado no se vería hasta cerrarlo y abrirlo. */
    const recargar = useCallback(async () => {
        await cargar();
        setEditando((actual) => (actual ? { ...actual } : null));
    }, [cargar]);

    useEffect(() => {
        if (!editando) return;
        const fresca = filas.find((f) => f.IdLiga === editando.IdLiga);
        if (fresca && fresca !== editando) setEditando(fresca);
        // Solo debe reaccionar a la llegada de datos nuevos, no a cada cambio del modal.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [filas]);

    const filtrados = useMemo(() => {
        const q = busqueda.trim().toLowerCase();
        return filas.filter((c) => {
            if (estatusFiltro === "vigentes" && c.Status !== VIGENTE) return false;
            if (estatusFiltro === "bajas" && c.Status !== BAJA) return false;
            if (tipoFiltro === "copas" && !esCopa(c.IdTipoLiga)) return false;
            if (tipoFiltro === "ligas" && esCopa(c.IdTipoLiga)) return false;
            if (q && !c.Liga.toLowerCase().includes(q) &&
                !c.productos.some((p) => p.Producto.toLowerCase().includes(q))) return false;
            return true;
        });
    }, [filas, busqueda, tipoFiltro, estatusFiltro]);

    const kpis = useMemo(() => ({
        copas: filtrados.filter((c) => esCopa(c.IdTipoLiga)).length,
        ligas: filtrados.filter((c) => !esCopa(c.IdTipoLiga)).length,
        sinPrecio: filtrados.filter((c) => c.productos.filter((p) => p.Status === VIGENTE).length === 0).length,
    }), [filtrados]);

    return (
        <DashboardLayout>
            <main className={`p-4 md:p-8 overflow-y-auto flex-1 ${acento?.fondo ?? ''}`}>
                <div className="max-w-7xl mx-auto">
                    <div className={`bg-[#0f172a] backdrop-blur-sm rounded-xl shadow-2xl p-4 md:p-8 border border-white/20 ${acento?.filoSuperior ?? ''}`}>
                        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 mb-6">
                            <div>
                                <h2 className="text-2xl md:text-3xl font-bold text-white flex items-center gap-3">
                                    <Boxes className={acento ? acento.icono : 'text-blue-400'} size={28} />
                                    {tipo === 'copa' ? 'Catálogo de Copas'
                                        : tipo === 'liga' ? 'Catálogo de Ligas'
                                        : 'Catálogo de Copas y Ligas'}
                                </h2>
                                <p className="text-xs text-slate-400 mt-1">
                                    Da de alta copas y ligas, cámbiales el nombre, la foto y el precio de sus cobros.
                                </p>
                            </div>
                            <div className="flex flex-wrap items-center gap-2">
                                <button
                                    onClick={cargar}
                                    disabled={isLoading}
                                    title="Actualizar"
                                    className="p-2 rounded-lg bg-white/5 border border-white/15 text-slate-300 hover:bg-white/10 transition-colors disabled:opacity-40"
                                >
                                    <RefreshCw size={15} className={isLoading ? "animate-spin" : ""} />
                                </button>
                                <button
                                    onClick={() => setCreando(true)}
                                    className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold transition-colors"
                                >
                                    <Plus size={14} /> Nueva copa o liga
                                </button>
                            </div>
                        </div>

                        <div className="grid grid-cols-3 gap-3 mb-6">
                            <Kpi etiqueta="Copas" valor={kpis.copas} clase="text-amber-300" />
                            <Kpi etiqueta="Ligas" valor={kpis.ligas} clase="text-blue-300" />
                            <Kpi etiqueta="Sin precio capturado" valor={kpis.sinPrecio} clase="text-rose-300" />
                        </div>

                        <div className="flex flex-wrap items-center gap-2 mb-5">
                            <div className="relative flex-1 min-w-[220px]">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={14} />
                                <input
                                    value={busqueda}
                                    onChange={(e) => setBusqueda(e.target.value)}
                                    placeholder="Buscar por nombre o concepto..."
                                    className="w-full bg-white/5 border border-white/15 text-slate-200 text-xs py-2 pl-9 pr-3 rounded-lg outline-none focus:border-blue-500"
                                />
                            </div>
                            <select value={tipoFiltro} onChange={(e) => setTipoFiltro(e.target.value as FiltroTipo)} className={SELECT}>
                                <option value="todos">Copas y ligas</option>
                                <option value="copas">Solo copas</option>
                                <option value="ligas">Solo ligas</option>
                            </select>
                            <select value={estatusFiltro} onChange={(e) => setEstatusFiltro(e.target.value as FiltroEstatus)} className={SELECT}>
                                <option value="vigentes">Vigentes</option>
                                <option value="bajas">Dadas de baja</option>
                                <option value="todos">Todas</option>
                            </select>
                        </div>

                        {isLoading ? (
                            <div className="h-64 flex flex-col items-center justify-center gap-3 text-slate-400">
                                <Loader2 size={30} className="animate-spin text-blue-500" />
                                <p className="text-sm font-bold">Cargando catálogo...</p>
                            </div>
                        ) : error ? (
                            <div className="h-64 flex flex-col items-center justify-center gap-3 text-rose-400">
                                <AlertCircle size={36} className="opacity-60" />
                                <p className="text-sm font-black">{error}</p>
                            </div>
                        ) : filtrados.length === 0 ? (
                            <div className="h-64 flex flex-col items-center justify-center gap-3 text-slate-500">
                                <Trophy size={40} className="opacity-20" />
                                <p className="text-base font-black">Sin resultados</p>
                                <p className="text-xs opacity-60">Ninguna copa o liga coincide con los filtros</p>
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                                {filtrados.map((c) => (
                                    <Tarjeta key={c.IdLiga} copa={c} onEditar={() => setEditando(c)} />
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </main>

            {editando && (
                <ModalEditar
                    copa={editando}
                    onClose={() => setEditando(null)}
                    onGuardado={recargar}
                />
            )}
            {creando && (
                <ModalCrear
                    onClose={() => setCreando(false)}
                    onCreado={async () => {
                        setCreando(false);
                        await cargar();
                    }}
                />
            )}
        </DashboardLayout>
    );
}

function Kpi({ etiqueta, valor, clase }: { etiqueta: string; valor: number; clase: string }) {
    return (
        <div className="bg-white/5 border border-white/10 rounded-xl px-4 py-3">
            <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest">{etiqueta}</p>
            <p className={`text-2xl font-black ${clase}`}>{valor}</p>
        </div>
    );
}

function ChipTipo({ idTipoLiga }: { idTipoLiga: number }) {
    const copa = esCopa(idTipoLiga);
    return (
        <span className={`text-[9px] font-black px-2 py-0.5 rounded-md border whitespace-nowrap ${
            copa
                ? "bg-amber-500/15 text-amber-300 border-amber-500/30"
                : "bg-blue-500/15 text-blue-300 border-blue-500/30"
        }`}>
            {etiquetaTipo(idTipoLiga)}
        </span>
    );
}

function Tarjeta({ copa, onEditar }: { copa: CopaLigaRow; onEditar: () => void }) {
    const foto = urlFoto(copa);
    const vigentes = copa.productos.filter((p) => p.Status === VIGENTE);
    const precios = vigentes.map((p) => p.Precio);
    const deBaja = copa.Status === BAJA;

    return (
        <button
            onClick={onEditar}
            className={`text-left bg-white/[0.03] border rounded-2xl overflow-hidden transition-all hover:bg-white/[0.07] hover:border-white/25 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60 ${
                deBaja ? "border-white/5 opacity-60" : "border-white/10"
            }`}
        >
            <div className="h-32 bg-slate-950/50 flex items-center justify-center overflow-hidden">
                {foto ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={foto} alt={copa.Liga} className="w-full h-full object-contain" />
                ) : (
                    <ImageOff size={28} className="text-slate-700" />
                )}
            </div>

            <div className="p-4">
                <div className="flex items-start justify-between gap-2">
                    <h3 className="text-sm font-black text-white leading-tight">{copa.Liga}</h3>
                    <div className="flex flex-col items-end gap-1 flex-shrink-0">
                        <ChipTipo idTipoLiga={copa.IdTipoLiga} />
                        {deBaja && (
                            <span className="text-[9px] font-black px-2 py-0.5 rounded-md bg-rose-500/15 text-rose-300 border border-rose-500/30">
                                BAJA
                            </span>
                        )}
                    </div>
                </div>

                <p className="mt-2 text-xs font-bold text-emerald-300">
                    {precios.length === 0 ? (
                        <span className="text-rose-300">Sin precio capturado</span>
                    ) : precios.length === 1 ? (
                        money(precios[0])
                    ) : (
                        `${money(Math.min(...precios))} — ${money(Math.max(...precios))}`
                    )}
                </p>
                <p className="text-[10px] text-slate-500 mt-1">
                    {vigentes.length} concepto(s) cobrable(s)
                    {copa.Convocatorias > 0 && ` · ${copa.Convocatorias} convocatoria(s) esta temporada`}
                </p>
            </div>
        </button>
    );
}

function ModalEditar({
    copa,
    onClose,
    onGuardado,
}: {
    copa: CopaLigaRow;
    onClose: () => void;
    onGuardado: () => Promise<void>;
}) {
    const [nombre, setNombre] = useState(copa.Liga);
    const [idTipoLiga, setIdTipoLiga] = useState(copa.IdTipoLiga);
    /* undefined = la foto no se tocó; null = quitarla; string = imagen nueva. */
    const [fotoNueva, setFotoNueva] = useState<string | null | undefined>(undefined);
    const [guardando, setGuardando] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
        document.addEventListener("keydown", onKey);
        return () => document.removeEventListener("keydown", onKey);
    }, [onClose]);

    const fotoActual = urlFoto(copa);
    const fotoMostrada = fotoNueva === undefined ? fotoActual : fotoNueva;
    const hayCambios =
        nombre.trim() !== copa.Liga || idTipoLiga !== copa.IdTipoLiga || fotoNueva !== undefined;

    const guardar = async () => {
        setGuardando(true);
        setError(null);
        try {
            const cuerpo: Record<string, unknown> = {};
            if (nombre.trim() !== copa.Liga) cuerpo.nombre = nombre.trim();
            if (idTipoLiga !== copa.IdTipoLiga) cuerpo.idTipoLiga = idTipoLiga;
            if (fotoNueva !== undefined) cuerpo.foto = fotoNueva ?? "";

            const res = await fetch(`/api/copas-ligas/${copa.IdLiga}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(cuerpo),
            });
            const json = await res.json();
            if (!json.success) {
                setError(json.message ?? "No se pudo guardar");
                return;
            }
            setFotoNueva(undefined);
            await onGuardado();
        } catch {
            setError("Error de conexión");
        } finally {
            setGuardando(false);
        }
    };

    const cambiarEstatus = async () => {
        const nuevo = copa.Status === BAJA ? VIGENTE : BAJA;
        setGuardando(true);
        setError(null);
        try {
            const res = await fetch(`/api/copas-ligas/${copa.IdLiga}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ status: nuevo }),
            });
            const json = await res.json();
            if (!json.success) {
                setError(json.message ?? "No se pudo cambiar el estatus");
                return;
            }
            await onGuardado();
        } catch {
            setError("Error de conexión");
        } finally {
            setGuardando(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-md flex items-center justify-center z-[120] p-4" onClick={onClose}>
            <div
                className="bg-[#0f172a] border border-white/15 rounded-3xl w-full max-w-3xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="p-5 border-b border-white/10 bg-white/5 flex items-start justify-between gap-3">
                    <div className="min-w-0">
                        <h3 className="text-lg font-black text-white flex items-center gap-2">
                            <Pencil size={16} className="text-blue-400 flex-shrink-0" />
                            <span className="truncate">{copa.Liga}</span>
                        </h3>
                        <p className="text-xs text-slate-400 mt-0.5">
                            ID {copa.IdLiga}
                            {copa.Convocatorias > 0 && ` · ${copa.Convocatorias} convocatoria(s) en la temporada activa`}
                        </p>
                    </div>
                    <button onClick={onClose} className="p-2 rounded-xl hover:bg-white/10 text-slate-400 hover:text-white transition-all flex-shrink-0">
                        <X size={20} />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-5 space-y-5">
                    <div className="grid md:grid-cols-2 gap-5">
                        <div>
                            <label className={ETIQUETA}>Foto</label>
                            <FotoUploader
                                valor={fotoMostrada}
                                onChange={(v) => setFotoNueva(v)}
                                alt={copa.Liga}
                            />
                        </div>

                        <div className="space-y-4">
                            <div>
                                <label className={ETIQUETA}>Nombre</label>
                                <input
                                    value={nombre}
                                    onChange={(e) => setNombre(e.target.value)}
                                    maxLength={45}
                                    className={CAMPO}
                                />
                                <p className="text-[10px] text-slate-500 mt-1">
                                    Es el nombre con el que aparece en Convocatorias.
                                </p>
                            </div>

                            <div>
                                <label className={ETIQUETA}>Tipo</label>
                                <div className="flex gap-2">
                                    {[TIPO_LIGA, TIPO_COPA].map((t) => (
                                        <button
                                            key={t}
                                            type="button"
                                            onClick={() => setIdTipoLiga(t)}
                                            className={`flex-1 py-2 rounded-lg text-xs font-black border transition-all ${
                                                idTipoLiga === t
                                                    ? t === TIPO_COPA
                                                        ? "bg-amber-500/20 text-amber-200 border-amber-500/50"
                                                        : "bg-blue-500/20 text-blue-200 border-blue-500/50"
                                                    : "bg-white/5 text-slate-400 border-white/10 hover:bg-white/10"
                                            }`}
                                        >
                                            {etiquetaTipo(t)}
                                        </button>
                                    ))}
                                </div>
                                {idTipoLiga !== copa.IdTipoLiga && (
                                    <p className="text-[10px] text-amber-300/90 mt-1.5">
                                        Al guardar, sus cobros también pasan a {etiquetaTipo(idTipoLiga)} en los reportes de ventas.
                                    </p>
                                )}
                            </div>

                            <div className="flex flex-wrap gap-2 pt-1">
                                <button
                                    onClick={guardar}
                                    disabled={!hayCambios || guardando || nombre.trim().length < 3}
                                    className="flex-1 min-w-[140px] flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                                >
                                    {guardando ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
                                    Guardar cambios
                                </button>
                                <button
                                    onClick={cambiarEstatus}
                                    disabled={guardando}
                                    className={`px-3 py-2 rounded-lg text-xs font-bold border transition-colors disabled:opacity-40 inline-flex items-center gap-1.5 ${
                                        copa.Status === BAJA
                                            ? "bg-emerald-600/15 hover:bg-emerald-600/25 border-emerald-500/30 text-emerald-200"
                                            : "bg-rose-600/15 hover:bg-rose-600/25 border-rose-500/30 text-rose-200"
                                    }`}
                                >
                                    {copa.Status === BAJA ? <><RotateCcw size={12} /> Reactivar</> : <><Ban size={12} /> Dar de baja</>}
                                </button>
                            </div>

                            {error && (
                                <p className="text-[11px] text-rose-300 flex items-start gap-1.5">
                                    <AlertCircle size={12} className="flex-shrink-0 mt-0.5" />
                                    {error}
                                </p>
                            )}
                        </div>
                    </div>

                    <Conceptos copa={copa} onCambio={onGuardado} />
                </div>
            </div>
        </div>
    );
}

/** Los cobros de la copa o liga: es donde vive el precio. */
function Conceptos({ copa, onCambio }: { copa: CopaLigaRow; onCambio: () => Promise<void> }) {
    const [agregando, setAgregando] = useState(false);
    const [concepto, setConcepto] = useState("");
    const [precio, setPrecio] = useState("");
    const [guardando, setGuardando] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const agregar = async () => {
        setGuardando(true);
        setError(null);
        try {
            const res = await fetch(`/api/copas-ligas/${copa.IdLiga}/productos`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ concepto: concepto.trim(), precio: Number(precio) }),
            });
            const json = await res.json();
            if (!json.success) {
                setError(json.message ?? "No se pudo agregar");
                return;
            }
            setConcepto("");
            setPrecio("");
            setAgregando(false);
            await onCambio();
        } catch {
            setError("Error de conexión");
        } finally {
            setGuardando(false);
        }
    };

    return (
        <div className="bg-white/[0.03] border border-white/10 rounded-2xl p-4">
            <div className="flex items-center justify-between gap-3 mb-3">
                <div>
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                        Precios de esta {etiquetaTipo(copa.IdTipoLiga).toLowerCase()}
                    </p>
                    <p className="text-[10px] text-slate-500 mt-0.5">
                        Cada renglón es un cobro distinto (categoría, transporte…). El precio nuevo aplica de aquí en adelante; lo ya cobrado no cambia.
                    </p>
                </div>
                {!agregando && (
                    <button
                        onClick={() => setAgregando(true)}
                        className="flex-shrink-0 flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/15 text-slate-300 text-[11px] font-bold transition-colors"
                    >
                        <Plus size={12} /> Agregar
                    </button>
                )}
            </div>

            {agregando && (
                <div className="flex flex-wrap items-end gap-2 mb-3 p-3 rounded-xl bg-white/5 border border-white/10">
                    <div className="flex-1 min-w-[180px]">
                        <label className={ETIQUETA}>Concepto</label>
                        <input
                            value={concepto}
                            onChange={(e) => setConcepto(e.target.value)}
                            maxLength={45}
                            autoFocus
                            placeholder="Ej. FUT 7, Transporte"
                            className={CAMPO}
                        />
                    </div>
                    <div className="w-32">
                        <label className={ETIQUETA}>Precio</label>
                        <input
                            type="number"
                            min={0}
                            step="0.01"
                            value={precio}
                            onChange={(e) => setPrecio(e.target.value)}
                            onKeyDown={(e) => { if (e.key === "Enter" && concepto.trim().length >= 3 && precio !== "") agregar(); }}
                            className={CAMPO}
                        />
                    </div>
                    <button
                        onClick={agregar}
                        disabled={guardando || concepto.trim().length < 3 || precio === ""}
                        className="px-3 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold disabled:opacity-40 inline-flex items-center gap-1.5"
                    >
                        {guardando ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />} Guardar
                    </button>
                    <button
                        onClick={() => { setAgregando(false); setError(null); }}
                        className="px-3 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-slate-300 text-xs font-bold"
                    >
                        Cancelar
                    </button>
                </div>
            )}

            {error && (
                <p className="text-[11px] text-rose-300 mb-2 flex items-center gap-1.5">
                    <AlertCircle size={12} /> {error}
                </p>
            )}

            {copa.productos.length === 0 ? (
                <p className="text-xs text-slate-500 py-4 text-center">
                    Todavía no tiene ningún cobro. Sin precio no se le puede cobrar a nadie.
                </p>
            ) : (
                <div className="space-y-1.5">
                    {copa.productos.map((p) => (
                        <RenglonConcepto key={p.IdProducto} producto={p} onCambio={onCambio} />
                    ))}
                </div>
            )}
        </div>
    );
}

function RenglonConcepto({
    producto,
    onCambio,
}: {
    producto: ProductoCopaLiga;
    onCambio: () => Promise<void>;
}) {
    const [precio, setPrecio] = useState(String(producto.Precio));
    const [guardando, setGuardando] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Si el catálogo se recarga, el input vuelve a reflejar lo que hay guardado.
    useEffect(() => { setPrecio(String(producto.Precio)); }, [producto.Precio]);

    const cambiado = precio !== "" && Number(precio) !== producto.Precio;
    const deBaja = producto.Status === BAJA;

    const guardar = async (cuerpo: Record<string, unknown>) => {
        setGuardando(true);
        setError(null);
        try {
            const res = await fetch(`/api/copas-ligas/productos/${producto.IdProducto}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(cuerpo),
            });
            const json = await res.json();
            if (!json.success) {
                setError(json.message ?? "No se pudo guardar");
                return;
            }
            await onCambio();
        } catch {
            setError("Error de conexión");
        } finally {
            setGuardando(false);
        }
    };

    return (
        <div className={`flex flex-wrap items-center gap-2 px-3 py-2 rounded-xl border ${
            deBaja ? "bg-white/[0.02] border-white/5 opacity-60" : "bg-white/5 border-white/10"
        }`}>
            <ClipboardList size={13} className="text-slate-500 flex-shrink-0" />
            <span className="flex-1 min-w-[140px] text-xs font-semibold text-slate-200 truncate" title={producto.Producto}>
                {producto.Producto}
            </span>

            {deBaja && (
                <span className="text-[9px] font-black px-2 py-0.5 rounded-md bg-rose-500/15 text-rose-300 border border-rose-500/30">
                    BAJA
                </span>
            )}

            <div className="flex items-center gap-1.5">
                <span className="text-slate-500 text-xs">$</span>
                <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={precio}
                    onChange={(e) => setPrecio(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter" && cambiado) guardar({ precio: Number(precio) }); }}
                    disabled={guardando}
                    className="w-28 bg-white/5 border border-white/15 rounded-lg px-2 py-1 text-xs text-slate-100 text-right outline-none focus:border-blue-500 disabled:opacity-50"
                />
                <button
                    onClick={() => guardar({ precio: Number(precio) })}
                    disabled={!cambiado || guardando}
                    title="Guardar el precio"
                    className="p-1.5 rounded-lg bg-emerald-600/20 hover:bg-emerald-600/40 border border-emerald-500/30 text-emerald-200 transition-colors disabled:opacity-25 disabled:cursor-not-allowed"
                >
                    {guardando ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
                </button>
                <button
                    onClick={() => guardar({ status: deBaja ? VIGENTE : BAJA })}
                    disabled={guardando}
                    title={deBaja ? "Reactivar este cobro" : "Dar de baja este cobro"}
                    className="p-1.5 rounded-lg bg-white/5 hover:bg-white/15 border border-white/10 text-slate-400 hover:text-white transition-colors disabled:opacity-40"
                >
                    {deBaja ? <RotateCcw size={12} /> : <Ban size={12} />}
                </button>
            </div>

            {error && (
                <p className="w-full text-[10px] text-rose-300 flex items-center gap-1">
                    <AlertCircle size={10} /> {error}
                </p>
            )}
        </div>
    );
}

function ModalCrear({ onClose, onCreado }: { onClose: () => void; onCreado: () => Promise<void> }) {
    const [nombre, setNombre] = useState("");
    const [idTipoLiga, setIdTipoLiga] = useState<number>(TIPO_COPA);
    const [foto, setFoto] = useState<string | null>(null);
    const [precio, setPrecio] = useState("");
    const [concepto, setConcepto] = useState("");
    const [guardando, setGuardando] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
        document.addEventListener("keydown", onKey);
        return () => document.removeEventListener("keydown", onKey);
    }, [onClose]);

    const crear = async () => {
        setGuardando(true);
        setError(null);
        try {
            const cuerpo: Record<string, unknown> = { nombre: nombre.trim(), idTipoLiga };
            if (foto) cuerpo.foto = foto;
            if (precio !== "") {
                cuerpo.precio = Number(precio);
                if (concepto.trim()) cuerpo.conceptoPrecio = concepto.trim();
            }

            const res = await fetch("/api/copas-ligas", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(cuerpo),
            });
            const json = await res.json();
            if (!json.success) {
                setError(json.message ?? "No se pudo crear");
                return;
            }
            await onCreado();
        } catch {
            setError("Error de conexión");
        } finally {
            setGuardando(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-md flex items-center justify-center z-[130] p-4" onClick={onClose}>
            <div
                className="bg-[#0f172a] border border-white/15 rounded-3xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="p-5 border-b border-white/10 bg-white/5 flex items-center justify-between">
                    <h3 className="text-lg font-black text-white flex items-center gap-2">
                        <Plus size={18} className="text-blue-400" /> Nueva copa o liga
                    </h3>
                    <button onClick={onClose} className="p-2 rounded-xl hover:bg-white/10 text-slate-400 hover:text-white transition-all">
                        <X size={20} />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-5 grid md:grid-cols-2 gap-5">
                    <div>
                        <label className={ETIQUETA}>Foto (opcional)</label>
                        <FotoUploader valor={foto} onChange={setFoto} alt="Nueva copa o liga" />
                    </div>

                    <div className="space-y-4">
                        <div>
                            <label className={ETIQUETA}>¿Es copa o liga?</label>
                            <div className="flex gap-2">
                                {[TIPO_LIGA, TIPO_COPA].map((t) => (
                                    <button
                                        key={t}
                                        type="button"
                                        onClick={() => setIdTipoLiga(t)}
                                        className={`flex-1 py-2 rounded-lg text-xs font-black border transition-all ${
                                            idTipoLiga === t
                                                ? t === TIPO_COPA
                                                    ? "bg-amber-500/20 text-amber-200 border-amber-500/50"
                                                    : "bg-blue-500/20 text-blue-200 border-blue-500/50"
                                                : "bg-white/5 text-slate-400 border-white/10 hover:bg-white/10"
                                        }`}
                                    >
                                        {etiquetaTipo(t)}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div>
                            <label className={ETIQUETA}>Nombre</label>
                            <input
                                value={nombre}
                                onChange={(e) => setNombre(e.target.value)}
                                maxLength={45}
                                autoFocus
                                placeholder="Ej. COPA PRIMAVERA"
                                className={CAMPO}
                            />
                        </div>

                        <div className="grid grid-cols-2 gap-2">
                            <div>
                                <label className={ETIQUETA}>Precio</label>
                                <input
                                    type="number"
                                    min={0}
                                    step="0.01"
                                    value={precio}
                                    onChange={(e) => setPrecio(e.target.value)}
                                    placeholder="0.00"
                                    className={CAMPO}
                                />
                            </div>
                            <div>
                                <label className={ETIQUETA}>Concepto</label>
                                <input
                                    value={concepto}
                                    onChange={(e) => setConcepto(e.target.value)}
                                    maxLength={45}
                                    placeholder="Igual al nombre"
                                    className={CAMPO}
                                />
                            </div>
                        </div>
                        <p className="text-[10px] text-slate-500 -mt-2">
                            Sin precio la copa o liga queda creada, pero no se le puede cobrar a nadie hasta
                            que le agregues uno.
                        </p>

                        {error && (
                            <p className="text-[11px] text-rose-300 flex items-start gap-1.5">
                                <AlertCircle size={12} className="flex-shrink-0 mt-0.5" /> {error}
                            </p>
                        )}
                    </div>
                </div>

                <div className="p-5 border-t border-white/10 bg-white/5 flex justify-end gap-2">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-white text-xs font-bold transition-colors"
                    >
                        Cancelar
                    </button>
                    <button
                        onClick={crear}
                        disabled={guardando || nombre.trim().length < 3}
                        className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                        {guardando ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
                        Crear
                    </button>
                </div>
            </div>
        </div>
    );
}
