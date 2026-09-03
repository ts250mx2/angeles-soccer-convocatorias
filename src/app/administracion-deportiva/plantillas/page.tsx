"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useUser, usePuedeVer } from "@/contexts/user-context";
import DashboardLayout from "@/components/DashboardLayout";
import CanchaPlantilla, { nombreCorto } from "@/components/CanchaPlantilla";
import {
  AlertCircle, ArrowLeft, ArrowRightLeft, FileText, Goal, LayoutGrid, Loader2, Plus,
  RotateCcw, Save, Search, Users, Wand2,
} from "lucide-react";
import TransferirJugador from "@/components/TransferirJugador";
import AvatarJugador from "@/components/AvatarJugador";
import PlayerPagosModal, { type PagosTarget } from "@/components/PlayerPagosModal";
import { partirCategoria } from "@/lib/categoria-equipo";
import {
  aniosDeSede, letraDe, letrasDe, sedesDeEquipos, seleccionHuerfana,
} from "@/lib/selector-equipo";
import {
  COLOR_BECA, MINIMO_JUGADORES_PLANTILLA, acomodoPorOmision, acota, etiquetaBeca,
  type JugadorPlantilla, type Plantilla,
} from "@/lib/plantilla-equipo";
import { exportarPlantillaPdf } from "@/lib/plantilla-export";
import { guardarEquipoRecordado, leerEquipoRecordado } from "@/lib/equipo-recordado";

/**
 * Plantilla de Equipos: la hoja del equipo, con su gente y el acomodo en la cancha.
 *
 * ── Dos caras: la portada y el editor ──
 *
 * Se entra a retomar una hoja que ya existe mucho más seguido que a empezar una, así que
 * lo primero que se ve son las que YA están armadas, con cuántos de cada equipo tienen
 * lugar en la cancha. Antes lo primero eran tres desplegables en blanco, sin ninguna
 * pista de en cuáles equipos había algo hecho: encontrar la hoja de la semana pasada era
 * acertarle de memoria. Empezar una nueva sigue estando —lleva al mismo editor con los
 * desplegables vacíos—, pero ya no es el único camino.
 *
 * El equipo se elige en tres pasos —sede, año, letra— porque así está escrito su nombre
 * en la base ('2018X', '2012FC', '2009-2010F') y así lo busca quien lo tiene en la
 * cabeza. Un solo desplegable con los cuatrocientos y pico equipos del catálogo obligaría
 * a leerlos todos.
 *
 * ── El equipo es UNO: no hay listas separadas ──
 *
 * La hoja enseña a todo el equipo en una sola lista, y a quien no tiene inscripción
 * pagada en la temporada elegida se le pone un aviso al lado del nombre. Antes venían
 * partidos en dos pestañas y había que saltar entre ellas para armar una alineación que
 * en la cancha no está partida: pasa que el niño entrena y juega mientras el pago se
 * regulariza, y esconderlo en otra pestaña obliga a armar la formación en papel. Lo que
 * no puede pasar es que se cuele sin que nadie lo note, así que va marcado en la lista,
 * marcado en el campo, se confirma al meterlo y sale marcado en el PDF. La inscripción
 * usa la MISMA regla que Inscripciones y la Lista de Jugadores, así que el aviso dice lo
 * mismo que aquellas pantallas.
 *
 * Y solo se ofrecen los equipos de más de `MINIMO_JUGADORES_PLANTILLA` jugadores: a un
 * grupo de cinco no se le arma una formación, son los restos de uno que se disolvió o una
 * categoría que apenas abre. El corte lo aplica el servidor —el mismo para la portada y
 * para el selector—, y cuenta la plantilla completa, que es lo que enseña la hoja.
 *
 * El acomodo se edita en el navegador y se manda completo al guardar, no en cada
 * arrastre: acomodar son quince movimientos seguidos, y una petición por movimiento
 * sería una tormenta de escrituras que además se cruzan entre sí.
 *
 * OJO con una asimetría que es fácil romper: las posiciones son del EQUIPO y no de la
 * temporada (tblEquiposPlantilla no la guarda). Cambiar de temporada mueve los avisos de
 * inscripción, nunca el acomodo. Y como el guardado REEMPLAZA el acomodo completo, se
 * mandan SIEMPRE todas las posiciones: si se omitiera alguna, guardar borraría ese lugar
 * sin que nadie lo pida.
 */

interface EquipoOpcion {
  IdEquipo: number;
  Equipo: string;
  IdSede: number | null;
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

/** Un equipo que ya tiene plantilla armada, como lo lista la portada. */
interface PlantillaArmada {
  idEquipo: number;
  equipo: string;
  idSede: number | null;
  sede: string;
  coach: string | null;
  jugadores: number;
  colocados: number;
  actualizada: string | null;
}

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
  /* Los tres pasos, en el orden en que se eligen: sede, año y letra. Ver
     @/lib/selector-equipo para por qué la sede va primero. */
  const [idSede, setIdSede] = useState<number | null>(null);
  const [anio, setAnio] = useState("");
  const [idEquipo, setIdEquipo] = useState<number | null>(null);
  /* La pantalla tiene dos caras: la PORTADA, que lista las hojas ya armadas, y el
     EDITOR, que abre una.

     La portada es lo primero porque retomar una hoja es lo que se hace casi siempre, y
     antes eso costaba acertarle a tres desplegables sin ninguna pista de cuáles equipos
     ya tenían algo hecho. Armar una nueva sigue estando: es el otro camino, no el
     único. */
  const [vista, setVista] = useState<"portada" | "editor">("portada");
  const [armadas, setArmadas] = useState<PlantillaArmada[]>([]);
  const [cargandoArmadas, setCargandoArmadas] = useState(true);
  const [buscaEquipo, setBuscaEquipo] = useState("");
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
  /* Si se llega desde la canchita del catálogo, esta referencia hace que el primer
     pedido incluya ese equipo aunque todavía no tenga inscritos en la temporada. */
  const equipoDirecto = useRef<number | null>(null);

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
          const params = new URLSearchParams(window.location.search);
          const idDirecto = Number(params.get("equipoId"));
          const sedeDirecta = Number(params.get("sedeId"));
          const categoriaDirecta = params.get("categoria")?.trim() ?? "";
          if (idDirecto > 0 && sedeDirecta > 0 && categoriaDirecta) {
            equipoDirecto.current = idDirecto;
            setTemporadaId(jsonTemporadas.temporadaActiva);
            setIdSede(sedeDirecta);
            setAnio(categoriaDirecta);
            setIdEquipo(idDirecto);
            /* Venir con un equipo en la URL —desde la canchita del catálogo— ya es
               haber elegido: pasar por la portada sería preguntar dos veces. */
            setVista("editor");
          } else {
            const recordado = leerEquipoRecordado();
            const existe = recordado
              && (jsonTemporadas.data as Temporada[]).some((t) => t.IdTemporada === recordado.temporadaId);
            setTemporadaId(existe ? recordado!.temporadaId : jsonTemporadas.temporadaActiva);
            if (existe) {
              setIdSede(recordado!.idSede);
              setAnio(recordado!.anio);
              setIdEquipo(recordado!.idEquipo);
            }
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
      temporadaId && idSede && idEquipo ? { temporadaId, idSede, anio, idEquipo } : null,
    );
  }, [temporadaId, idSede, anio, idEquipo]);

  /* Los equipos de los selectores: los que tienen gente de verdad.
  
     Se cuenta la PLANTILLA COMPLETA (`conteo=activos`), no los inscritos, porque eso es
     lo que enseña la hoja desde que dejó de partirse en pestañas: si el número entre
     paréntesis del selector contara otra cosa que la lista de al lado, habría que
     explicar cuál de los dos es el bueno.
  
     Y se recortan los de cinco o menos (`minimo`): esos no son equipos a los que se les
     arme una formación. El corte lo aplica el servidor con la misma constante que usa la
     portada, para que no pueda ofrecer un equipo que aquí no se puede elegir.
  
     Se vuelven a pedir al cambiar de temporada porque la lista sigue dependiendo de ella:
     el pedido lleva la temporada y el servidor decide con reglas que viven allá. */
  useEffect(() => {
    if (!user || !puedeVer || !temporadaId) return;
    let vigente = true;
    (async () => {
      try {
        const directo = equipoDirecto.current;
        /* Llegar desde la canchita del catálogo trae un equipo concreto, y ése entra
           aunque sea chico: el usuario ya dijo cuál quiere. */
        const extra = directo ? `&conInscritos=0&equipoId=${directo}` : `&minimo=${MINIMO_JUGADORES_PLANTILLA}`;
        const res = await fetch(
          `/api/administracion-deportiva/equipos?temporadaId=${temporadaId}&conteo=activos${extra}`,
          { cache: "no-store" },
        );
        const json = await res.json();
        if (!vigente) return;
        if (json.success) {
          setEquipos({ temporadaId, lista: json.data });
          equipoDirecto.current = null;
        }
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

  // Las tres listas de los desplegables, en cascada. La regla vive en @/lib/selector-equipo.
  /* Las plantillas que YA están armadas: la portada de la pantalla.
  
     No llevan temporada, y es a propósito: las posiciones son del EQUIPO y no de la
     temporada (tblEquiposPlantilla no la guarda), así que filtrarlas por temporada
     escondería hojas que existen. */
  const cargarArmadas = useCallback(async () => {
    setCargandoArmadas(true);
    try {
      const res = await fetch("/api/administracion-deportiva/plantillas/lista", { cache: "no-store" });
      const json = await res.json();
      if (json.success) setArmadas(json.data);
    } catch {
      /* Una portada vacía no impide armar una nueva, así que no se grita: el error de
         verdad —el que sí importa— aparece al guardar. */
    } finally {
      setCargandoArmadas(false);
    }
  }, []);

  useEffect(() => {
    if (user && puedeVer) cargarArmadas();
  }, [user, puedeVer, cargarArmadas]);

  /* La búsqueda de la portada corre sobre el nombre del equipo, su sede y su coach:
     son las tres formas en que alguien identifica una hoja —"los 2018X", "los de
     Saltillo", "los de Ramírez"— y cuál se le viene a la cabeza no lo decide esta
     pantalla. */
  const armadasFiltradas = useMemo(() => {
    const q = buscaEquipo.trim().toLowerCase();
    if (!q) return armadas;
    return armadas.filter((a) =>
      `${a.equipo} ${a.sede} ${a.coach ?? ""}`.toLowerCase().includes(q),
    );
  }, [armadas, buscaEquipo]);

  /**
   * Abre una hoja de la portada.
   *
   * Deja los tres desplegables apuntando a ese equipo —el año sale del propio nombre,
   * igual que en el selector— para que el editor no aparezca contradiciendo a lo que se
   * acaba de abrir, y para que desde ahí se pueda saltar a la letra de al lado sin
   * volver a la portada.
   */
  const abrirArmada = (a: PlantillaArmada) => {
    setIdSede(a.idSede);
    setAnio(partirCategoria(a.equipo).anio);
    setIdEquipo(a.idEquipo);
    setVista("editor");
  };

  const sedes = useMemo(() => sedesDeEquipos(equipos.lista), [equipos]);
  const anios = useMemo(() => aniosDeSede(equipos.lista, idSede), [equipos, idSede]);
  const letras = useMemo(() => letrasDe(equipos.lista, idSede, anio), [equipos, idSede, anio]);

  /* Al cambiar de temporada la lista se encoge, y lo que estaba elegido puede haber
     dejado de existir en ella. Se suelta la selección huérfana en vez de dejarla puesta:
     un selector que enseña algo que ya no está entre sus opciones se ve en blanco y no
     hay forma de saber qué se está mirando. Soltar un paso arrastra a los de abajo. */
  useEffect(() => {
    if (!listaAlDia) return;
    const huerfano = seleccionHuerfana(equipos.lista, idSede, anio, idEquipo);
    if (huerfano === "sede") {
      setIdSede(null);
      setAnio("");
      setIdEquipo(null);
    } else if (huerfano === "anio") {
      setAnio("");
      setIdEquipo(null);
    } else if (huerfano === "equipo") {
      setIdEquipo(null);
    }
  }, [listaAlDia, equipos, idSede, anio, idEquipo]);

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
     cambian los avisos de la lista. El acomodo NO cambia —las posiciones son del equipo,
     no de la temporada—, así que lo que se ve moverse son los avisos, no los nombres de
     la cancha. */
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

  /* El equipo, en UNA sola lista.

     Antes venia partido en dos pestanas por inscripcion, y eso obligaba a saltar entre
     ellas para armar una alineacion que en la cancha es una sola. Ahora estan todos
     juntos y al que no esta inscrito se le pone un aviso: la informacion sigue estando,
     pero no rompe la lista en dos.

     La inscripcion usa la MISMA regla que Inscripciones y la Lista de Jugadores, asi que
     el aviso dice lo mismo que aquellas pantallas. */
  const jugadores = useMemo(() => plantilla?.jugadores ?? [], [plantilla]);

  /** Los que no tienen inscripcion pagada en la temporada elegida. Solo se avisan. */
  const sinInscripcion = useMemo(() => jugadores.filter((j) => !j.inscrito), [jugadores]);

  const temporadaNombre =
    temporadas.find((t) => t.IdTemporada === temporadaId)?.Temporada ?? "";

  /* En la cancha esta QUIEN TIENE LUGAR; en la banca, el resto del equipo. Ya no hay
     distincion por inscripcion: el equipo es uno solo. */
  const enCancha = useMemo(() => jugadores.filter((j) => j.x !== null), [jugadores]);
  const enBanca = useMemo(() => jugadores.filter((j) => j.x === null), [jugadores]);

  /** Los que estan en el campo sin estar inscritos. Es lo que hay que poder ver de lejos. */
  const enCanchaSinInscripcion = useMemo(
    () => enCancha.filter((j) => !j.inscrito),
    [enCancha],
  );

  /** Le busca un lugar libre en la cancha, entre los puestos del acomodo por omision. */
  const lugarLibre = (): { x: number; y: number } => {
    const puestos = acomodoPorOmision(Math.max(jugadores.length, enCancha.length + 1));
    const ocupados = enCancha.map((j) => ({ x: j.x!, y: j.y! }));
    return (
      puestos.find((p) => !ocupados.some((o) => Math.abs(o.x - p.x) < 6 && Math.abs(o.y - p.y) < 6)) ??
      { x: 50, y: 50 }
    );
  };

  /**
   * Manda a la cancha a alguien de la banca.
   *
   * Si NO esta inscrito se confirma antes: el resto de la aplicacion —Convocatorias,
   * Adeudos, los conteos de Inscripciones— lo sigue tratando como no inscrito, asi que
   * quien lo pone tiene que saber que la hoja va a decir una cosa y el padron otra. Es un
   * aviso, no un veto: la decision es del club.
   */
  const mandarACancha = (j: JugadorPlantilla) => {
    if (!plantilla) return;
    if (!j.inscrito) {
      const aviso =
        `${j.jugador} NO tiene inscripcion pagada en ${temporadaNombre || "esta temporada"}.` +
        "\n\nSe puede poner en la cancha igual, y va a quedar marcado como tal en la hoja y en el PDF." +
        "\n\n\u00bfMeterlo de todas formas?";
      if (!confirm(aviso)) return;
      setAviso(`${j.jugador} entro a la cancha sin inscripcion. Queda marcado en la hoja.`);
    }
    const libre = lugarLibre();
    cambiaJugador(j.idJugador, { x: acota(libre.x), y: acota(libre.y) });
  };

  /** Reparte a TODO el equipo por la cancha, de atras hacia adelante. El punto de partida. */
  const acomodarTodos = () => {
    if (!plantilla) return;
    const puestos = acomodoPorOmision(jugadores.length);
    const lugarDe = new Map(jugadores.map((j, i) => [j.idJugador, puestos[i]]));
    setPlantilla({
      ...plantilla,
      jugadores: plantilla.jugadores.map((j) => {
        const lugar = lugarDe.get(j.idJugador);
        return lugar ? { ...j, x: acota(lugar.x), y: acota(lugar.y) } : j;
      }),
    });
    setSucio(true);
  };

  /** Saca de la cancha a todos los que esten puestos. */
  const vaciarCancha = () => {
    if (!plantilla) return;
    setPlantilla({
      ...plantilla,
      jugadores: plantilla.jugadores.map((j) => ({ ...j, x: null, y: null })),
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
        /* Guardar por primera vez estrena una hoja, y la portada la lista. Si no se
           volviera a pedir, el equipo que se acaba de armar no aparecería ahí hasta
           recargar la página. */
        cargarArmadas();
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
                    {vista === "portada"
                      ? "Las hojas que ya están armadas. Abre una para editarla, o empieza otra."
                      : "El acomodo del equipo en la cancha. Arrastra los nombres para moverlos."}
                  </p>
                </div>

                {/* La temporada no elige qué equipo se ve: decide contra qué se mide la
                    inscripción de cada jugador. En la portada no mide nada —las hojas no
                    son de una temporada— y ahí solo sería un desplegable de adorno. */}
                <div className={`lg:text-right${vista === "portada" ? " hidden" : ""}`}>
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
              {vista === "editor" && (
              <div className="flex flex-wrap items-end gap-2 mt-4">
                <div>
                  <span className={ETIQUETA_SELECT}>&nbsp;</span>
                  <button
                    onClick={() => {
                      /* El acomodo vive en el navegador hasta que se aprieta Guardar, así
                         que salirse del editor con cambios pendientes los tira. Es el
                         mismo aviso que da el navegador al cerrar la pestaña. */
                      if (sucio && !confirm("Hay cambios sin guardar en esta plantilla.\n\n¿Salir y perderlos?")) return;
                      setSucio(false);
                      setVista("portada");
                    }}
                    title="Volver a la lista de plantillas armadas"
                    className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white/5 hover:bg-white/10 border border-white/15 text-slate-300 text-xs font-bold transition-all"
                  >
                    <ArrowLeft size={14} /> Plantillas
                  </button>
                </div>
                <div>
                  <label htmlFor="pl-sede" className={ETIQUETA_SELECT}>Sede:</label>
                  <select
                    id="pl-sede"
                    value={idSede ?? ""}
                    onChange={(e) => {
                      // Cambiar de sede invalida el año y la letra: son suyos.
                      setIdSede(Number(e.target.value) || null);
                      setAnio("");
                      setIdEquipo(null);
                    }}
                    className={SELECT}
                    title="La misma categoría existe en varias sedes; ésta es la que manda"
                  >
                    <option value="">Sede...</option>
                    {sedes.map((s) => (
                      <option key={s.idSede} value={s.idSede}>{s.sede}</option>
                    ))}
                  </select>
                </div>

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
                    {/* Ya no hace falta decir la sede en cada opción: la eligió arriba. */}
                    {letras.map((e) => (
                      <option key={e.IdEquipo} value={e.IdEquipo}>
                        {letraDe(e)} ({e.Jugadores})
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
                      onClick={() =>
                        /* La hoja impresa lleva al equipo completo, igual que la
                           pantalla. A quien no está inscrito se le marca, no se le
                           esconde: si el PDF lo omitiera, contradiría a la pantalla
                           justo donde ya no se puede preguntar. */
                        exportarPlantillaPdf(plantilla, temporadaNombre)
                      }
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
              )}
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

            {vista === "portada" ? (
              <>
                <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                  <div className="relative">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                    <input
                      type="search"
                      value={buscaEquipo}
                      onChange={(e) => setBuscaEquipo(e.target.value)}
                      placeholder="Buscar equipo, sede o coach..."
                      className="w-72 max-w-full pl-9 pr-3 py-2 rounded-lg bg-white/5 border border-white/15 text-slate-100 text-xs placeholder:text-slate-500 focus:outline-none focus:border-emerald-500/50"
                    />
                  </div>
                  {/* Empezar una hoja lleva al MISMO editor, con los desplegables en
                      blanco. No es otra pantalla: es la misma sin equipo elegido. */}
                  <button
                    onClick={() => { setIdEquipo(null); setVista("editor"); }}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black transition-all"
                  >
                    <Plus size={15} /> Nueva plantilla
                  </button>
                </div>

                {cargandoArmadas ? (
                  <div className="flex flex-col items-center justify-center gap-3 py-24 text-slate-400">
                    <Loader2 size={30} className="animate-spin text-emerald-400" />
                    <p className="text-sm font-bold">Cargando las plantillas...</p>
                  </div>
                ) : armadasFiltradas.length === 0 ? (
                  <div className="text-center py-20">
                    <LayoutGrid size={34} className="mx-auto text-slate-700 mb-3" />
                    <p className="text-slate-300 font-bold text-sm">
                      {armadas.length === 0
                        ? "Todavía no hay ninguna plantilla armada"
                        : "Ningún equipo coincide con la búsqueda"}
                    </p>
                    <p className="text-slate-500 text-xs mt-1">
                      {armadas.length === 0
                        ? "Empieza una con «Nueva plantilla»: eliges la sede, la categoría y la letra."
                        : "Prueba con el año, la letra, la sede o el nombre del coach."}
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                    {armadasFiltradas.map((a) => (
                      <button
                        key={a.idEquipo}
                        onClick={() => abrirArmada(a)}
                        title={`Abrir la plantilla de ${a.equipo}`}
                        className="text-left p-3.5 rounded-2xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/10 hover:border-emerald-500/40 transition-all"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="text-sm font-black text-white truncate">{a.equipo}</p>
                            <p className="text-[10px] font-bold text-slate-400 truncate">{a.sede || "Sin sede"}</p>
                          </div>
                          {/* Cuántos de los del equipo tienen lugar en la cancha. Es lo
                              que dice de un vistazo si la hoja está terminada o a medias:
                              una de 3 de 18 es una que alguien dejó empezada. */}
                          <span className="flex-shrink-0 px-2 py-1 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-[10px] font-black tabular-nums">
                            {a.colocados}/{a.jugadores}
                          </span>
                        </div>
                        <div className="mt-2.5 flex items-center justify-between gap-2 text-[10px] text-slate-500 font-bold">
                          <span className="inline-flex items-center gap-1 min-w-0">
                            <Users size={11} className="flex-shrink-0" />
                            <span className="truncate">{a.coach || "Sin coach"}</span>
                          </span>
                          {a.actualizada && <span className="flex-shrink-0 tabular-nums">{a.actualizada}</span>}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </>
            ) : cargando ? (
              <div className="flex flex-col items-center justify-center gap-3 py-24 text-slate-400">
                <Loader2 size={30} className="animate-spin text-emerald-400" />
                <p className="text-sm font-bold">Cargando la plantilla...</p>
              </div>
            ) : !plantilla ? (
              <div className="text-center py-20">
                <LayoutGrid size={34} className="mx-auto text-slate-700 mb-3" />
                <p className="text-slate-300 font-bold text-sm">Elige la sede, la categoría y su letra</p>
                <p className="text-slate-500 text-xs mt-1">
                  Ahí aparecen los jugadores del equipo y su acomodo en la cancha. Solo se
                  ofrecen los equipos de más de {MINIMO_JUGADORES_PLANTILLA} jugadores: a un
                  grupo más chico no se le arma una formación.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-5">
                {/* ── Listado ── */}
                <div>
                  {/* UNA sola lista: el equipo es uno solo. Antes venia partido en dos
                      pestanas por inscripcion y habia que saltar entre ellas para armar
                      una alineacion que en la cancha no esta partida. */}
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                    <p className="text-[11px] font-black text-slate-300 uppercase tracking-widest">
                      {jugadores.length} {jugadores.length === 1 ? "jugador" : "jugadores"}
                    </p>
                    {sinInscripcion.length > 0 && (
                      <p
                        title={`Sin inscripción pagada en ${temporadaNombre || "la temporada"}`}
                        className="inline-flex items-center gap-1.5 text-[10px] font-black px-2 py-1 rounded-lg bg-amber-500/15 text-amber-300 border border-amber-500/30"
                      >
                        <AlertCircle size={11} />
                        {sinInscripcion.length} sin inscripción
                      </p>
                    )}
                  </div>

                  <div className="rounded-2xl border border-white/10 overflow-hidden">
                    <table className="w-full">
                      <thead>
                        <tr className="bg-slate-800">
                          <th className="px-2 py-2 text-[9px] font-black text-slate-400 uppercase tracking-widest w-8">E</th>
                          <th className="px-2 py-2 text-left text-[9px] font-black text-slate-400 uppercase tracking-widest">Nombre</th>
                          <th className="px-2 py-2 text-[9px] font-black text-slate-400 uppercase tracking-widest">Fecha</th>
                          <th className="px-2 py-2 text-[9px] font-black text-slate-400 uppercase tracking-widest">Semestre</th>
                          <th className="px-2 py-2 text-[9px] font-black text-slate-400 uppercase tracking-widest">Copas</th>
                          <th className="px-2 py-2 text-[9px] font-black text-slate-400 uppercase tracking-widest">Ligas</th>
                          <th className="px-2 py-2 text-[9px] font-black text-slate-400 uppercase tracking-widest w-24">
                            Cancha
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {jugadores.map((j, i) => {
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
                                    {j.x === null && (
                                      <span className="ml-1.5 text-[9px] font-black text-slate-500 uppercase">
                                        · sin colocar
                                      </span>
                                    )}
                                    {/* El aviso hace el trabajo que hacía la pestaña: dice
                                        lo mismo, sin partir al equipo en dos listas. */}
                                    {!j.inscrito && (
                                      <span
                                        title={`No tiene inscripción pagada en ${temporadaNombre || "la temporada"}`}
                                        className="ml-1.5 inline-flex items-center gap-1 align-middle text-[9px] font-black px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-300 border border-amber-500/30"
                                      >
                                        <AlertCircle size={9} /> SIN INSCRIPCIÓN
                                      </span>
                                    )}
                                  </div>
                                </div>
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
                              {/* Mandar a la cancha tiene su propio boton y no se cuela
                                  en el clic de la fila, que abre el historial de pagos. */}
                              <td className="px-2 py-1.5 text-center">
                                  {j.x === null ? (
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        mandarACancha(j);
                                      }}
                                      title={
                                        j.inscrito
                                          ? `Poner a ${j.jugador} en la cancha`
                                          : `Poner a ${j.jugador} en la cancha aunque no esté inscrito`
                                      }
                                      className={`inline-flex items-center gap-1 px-2 py-1 rounded-md border text-[10px] font-black transition-colors ${
                                        j.inscrito
                                          ? "bg-emerald-600/20 hover:bg-emerald-600/35 border-emerald-500/40 text-emerald-200"
                                          : "bg-amber-600/20 hover:bg-amber-600/35 border-amber-500/40 text-amber-200"
                                      }`}
                                    >
                                      <Goal size={11} /> A la cancha
                                    </button>
                                  ) : (
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        cambiaJugador(j.idJugador, { x: null, y: null });
                                      }}
                                      title={`Sacar a ${j.jugador} de la cancha`}
                                      className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-white/10 hover:bg-rose-600/30 border border-white/15 hover:border-rose-500/40 text-slate-300 text-[10px] font-bold transition-colors"
                                    >
                                      <RotateCcw size={11} /> Sacar
                                    </button>
                                  )}
                              </td>
                            </tr>
                          );
                        })}
                        {jugadores.length === 0 && (
                          <tr>
                            <td colSpan={7} className="px-3 py-8 text-center text-slate-500 text-xs">
                              Este equipo no tiene jugadores activos.
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
                    {enCanchaSinInscripcion.length > 0 && (
                      <p className="mb-2 text-[10px] font-bold text-amber-300 leading-snug flex items-start gap-1.5">
                        <AlertCircle size={12} className="flex-shrink-0 mt-0.5" />
                        <span>
                          {enCanchaSinInscripcion.length === 1 ? "Hay 1 jugador" : `Hay ${enCanchaSinInscripcion.length} jugadores`} en
                          la cancha SIN inscripción en esta temporada:{" "}
                          {enCanchaSinInscripcion.map((j) => nombreCorto(j.jugador)).join(", ")}.
                        </span>
                      </p>
                    )}
                    {enBanca.length === 0 ? (
                      <p className="text-[10px] text-slate-500">
                        {jugadores.length === 0
                          ? "Este equipo no tiene jugadores que acomodar."
                          : "Todo el equipo está en la cancha."}
                      </p>
                    ) : (
                      <div className="flex flex-wrap gap-1.5">
                        {enBanca.map((j) => (
                          <button
                            key={j.idJugador}
                            onClick={() => mandarACancha(j)}
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
                    jugadores={plantilla.jugadores}
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
             es lo que decide el aviso al lado del nombre. Se recarga para que la
             pantalla no se quede diciendo lo de antes. */
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
