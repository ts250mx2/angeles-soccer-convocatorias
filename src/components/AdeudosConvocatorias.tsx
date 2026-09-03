"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertCircle, Loader2, Search, Trophy, X } from "lucide-react";
import { ACENTO_TORNEO } from "@/lib/acento-torneo";
import { urlEscudo } from "@/lib/copas-ligas";
import GraficaPastel, { type Rebanada } from "@/components/GraficaPastel";

/**
 * Lo que se debe por haber sido CONVOCADO a una copa o a una liga.
 *
 * Vive DENTRO del panel de esta temporada, en dos tarjetas, porque es adeudo de la misma
 * temporada que el resto del panel. Pero no se suma con el de mensualidades, y por eso va
 * en tarjetas aparte: la mensualidad se debe por estar inscrito y la convocatoria por
 * haber jugado un torneo concreto. Sumarlos daría un número que nadie puede cobrar,
 * porque no se sabría de qué se compone.
 *
 * Copas y ligas van separadas, con los mismos colores que las distinguen en el resto de
 * la aplicación (ámbar y azul, ver @/lib/acento-torneo) para no releer la leyenda en cada
 * pantalla.
 *
 * ── El pastel ──
 *
 * Reparto part-to-whole con pocos segmentos —hoy 3 copas y 4 ligas—, que es justo para lo
 * que sirve un pastel. La comparación fina NO se hace midiendo ángulos: al lado va
 * siempre la lista con el nombre, el escudo y el importe exacto de cada torneo.
 *
 * Los torneos NO son una escala ordenada (la GOLD no es "más" que la REY DE REYES), así
 * que llevan colores categóricos distintos y no una rampa de un solo tono.
 *
 * ── Sin colapsar ──
 *
 * La lista de torneos está siempre a la vista. Plegada obligaba a un clic para ver de qué
 * se compone el total, y el total por sí solo no se puede cobrar: lo cobrable es "los que
 * deben la GOLD".
 */

interface FilaResumen {
    idLiga: number;
    liga: string;
    esCopa: boolean;
    /** Tiene escudo cargado; la imagen la sirve /api/copas-ligas/foto. */
    tieneFoto: number;
    fotoVersion: string | null;
    jugadores: number;
    deuda: number;
    /** 'dd/mm/aaaa': lo más próximo que se juega de ese torneo. */
    desde: string | null;
}

interface FilaDetalle {
    idJugador: number;
    jugador: string;
    sede: string;
    categoria: string;
    liga: string;
    desde: string | null;
    hasta: string | null;
    precio: number;
    pagado: number;
    debe: number;
}

/** El mismo margen del servidor: evita que la basura del punto flotante deba un centavo. */
const yaPago = (f: FilaDetalle): boolean => f.debe <= 0.009;

const moneda = (n: number): string =>
    new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 0 })
        .format(n || 0);

/* Colores categóricos, uno por torneo, dentro de la familia del tipo: ámbar las copas y
   azul las ligas, que es como se distinguen en toda la aplicación. Si algún día hubiera
   más torneos que colores la lista se repite, que es preferible a inventar tonos que no
   se distingan entre sí. */
const PALETA_COPA = ["#f59e0b", "#fcd34d", "#b45309", "#fde68a", "#92400e"];
const PALETA_LIGA = ["#38bdf8", "#0369a1", "#bae6fd", "#0ea5e9", "#075985"];

/* Pagado y con adeudo: los mismos verde y rojo con los que toda la aplicación dice "al
   corriente" y "debe". No son una escala, son dos estados opuestos. */
const COLOR_PAGADO = "#10b981";
const COLOR_DEBE = "#f43f5e";

export default function AdeudosConvocatorias({ temporadaId }: { temporadaId: number | null }) {
    const [filas, setFilas] = useState<FilaResumen[]>([]);
    const [cargando, setCargando] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [detalle, setDetalle] = useState<{ tipo: "copa" | "liga"; idLiga: number; liga: string } | null>(null);

    useEffect(() => {
        if (!temporadaId) return;
        let vivo = true;
        setCargando(true);
        setError(null);
        (async () => {
            try {
                const res = await fetch(`/api/adeudos/convocatorias?temporadaId=${temporadaId}`, {
                    cache: "no-store",
                });
                const json = await res.json();
                if (!vivo) return;
                if (json.success) setFilas(json.data);
                else setError(json.message ?? "No se pudieron cargar los adeudos de copas y ligas");
            } catch {
                if (vivo) setError("Error de conexión");
            } finally {
                if (vivo) setCargando(false);
            }
        })();
        return () => { vivo = false; };
    }, [temporadaId]);

    /* Los totales de cada tipo.

       OJO con el conteo: los adeudos se suman por torneo, y un niño convocado a dos copas
       que debe las dos cuenta en ambas. Es a propósito —son dos cobros distintos— pero por
       eso la cifra se rotula "adeudos" y no "niños": decir "niños" daría un número que no
       cuadra con el detalle. */
    const totales = useMemo(() => {
        const de = (esCopa: boolean) => {
            const suyas = [...filas.filter((f) => f.esCopa === esCopa)].sort((a, b) => b.deuda - a.deuda);
            const paleta = esCopa ? PALETA_COPA : PALETA_LIGA;
            return {
                torneos: suyas,
                adeudos: suyas.reduce((t, f) => t + f.jugadores, 0),
                deuda: suyas.reduce((t, f) => t + f.deuda, 0),
                /* El pastel reparte el DINERO, no los niños: es lo que la tarjeta anuncia
                   en grande, y dos gráficas de cosas distintas en la misma tarjeta se
                   leerían mal. */
                rebanadas: suyas.map((f, i): Rebanada => ({
                    etiqueta: f.liga,
                    cantidad: f.deuda,
                    color: paleta[i % paleta.length],
                })),
                color: (i: number) => paleta[i % paleta.length],
            };
        };
        return { copa: de(true), liga: de(false) };
    }, [filas]);

    if (!temporadaId) return null;

    return (
        <>
            <div className="mt-5 pt-5 border-t border-white/10">
                <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-3 flex items-center gap-1.5">
                    <Trophy size={12} /> Adeudos de convocatorias
                </p>

                {error && (
                    <div className="mb-3 px-4 py-3 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-200 text-sm font-bold flex items-start gap-2">
                        <AlertCircle size={16} className="flex-shrink-0 mt-0.5" /> {error}
                    </div>
                )}

                {cargando ? (
                    <div className="h-40 rounded-2xl bg-white/5 border border-white/10 animate-pulse" />
                ) : (
                    <div className="grid grid-cols-1 2xl:grid-cols-2 gap-3">
                        <TarjetaTorneo
                            tipo="copa"
                            titulo="Adeudo de copas"
                            datos={totales.copa}
                            onVerNinos={(idLiga, liga) => setDetalle({ tipo: "copa", idLiga, liga })}
                        />
                        <TarjetaTorneo
                            tipo="liga"
                            titulo="Adeudo de ligas"
                            datos={totales.liga}
                            onVerNinos={(idLiga, liga) => setDetalle({ tipo: "liga", idLiga, liga })}
                        />
                    </div>
                )}
            </div>

            {detalle && (
                <DetalleConvocatorias
                    temporadaId={temporadaId}
                    tipo={detalle.tipo}
                    idLiga={detalle.idLiga}
                    liga={detalle.liga}
                    onCerrar={() => setDetalle(null)}
                />
            )}
        </>
    );
}

interface DatosTipo {
    torneos: FilaResumen[];
    adeudos: number;
    deuda: number;
    rebanadas: Rebanada[];
    color: (i: number) => string;
}

/** Una tarjeta: el total, el pastel de su reparto y la lista de torneos, siempre visible. */
function TarjetaTorneo({
    tipo,
    titulo,
    datos,
    onVerNinos,
}: {
    tipo: "copa" | "liga";
    titulo: string;
    datos: DatosTipo;
    /** `idLiga` 0 = todos los torneos de este tipo. */
    onVerNinos: (idLiga: number, liga: string) => void;
}) {
    const acento = ACENTO_TORNEO[tipo];
    const cifra = tipo === "copa" ? "text-amber-300" : "text-sky-300";
    const hay = datos.deuda > 0;

    return (
        <div className={`rounded-2xl border border-white/10 bg-white/[0.03] p-4 ${acento.filoSuperior}`}>
            <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{titulo}</p>
                    <p className={`text-2xl font-black tabular-nums ${cifra}`}>{moneda(datos.deuda)}</p>
                    <p className="text-[10px] font-bold text-slate-500 mt-0.5">
                        {datos.adeudos} {datos.adeudos === 1 ? "adeudo" : "adeudos"} en{" "}
                        {datos.torneos.length}{" "}
                        {datos.torneos.length === 1
                            ? tipo === "copa" ? "copa" : "liga"
                            : tipo === "copa" ? "copas" : "ligas"}
                    </p>
                </div>
                {hay && (
                    <button
                        type="button"
                        onClick={() => onVerNinos(0, "")}
                        className="px-2.5 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-slate-200 text-[10px] font-black transition-colors whitespace-nowrap flex-shrink-0"
                    >
                        Ver todos
                    </button>
                )}
            </div>

            {!hay ? (
                <p className="text-[11px] text-slate-500 mt-3">Nadie debe convocatorias de este tipo.</p>
            ) : (
                <div className="mt-3 flex items-start gap-4">
                    <div className="flex-shrink-0">
                        <GraficaPastel
                            rebanadas={datos.rebanadas}
                            total={datos.deuda}
                            tamano={96}
                            unidad="pesos de adeudo"
                        />
                    </div>

                    <ul className="min-w-0 flex-1 space-y-0.5">
                        {datos.torneos.map((t, i) => {
                            const escudo = urlEscudo({
                                IdLiga: t.idLiga,
                                TieneFoto: t.tieneFoto,
                                FotoVersion: t.fotoVersion,
                            });
                            return (
                                <li key={t.idLiga}>
                                    <button
                                        type="button"
                                        onClick={() => onVerNinos(t.idLiga, t.liga)}
                                        title={`Ver quién debe la ${t.liga}`}
                                        className="w-full flex items-center gap-2 px-1.5 py-1 rounded-lg hover:bg-white/10 transition-colors text-left"
                                    >
                                        {/* La mota de color enlaza el renglón con su rebanada. */}
                                        <span
                                            aria-hidden
                                            className="w-2 h-2 rounded-full flex-shrink-0"
                                            style={{ backgroundColor: datos.color(i) }}
                                        />
                                        {escudo ? (
                                            // eslint-disable-next-line @next/next/no-img-element
                                            <img
                                                src={escudo}
                                                alt=""
                                                loading="lazy"
                                                className="w-6 h-6 rounded object-contain bg-slate-950/50 border border-white/10 flex-shrink-0"
                                            />
                                        ) : (
                                            /* Sin escudo queda el hueco del mismo tamaño, para
                                               que los renglones no bailen. */
                                            <span className="w-6 h-6 rounded bg-slate-800 border border-white/10 flex-shrink-0 flex items-center justify-center">
                                                <Trophy size={11} className="text-slate-600" />
                                            </span>
                                        )}

                                        <span className="min-w-0 flex-1">
                                            <span className="block text-[10px] font-black text-slate-100 truncate">
                                                {t.liga}
                                            </span>
                                            <span className="block text-[9px] text-slate-500 tabular-nums">
                                                {t.jugadores} {t.jugadores === 1 ? "adeudo" : "adeudos"}
                                                {t.desde ? ` · desde ${t.desde}` : ""}
                                            </span>
                                        </span>

                                        <span className={`text-[10px] font-black tabular-nums flex-shrink-0 ${cifra}`}>
                                            {moneda(t.deuda)}
                                        </span>
                                    </button>
                                </li>
                            );
                        })}
                    </ul>
                </div>
            )}
        </div>
    );
}

/** Los niños que deben, con la fecha del torneo al que se les convocó. */
function DetalleConvocatorias({
    temporadaId,
    tipo,
    idLiga,
    liga,
    onCerrar,
}: {
    temporadaId: number;
    tipo: "copa" | "liga";
    /** 0 = todos los torneos de ese tipo. */
    idLiga: number;
    liga: string;
    onCerrar: () => void;
}) {
    const [filas, setFilas] = useState<FilaDetalle[]>([]);
    const [cargando, setCargando] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const cargar = useCallback(async () => {
        setCargando(true);
        setError(null);
        try {
            const params = new URLSearchParams({
                temporadaId: String(temporadaId),
                detalle: "1",
                tipo,
                idLiga: String(idLiga),
            });
            const res = await fetch(`/api/adeudos/convocatorias?${params}`, { cache: "no-store" });
            const json = await res.json();
            if (json.success) setFilas(json.data);
            else setError(json.message ?? "No se pudo cargar el detalle");
        } catch {
            setError("Error de conexión");
        } finally {
            setCargando(false);
        }
    }, [temporadaId, tipo, idLiga]);

    useEffect(() => { cargar(); }, [cargar]);

    useEffect(() => {
        const alTeclear = (e: KeyboardEvent) => { if (e.key === "Escape") onCerrar(); };
        document.addEventListener("keydown", alTeclear);
        return () => document.removeEventListener("keydown", alTeclear);
    }, [onCerrar]);

    const [busqueda, setBusqueda] = useState("");
    /* Arranca en los que deben, que es a lo que se entra: la tarjeta anuncia un adeudo.
       Los pagados se piden a propósito, para confirmar quién ya está al corriente. */
    const [verPagados, setVerPagados] = useState(false);

    /* Primero el texto. Se busca por nombre, categoría, sede y torneo: son los cuatro
       datos por los que alguien llega aquí buscando a alguien concreto, y cuál de ellos
       recuerda depende de por qué abrió la lista. */
    const filtradasPorTexto = useMemo(() => {
        const q = busqueda.trim().toLowerCase();
        if (!q) return filas;
        return filas.filter((f) =>
            [f.jugador, f.categoria, f.sede, f.liga].some((campo) =>
                String(campo ?? "").toLowerCase().includes(q),
            ) || String(f.idJugador) === q,
        );
    }, [filas, busqueda]);

    /** Y después el estado. Es lo que acaba en la tabla. */
    const visibles = useMemo(
        () => (verPagados ? filtradasPorTexto : filtradasPorTexto.filter((f) => !yaPago(f))),
        [filtradasPorTexto, verPagados],
    );

    /** Cuántos de los que pasan el texto ya pagaron: rotula el interruptor. */
    const cuantosPagados = useMemo(
        () => filtradasPorTexto.filter(yaPago).length,
        [filtradasPorTexto],
    );

    /* Agrupado por CATEGORÍA, de mayor a menor adeudo.

       Es como se cobra: el entrenador de los 2016A se lleva su lista, no la del torneo
       entero. Por eso cada grupo trae su subtotal —lo que le toca perseguir— y la columna
       de categoría desaparece de los renglones: repetir el mismo texto quince veces
       ocupaba ancho sin decir nada nuevo.

       El PASTEL de cada grupo se calcula sobre TODOS los convocados de esa categoría, no
       sobre lo que se está viendo: la pregunta que contesta es "cómo va esta categoría", y
       con solo los deudores en la mano siempre daría 100% en rojo. Por eso el interruptor
       de pagados mueve la lista pero no la gráfica. */
    const grupos = useMemo(() => {
        const porCategoria = new Map<string, { todos: FilaDetalle[]; visibles: FilaDetalle[] }>();
        const asegura = (clave: string) => {
            const g = porCategoria.get(clave) ?? { todos: [], visibles: [] };
            porCategoria.set(clave, g);
            return g;
        };
        for (const f of filtradasPorTexto) asegura(f.categoria || "SIN CATEGORÍA").todos.push(f);
        for (const f of visibles) asegura(f.categoria || "SIN CATEGORÍA").visibles.push(f);

        return [...porCategoria.entries()]
            .map(([categoria, g]) => {
                const pagados = g.todos.filter(yaPago).length;
                const deben = g.todos.length - pagados;
                return {
                    categoria,
                    lista: g.visibles,
                    pagados,
                    deben,
                    /* Lo que falta cobrar. Se acota a 0 por si alguien pagó de más: un
                       saldo a favor no resta de lo que deben los demás. */
                    deuda: g.todos.reduce((t, f) => t + Math.max(f.debe, 0), 0),
                    rebanadas: [
                        { etiqueta: "Pagado", cantidad: pagados, color: COLOR_PAGADO },
                        { etiqueta: "Debe", cantidad: deben, color: COLOR_DEBE },
                    ] as Rebanada[],
                };
            })
            /* Los grupos que el filtro dejó sin nadie visible no se pintan: una cabecera
               sola no dice nada. */
            .filter((g) => g.lista.length > 0)
            .sort((a, b) => b.deuda - a.deuda);
    }, [filtradasPorTexto, visibles]);

    const total = visibles.reduce((t, f) => t + Math.max(f.debe, 0), 0);
    const cifra = tipo === "copa" ? "text-amber-300" : "text-sky-300";

    return (
        <div className="fixed inset-0 z-[130] flex items-start justify-center bg-black/70 backdrop-blur-md p-4 overflow-y-auto">
            <div className="w-full max-w-5xl my-8 bg-[#0f172a] border border-white/15 rounded-3xl shadow-2xl">
                <div className="flex items-start justify-between gap-3 px-6 py-4 border-b border-white/10">
                    <div className="min-w-0">
                        <h2 className="text-lg font-black text-white">
                            Adeudo de {tipo === "copa" ? "copas" : "ligas"}
                        </h2>
                        <p className="text-[11px] text-slate-400 mt-0.5">
                            {liga || (tipo === "copa" ? "Todas las copas" : "Todas las ligas")} ·{" "}
                            {visibles.length} {visibles.length === 1 ? "adeudo" : "adeudos"}
                            {busqueda.trim() && filas.length !== visibles.length
                                ? ` de ${filas.length}`
                                : ""}{" "}
                            en {grupos.length}{" "}
                            {grupos.length === 1 ? "categoría" : "categorías"} ·{" "}
                            <span className={`font-black ${cifra}`}>{moneda(total)}</span>
                        </p>
                    </div>
                    <button
                        onClick={onCerrar}
                        className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-white/10 transition-all"
                    >
                        <X size={18} />
                    </button>
                </div>

                <div className="p-4 md:p-6">
                    {error && (
                        <div className="mb-3 px-4 py-3 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-200 text-sm font-bold">
                            {error}
                        </div>
                    )}

                    {/* Buscador y filtro de estado. El buscador solo esconde renglones: el
                        total del encabezado se recalcula con lo visible, para que la cifra
                        y la lista no se contradigan. */}
                    {!cargando && filas.length > 0 && (
                        <div className="flex flex-wrap items-center gap-3 mb-3">
                            <div className="relative flex-1 min-w-[220px] max-w-sm">
                                <Search
                                    size={14}
                                    className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none"
                                />
                                <input
                                    type="text"
                                    value={busqueda}
                                    onChange={(e) => setBusqueda(e.target.value)}
                                    placeholder="Buscar por nombre, categoría, sede o torneo..."
                                    className="w-full bg-white/5 border border-white/15 rounded-lg pl-9 pr-8 py-2 text-xs text-slate-100 placeholder-slate-500 outline-none focus:border-blue-500/60 transition-colors"
                                />
                                {busqueda && (
                                    <button
                                        type="button"
                                        onClick={() => setBusqueda("")}
                                        title="Limpiar la búsqueda"
                                        className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded text-slate-500 hover:text-white hover:bg-white/10 transition-colors"
                                    >
                                        <X size={12} />
                                    </button>
                                )}
                            </div>

                            <label
                                className="inline-flex items-center gap-2 cursor-pointer select-none"
                                title="Los que ya pagaron su copa o liga no deben nada; se muestran para confirmar quién está al corriente."
                            >
                                <input
                                    type="checkbox"
                                    className="sr-only peer"
                                    checked={verPagados}
                                    onChange={(e) => setVerPagados(e.target.checked)}
                                />
                                <span className="w-9 h-5 rounded-full bg-white/15 peer-checked:bg-emerald-600 relative transition-colors after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:w-4 after:h-4 after:rounded-full after:bg-white after:transition-transform peer-checked:after:translate-x-4" />
                                <span className="text-[11px] font-bold text-slate-300 whitespace-nowrap">
                                    Ver los que ya pagaron
                                    {cuantosPagados > 0 && (
                                        <span className="text-slate-500"> ({cuantosPagados})</span>
                                    )}
                                </span>
                            </label>
                        </div>
                    )}

                    {cargando ? (
                        <div className="flex items-center justify-center gap-2 py-16 text-slate-400">
                            <Loader2 size={22} className="animate-spin" />
                            <span className="text-sm font-bold">Cargando...</span>
                        </div>
                    ) : filas.length === 0 ? (
                        <p className="text-center py-16 text-slate-400 text-sm font-bold">Nadie debe aquí.</p>
                    ) : visibles.length === 0 ? (
                        <div className="text-center py-12">
                            <p className="text-slate-300 font-bold text-sm">
                                {verPagados ? "Nadie con ese texto" : "Aquí ya nadie debe"}
                            </p>
                            <p className="text-slate-500 text-xs mt-1">
                                {verPagados
                                    ? `Son ${filas.length} convocados en total. Limpia la búsqueda para verlos todos.`
                                    : `Los ${cuantosPagados} que quedan ya pagaron. Enciéndelos arriba para verlos.`}
                            </p>
                        </div>
                    ) : (
                        <div className="overflow-x-auto rounded-2xl border border-white/10">
                            <table className="w-full min-w-[700px]">
                                <thead>
                                    <tr className="bg-slate-800">
                                        {["Jugador", "Sede", "Torneo", "Fecha de convocatoria", "Precio", "Pagado", "Debe"]
                                            .map((h, i) => (
                                                <th
                                                    key={h}
                                                    className={`px-3 py-2 text-[9px] font-black text-slate-400 uppercase tracking-widest ${
                                                        i >= 4 ? "text-right" : "text-left"
                                                    }`}
                                                >
                                                    {h}
                                                </th>
                                            ))}
                                    </tr>
                                </thead>
                                {grupos.map((g) => (
                                    <tbody key={g.categoria}>
                                        {/* La cabecera del grupo: su reparto entre pagados y
                                            deudores, y el subtotal que toca perseguir. */}
                                        <tr className="bg-white/[0.06]">
                                            <th colSpan={6} className="px-3 py-2 text-left">
                                                <div className="flex items-center gap-2.5">
                                                    <GraficaPastel
                                                        rebanadas={g.rebanadas}
                                                        total={g.pagados + g.deben}
                                                        tamano={30}
                                                        unidad="convocados"
                                                    />
                                                    <div className="min-w-0">
                                                        <span className="block text-[10px] font-black text-slate-200 uppercase tracking-wider">
                                                            {g.categoria}
                                                        </span>
                                                        <span className="block text-[9px] font-bold text-slate-500">
                                                            <span className="text-emerald-400">
                                                                {g.pagados} pagados
                                                            </span>
                                                            {" · "}
                                                            <span className="text-rose-400">{g.deben} deben</span>
                                                            {g.pagados + g.deben > 0 && (
                                                                <>
                                                                    {" · "}
                                                                    {Math.round(
                                                                        (g.pagados / (g.pagados + g.deben)) * 100,
                                                                    )}
                                                                    % cobrado
                                                                </>
                                                            )}
                                                        </span>
                                                    </div>
                                                </div>
                                            </th>
                                            <th className={`px-3 py-2 text-right text-[10px] font-black tabular-nums ${cifra}`}>
                                                {moneda(g.deuda)}
                                            </th>
                                        </tr>
                                        {g.lista.map((f) => (
                                            <tr
                                                key={`${f.idJugador}-${f.liga}`}
                                                className="border-b border-white/5 hover:bg-white/[0.04] transition-colors"
                                            >
                                                <td className="px-3 py-2 text-[11px] font-bold text-slate-100">{f.jugador}</td>
                                                <td className="px-3 py-2 text-[11px] text-slate-400">{f.sede}</td>
                                                <td className="px-3 py-2 text-[11px] text-slate-300">{f.liga}</td>
                                                {/* La fecha es la del TORNEO, no la de captura:
                                                    es la que sirve para reclamar el cobro. */}
                                                <td className="px-3 py-2 text-[11px] text-slate-300 whitespace-nowrap tabular-nums">
                                                    {f.desde ? (f.desde === f.hasta ? f.desde : `${f.desde} — ${f.hasta}`) : "—"}
                                                </td>
                                                <td className="px-3 py-2 text-[11px] text-right tabular-nums text-slate-400">
                                                    {moneda(f.precio)}
                                                </td>
                                                <td className="px-3 py-2 text-[11px] text-right tabular-nums text-emerald-400">
                                                    {moneda(f.pagado)}
                                                </td>
                                                <td className="px-3 py-2 text-right">
                                                    {yaPago(f) ? (
                                                        <span className="text-[9px] font-black px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                                                            PAGADO
                                                        </span>
                                                    ) : (
                                                        <span className={`text-[11px] tabular-nums font-black ${cifra}`}>
                                                            {moneda(f.debe)}
                                                        </span>
                                                    )}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                ))}
                            </table>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
