"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Trophy, Plus, Trash2, Copy, Check, AlertCircle, Loader2, ArrowLeft, Users,
} from "lucide-react";
import { useUser, usePuedeVer } from "@/contexts/user-context";
import DashboardLayout from "@/components/DashboardLayout";
import BuscadorIncremental, { type OpcionBuscador } from "@/components/BuscadorIncremental";
import { ELIMINATORIAS } from "@/lib/convocatoria-opciones";
import { esCopa } from "@/lib/copas-ligas";

/**
 * El torneo entero en una pantalla: su ficha y todas sus categorías.
 *
 * Sirve para las dos cosas, porque son la misma:
 *
 *   Alta      Se elige la copa o liga y se agregan sus categorías de golpe. Antes esto
 *             era un modal de un solo juego de campos: ocho categorías eran ocho vueltas
 *             completas al formulario.
 *   Edición   Se llega desde el torneo abierto con ?liga=; las categorías que ya existen
 *             se cargan como renglones editables y se pueden agregar más abajo.
 *
 * La ficha del torneo —nombre, tipo y escudo— se MUESTRA pero no se edita: ese es el
 * catálogo de Copas y Ligas, y desde aquí solo se administran sus convocatorias. Tocar
 * el nombre o el tipo desde la pantalla de captura diaria es demasiado fácil de hacer
 * sin querer, y arrastra a todo lo que apunta a esa liga.
 *
 * Arriba se captura una vez lo que se repite (fechas, profesor, jornadas y los tres
 * costos) y cada renglón nuevo lo hereda. En edición cada renglón trae SUS valores, que
 * pueden diferir entre categorías: por eso viven en el grid y no en la cabecera, para no
 * igualarlos sin querer. "Aplicar a todos" los baja a propósito cuando eso es lo que se
 * busca.
 *
 * Guardar reparte el trabajo: los renglones nuevos van al alta por lote, y los que ya
 * existían y cambiaron van uno a uno por la ruta de actualización de siempre —cambiar el
 * color arrastra el detalle y los precios fijados a mano, y esa lógica ya vive ahí.
 */

interface Liga {
  IdLiga: number;
  Liga: string;
  IdTipoLiga?: number;
  FechaAct?: string | null;
}

interface Profesor {
  IdUsuario: number;
  Usuario: string;
}

type Estado = "creada" | "actualizada" | "duplicada" | "excluida" | "error";

interface Renglon {
  /** Identidad en la pantalla; no viaja al servidor. */
  id: number;
  /** Clave con la que se leyó de la base. Sin esto, el renglón es nuevo. */
  original?: { categoria: string; color: string };
  categoria: string;
  color: string;
  idProfesor: string;
  fechaInicio: string;
  fechaFin: string;
  cantidadJornadas: string;
  eliminatoria: string;
  costoLiga: string;
  costoProfesor: string;
  costoArbitro: string;
  cerrada?: boolean;
  convocados?: number;
  resultado?: { estado: Estado; mensaje?: string };
}

const hoy = () => new Date().toISOString().split("T")[0];
const fecha10 = (v: unknown): string => String(v ?? "").slice(0, 10);
const texto = (v: unknown): string => (v === null || v === undefined ? "" : String(v));

const CAMPO =
  "w-full bg-white/5 border border-white/15 text-slate-200 text-sm py-2 px-3 rounded-lg outline-none focus:border-blue-500 transition-colors";
const ETIQUETA = "block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1.5";
const CELDA =
  "w-full bg-white/5 border border-white/10 text-slate-200 text-xs py-1.5 px-2 rounded-md outline-none focus:border-blue-500 transition-colors";

const ESTILO_ESTADO: Record<Estado, string> = {
  creada: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  actualizada: "bg-blue-500/15 text-blue-300 border-blue-500/30",
  duplicada: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  excluida: "bg-slate-500/15 text-slate-300 border-slate-500/30",
  error: "bg-rose-500/15 text-rose-300 border-rose-500/30",
};

const ETIQUETA_ESTADO: Record<Estado, string> = {
  creada: "Creada",
  actualizada: "Actualizada",
  duplicada: "Ya existía",
  excluida: "No se convoca",
  error: "Error",
};

/** ¿El renglón cambió respecto a lo que se leyó de la base? */
function cambio(r: Renglon, base: Renglon | undefined): boolean {
  if (!base) return true;
  return (
    r.color !== base.color ||
    r.idProfesor !== base.idProfesor ||
    r.fechaInicio !== base.fechaInicio ||
    r.fechaFin !== base.fechaFin ||
    r.cantidadJornadas !== base.cantidadJornadas ||
    r.eliminatoria !== base.eliminatoria ||
    r.costoLiga !== base.costoLiga ||
    r.costoProfesor !== base.costoProfesor ||
    r.costoArbitro !== base.costoArbitro
  );
}

function TorneoContenido() {
  const router = useRouter();
  const params = useSearchParams();
  const { user, isInitialized, season, seasonId } = useUser();
  const puedeVer = usePuedeVer("/");

  const [ligas, setLigas] = useState<Liga[]>([]);
  const [profesores, setProfesores] = useState<Profesor[]>([]);
  const [categorias, setCategorias] = useState<string[]>([]);
  const [conteoPorCategoria, setConteoPorCategoria] = useState<Record<string, number>>({});

  const [idLiga, setIdLiga] = useState<string>(params.get("liga") ?? "");


  // ── Valores que se repiten, para los renglones nuevos ──
  const [fechaInicio, setFechaInicio] = useState(hoy);
  const [fechaFin, setFechaFin] = useState(hoy);
  const [idProfesor, setIdProfesor] = useState("");
  const [costoLiga, setCostoLiga] = useState("");
  const [costoProfesor, setCostoProfesor] = useState("");
  const [costoArbitro, setCostoArbitro] = useState("");
  const [cantidadJornadas, setCantidadJornadas] = useState("");
  const [eliminatoria, setEliminatoria] = useState("");

  const [renglones, setRenglones] = useState<Renglon[]>([]);
  /** Copia de lo leído de la base, para saber qué cambió al guardar. */
  const [base, setBase] = useState<Map<number, Renglon>>(new Map());
  const [cargandoTorneo, setCargandoTorneo] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  useEffect(() => {
    if (isInitialized && !user) router.push("/login");
  }, [user, isInitialized, router]);

  useEffect(() => {
    if (!user || !puedeVer) return;

    fetch("/api/leagues")
      .then((r) => r.json())
      .then((j) => { if (j.success) setLigas(j.leagues); })
      .catch(() => setError("No se pudieron cargar las copas y ligas"));

    fetch("/api/users")
      .then((r) => r.json())
      .then((j) => { if (j.success) setProfesores(j.data); })
      .catch(() => { /* sin profesores se puede capturar igual */ });

    fetch("/api/convocatorias/categories")
      .then((r) => r.json())
      .then((j) => {
        if (!j.success) return;
        const filas = j.data as Array<{ Categoria: string; Jugadores?: number }>;
        setCategorias(filas.map((f) => f.Categoria));
        setConteoPorCategoria(Object.fromEntries(filas.map((f) => [f.Categoria, Number(f.Jugadores) || 0])));
      })
      .catch(() => { /* la categoría se puede escribir a mano */ });
  }, [user, puedeVer]);

  const ligaElegida = useMemo(
    () => ligas.find((l) => String(l.IdLiga) === idLiga) ?? null,
    [ligas, idLiga],
  );

  /* La ficha es de solo lectura: se lee del catálogo cada vez, sin copia en estado que
     pueda quedar desfasada. */
  const tipoCopa = esCopa(ligaElegida?.IdTipoLiga);
  const escudo = ligaElegida
    ? `/api/copas-ligas/foto/${ligaElegida.IdLiga}?v=${String(ligaElegida.FechaAct ?? "").replace(/\D/g, "") || "0"}`
    : null;

  /* Las categorías que ya tiene el torneo, para poder corregirlas aquí mismo. Salen del
     mismo resumen que pinta la pantalla principal, así que no hace falta otra ruta. */
  const cargarExistentes = useCallback(async (liga: string) => {
    if (!liga) return;
    setCargandoTorneo(true);
    try {
      const res = await fetch("/api/convocatorias/summary");
      const json = await res.json();
      if (!json.success) return;

      const suyas = (json.data as Array<Record<string, unknown>>)
        .filter((c) => String(c.IdLiga) === liga);

      const filas: Renglon[] = suyas.map((c, i) => ({
        id: Date.now() + i,
        original: { categoria: texto(c.Categoria), color: texto(c.Color) },
        categoria: texto(c.Categoria),
        color: texto(c.Color),
        idProfesor: c.IdProfesor ? String(c.IdProfesor) : "",
        fechaInicio: fecha10(c.FechaInicio),
        fechaFin: fecha10(c.FechaFin),
        cantidadJornadas: c.CantidadJornadas ? String(c.CantidadJornadas) : "",
        eliminatoria: texto(c.Eliminatoria),
        costoLiga: c.CostoLiga ? String(c.CostoLiga) : "",
        costoProfesor: c.CostoProfesor ? String(c.CostoProfesor) : "",
        costoArbitro: c.CostoArbitro ? String(c.CostoArbitro) : "",
        cerrada: Number(c.Cerrada) === 1,
        convocados: Number(c.JugadoresConvocados) || 0,
      }));

      setRenglones(filas);
      setBase(new Map(filas.map((f) => [f.id, { ...f }])));

      // Las fechas del torneo arrancan en las de la primera categoría: es lo normal.
      if (filas.length > 0) {
        setFechaInicio(filas[0].fechaInicio || hoy());
        setFechaFin(filas[0].fechaFin || hoy());
        setCantidadJornadas(filas[0].cantidadJornadas);
        setEliminatoria(filas[0].eliminatoria);
      }
    } finally {
      setCargandoTorneo(false);
    }
  }, []);

  const ligaInicial = params.get("liga");
  useEffect(() => {
    if (ligaInicial) cargarExistentes(ligaInicial);
  }, [ligaInicial, cargarExistentes]);

  const nuevoRenglon = useCallback((categoria = ""): Renglon => ({
    id: Date.now() + Math.random(),
    categoria,
    color: "",
    idProfesor,
    fechaInicio,
    fechaFin,
    cantidadJornadas,
    eliminatoria,
    costoLiga,
    costoProfesor,
    costoArbitro,
  }), [idProfesor, fechaInicio, fechaFin, cantidadJornadas, eliminatoria, costoLiga, costoProfesor, costoArbitro]);

  /* Las categorías que llegan por la URL vienen del aviso de pagos pendientes. */
  const precargadas = params.get("categorias");
  useEffect(() => {
    if (!precargadas) return;
    const lista = precargadas.split(",").map((c) => c.trim()).filter(Boolean);
    if (lista.length === 0) return;
    setRenglones((prev) => [
      ...prev,
      ...lista.map((categoria, i) => ({
        id: Date.now() + i + Math.random(),
        categoria,
        color: "",
        idProfesor: "",
        fechaInicio: hoy(),
        fechaFin: hoy(),
        cantidadJornadas: "",
        eliminatoria: "",
        costoLiga: "",
        costoProfesor: "",
        costoArbitro: "",
      })),
    ]);
  }, [precargadas]);

  const agregar = () => setRenglones((prev) => [...prev, nuevoRenglon()]);

  const duplicar = (id: number) =>
    setRenglones((prev) => {
      const i = prev.findIndex((r) => r.id === id);
      if (i === -1) return prev;
      const copia: Renglon = {
        ...prev[i], id: Date.now() + Math.random(), original: undefined,
        color: "", cerrada: false, convocados: undefined, resultado: undefined,
      };
      return [...prev.slice(0, i + 1), copia, ...prev.slice(i + 1)];
    });

  const quitar = (id: number) => setRenglones((prev) => prev.filter((r) => r.id !== id));

  const cambiar = (id: number, campo: keyof Renglon, valor: string) =>
    setRenglones((prev) => prev.map((r) => (r.id === id ? { ...r, [campo]: valor, resultado: undefined } : r)));

  const aplicarATodos = () =>
    setRenglones((prev) => prev.map((r) => ({
      ...r,
      idProfesor, fechaInicio, fechaFin, cantidadJornadas, eliminatoria,
      costoLiga, costoProfesor, costoArbitro,
      resultado: undefined,
    })));

  const guardar = async () => {
    setError(null);
    setAviso(null);

    if (!idLiga) return setError("Elige la copa o liga");
    if (!seasonId) return setError("No hay temporada activa");

    const conCategoria = renglones.filter((r) => r.categoria.trim());
    if (conCategoria.length === 0) {
      return setError("Agrega al menos una categoría");
    }

    setGuardando(true);
    try {
      const nuevos = conCategoria.filter((r) => !r.original);
      const editados = conCategoria.filter((r) => r.original && cambio(r, base.get(r.id)));
      const resultados = new Map<number, { estado: Estado; mensaje?: string }>();

      // ── Los que ya existían: uno a uno, por la ruta de siempre ──
      for (const r of editados) {
        try {
          const res = await fetch("/api/convocatorias/update", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              seasonId,
              leagueId: Number(idLiga),
              oldCategoria: r.original!.categoria,
              oldColor: r.original!.color,
              newColor: r.color.trim(),
              fechaInicio: r.fechaInicio,
              fechaFin: r.fechaFin,
              idProfesor: r.idProfesor ? Number(r.idProfesor) : null,
              costoLiga: r.costoLiga,
              costoProfesor: r.costoProfesor,
              costoArbitro: r.costoArbitro,
              cantidadJornadas: r.cantidadJornadas,
              eliminatoria: r.eliminatoria,
            }),
          });
          const json = await res.json();
          resultados.set(r.id, json.success
            ? { estado: "actualizada" }
            : { estado: "error", mensaje: json.message });
        } catch {
          resultados.set(r.id, { estado: "error", mensaje: "Error de conexión" });
        }
      }

      // ── Los nuevos: todos de una vez ──
      if (nuevos.length > 0) {
        const res = await fetch("/api/convocatorias/crear-lote", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            seasonId,
            leagueId: Number(idLiga),
            fechaInicio,
            fechaFin,
            cantidadJornadas,
            eliminatoria,
            renglones: nuevos.map((r) => ({
              categoria: r.categoria.trim(),
              color: r.color.trim(),
              idProfesor: r.idProfesor,
              costoLiga: r.costoLiga,
              costoProfesor: r.costoProfesor,
              costoArbitro: r.costoArbitro,
              fechaInicio: r.fechaInicio,
              fechaFin: r.fechaFin,
              cantidadJornadas: r.cantidadJornadas,
              eliminatoria: r.eliminatoria,
            })),
          }),
        });
        const json = await res.json();
        if (!json.success) {
          setError(json.message ?? "No se pudieron crear las convocatorias");
          return;
        }
        const porClave = new Map<string, { estado: Estado; mensaje?: string }>();
        (json.resultados as Array<{ categoria: string; color: string; estado: Estado; mensaje?: string }>)
          .forEach((x) => porClave.set(`${x.categoria}|${x.color}`, { estado: x.estado, mensaje: x.mensaje }));
        nuevos.forEach((r) => {
          const hallado = porClave.get(`${r.categoria.trim()}|${r.color.trim()}`);
          if (hallado) resultados.set(r.id, hallado);
        });
      }

      setRenglones((prev) => prev.map((r) => ({ ...r, resultado: resultados.get(r.id) ?? r.resultado })));

      const creadas = [...resultados.values()].filter((x) => x.estado === "creada").length;
      const actualizadas = [...resultados.values()].filter((x) => x.estado === "actualizada").length;
      setAviso(
        [
          creadas > 0 ? `${creadas} creada(s)` : null,
          actualizadas > 0 ? `${actualizadas} actualizada(s)` : null,
          creadas === 0 && actualizadas === 0 ? 'No había nada que guardar' : null,
        ].filter(Boolean).join(' · '),
      );
      // Se recargan las categorías para que los renglones nuevos ya salgan como existentes.
      if (creadas > 0) await cargarExistentes(idLiga);
    } catch {
      setError("Error de conexión");
    } finally {
      setGuardando(false);
    }
  };

  const existentes = renglones.filter((r) => r.original).length;
  const nuevos = renglones.filter((r) => !r.original && r.categoria.trim()).length;
  const opcionesCategoria: OpcionBuscador[] = categorias.map((c) => ({
    valor: c,
    etiqueta: c,
    detalle: conteoPorCategoria[c] ? `${conteoPorCategoria[c]} jugador(es)` : undefined,
  }));

  return (
    <DashboardLayout>
      <main className="p-4 md:p-8 overflow-y-auto flex-1">
        <div className="max-w-7xl mx-auto">
          <div className="bg-[#0f172a] backdrop-blur-sm rounded-xl shadow-2xl p-4 md:p-8 border border-white/20">

            {/* Encabezado */}
            <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 mb-6">
              <div className="flex items-center gap-3">
                <button
                  onClick={() => router.push("/")}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 border border-white/15 text-slate-300 hover:text-white hover:bg-white/10 text-xs font-bold transition-colors"
                >
                  <ArrowLeft size={13} /> Convocatorias
                </button>
                <div>
                  <h2 className="text-2xl md:text-3xl font-bold text-white">
                    {existentes > 0 ? "Editar torneo" : "Nueva convocatoria"}
                  </h2>
                  <p className="text-xs text-slate-400 mt-0.5">
                    La ficha del torneo y todas sus categorías, en una pantalla · Ciclo {season ?? "—"}
                  </p>
                </div>
              </div>
              <button
                onClick={guardar}
                disabled={guardando || cargandoTorneo || renglones.length === 0}
                className="flex items-center gap-2 bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-700 hover:to-blue-600 text-white font-bold py-2.5 px-6 rounded-lg shadow-md transition-all disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {guardando ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
                Guardar cambios
              </button>
            </div>

            {error && (
              <p className="flex items-start gap-2 mb-4 text-xs text-rose-300 bg-rose-500/10 border border-rose-500/30 rounded-lg px-3 py-2">
                <AlertCircle size={14} className="flex-shrink-0 mt-0.5" /> {error}
              </p>
            )}
            {aviso && (
              <p className="mb-4 text-xs text-emerald-300 bg-emerald-500/10 border border-emerald-500/30 rounded-lg px-3 py-2">
                {aviso}
              </p>
            )}

            {/* ── La ficha del torneo ── */}
            <div className="bg-white/5 border border-white/10 rounded-2xl p-5 mb-5">
              <div className="flex items-center gap-2 mb-4">
                <Trophy size={15} className="text-amber-400" />
                <h3 className="text-xs font-black text-white uppercase tracking-widest">Copa o liga</h3>
                {ligaElegida && (
                  <span className={`text-[9px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded border ${
                    tipoCopa
                      ? "bg-amber-500/15 text-amber-300 border-amber-500/30"
                      : "bg-blue-500/15 text-blue-300 border-blue-500/30"
                  }`}>
                    {tipoCopa ? "Copa" : "Liga"}
                  </span>
                )}
                {existentes > 0 && (
                  <span className="text-[10px] font-bold text-slate-400">
                    {existentes} categoría(s) ya dadas de alta
                  </span>
                )}
              </div>

              <div className="flex flex-wrap items-end gap-4">
                {/* El escudo, solo para reconocer el torneo de un vistazo. */}
                {ligaElegida && (
                  escudo ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={escudo} alt="" className="w-16 h-16 rounded-xl object-contain bg-white/5 border border-white/10 flex-shrink-0" />
                  ) : (
                    <div className="w-16 h-16 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center flex-shrink-0">
                      <Trophy size={20} className="text-slate-600" />
                    </div>
                  )
                )}

                <div className="flex-1 min-w-[240px]">
                  <label className={ETIQUETA}>Copa o liga</label>
                  <select
                    value={idLiga}
                    onChange={(e) => {
                      const valor = e.target.value;
                      setIdLiga(valor);
                      setRenglones([]);
                      setBase(new Map());
                      if (valor) cargarExistentes(valor);
                    }}
                    className={`${CAMPO} [color-scheme:dark]`}
                  >
                    <option value="">Elige la copa o liga...</option>
                    {ligas.map((l) => (
                      <option key={l.IdLiga} value={l.IdLiga}>{l.Liga}</option>
                    ))}
                  </select>
                </div>
              </div>

              {ligaElegida && (
                <p className="text-[10px] text-slate-500 mt-3">
                  El nombre, el tipo y el escudo son del catálogo de Copas y Ligas y no se cambian desde
                  aquí: de esta liga cuelgan convocatorias, pagos y reportes de otras temporadas. Aquí se
                  administran sus categorías.
                </p>
              )}
            </div>

            {/* ── Valores que se repiten ── */}
            <div className="bg-white/5 border border-white/10 rounded-2xl p-5 mb-5">
              <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                <h3 className="text-xs font-black text-white uppercase tracking-widest">
                  Valores para las categorías nuevas
                </h3>
                {renglones.length > 0 && (
                  <button
                    onClick={aplicarATodos}
                    title="Copiar estos valores a TODOS los renglones, incluidos los que ya existían"
                    className="px-3 py-2 rounded-lg bg-white/5 border border-white/15 text-slate-300 text-xs font-bold hover:bg-white/10 transition-colors"
                  >
                    Aplicar a todos
                  </button>
                )}
              </div>

              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <div>
                  <label className={ETIQUETA}>Fecha de inicio</label>
                  <input type="date" value={fechaInicio} onChange={(e) => setFechaInicio(e.target.value)} className={`${CAMPO} [color-scheme:dark]`} />
                </div>
                <div>
                  <label className={ETIQUETA}>Fecha de fin</label>
                  <input type="date" value={fechaFin} onChange={(e) => setFechaFin(e.target.value)} className={`${CAMPO} [color-scheme:dark]`} />
                </div>
                <div>
                  <label className={ETIQUETA}>Profesor</label>
                  <select value={idProfesor} onChange={(e) => setIdProfesor(e.target.value)} className={`${CAMPO} [color-scheme:dark]`}>
                    <option value="">Sin asignar</option>
                    {profesores.map((p) => (
                      <option key={p.IdUsuario} value={p.IdUsuario}>{p.Usuario}</option>
                    ))}
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className={ETIQUETA}>Jornadas</label>
                    <input type="number" min={0} value={cantidadJornadas} onChange={(e) => setCantidadJornadas(e.target.value)} placeholder="—" className={CAMPO} />
                  </div>
                  <div>
                    <label className={ETIQUETA}>Eliminatoria</label>
                    <select value={eliminatoria} onChange={(e) => setEliminatoria(e.target.value)} className={`${CAMPO} [color-scheme:dark]`}>
                      <option value="">—</option>
                      {ELIMINATORIAS.map((op) => <option key={op} value={op}>{op}</option>)}
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2 md:col-span-2">
                  {[
                    { etiqueta: "C. liga", valor: costoLiga, set: setCostoLiga },
                    { etiqueta: "C. profesor", valor: costoProfesor, set: setCostoProfesor },
                    { etiqueta: "C. árbitro", valor: costoArbitro, set: setCostoArbitro },
                  ].map((c) => (
                    <div key={c.etiqueta}>
                      <label className={ETIQUETA}>{c.etiqueta}</label>
                      <input type="number" min={0} step="0.01" value={c.valor} onChange={(e) => c.set(e.target.value)} placeholder="0" className={CAMPO} />
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* ── Las categorías ── */}
            <div className="bg-white/5 border border-white/10 rounded-2xl p-5">
              <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                <div className="flex items-center gap-2">
                  <Users size={15} className="text-blue-400" />
                  <h3 className="text-xs font-black text-white uppercase tracking-widest">
                    Categorías ({renglones.length})
                  </h3>
                  {nuevos > 0 && (
                    <span className="text-[10px] font-bold text-emerald-300">{nuevos} nueva(s)</span>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <div className="w-64">
                    <BuscadorIncremental
                      etiqueta=""
                      placeholder="Agregar categoría..."
                      opciones={opcionesCategoria}
                      valor={null}
                      onChange={(op) => { if (op) setRenglones((prev) => [...prev, nuevoRenglon(op.valor)]); }}
                      permiteNuevo
                    />
                  </div>
                  <button
                    onClick={agregar}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white/5 border border-white/15 text-slate-200 text-xs font-bold hover:bg-white/10 transition-colors"
                  >
                    <Plus size={13} /> Renglón vacío
                  </button>
                </div>
              </div>

              {cargandoTorneo ? (
                <div className="flex items-center gap-2 py-10 justify-center text-slate-400">
                  <Loader2 size={18} className="animate-spin text-blue-500" />
                  <span className="text-xs font-bold">Cargando las categorías del torneo...</span>
                </div>
              ) : renglones.length === 0 ? (
                <div className="py-12 text-center border border-dashed border-white/15 rounded-xl">
                  <p className="text-sm font-bold text-slate-300">Todavía no hay categorías</p>
                  <p className="text-xs text-slate-500 mt-1">
                    Búscalas arriba y se van agregando como renglones, con los valores del torneo ya puestos.
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto rounded-xl border border-white/10">
                  <table className="w-full text-left min-w-[1180px]">
                    <thead className="bg-white/5 text-[9px] uppercase font-black text-slate-500 tracking-widest">
                      <tr>
                        <th className="px-3 py-2.5">Categoría</th>
                        <th className="px-3 py-2.5">Color</th>
                        <th className="px-3 py-2.5">Profesor</th>
                        <th className="px-3 py-2.5">Inicio</th>
                        <th className="px-3 py-2.5">Fin</th>
                        <th className="px-3 py-2.5">Jorn.</th>
                        <th className="px-3 py-2.5">Eliminatoria</th>
                        <th className="px-3 py-2.5 text-right">C. liga</th>
                        <th className="px-3 py-2.5 text-right">C. prof.</th>
                        <th className="px-3 py-2.5 text-right">C. árb.</th>
                        <th className="px-3 py-2.5 text-center">Jug.</th>
                        <th className="px-3 py-2.5" />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {renglones.map((r) => (
                        <tr key={r.id} className={`transition-colors ${r.original ? "" : "bg-emerald-500/[0.04]"} hover:bg-white/[0.03]`}>
                          <td className="px-3 py-2 min-w-[150px]">
                            {r.original ? (
                              <div>
                                <span className="text-xs font-bold text-slate-200">{r.categoria}</span>
                                {r.cerrada && (
                                  <span className="ml-1.5 text-[9px] font-black uppercase tracking-widest text-rose-300">Cerrada</span>
                                )}
                              </div>
                            ) : (
                              <input
                                value={r.categoria}
                                onChange={(e) => cambiar(r.id, "categoria", e.target.value.toUpperCase())}
                                list="categorias-existentes"
                                placeholder="Categoría"
                                className={CELDA}
                              />
                            )}
                            {r.resultado && (
                              <span
                                title={r.resultado.mensaje}
                                className={`inline-block mt-1 text-[9px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded border ${ESTILO_ESTADO[r.resultado.estado]}`}
                              >
                                {ETIQUETA_ESTADO[r.resultado.estado]}
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-2 w-24">
                            <input
                              value={r.color}
                              onChange={(e) => cambiar(r.id, "color", e.target.value.toUpperCase())}
                              placeholder="—"
                              className={CELDA}
                            />
                          </td>
                          <td className="px-3 py-2 min-w-[130px]">
                            <select
                              value={r.idProfesor}
                              onChange={(e) => cambiar(r.id, "idProfesor", e.target.value)}
                              className={`${CELDA} [color-scheme:dark]`}
                            >
                              <option value="">Sin asignar</option>
                              {profesores.map((p) => (
                                <option key={p.IdUsuario} value={p.IdUsuario}>{p.Usuario}</option>
                              ))}
                            </select>
                          </td>
                          <td className="px-3 py-2 w-32">
                            <input type="date" value={r.fechaInicio} onChange={(e) => cambiar(r.id, "fechaInicio", e.target.value)} className={`${CELDA} [color-scheme:dark]`} />
                          </td>
                          <td className="px-3 py-2 w-32">
                            <input type="date" value={r.fechaFin} onChange={(e) => cambiar(r.id, "fechaFin", e.target.value)} className={`${CELDA} [color-scheme:dark]`} />
                          </td>
                          <td className="px-3 py-2 w-16">
                            <input type="number" min={0} value={r.cantidadJornadas} onChange={(e) => cambiar(r.id, "cantidadJornadas", e.target.value)} placeholder="—" className={`${CELDA} text-center`} />
                          </td>
                          <td className="px-3 py-2 w-32">
                            <select
                              value={r.eliminatoria}
                              onChange={(e) => cambiar(r.id, "eliminatoria", e.target.value)}
                              className={`${CELDA} [color-scheme:dark]`}
                            >
                              <option value="">—</option>
                              {ELIMINATORIAS.map((op) => <option key={op} value={op}>{op}</option>)}
                            </select>
                          </td>
                          {([
                            ["costoLiga", r.costoLiga],
                            ["costoProfesor", r.costoProfesor],
                            ["costoArbitro", r.costoArbitro],
                          ] as const).map(([campo, valor]) => (
                            <td key={campo} className="px-3 py-2 w-24">
                              <input
                                type="number"
                                min={0}
                                step="0.01"
                                value={valor}
                                onChange={(e) => cambiar(r.id, campo, e.target.value)}
                                placeholder="0"
                                className={`${CELDA} text-right`}
                              />
                            </td>
                          ))}
                          <td className="px-3 py-2 text-center">
                            <span
                              title={r.original ? "Jugadores convocados" : "Jugadores activos de la categoría"}
                              className="text-xs font-bold text-slate-300 tabular-nums"
                            >
                              {r.original ? r.convocados ?? 0 : conteoPorCategoria[r.categoria.trim()] ?? "—"}
                            </span>
                          </td>
                          <td className="px-3 py-2">
                            <div className="flex items-center justify-end gap-1">
                              <button
                                onClick={() => duplicar(r.id)}
                                title="Duplicar como categoría nueva (para otro color)"
                                className="p-1.5 rounded-lg text-slate-400 hover:text-blue-300 hover:bg-blue-500/10 transition-colors"
                              >
                                <Copy size={13} />
                              </button>
                              {!r.original && (
                                <button
                                  onClick={() => quitar(r.id)}
                                  title="Quitar el renglón"
                                  className="p-1.5 rounded-lg text-slate-400 hover:text-rose-300 hover:bg-rose-500/10 transition-colors"
                                >
                                  <Trash2 size={13} />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <datalist id="categorias-existentes">
                    {categorias.map((c) => <option key={c} value={c} />)}
                  </datalist>
                </div>
              )}

              <p className="text-[10px] text-slate-500 mt-3">
                Los renglones con fondo verde son nuevos; los demás ya existen y solo se actualizan si los
                cambias. La categoría de un renglón existente no se edita —es su identidad—: para moverla,
                duplícala y borra la anterior desde la pantalla de convocatorias.
              </p>
            </div>

          </div>
        </div>
      </main>
    </DashboardLayout>
  );
}

export default function TorneoPage() {
  return (
    <Suspense fallback={null}>
      <TorneoContenido />
    </Suspense>
  );
}
