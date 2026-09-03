"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import DashboardLayout from "@/components/DashboardLayout";
import { usePuedeVer, useUser } from "@/contexts/user-context";
import {
  ArrowLeft, Check, ChevronRight, Clock3, Goal, Loader2, MapPin, Plus, Search,
  Pencil, ShieldCheck, Shirt, Sparkles, UserRound, Users, X,
} from "lucide-react";

type Equipo = {
  IdEquipo: number;
  Equipo: string;
  AnioInicio: number | null;
  AnioFin: number | null;
  Serie: string | null;
  IdSede: number | null;
  Sede: string | null;
  IdEntrenador: number | null;
  Coach: string | null;
  IdTipoEquipo: number | null;
  TipoEquipo: string | null;
  Genero: number | null;
  Cupo: number;
  EsSelectivo: number;
  EsCompetencia: number;
  IdLiga: number;
  Liga: string | null;
  Jugadores: number;
  LunesStr: string | null;
  MartesStr: string | null;
  MiercolesStr: string | null;
  JuevesStr: string | null;
  ViernesStr: string | null;
  SabadoStr: string | null;
  DomingoStr: string | null;
};

type Opcion = Record<string, number | string>;
type Catalogos = {
  equipos: Equipo[];
  sedes: Opcion[];
  entrenadores: Opcion[];
  tipos: Opcion[];
  ligas: Opcion[];
};
type Modo = "entrenamiento" | "competencia";
type GeneroFiltro = 1 | 2 | 3 | null;

const DIAS = [
  ["LunesStr", "Lun"], ["MartesStr", "Mar"], ["MiercolesStr", "Mié"],
  ["JuevesStr", "Jue"], ["ViernesStr", "Vie"], ["SabadoStr", "Sáb"],
  ["DomingoStr", "Dom"],
] as const;

const GENEROS = {
  1: { nombre: "Masculino", fondo: "from-sky-700 to-blue-950", borde: "border-sky-400/55", texto: "text-sky-200", punto: "bg-sky-400" },
  2: { nombre: "Femenino", fondo: "from-fuchsia-700 to-rose-950", borde: "border-fuchsia-400/55", texto: "text-fuchsia-200", punto: "bg-fuchsia-400" },
  3: { nombre: "Mixto", fondo: "from-violet-700 to-indigo-950", borde: "border-violet-400/55", texto: "text-violet-200", punto: "bg-violet-400" },
} as const;

const CONTROL = "w-full rounded-xl border border-white/15 bg-slate-950/60 px-3 py-2.5 text-sm text-slate-100 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-500/20 disabled:opacity-45";
const LABEL = "mb-1.5 block text-[10px] font-black uppercase tracking-[0.16em] text-slate-400";

function valoresIniciales() {
  const anio = new Date().getFullYear();
  return {
    modo: "entrenamiento" as Modo, anioInicio: anio, anioFin: anio, serie: "",
    idSede: 0, idEntrenador: 0, idTipoEquipo: 0, genero: 3, cupo: 0,
    esSelectivo: false, idLiga: 0,
    horarios: Object.fromEntries(DIAS.map(([campo]) => [campo, { activo: false, inicio: "17:00", fin: "18:30" }])) as Record<string, { activo: boolean; inicio: string; fin: string }>,
  };
}

function valoresDeEquipo(equipo: Equipo) {
  const horarios = Object.fromEntries(DIAS.map(([campo]) => {
    const valor = equipo[campo]?.trim() ?? "";
    const partes = valor.match(/^(\d{2}:\d{2}) - (\d{2}:\d{2})$/);
    return [campo, {
      activo: Boolean(partes),
      inicio: partes?.[1] ?? "17:00",
      fin: partes?.[2] ?? "18:30",
    }];
  })) as Record<string, { activo: boolean; inicio: string; fin: string }>;
  return {
    modo: (equipo.EsCompetencia === 1 ? "competencia" : "entrenamiento") as Modo,
    anioInicio: equipo.AnioInicio ?? new Date().getFullYear(),
    anioFin: equipo.AnioFin ?? equipo.AnioInicio ?? new Date().getFullYear(),
    serie: equipo.Serie ?? "",
    idSede: equipo.IdSede ?? 0,
    idEntrenador: equipo.IdEntrenador ?? 0,
    idTipoEquipo: equipo.IdTipoEquipo ?? 0,
    genero: equipo.Genero ?? 3,
    cupo: equipo.Cupo,
    esSelectivo: equipo.EsSelectivo === 1,
    idLiga: equipo.IdLiga ?? 0,
    horarios,
  };
}

export default function EquiposPage() {
  const router = useRouter();
  const { user, isInitialized } = useUser();
  const puedeVer = usePuedeVer("/administracion-deportiva/equipos");
  const [catalogos, setCatalogos] = useState<Catalogos | null>(null);
  const [genero, setGenero] = useState<GeneroFiltro>(null);
  const [busqueda, setBusqueda] = useState("");
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [altaAbierta, setAltaAbierta] = useState(false);
  const [equipoEditando, setEquipoEditando] = useState<Equipo | null>(null);
  const [sedeSeleccionada, setSedeSeleccionada] = useState<string | null>(null);

  useEffect(() => {
    if (isInitialized && !user) router.push("/login");
  }, [isInitialized, user, router]);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      const respuesta = await fetch("/api/administracion-deportiva/catalogo-equipos", { cache: "no-store" });
      const json = await respuesta.json();
      if (!respuesta.ok || !json.success) throw new Error(json.message || "No se pudo cargar el catálogo.");
      setCatalogos(json.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo cargar el catálogo.");
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    if (user && puedeVer) cargar();
  }, [user, puedeVer, cargar]);

  const gruposSede = useMemo(() => {
    const consulta = busqueda.trim().toLocaleLowerCase("es-MX");
    const agrupadas = new Map<string, { todos: Equipo[]; visibles: Equipo[] }>();
    for (const sede of catalogos?.sedes ?? []) {
      agrupadas.set(String(sede.Sede), { todos: [], visibles: [] });
    }
    for (const equipo of catalogos?.equipos ?? []) {
      const sede = equipo.Sede?.trim() || "Sin sede asignada";
      const grupo = agrupadas.get(sede) ?? { todos: [], visibles: [] };
      grupo.todos.push(equipo);
      const coincideGenero = genero === null || equipo.Genero === genero;
      const coincideBusqueda = !consulta || [equipo.Equipo, equipo.Sede, equipo.Coach, equipo.TipoEquipo, equipo.Liga]
        .some((valor) => String(valor ?? "").toLocaleLowerCase("es-MX").includes(consulta));
      if (coincideGenero && coincideBusqueda) grupo.visibles.push(equipo);
      agrupadas.set(sede, grupo);
    }
    return [...agrupadas.entries()].sort(([a], [b]) => a.localeCompare(b, "es"));
  }, [catalogos, genero, busqueda]);

  const sedes = useMemo(() => {
    const consulta = busqueda.trim().toLocaleLowerCase("es-MX");
    return gruposSede.filter(([sede, grupo]) =>
      !consulta || grupo.visibles.length > 0 || sede.toLocaleLowerCase("es-MX").includes(consulta),
    );
  }, [gruposSede, busqueda]);
  const sedeActiva = gruposSede.find(([sede]) => sede === sedeSeleccionada);

  const abrirPlantilla = (equipo: Equipo) => {
    const anio = equipo.AnioInicio && equipo.AnioFin && equipo.AnioFin !== equipo.AnioInicio
      ? `${equipo.AnioInicio}-${equipo.AnioFin}`
      : String(equipo.AnioInicio ?? "");
    const params = new URLSearchParams({
      sedeId: String(equipo.IdSede ?? 0),
      categoria: anio,
      equipoId: String(equipo.IdEquipo),
    });
    router.push(`/administracion-deportiva/plantillas?${params}`);
  };

  return (
    <DashboardLayout>
      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-[1680px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          <header className="relative mb-7 overflow-hidden rounded-[28px] border border-white/10 bg-slate-950/45 px-5 py-6 shadow-2xl sm:px-8">
            <div className="pointer-events-none absolute -right-16 -top-24 h-64 w-64 rounded-full bg-blue-500/15 blur-3xl" />
            <div className="relative flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <div className="mb-3 flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.22em] text-blue-300">
                  <Shirt size={15} /> Administración deportiva
                </div>
                <h1 className="text-3xl font-black tracking-tight text-white sm:text-4xl">Equipos por sede</h1>
                <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-400">
                  El mapa operativo de categorías, entrenadores y horarios del club.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setAltaAbierta(true)}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-500 px-5 py-3 text-sm font-black text-white shadow-lg shadow-blue-950/40 transition hover:bg-blue-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-300"
              >
                <Plus size={18} strokeWidth={3} /> Dar de alta equipo
              </button>
            </div>
          </header>

          <section className="mb-6 flex flex-col gap-3 rounded-2xl border border-white/10 bg-white/[0.04] p-3 md:flex-row md:items-center md:justify-between">
            <div className="grid grid-cols-4 rounded-xl bg-slate-950/55 p-1">
              {([
                [null, "Todos"], [1, "Niños"], [2, "Niñas"], [3, "Mixto"],
              ] as [GeneroFiltro, string][]).map(([valor, etiqueta]) => (
                <button
                  key={etiqueta}
                  type="button"
                  onClick={() => setGenero(valor)}
                  className={`rounded-lg px-4 py-2 text-xs font-black transition ${genero === valor ? "bg-blue-500 text-white shadow" : "text-slate-400 hover:text-white"}`}
                >
                  {etiqueta}
                </button>
              ))}
            </div>
            <div className="flex flex-1 flex-col gap-3 sm:flex-row sm:items-center sm:justify-end">
              <label className="relative block w-full sm:max-w-xs">
                <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                <input
                  value={busqueda}
                  onChange={(e) => setBusqueda(e.target.value)}
                  placeholder="Buscar equipo, sede o coach…"
                  className="w-full rounded-xl border border-white/10 bg-slate-950/55 py-2.5 pl-10 pr-9 text-xs text-white outline-none placeholder:text-slate-500 focus:border-blue-400"
                />
                {busqueda && <button type="button" onClick={() => setBusqueda("")} className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-slate-500 hover:text-white"><X size={14} /></button>}
              </label>
            </div>
          </section>

          {aviso && (
            <div className="mb-5 flex items-center justify-between rounded-xl border border-emerald-400/25 bg-emerald-500/10 px-4 py-3 text-sm font-bold text-emerald-200">
              <span className="flex items-center gap-2"><Check size={17} />{aviso}</span>
              <button type="button" onClick={() => setAviso(null)} className="p-1"><X size={15} /></button>
            </div>
          )}

          {cargando ? (
            <div className="flex min-h-64 items-center justify-center text-slate-400"><Loader2 className="mr-3 animate-spin" /> Cargando equipos…</div>
          ) : error ? (
            <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 p-8 text-center">
              <p className="font-bold text-rose-200">{error}</p>
              <button type="button" onClick={cargar} className="mt-4 rounded-lg bg-white/10 px-4 py-2 text-sm font-bold hover:bg-white/15">Volver a intentar</button>
            </div>
          ) : (
            <div className="overflow-hidden">
              <div className={`flex w-[200%] items-start transition-transform duration-500 ease-[cubic-bezier(.22,1,.36,1)] motion-reduce:transition-none ${sedeSeleccionada ? "-translate-x-1/2" : "translate-x-0"}`}>
                <section className={`w-1/2 shrink-0 pr-1 transition-opacity duration-300 ${sedeSeleccionada ? "pointer-events-none opacity-20" : "opacity-100"}`} aria-hidden={Boolean(sedeSeleccionada)}>
                  {sedes.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-white/15 py-20 text-center text-slate-400">
                      <Goal size={34} className="mx-auto mb-3 text-slate-600" />
                      <p className="font-bold">No hay equipos que coincidan.</p>
                      <p className="mt-1 text-xs">Prueba con otro género o limpia la búsqueda.</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
                      {sedes.map(([sede, equipos]) => (
                        <TarjetaSede
                          key={sede}
                          sede={sede}
                          cantidad={equipos.visibles.length}
                          onAbrir={() => setSedeSeleccionada(sede)}
                        />
                      ))}
                    </div>
                  )}
                </section>

                <section className={`w-1/2 shrink-0 pl-1 transition-opacity delay-150 duration-300 ${sedeSeleccionada ? "opacity-100" : "pointer-events-none opacity-0"}`} aria-hidden={!sedeSeleccionada}>
                  <div className="mb-5 flex flex-col gap-3 rounded-2xl border border-white/10 bg-slate-950/35 p-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-center gap-3">
                      <button type="button" onClick={() => setSedeSeleccionada(null)} className="inline-flex items-center gap-2 rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-xs font-black text-slate-200 transition hover:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400">
                        <ArrowLeft size={16} /> Regresar
                      </button>
                      <div>
                        <p className="text-[9px] font-black uppercase tracking-widest text-blue-300">Sede</p>
                        <h2 className="text-xl font-black text-white">{sedeSeleccionada}</h2>
                      </div>
                    </div>
                    <p className="text-xs font-bold text-slate-400">{sedeActiva?.[1].visibles.length ?? 0} equipos</p>
                  </div>
                  {sedeActiva && sedeActiva[1].visibles.length > 0 ? (
                    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                      {sedeActiva[1].visibles.map((equipo) => (
                        <CanchaEquipo key={equipo.IdEquipo} equipo={equipo} onAbrir={() => abrirPlantilla(equipo)} onEditar={() => setEquipoEditando(equipo)} />
                      ))}
                    </div>
                  ) : (
                    <div className="rounded-2xl border border-dashed border-white/15 py-16 text-center text-sm font-bold text-slate-500">
                      No hay equipos que coincidan con los filtros.
                    </div>
                  )}
                </section>
              </div>
            </div>
          )}
        </div>
      </main>

      {altaAbierta && catalogos && (
        <AltaEquipoModal
          catalogos={catalogos}
          modoInicial="entrenamiento"
          onCerrar={() => setAltaAbierta(false)}
          onGuardado={async (mensaje) => {
            setAltaAbierta(false);
            setAviso(mensaje);
            await cargar();
          }}
        />
      )}
      {equipoEditando && catalogos && (
        <AltaEquipoModal
          catalogos={catalogos}
          modoInicial={equipoEditando.EsCompetencia === 1 ? "competencia" : "entrenamiento"}
          equipo={equipoEditando}
          onCerrar={() => setEquipoEditando(null)}
          onGuardado={async (mensaje) => {
            setEquipoEditando(null);
            setAviso(mensaje);
            await cargar();
          }}
        />
      )}
    </DashboardLayout>
  );
}

function TarjetaSede({ sede, cantidad, onAbrir }: { sede: string; cantidad: number; onAbrir: () => void }) {
  return (
    <button
      type="button"
      onClick={onAbrir}
      className="group relative min-h-32 overflow-hidden rounded-2xl border border-white/10 bg-slate-950/40 p-4 text-left shadow-lg transition duration-200 hover:-translate-y-0.5 hover:border-blue-400/40 hover:bg-blue-950/45 hover:shadow-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
    >
      <MapPin size={16} className="absolute right-4 top-4 text-blue-400/50 transition group-hover:text-blue-300" />
      <b className="block text-5xl font-black leading-none tracking-tighter text-white tabular-nums">{cantidad}</b>
      <span className="mt-1 block text-[9px] font-black uppercase tracking-[0.18em] text-slate-500">{cantidad === 1 ? "equipo" : "equipos"}</span>
      <span className="mt-4 flex items-end justify-between gap-2">
        <strong className="line-clamp-2 text-xs font-black leading-tight text-slate-200">{sede}</strong>
        <ChevronRight size={15} className="shrink-0 text-slate-600 transition-transform group-hover:translate-x-0.5 group-hover:text-blue-300" />
      </span>
    </button>
  );
}

function CanchaEquipo({ equipo, onAbrir, onEditar }: { equipo: Equipo; onAbrir: () => void; onEditar: () => void }) {
  const genero = GENEROS[(equipo.Genero ?? 3) as keyof typeof GENEROS] ?? GENEROS[3];
  const dias = DIAS.filter(([campo]) => Boolean(equipo[campo]?.trim())).map(([campo, dia]) => `${dia} ${equipo[campo]}`);
  return (
    <article className={`group relative overflow-hidden rounded-2xl border ${genero.borde} bg-gradient-to-br ${genero.fondo} shadow-lg transition duration-200 hover:-translate-y-0.5 hover:shadow-2xl`}>
      <button type="button" onClick={onAbrir} title={`Abrir la plantilla de ${equipo.Equipo}`} className="block w-full text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-white/80">
      <div className="relative min-h-40 overflow-hidden p-4">
        <div className="pointer-events-none absolute inset-3 rounded-lg border border-white/25" />
        <div className="pointer-events-none absolute inset-y-3 left-1/2 border-l border-white/25" />
        <div className="pointer-events-none absolute left-1/2 top-1/2 h-14 w-14 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/25" />
        <div className="pointer-events-none absolute -left-px top-1/2 h-16 w-8 -translate-y-1/2 border border-l-0 border-white/25" />
        <div className="pointer-events-none absolute -right-px top-1/2 h-16 w-8 -translate-y-1/2 border border-r-0 border-white/25" />
        <div className="relative z-10 flex items-start justify-between gap-2">
          <span className="rounded-full border border-white/20 bg-black/20 px-2 py-1 text-[9px] font-black uppercase tracking-widest text-white/80">{genero.nombre}</span>
          {equipo.EsSelectivo === 1 && <span title="Equipo selectivo" className="mr-10 rounded-full border border-amber-300/30 bg-amber-300/15 p-1.5 text-amber-200"><Sparkles size={12} /></span>}
        </div>
        <div className="relative z-10 flex min-h-24 items-center justify-center px-5 text-center">
          <h3 className="break-words text-3xl font-black leading-none tracking-tight text-white drop-shadow-lg">{equipo.Equipo}</h3>
        </div>
        {equipo.Liga && <p className="relative z-10 truncate text-center text-[10px] font-black uppercase tracking-widest text-white/70">{equipo.Liga}</p>}
      </div>
      <div className="border-t border-white/15 bg-slate-950/45 px-4 py-3">
        <div className="flex items-center justify-between gap-3 text-[10px] font-bold text-slate-300">
          <span className="flex min-w-0 items-center gap-1.5 truncate"><UserRound size={13} className={genero.texto} />{equipo.Coach || "Sin coach"}</span>
          <span className="shrink-0">{equipo.TipoEquipo || "Sin tipo"}</span>
        </div>
        <div className="mt-2 flex items-center justify-between gap-3 text-[10px] text-slate-400">
          <span className="flex items-center gap-1.5"><Users size={13} />{equipo.Jugadores}{equipo.Cupo > 0 ? ` / ${equipo.Cupo}` : ""}</span>
          <span title={dias.join(" · ")} className="flex min-w-0 items-center gap-1.5 truncate"><Clock3 size={13} />{dias.length ? `${dias.length} días` : "Sin horario"}</span>
        </div>
      </div>
      </button>
      <button
        type="button"
        onClick={onEditar}
        title={`Editar ${equipo.Equipo}`}
        aria-label={`Editar ${equipo.Equipo}`}
        className="absolute right-3 top-3 z-20 rounded-lg border border-white/25 bg-slate-950/70 p-2 text-white shadow-lg backdrop-blur transition hover:scale-105 hover:bg-white hover:text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
      >
        <Pencil size={14} />
      </button>
    </article>
  );
}

function AltaEquipoModal({ catalogos, modoInicial, equipo, onCerrar, onGuardado }: {
  catalogos: Catalogos;
  modoInicial: Modo;
  equipo?: Equipo;
  onCerrar: () => void;
  onGuardado: (mensaje: string) => void | Promise<void>;
}) {
  const [form, setForm] = useState(() => equipo ? valoresDeEquipo(equipo) : { ...valoresIniciales(), modo: modoInicial });
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const nombre = `${form.anioInicio || ""}${form.anioFin !== form.anioInicio ? `-${form.anioFin || ""}` : ""}${form.serie.trim().toUpperCase()}`;

  useEffect(() => {
    const cerrar = (e: KeyboardEvent) => { if (e.key === "Escape" && !guardando) onCerrar(); };
    window.addEventListener("keydown", cerrar);
    return () => window.removeEventListener("keydown", cerrar);
  }, [guardando, onCerrar]);

  const cambiar = <K extends keyof typeof form>(campo: K, valor: (typeof form)[K]) => setForm((actual) => ({ ...actual, [campo]: valor }));

  const guardar = async (e: React.FormEvent) => {
    e.preventDefault();
    setGuardando(true);
    setError(null);
    const horarios = Object.fromEntries(Object.entries(form.horarios).map(([dia, h]) => [dia, h.activo ? `${h.inicio} - ${h.fin}` : ""]));
    try {
      const respuesta = await fetch("/api/administracion-deportiva/catalogo-equipos", {
        method: equipo ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, idEquipo: equipo?.IdEquipo, esCompetencia: form.modo === "competencia", horarios }),
      });
      const json = await respuesta.json();
      if (!respuesta.ok || !json.success) throw new Error(json.message || "No se pudo guardar el equipo.");
      await onGuardado(json.message);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar el equipo.");
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/80 p-3 backdrop-blur-sm" onMouseDown={(e) => { if (e.target === e.currentTarget && !guardando) onCerrar(); }}>
      <form onSubmit={guardar} className="max-h-[94vh] w-full max-w-4xl overflow-y-auto rounded-[26px] border border-white/15 bg-slate-900 shadow-2xl">
        <div className="sticky top-0 z-20 flex items-center justify-between gap-4 border-b border-white/10 bg-slate-900/95 px-5 py-4 backdrop-blur-xl sm:px-7">
          <div>
            <p className="text-[9px] font-black uppercase tracking-[0.2em] text-blue-300">{equipo ? "Edición" : "Nueva alta"}</p>
            <h2 className="text-xl font-black text-white">{equipo ? `Editar ${equipo.Equipo}` : "Crear equipo"}</h2>
          </div>
          <button type="button" onClick={onCerrar} disabled={guardando} aria-label="Cerrar" className="rounded-xl p-2 text-slate-400 hover:bg-white/10 hover:text-white disabled:opacity-40"><X size={20} /></button>
        </div>

        <div className="space-y-6 p-5 sm:p-7">
          <div className="grid gap-3 rounded-2xl border border-white/10 bg-slate-950/40 p-2 sm:grid-cols-2">
            {(["entrenamiento", "competencia"] as Modo[]).map((opcion) => (
              <button key={opcion} type="button" onClick={() => cambiar("modo", opcion)} className={`rounded-xl px-4 py-3 text-sm font-black capitalize transition ${form.modo === opcion ? "bg-blue-500 text-white" : "text-slate-400 hover:bg-white/5 hover:text-white"}`}>{opcion}</button>
            ))}
          </div>

          <section>
            <div className="mb-4 flex items-center gap-2"><Goal size={17} className="text-blue-300" /><h3 className="text-sm font-black text-white">Identidad de la categoría</h3></div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <label><span className={LABEL}>Año inicio *</span><input type="number" min="1900" max={new Date().getFullYear() + 5} required value={form.anioInicio} onChange={(e) => { const valor = Number(e.target.value); setForm((f) => ({ ...f, anioInicio: valor, anioFin: Math.max(valor, f.anioFin) })); }} className={CONTROL} /></label>
              <label><span className={LABEL}>Año fin *</span><input type="number" min={form.anioInicio} max={new Date().getFullYear() + 5} required value={form.anioFin} onChange={(e) => cambiar("anioFin", Number(e.target.value))} className={CONTROL} /></label>
              <label><span className={LABEL}>Serie *</span><input maxLength={10} required value={form.serie} onChange={(e) => cambiar("serie", e.target.value.toUpperCase())} placeholder="A, FC, X…" className={CONTROL} /></label>
              <label><span className={LABEL}>Nombre generado</span><div className={`${CONTROL} flex min-h-[42px] items-center font-black text-blue-200`}>{nombre || "—"}</div></label>
            </div>
          </section>

          <section>
            <div className="mb-4 flex items-center gap-2"><ShieldCheck size={17} className="text-blue-300" /><h3 className="text-sm font-black text-white">Datos deportivos</h3></div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <SelectCatalogo label={`Sede ${form.modo === "entrenamiento" ? "*" : ""}`} value={form.idSede} onChange={(v) => cambiar("idSede", v)} opciones={catalogos.sedes} id="IdSede" texto="Sede" required={form.modo === "entrenamiento"} placeholder={form.modo === "competencia" ? "Sin sede asignada" : "Selecciona una sede"} />
              <SelectCatalogo label="Coach *" value={form.idEntrenador} onChange={(v) => cambiar("idEntrenador", v)} opciones={catalogos.entrenadores} id="IdUsuario" texto="Usuario" required placeholder="Selecciona un coach" />
              <SelectCatalogo label="Tipo de equipo *" value={form.idTipoEquipo} onChange={(v) => cambiar("idTipoEquipo", v)} opciones={catalogos.tipos} id="IdTipoEquipo" texto="TipoEquipo" required placeholder="Selecciona un tipo" />
              <label><span className={LABEL}>Género *</span><select value={form.genero} onChange={(e) => cambiar("genero", Number(e.target.value))} className={CONTROL}>{[1, 2, 3].map((g) => <option key={g} value={g}>{GENEROS[g as keyof typeof GENEROS].nombre}</option>)}</select></label>
              <label><span className={LABEL}>Cupo</span><input type="number" min="0" value={form.cupo} onChange={(e) => cambiar("cupo", Number(e.target.value))} className={CONTROL} /></label>
              {form.modo === "competencia" && <SelectCatalogo label="Liga *" value={form.idLiga} onChange={(v) => cambiar("idLiga", v)} opciones={catalogos.ligas} id="IdLiga" texto="Liga" required placeholder="Selecciona una liga" />}
            </div>
            <label className="mt-4 flex cursor-pointer items-center gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3">
              <input type="checkbox" checked={form.esSelectivo} onChange={(e) => cambiar("esSelectivo", e.target.checked)} className="h-4 w-4 accent-blue-500" />
              <span><b className="block text-sm text-slate-200">Equipo selectivo</b><small className="text-xs text-slate-500">Marca al equipo como grupo de selección.</small></span>
            </label>
          </section>

          {form.modo === "entrenamiento" && (
            <section>
              <div className="mb-4 flex items-center gap-2"><Clock3 size={17} className="text-blue-300" /><h3 className="text-sm font-black text-white">Horarios de entrenamiento</h3></div>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {DIAS.map(([campo, dia]) => {
                  const horario = form.horarios[campo];
                  return (
                    <div key={campo} className={`rounded-xl border p-3 transition ${horario.activo ? "border-blue-400/35 bg-blue-500/10" : "border-white/10 bg-white/[0.02]"}`}>
                      <label className="flex cursor-pointer items-center gap-2 text-xs font-black text-slate-200"><input type="checkbox" checked={horario.activo} onChange={(e) => cambiar("horarios", { ...form.horarios, [campo]: { ...horario, activo: e.target.checked } })} className="accent-blue-500" />{dia}</label>
                      <div className="mt-2 grid grid-cols-2 gap-2"><input aria-label={`Hora de inicio ${dia}`} type="time" disabled={!horario.activo} value={horario.inicio} onChange={(e) => cambiar("horarios", { ...form.horarios, [campo]: { ...horario, inicio: e.target.value } })} className={`${CONTROL} px-2 py-2 text-xs`} /><input aria-label={`Hora final ${dia}`} type="time" disabled={!horario.activo} value={horario.fin} onChange={(e) => cambiar("horarios", { ...form.horarios, [campo]: { ...horario, fin: e.target.value } })} className={`${CONTROL} px-2 py-2 text-xs`} /></div>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {error && <p role="alert" className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm font-bold text-rose-200">{error}</p>}
        </div>
        <div className="sticky bottom-0 z-20 flex justify-end gap-3 border-t border-white/10 bg-slate-900/95 px-5 py-4 backdrop-blur-xl sm:px-7">
          <button type="button" onClick={onCerrar} disabled={guardando} className="rounded-xl px-5 py-2.5 text-sm font-bold text-slate-400 hover:bg-white/5 hover:text-white disabled:opacity-40">Cancelar</button>
          <button type="submit" disabled={guardando} className="inline-flex items-center gap-2 rounded-xl bg-blue-500 px-5 py-2.5 text-sm font-black text-white hover:bg-blue-400 disabled:opacity-50">{guardando ? <Loader2 size={17} className="animate-spin" /> : equipo ? <Check size={17} /> : <Plus size={17} />}{guardando ? "Guardando…" : equipo ? "Guardar cambios" : "Crear equipo"}</button>
        </div>
      </form>
    </div>
  );
}

function SelectCatalogo({ label, value, onChange, opciones, id, texto, required, placeholder }: {
  label: string; value: number; onChange: (valor: number) => void; opciones: Opcion[];
  id: string; texto: string; required?: boolean; placeholder: string;
}) {
  return <label><span className={LABEL}>{label}</span><select required={required} value={value || ""} onChange={(e) => onChange(Number(e.target.value))} className={CONTROL}><option value="">{placeholder}</option>{opciones.map((opcion) => <option key={Number(opcion[id])} value={Number(opcion[id])}>{String(opcion[texto])}</option>)}</select></label>;
}
