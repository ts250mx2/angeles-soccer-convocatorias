"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useUser, usePuedeVer } from "@/contexts/user-context";
import DashboardLayout from "@/components/DashboardLayout";
import CanchaPlantilla, { nombreCorto } from "@/components/CanchaPlantilla";
import {
  AlertCircle, ArrowRightLeft, FileText, Goal, LayoutGrid, Loader2, RotateCcw, Save,
  Users, Wand2,
} from "lucide-react";
import TransferirJugador from "@/components/TransferirJugador";
import AvatarJugador from "@/components/AvatarJugador";
import PlayerPagosModal, { type PagosTarget } from "@/components/PlayerPagosModal";
import { partirCategoria } from "@/lib/categoria-equipo";
import {
  COLOR_BECA, acomodoPorOmision, acota, etiquetaBeca,
  type JugadorPlantilla, type Plantilla,
} from "@/lib/plantilla-equipo";
import { exportarPlantillaPdf } from "@/lib/plantilla-export";
import { guardarEquipoRecordado, leerEquipoRecordado } from "@/lib/equipo-recordado";

/**
 * Plantilla de Equipos: la hoja del equipo, con su gente y el acomodo en la cancha.
 *
 * Se elige el equipo en dos pasos —primero el año y luego la letra— porque así está
 * escrito el nombre del equipo en la base ('2018X', '2012FC', '2009-2010F') y así lo
 * busca quien lo tiene en la cabeza: primero "los 2018" y después "el X". Un solo
 * desplegable con todos los equipos obligaría a leerlos todos.
 *
 * Y solo se ofrecen los que tienen gente INSCRITA en la temporada elegida: de los 346
 * equipos vigentes del catálogo, en una temporada cualquiera llegan con alguien poco
 * más de cien. Los otros doscientos y pico son grupos de años anteriores que nadie
 * disolvió, y elegir uno solo lleva a una hoja sin nadie que acomodar. Por eso cambiar
 * de temporada vuelve a pedir la lista al servidor en vez de filtrar aquí: la regla de
 * quién está inscrito es la de Inscripciones, y vive allá.
 *
 * El acomodo se edita en el navegador y se manda completo al guardar, no en cada
 * arrastre: acomodar son quince movimientos seguidos, y una petición por movimiento
 * sería una tormenta de escrituras que además se cruzan entre sí.
 *
 * La cancha es de los INSCRITOS en la temporada elegida —son los que juegan— y los
 * demás viven en su propia pestaña, a la vista pero fuera del acomodo. La inscripción
 * usa la MISMA regla que Inscripciones y la Lista de Jugadores, así que los números
 * coinciden con los de aquellas pantallas.
 *
 * OJO con una asimetría que es fácil romper: las posiciones son del EQUIPO y no de la
 * temporada (tblEquiposPlantilla no la guarda). Cambiar de temporada mueve nombres entre
 * pestañas, nunca el acomodo. Y como el guardado REEMPLAZA el acomodo completo, al
 * guardar se mandan también las posiciones de los no inscritos, que no se pintan: si se
 * omitieran, cambiar de temporada y guardar les borraría el lugar sin que nadie lo pida.
 */

interface EquipoOpcion {
  IdEquipo: number;
  Equipo: string;
  Sede: string | null;
  Coach: string | null;
  Jugadores: number;
}

interface UsuarioOpcion {
  IdUsuario: number;
  Usuario: string;
}

interface Temporada {
  IdTemporada: number;
  Temporada: string;
  EsActiva: boolean;
}

/** Las dos pestañas del listado. La cancha es siempre la de los inscritos. */
type Pestania = "inscritos" | "no-inscritos";

const SELECT =
  "appearance-none bg-white/5 border border-white/15 text-slate-200 text-xs py-2 pl-3 pr-8 rounded-lg leading-tight focus:outline-none focus:border-blue-500 [color-scheme:dark] disabled:opacity-40";

/* Cada selector va rotulado. Los del equipo se leen '2018' y 'X': sin el rótulo encima
   no se sabe cuál es la categoría y cuál el equipo hasta desplegarlos. */
const ETIQUETA_SELECT =
  "block mb-1 text-[9px] font-black text-slate-400 uppercase tracking-widest";

export default function PlantillasPage() {
  const router = useRouter();
  const { user, isInitialized } = useUser();
  const puedeVer = usePuedeVer("/administracion-deportiva/plantillas");

  /* El catálogo de equipos, junto con la temporada de la que salió. Van pegados porque
     entre que se cambia la temporada y llega su lista hay un momento en que lo que se
     tiene en pantalla es la lista ANTERIOR, y actuar sobre ella —soltar la selección,
     cargar una hoja— sería decidir con datos que ya no valen. Guardar de cuál es evita
     tener que adivinarlo, y de paso deja la lista vieja a la vista mientras carga la
     nueva, en vez de parpadear en blanco. */
  const [equipos, setEquipos] = useState<{ temporadaId: number; lista: EquipoOpcion[] }>(
    { temporadaId: 0, lista: [] },
  );
  const [usuarios, setUsuarios] = useState<UsuarioOpcion[]>([]);
  const [temporadas, setTemporadas] = useState<Temporada[]>([]);
  const [temporadaId, setTemporadaId] = useState<number | null>(null);
  const [anio, setAnio] = useState("");
  const [idEquipo, setIdEquipo] = useState<number | null>(null);
  const [pestania, setPestania] = useState<Pestania>("inscritos");
  const [transfiriendo, setTransfiriendo] = useState(false);
  /* El historial de pagos: el MISMO modal de Inscripciones, Adeudos y la Lista de
     Jugadores. Se reutiliza en vez de hacer uno propio para que los pagos de un niño se
     vean y se corrijan igual desde donde se abran. */
  const [pagosTarget, setPagosTarget] = useState<PagosTarget | null>(null);
  /** Lo que acaba de pasar, para confirmarlo sin un alert que interrumpa. */
  const [aviso, setAviso] = useState<string | null>(null);

  const [plantilla, setPlantilla] = useState<Plantilla | null>(null);
  const [cargando, setCargando] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /* Hay cambios sin guardar. Se enciende con cada movimiento y se apaga al guardar o al
     recargar; es lo que hace que el botón Guardar se note y que avisemos al salir. */
  const [sucio, setSucio] = useState(false);

  useEffect(() => {
    if (isInitialized && !user) router.push("/login");
  }, [user, isInitialized, router]);

  /* Las temporadas y los usuarios del auxiliar. Van aparte de los equipos porque no
     dependen de nada: se piden una vez y ahí se quedan. */
  /* Se levanta cuando la carga de temporadas ya intentó restaurar, con o sin éxito.
     Va en un ref y no en estado: solo decide si el efecto de abajo puede escribir, y
     como estado provocaría un render de más sin cambiar nada de lo que se pinta. */
  const yaSeIntentoRestaurar = useRef(false);

  useEffect(() => {
    if (!user || !puedeVer) return;
    (async () => {
      try {
        const [resUsuarios, resTemporadas] = await Promise.all([
          fetch("/api/users"),
          fetch("/api/inscripciones/temporadas"),
        ]);
        const jsonUsuarios = await resUsuarios.json();
        const jsonTemporadas = await resTemporadas.json();
        if (jsonUsuarios.success) setUsuarios(jsonUsuarios.data);
        if (jsonTemporadas.success) {
          setTemporadas(jsonTemporadas.data);
          /* Se retoma el equipo que se estaba viendo —también el elegido en la hoja de
             Asistencia, que comparte la memoria—. Si no hay nada guardado arranca en la
             vigente, que es la que se consulta el 99% de las veces. La temporada
             guardada solo se acepta si sigue en el catálogo; si no, se cae a la activa y
             la validación de más abajo suelta el equipo por su cuenta. */
          const recordado = leerEquipoRecordado();
          const existe = recordado
            && (jsonTemporadas.data as Temporada[]).some((t) => t.IdTemporada === recordado.temporadaId);
          setTemporadaId(existe ? recordado!.temporadaId : jsonTemporadas.temporadaActiva);
          if (existe) {
            setAnio(recordado!.anio);
            setIdEquipo(recordado!.idEquipo);
          }
        }
        // A partir de aquí ya se puede recordar lo que el usuario elija.
        yaSeIntentoRestaurar.current = true;
      } catch {
        setError("Error de conexión");
      }
    })();
  }, [user, puedeVer]);

  /* Recordar el equipo para la próxima visita, y para la otra hoja del mismo equipo.
     Es un efecto sin setState: solo pone al día el almacenamiento del navegador.

     El candado NO es un detalle: este efecto corre también en el primer render, cuando
     todavía no hay nada elegido porque las temporadas ni han llegado. Sin él escribía
     `null` —o sea, BORRABA lo recordado— justo antes de que la carga de temporadas
     alcanzara a leerlo, y la selección no volvía nunca. */
  useEffect(() => {
    if (!yaSeIntentoRestaurar.current) return;
    guardarEquipoRecordado(
      temporadaId && idEquipo ? { temporadaId, anio, idEquipo } : null,
    );
  }, [temporadaId, anio, idEquipo]);

  /* Los equipos de los selectores, que SÍ dependen de la temporada: solo se ofrecen los
     que tienen gente inscrita en ella. Por eso se vuelven a pedir al cambiarla, en vez
     de traer la lista completa una vez y filtrarla aquí: quién está inscrito lo decide
     una regla que vive en el servidor y que comparten Inscripciones y la Lista de
     Jugadores, y copiarla al navegador la dejaría a la deriva. */
  useEffect(() => {
    if (!user || !puedeVer || !temporadaId) return;
    let vigente = true;
    (async () => {
      try {
        const res = await fetch(
          `/api/administracion-deportiva/equipos?temporadaId=${temporadaId}`,
          { cache: "no-store" },
        );
        const json = await res.json();
        if (!vigente) return;
        if (json.success) setEquipos({ temporadaId, lista: json.data });
        else setError(json.message ?? "Error al cargar los equipos");
      } catch {
        if (vigente) setError("Error de conexión");
      }
    })();
    // Cambiar de temporada dos veces seguidas puede contestar en desorden.
    return () => { vigente = false; };
  }, [user, puedeVer, temporadaId]);

  /** La lista que se está viendo ya es la de la temporada elegida, no la de la anterior. */
  const listaAlDia = equipos.temporadaId === temporadaId;

  /* Los años, sacados del nombre del equipo con la misma regla que usa el resto de la
     aplicación para partir una categoría. */
  const anios = useMemo(
    () =>
      [...new Set(equipos.lista.map((e) => partirCategoria(e.Equipo).anio).filter(Boolean))].sort(
        (a, b) => b.localeCompare(a),
      ),
    [equipos],
  );

  /** Los equipos del año elegido: es la lista del segundo selector, la de las letras. */
  const letras = useMemo(
    () => (anio ? equipos.lista.filter((e) => partirCategoria(e.Equipo).anio === anio) : []),
    [equipos, anio],
  );

  /* Al cambiar de temporada la lista se encoge, y lo que estaba elegido puede haber
     dejado de existir en ella. Se suelta la selección huérfana en vez de dejarla puesta:
     un selector que enseña un equipo que ya no está entre sus opciones se ve en blanco y
     no hay forma de saber qué se está mirando. */
  useEffect(() => {
    if (!listaAlDia) return;
    if (anio && !anios.includes(anio)) {
      setAnio("");
      setIdEquipo(null);
      return;
    }
    if (idEquipo && !equipos.lista.some((e) => e.IdEquipo === idEquipo)) setIdEquipo(null);
  }, [listaAlDia, equipos, anios, anio, idEquipo]);

  const cargar = useCallback(async (id: number, idTemporada: number) => {
    setCargando(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/administracion-deportiva/plantillas?idEquipo=${id}&temporadaId=${idTemporada}`,
        { cache: "no-store" },
      );
      const json = await res.json();
      if (json.success) {
        setPlantilla(json.data);
        setSucio(false);
      } else {
        setError(json.message ?? "Error al cargar la plantilla");
        setPlantilla(null);
      }
    } catch {
      setError("Error de conexión");
      setPlantilla(null);
    } finally {
      setCargando(false);
    }
  }, []);

  /* Cambiar de temporada recarga: quién está inscrito depende de ella, y con ella
     cambia el reparto entre las dos pestañas. El acomodo NO cambia —las posiciones son
     del equipo, no de la temporada—, así que lo que se ve moverse son los nombres entre
     pestañas, no los de la cancha. */
  useEffect(() => {
    if (!idEquipo || !temporadaId) { setPlantilla(null); return; }
    /* Con la lista todavía sin actualizar no se sabe si el equipo sigue ofreciéndose en
       esta temporada. Se espera: traer su hoja para tirarla un render después haría
       parpadear una plantilla que ya no va, y encima por una petición de más. */
    if (!listaAlDia) return;
    if (!equipos.lista.some((e) => e.IdEquipo === idEquipo)) { setPlantilla(null); return; }
    cargar(idEquipo, temporadaId);
  }, [idEquipo, temporadaId, listaAlDia, equipos, cargar]);

  /* Avisar antes de salir con cambios sin guardar. Es el único aviso posible: el acomodo
     vive en el navegador hasta que se aprieta Guardar. */
  useEffect(() => {
    if (!sucio) return;
    const alSalir = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", alSalir);
    return () => window.removeEventListener("beforeunload", alSalir);
  }, [sucio]);

  /** Cambia a un jugador de la plantilla que está en pantalla. */
  const cambiaJugador = (idJugador: number, cambio: Partial<JugadorPlantilla>) => {
    setPlantilla((prev) =>
      prev === null
        ? prev
        : {
            ...prev,
            jugadores: prev.jugadores.map((j) =>
              j.idJugador === idJugador ? { ...j, ...cambio } : j,
            ),
          },
    );
    setSucio(true);
  };

  /* El equipo, partido por inscripción en la temporada elegida. La cancha trabaja SOLO
     con los inscritos: son los que juegan esta temporada, y son los que se acomodan. */
  const inscritos = useMemo(
    () => plantilla?.jugadores.filter((j) => j.inscrito) ?? [],
    [plantilla],
  );
  const noInscritos = useMemo(
    () => plantilla?.jugadores.filter((j) => !j.inscrito) ?? [],
    [plantilla],
  );
  const listado = pestania === "inscritos" ? inscritos : noInscritos;

  const temporadaNombre =
    temporadas.find((t) => t.IdTemporada === temporadaId)?.Temporada ?? "";

  const enCancha = inscritos.filter((j) => j.x !== null);
  const enBanca = inscritos.filter((j) => j.x === null);

  /* No inscritos que TODAVÍA ocupan un lugar en la cancha: se acomodaron cuando sí
     estaban inscritos, o en otra temporada. No se pintan en el campo —la cancha es de
     los inscritos— pero su lugar se conserva al guardar, así que hay que poder verlos y
     liberarlos. Callarlos dejaría lugares ocupados por gente invisible. */
  const fantasmas = noInscritos.filter((j) => j.x !== null);

  /** Manda a la cancha a alguien de la banca, en el primer lugar libre del acomodo. */
  const mandarACancha = (idJugador: number) => {
    if (!plantilla) return;
    const puestos = acomodoPorOmision(inscritos.length);
    const ocupados = enCancha.map((j) => ({ x: j.x!, y: j.y! }));
    const libre =
      puestos.find((p) => !ocupados.some((o) => Math.abs(o.x - p.x) < 6 && Math.abs(o.y - p.y) < 6)) ??
      { x: 50, y: 50 };
    cambiaJugador(idJugador, { x: acota(libre.x), y: acota(libre.y) });
  };

  /** Reparte a los INSCRITOS por la cancha, de atrás hacia adelante. El punto de partida. */
  const acomodarTodos = () => {
    if (!plantilla) return;
    const puestos = acomodoPorOmision(inscritos.length);
    const lugarDe = new Map(inscritos.map((j, i) => [j.idJugador, puestos[i]]));
    setPlantilla({
      ...plantilla,
      jugadores: plantilla.jugadores.map((j) => {
        const lugar = lugarDe.get(j.idJugador);
        return lugar ? { ...j, x: acota(lugar.x), y: acota(lugar.y) } : j;
      }),
    });
    setSucio(true);
  };

  /** Saca de la cancha a los inscritos. A los no inscritos no los toca: no se ven aquí. */
  const vaciarCancha = () => {
    if (!plantilla) return;
    setPlantilla({
      ...plantilla,
      jugadores: plantilla.jugadores.map((j) => (j.inscrito ? { ...j, x: null, y: null } : j)),
    });
    setSucio(true);
  };

  const guardar = async () => {
    if (!plantilla) return;
    setGuardando(true);
    setError(null);
    try {
      const res = await fetch("/api/administracion-deportiva/plantillas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          idEquipo: plantilla.idEquipo,
          idEntrenador: plantilla.idEntrenador,
          idAuxiliar: plantilla.idAuxiliar,
          /* TODOS los colocados, no solo los de la cancha visible: el servidor
             reemplaza el acomodo completo, así que omitir a los no inscritos borraría
             su lugar en silencio. Ver el comentario del POST en la API. */
          posiciones: plantilla.jugadores
            .filter((j) => j.x !== null && j.y !== null)
            .map((j) => ({ idJugador: j.idJugador, x: j.x, y: j.y })),
        }),
      });
      const json = await res.json();
      if (json.success) {
        setSucio(false);
        /* Cambiar el DT reescribe el entrenador de los jugadores del equipo. Se dice
           cuántos, porque es un efecto sobre sus fichas y no solo sobre el equipo. */
        setAviso(
          json.entrenadorPropagado > 0
            ? `Guardado. El entrenador se actualizó en ${json.entrenadorPropagado} ficha${json.entrenadorPropagado === 1 ? "" : "s"} de jugador.`
            : "Guardado.",
        );
      } else setError(json.message ?? "No se pudo guardar la plantilla");
    } catch {
      setError("Error de conexión al guardar");
    } finally {
      setGuardando(false);
    }
  };

  if (isInitialized && user && !puedeVer) {
    return (
      <DashboardLayout>
        <main className="p-8 flex-1">
          <p className="text-slate-300 font-bold">No tienes acceso a este módulo.</p>
        </main>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <main className="p-4 md:p-8 overflow-y-auto flex-1">
        <div className="max-w-[1500px] mx-auto">
          <div className="bg-[#0f172a] rounded-xl shadow-2xl p-4 md:p-6 border border-white/20">
            {/* Encabezado en dos renglones.

                Arriba, el título y —en la esquina— la TEMPORADA: no elige qué se está
                viendo sino contra qué se mide la inscripción, así que se aparta de los
                otros dos selectores para que no parezca uno más del mismo juego.

                Abajo, lo que sí contesta "qué equipo estoy viendo" —categoría y equipo—
                y enseguida las acciones sobre ese equipo. En una sola línea con los
                botones, los selectores quedaban perdidos entre Guardar y PDF. */}
            <div className="mb-5">
              <div className="flex flex-col lg:flex-row justify-between items-start lg:items-end gap-4">
                <div>
                  <h2 className="text-2xl md:text-3xl font-bold text-white flex items-center gap-3">
                    <Goal className="text-emerald-400" size={28} />
                    Plantilla de Equipos
                  </h2>
                  <p className="text-xs text-slate-400 mt-1">
                    El acomodo del equipo en la cancha. Arrastra los nombres para moverlos.
                  </p>
                </div>

                <div className="lg:text-right">
                  <label htmlFor="pl-temporada" className={ETIQUETA_SELECT}>Temporada:</label>
                  <select
                    id="pl-temporada"
                    value={temporadaId ?? ""}
                    onChange={(e) => setTemporadaId(Number(e.target.value) || null)}
                    className={SELECT}
                    title="La inscripción se mide contra esta temporada"
                  >
                    {temporadas.map((t) => (
                      <option key={t.IdTemporada} value={t.IdTemporada}>
                        {t.Temporada}{t.EsActiva ? " (activa)" : ""}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* El equipo se elige aquí, y a continuación lo que se hace con él. */}
              <div className="flex flex-wrap items-end gap-2 mt-4">
                <div>
                  <label htmlFor="pl-categoria" className={ETIQUETA_SELECT}>Categoría:</label>
                  <select
                    id="pl-categoria"
                    value={anio}
                    onChange={(e) => { setAnio(e.target.value); setIdEquipo(null); }}
                    className={SELECT}
                    title="Año o años de la categoría. Solo salen las que tienen equipos con inscritos en la temporada"
                  >
                    <option value="">{anios.length > 0 ? "Categoría..." : "Sin inscritos"}</option>
                    {anios.map((a) => <option key={a} value={a}>{a}</option>)}
                  </select>
                </div>

                <div>
                  <label htmlFor="pl-equipo" className={ETIQUETA_SELECT}>Equipo:</label>
                  <select
                    id="pl-equipo"
                    value={idEquipo ?? ""}
                    onChange={(e) => setIdEquipo(Number(e.target.value) || null)}
                    className={SELECT}
                    disabled={!anio}
                    title="Letra del equipo. Solo salen los que tienen jugadores inscritos en la temporada elegida"
                  >
                    <option value="">{anio ? "Letra..." : "Elige la categoría"}</option>
                    {letras.map((e) => (
                      <option key={e.IdEquipo} value={e.IdEquipo}>
                        {partirCategoria(e.Equipo).equipo || e.Equipo}
                        {e.Sede ? ` · ${e.Sede}` : ""} ({e.Jugadores})
                      </option>
                    ))}
                  </select>
                </div>

                {/* Las acciones sobre el equipo elegido. Solo existen cuando hay uno: sin
                    equipo no hay a quién traer, ni qué imprimir, ni qué guardar. La
                    separación las despega de los selectores para que no se lean como un
                    tercer campo del mismo grupo. */}
                {plantilla && (
                  <div className="flex flex-wrap items-center gap-2 sm:ml-3">
                    <button
                      onClick={() => setTransfiriendo(true)}
                      className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-emerald-600/15 hover:bg-emerald-600/25 border border-emerald-500/30 text-emerald-200 text-xs font-bold transition-all"
                      title="Traer a un jugador de otro equipo"
                    >
                      <ArrowRightLeft size={14} /> Traer jugador
                    </button>
                    <button
                      onClick={() => exportarPlantillaPdf({ ...plantilla, jugadores: inscritos }, temporadaNombre)}
                      className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-blue-600/15 hover:bg-blue-600/25 border border-blue-500/30 text-blue-200 text-xs font-bold transition-all"
                    >
                      <FileText size={14} /> PDF
                    </button>
                    <button
                      onClick={guardar}
                      disabled={guardando || !sucio}
                      className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:bg-white/10 disabled:text-slate-500 text-white text-xs font-black transition-all"
                    >
                      {guardando ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                      {sucio ? "Guardar" : "Guardado"}
                    </button>
                  </div>
                )}
              </div>
            </div>

            {error && (
              <div className="mb-4 px-4 py-3 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-200 text-sm font-bold flex items-start gap-2">
                <AlertCircle size={16} className="flex-shrink-0 mt-0.5" /> {error}
              </div>
            )}

            {aviso && (
              <div className="mb-4 px-4 py-3 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-200 text-sm font-bold flex items-start justify-between gap-2">
                <span>{aviso}</span>
                <button onClick={() => setAviso(null)} className="text-emerald-300/70 hover:text-emerald-100">
                  ✕
                </button>
              </div>
            )}

            {cargando ? (
              <div className="flex flex-col items-center justify-center gap-3 py-24 text-slate-400">
                <Loader2 size={30} className="animate-spin text-emerald-400" />
                <p className="text-sm font-bold">Cargando la plantilla...</p>
              </div>
            ) : !plantilla ? (
              <div className="text-center py-20">
                <LayoutGrid size={34} className="mx-auto text-slate-700 mb-3" />
                <p className="text-slate-300 font-bold text-sm">Elige una categoría y su letra</p>
                <p className="text-slate-500 text-xs mt-1">
                  Ahí aparecen los jugadores del equipo y su acomodo en la cancha. Solo se
                  ofrecen los equipos con jugadores inscritos en la temporada elegida.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-5">
                {/* ── Listado ── */}
                <div>
                  {/* Las dos pestañas. El número va en la etiqueta porque es el dato que
                      se consulta: cuántos hay de cada lado. */}
                  <div className="flex items-center gap-1 mb-3">
                    {([
                      ["inscritos", "Inscritos", inscritos.length],
                      ["no-inscritos", "No inscritos", noInscritos.length],
                    ] as const).map(([clave, etiqueta, cuantos]) => (
                      <button
                        key={clave}
                        onClick={() => setPestania(clave)}
                        aria-pressed={pestania === clave}
                        className={`px-3 py-2 rounded-lg text-[11px] font-black transition-colors border ${
                          pestania === clave
                            ? clave === "inscritos"
                              ? "bg-emerald-600/20 border-emerald-500/40 text-emerald-200"
                              : "bg-amber-600/20 border-amber-500/40 text-amber-200"
                            : "bg-white/5 border-white/10 text-slate-400 hover:bg-white/10"
                        }`}
                      >
                        {etiqueta} ({cuantos})
                      </button>
                    ))}
                  </div>

                  {pestania === "no-inscritos" && (
                    <p className="mb-3 text-[10px] text-slate-500 leading-snug">
                      No tienen inscripción pagada en {temporadaNombre || "la temporada"}. Están en el
                      equipo y siguen entrenando, pero no se acomodan en la cancha.
                    </p>
                  )}

                  <div className="rounded-2xl border border-white/10 overflow-hidden">
                    <table className="w-full">
                      <thead>
                        <tr className="bg-slate-800">
                          <th className="px-2 py-2 text-[9px] font-black text-slate-400 uppercase tracking-widest w-8">E</th>
                          <th className="px-2 py-2 text-left text-[9px] font-black text-slate-400 uppercase tracking-widest">Nombre</th>
                          <th className="px-2 py-2 text-[9px] font-black text-slate-400 uppercase tracking-widest">Estado</th>
                          <th className="px-2 py-2 text-[9px] font-black text-slate-400 uppercase tracking-widest">Fecha</th>
                          <th className="px-2 py-2 text-[9px] font-black text-slate-400 uppercase tracking-widest">Semestre</th>
                          <th className="px-2 py-2 text-[9px] font-black text-slate-400 uppercase tracking-widest">Copas</th>
                          <th className="px-2 py-2 text-[9px] font-black text-slate-400 uppercase tracking-widest">Ligas</th>
                        </tr>
                      </thead>
                      <tbody>
                        {listado.map((j, i) => {
                          /* Las tres becas van en su propia columna: son descuentos
                             independientes de la ficha y juntarlas obligaría a inventar
                             cuál de las dos de torneo se enseña. */
                          const sem = etiquetaBeca(j.beca);
                          const cop = etiquetaBeca(j.becaCopas);
                          const lig = etiquetaBeca(j.becaLigas);
                          return (
                            <tr
                              key={j.idJugador}
                              onClick={() => setPagosTarget({ idJugador: j.idJugador, jugador: j.jugador })}
                              title={`Ver el historial de pagos de ${j.jugador}`}
                              className={`border-b border-white/5 last:border-b-0 cursor-pointer hover:bg-white/[0.08] transition-colors ${
                                j.x === null ? "bg-white/[0.01]" : "bg-white/[0.04]"
                              }`}
                            >
                              <td className="px-2 py-1.5 text-center text-[10px] font-mono text-slate-500 tabular-nums">
                                {i + 1}
                              </td>
                              <td className="px-2 py-1.5">
                                <div className="flex items-center gap-2 min-w-0">
                                  <AvatarJugador idJugador={j.idJugador} nombre={j.jugador} tieneFoto={j.tieneFoto} fotoVersion={j.fotoVersion} tamano={26} />
                                  <div className="min-w-0">
                                    <span className="text-[11px] font-bold text-slate-100">{j.jugador}</span>
                                    {pestania === "inscritos" && j.x === null && (
                                      <span className="ml-1.5 text-[9px] font-black text-slate-500 uppercase">
                                        · sin colocar
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </td>
                              {/* Inscripción y adeudo, con la MISMA regla que Adeudos por
                                  Sede y la Lista de Jugadores. Quien no está inscrito no
                                  trae meses: lo que le falta es la inscripción. */}
                              <td className="px-2 py-1.5 text-center whitespace-nowrap">
                                {!j.inscrito ? (
                                  <span className="text-[9px] font-black px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-300 border border-amber-500/30">
                                    SIN INSCRIPCIÓN
                                  </span>
                                ) : j.mesesDebe > 0 ? (
                                  <span
                                    title={`Debe ${j.mesesDebe} ${j.mesesDebe === 1 ? "mes" : "meses"} de la temporada`}
                                    className="text-[9px] font-black px-1.5 py-0.5 rounded bg-rose-500/15 text-rose-300 border border-rose-500/30"
                                  >
                                    DEBE {j.mesesDebe}
                                  </span>
                                ) : (
                                  <span className="text-[9px] font-black px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                                    AL CORRIENTE
                                  </span>
                                )}
                              </td>
                              <td className="px-2 py-1.5 text-center text-[10px] text-slate-400 tabular-nums whitespace-nowrap">
                                {j.fechaNacimiento ?? "—"}
                              </td>
                              <td className="px-1 py-1.5 text-center">
                                <span className={`inline-block w-full px-1.5 py-0.5 rounded text-[9px] font-black ${COLOR_BECA[sem.tono]}`}>
                                  {sem.texto}
                                </span>
                              </td>
                              <td className="px-1 py-1.5 text-center">
                                <span className={`inline-block w-full px-1.5 py-0.5 rounded text-[9px] font-black ${COLOR_BECA[cop.tono]}`}>
                                  {cop.texto}
                                </span>
                              </td>
                              <td className="px-1 py-1.5 text-center">
                                <span className={`inline-block w-full px-1.5 py-0.5 rounded text-[9px] font-black ${COLOR_BECA[lig.tono]}`}>
                                  {lig.texto}
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                        {listado.length === 0 && (
                          <tr>
                            <td colSpan={6} className="px-3 py-8 text-center text-slate-500 text-xs">
                              {plantilla.jugadores.length === 0
                                ? "Este equipo no tiene jugadores activos."
                                : pestania === "inscritos"
                                  ? "Nadie del equipo tiene inscripción en esta temporada."
                                  : "Todos los del equipo están inscritos."}
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>

                  {/* La banca: quien todavía no tiene lugar en la cancha */}
                  <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.03] p-3">
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                        <Users size={12} /> Sin colocar ({enBanca.length})
                      </p>
                      <div className="flex gap-1.5">
                        <button
                          onClick={acomodarTodos}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-slate-200 text-[10px] font-bold transition-colors"
                          title="Reparte a todos por la cancha, de atrás hacia adelante"
                        >
                          <Wand2 size={11} /> Acomodar
                        </button>
                        <button
                          onClick={vaciarCancha}
                          disabled={enCancha.length === 0}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 disabled:opacity-30 text-slate-200 text-[10px] font-bold transition-colors"
                          title="Saca a todos de la cancha"
                        >
                          <RotateCcw size={11} /> Vaciar
                        </button>
                      </div>
                    </div>
                    {fantasmas.length > 0 && (
                      <p className="mb-2 text-[10px] text-amber-300/90 leading-snug">
                        {fantasmas.length === 1 ? "Hay 1 jugador" : `Hay ${fantasmas.length} jugadores`} sin
                        inscripción que {fantasmas.length === 1 ? "conserva" : "conservan"} su lugar en la
                        cancha de antes. No se {fantasmas.length === 1 ? "pinta" : "pintan"}, y al guardar
                        se {fantasmas.length === 1 ? "respeta" : "respetan"}: {fantasmas.map((j) => nombreCorto(j.jugador)).join(", ")}.
                      </p>
                    )}
                    {enBanca.length === 0 ? (
                      <p className="text-[10px] text-slate-500">
                        {inscritos.length === 0
                          ? "No hay inscritos que acomodar en esta temporada."
                          : "Todos los inscritos están en la cancha."}
                      </p>
                    ) : (
                      <div className="flex flex-wrap gap-1.5">
                        {enBanca.map((j) => (
                          <button
                            key={j.idJugador}
                            onClick={() => mandarACancha(j.idJugador)}
                            title={`Mandar a ${j.jugador} a la cancha`}
                            className="inline-flex items-center gap-1.5 pl-1 pr-2 py-1 rounded-md bg-white/10 hover:bg-emerald-600/30 border border-white/10 hover:border-emerald-500/40 text-[10px] font-bold text-slate-200 transition-colors"
                          >
                            <AvatarJugador idJugador={j.idJugador} nombre={j.jugador} tieneFoto={j.tieneFoto} fotoVersion={j.fotoVersion} tamano={18} />
                            {nombreCorto(j.jugador)}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* El pie de la hoja */}
                  <div className="mt-3 rounded-2xl border border-white/10 bg-white/[0.03] p-3">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">
                      Horario
                    </p>
                    <p className="text-[11px] font-bold text-slate-200">
                      {plantilla.horario || "Sin horario capturado en el equipo."}
                    </p>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      SEDE {plantilla.sede || "—"}
                    </p>
                  </div>
                </div>

                {/* ── Cancha ── */}
                <div>
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <p className="text-sm font-black text-white">
                      ANGELES {plantilla.equipo}
                    </p>
                    <div className="flex flex-wrap items-center gap-2">
                      <label className="flex items-center gap-1.5">
                        <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
                          DT
                        </span>
                        <select
                          value={plantilla.idEntrenador ?? ""}
                          onChange={(e) => {
                            const id = Number(e.target.value) || null;
                            setPlantilla({
                              ...plantilla,
                              idEntrenador: id,
                              dt: usuarios.find((u) => u.IdUsuario === id)?.Usuario ?? null,
                            });
                            setSucio(true);
                          }}
                          className={SELECT}
                          title="Al guardar, el entrenador se actualiza también en la ficha de los jugadores del equipo"
                        >
                          <option value="">Sin asignar</option>
                          {usuarios.map((u) => (
                            <option key={u.IdUsuario} value={u.IdUsuario}>{u.Usuario}</option>
                          ))}
                        </select>
                      </label>
                      <label className="flex items-center gap-1.5">
                        <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
                          Aux
                        </span>
                        <select
                          value={plantilla.idAuxiliar ?? ""}
                          onChange={(e) => {
                            const id = Number(e.target.value) || null;
                            setPlantilla({
                              ...plantilla,
                              idAuxiliar: id,
                              auxiliar: usuarios.find((u) => u.IdUsuario === id)?.Usuario ?? null,
                            });
                            setSucio(true);
                          }}
                          className={SELECT}
                        >
                          <option value="">Sin auxiliar</option>
                          {usuarios.map((u) => (
                            <option key={u.IdUsuario} value={u.IdUsuario}>{u.Usuario}</option>
                          ))}
                        </select>
                      </label>
                    </div>
                  </div>

                  <CanchaPlantilla
                    onAbrir={(j) => setPagosTarget({ idJugador: j.idJugador, jugador: j.jugador })}
                    jugadores={inscritos}
                    dt={plantilla.dt}
                    auxiliar={plantilla.auxiliar}
                    bloqueada={guardando}
                    onMover={(id, x, y) => cambiaJugador(id, { x, y })}
                    onQuitar={(id) => cambiaJugador(id, { x: null, y: null })}
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Traer a alguien de otro equipo. Recarga al terminar: la transferencia cambia la
          ficha del jugador, así que lo que hay en pantalla ya no está al día. */}
      {/* Historial de pagos del jugador, acotado a la temporada elegida arriba. */}
      <PlayerPagosModal
        target={pagosTarget}
        temporadaId={temporadaId}
        temporadaNombre={temporadaNombre || undefined}
        onClose={() => setPagosTarget(null)}
        onDataChanged={() => {
          /* Un pago capturado o corregido cambia el adeudo y hasta la inscripción, que
             es lo que reparte a los jugadores entre las dos pestañas. Se recarga para
             que la pantalla no se quede diciendo lo de antes. */
          if (idEquipo && temporadaId) cargar(idEquipo, temporadaId);
        }}
      />

      {transfiriendo && plantilla && (
        <TransferirJugador
          idEquipo={plantilla.idEquipo}
          equipo={plantilla.equipo}
          onCerrar={() => setTransfiriendo(false)}
          onTransferido={async (mensaje) => {
            setTransfiriendo(false);
            setAviso(mensaje);
            if (idEquipo && temporadaId) await cargar(idEquipo, temporadaId);
          }}
        />
      )}
    </DashboardLayout>
  );
}
