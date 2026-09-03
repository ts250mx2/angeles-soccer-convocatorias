"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useUser, usePuedeVer } from "@/contexts/user-context";
import DashboardLayout from "@/components/DashboardLayout";
import {
  AlertCircle, ArrowLeft, CalendarCheck, ChevronLeft, ChevronRight, FileText, Loader2,
  Plus, Printer, Save, Search, Users, X,
} from "lucide-react";
import { partirCategoria } from "@/lib/categoria-equipo";
import {
  aniosDeSede, letraDe, letrasDe, sedesDeEquipos, seleccionHuerfana,
} from "@/lib/selector-equipo";
import {
  COLOR_MARCA, MESES, TEXTO_MARCA, etiquetaMes, porcentajesEnteros, resumenDe, siguienteMarca,
  type DiaClase, type Marca,
} from "@/lib/asistencia";
import AvatarJugador from "@/components/AvatarJugador";
import PlayerPagosModal, { type PagosTarget } from "@/components/PlayerPagosModal";
import { exportarAsistenciaPdf, type AlumnoHoja } from "@/lib/asistencia-export";
import { guardarEquipoRecordado, leerEquipoRecordado } from "@/lib/equipo-recordado";

/**
 * Asistencia: la hoja mensual del equipo, la misma que el club llena en papel.
 *
 * ── Dos caras: la portada y la hoja ──
 *
 * Lo primero que se ve son los equipos a los que YA se les pasó lista ESE MES, con
 * cuántos días llevan capturados y cómo va su asistencia. Es el mismo trato que la
 * Plantilla, y por la misma razón: se entra a seguirle a una lista empezada mucho más
 * seguido que a abrir una en blanco, y antes eso costaba acertarle a tres desplegables
 * sin ninguna pista de dónde había algo capturado. Pasar lista a otro equipo sigue
 * estando: es el otro camino, no el único.
 *
 * La diferencia con la Plantilla es el MES. Una hoja de plantilla no es de ninguna
 * temporada, pero una lista sí es de un mes: la misma pregunta —"¿a quién le falta?"—
 * tiene otra respuesta en agosto que en septiembre. Por eso el mes manda en las dos
 * caras: en la portada decide QUÉ equipos aparecen, y en la hoja, cuáles son las
 * columnas.
 *
 * El equipo se elige igual que en la Plantilla —sede, categoría y letra— y por la
 * misma razón: así está escrito el nombre en la base ('2023C') y así lo busca quien lo
 * tiene en la cabeza. El catálogo de equipos es el MISMO endpoint, que ya solo ofrece los
 * que tienen gente inscrita en la temporada.
 *
 * Las columnas son los días que ESE equipo entrena dentro del mes, no los treinta y uno.
 * La regla vive en @/lib/asistencia.
 *
 * Se marca tocando la celda y CICLA: vacío → vino → faltó → vacío. Un solo gesto para los
 * tres estados, que es lo que se necesita pasando lista con el celular en una mano. Y se
 * guarda el mes completo al apretar Guardar, no celda por celda: pasar lista son quince
 * toques seguidos y una petición por toque sería una tormenta de escrituras.
 */

interface EquipoOpcion {
  IdEquipo: number;
  Equipo: string;
  IdSede: number | null;
  Sede: string | null;
  Jugadores: number;
}

/** Un equipo con lista capturada en el mes, como lo enseña la portada. */
interface ListaDelMes {
  idEquipo: number;
  equipo: string;
  idSede: number | null;
  sede: string;
  profesor: string | null;
  alumnos: number;
  diasConLista: number;
  diasDelMes: number;
  asistencias: number;
  faltas: number;
  pctAsistencia: number | null;
  actualizada: string | null;
}

interface Temporada {
  IdTemporada: number;
  Temporada: string;
  EsActiva: boolean;
}

interface Hoja {
  idEquipo: number;
  equipo: string;
  sede: string;
  profesor: string;
  auxiliar: string;
  horario: string;
  anio: number;
  mes: number;
  dias: DiaClase[];
  alumnos: AlumnoHoja[];
  marcas: Array<{ idJugador: number; fecha: string; marca: Marca }>;
}

const SELECT =
  "appearance-none bg-white/5 border border-white/15 text-slate-200 text-xs py-2 pl-3 pr-8 rounded-lg leading-tight focus:outline-none focus:border-blue-500 [color-scheme:dark] disabled:opacity-40";

const ETIQUETA_SELECT =
  "block mb-1 text-[9px] font-black text-slate-400 uppercase tracking-widest";

/** La llave de una celda: un alumno en un día. */
const llave = (idJugador: number, fecha: string) => `${idJugador}|${fecha}`;

/**
 * Lo que se le cuelga al nombre cuando el alumno debe algo, o null si está al corriente.
 *
 * Se dice aquí, en la hoja, porque es el único momento en que alguien del club tiene al
 * niño enfrente: enterarse el día del corte ya es tarde para cobrarle sin perseguirlo.
 *
 * Deber mensualidades y no haberse inscrito son cosas distintas y se dicen distinto: la
 * misma separación que hacen Adeudos y la Lista de Jugadores.
 */
function avisoAdeudo(a: AlumnoHoja): { texto: string; titulo: string; clase: string } | null {
  if (a.inscrito === false) {
    return {
      texto: "SIN INSCRIBIR",
      titulo: "No tiene pagada la inscripción de la temporada.",
      clase: "bg-amber-500/15 text-amber-300 border-amber-500/30",
    };
  }
  const meses = a.mesesDebe ?? 0;
  if (meses <= 0) return null;
  return {
    texto: meses === 1 ? "DEBE 1 MES" : `DEBE ${meses} MESES`,
    titulo: `Tiene ${meses} mes(es) de mensualidad vencidos sin pagar.`,
    clase: "bg-rose-500/15 text-rose-300 border-rose-500/30",
  };
}

export default function AsistenciaPage() {
  const router = useRouter();
  const { user, isInitialized } = useUser();
  const puedeVer = usePuedeVer("/administracion-deportiva/asistencia");

  /* La lista de equipos recuerda de qué temporada salió y con qué equipo forzado, para
     no decidir nada con la lista anterior mientras llega la nueva. Lo del forzado se
     explica en `abrirLista`. */
  const [equipos, setEquipos] = useState<
    { temporadaId: number; forzado: number | null; lista: EquipoOpcion[] }
  >({ temporadaId: 0, forzado: null, lista: [] });
  const [temporadas, setTemporadas] = useState<Temporada[]>([]);
  const [temporadaId, setTemporadaId] = useState<number | null>(null);
  /* Los tres pasos, en el orden en que se eligen: sede, año y letra. Los mismos que la
     Plantilla, con la misma regla (@/lib/selector-equipo) y la misma memoria. */
  const [idSede, setIdSede] = useState<number | null>(null);
  const [anio, setAnio] = useState("");
  const [idEquipo, setIdEquipo] = useState<number | null>(null);

  const hoy = new Date();
  const [mes, setMes] = useState(hoy.getMonth() + 1);
  const [anioMes, setAnioMes] = useState(hoy.getFullYear());

  /* Las dos caras de la pantalla. Se arranca en la portada: seguirle a una lista del
     mes es lo que se hace casi siempre. */
  const [vista, setVista] = useState<"portada" | "editor">("portada");
  const [listas, setListas] = useState<ListaDelMes[]>([]);
  const [cargandoListas, setCargandoListas] = useState(true);
  const [buscaEquipo, setBuscaEquipo] = useState("");

  const [hoja, setHoja] = useState<Hoja | null>(null);
  /** Lo marcado, en memoria. Se manda completo al guardar. */
  const [marcas, setMarcas] = useState<Map<string, Marca>>(new Map());
  const [busqueda, setBusqueda] = useState("");
  const [cargando, setCargando] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [sucio, setSucio] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  /* El mismo modal que abre la Plantilla al tocar un alumno: pagos, datos generales y
     su foto. Aquí sirve para lo de siempre —"¿este ya pagó?"— sin salir de la hoja. */
  const [pagosTarget, setPagosTarget] = useState<PagosTarget | null>(null);

  useEffect(() => {
    if (isInitialized && !user) router.push("/login");
  }, [user, isInitialized, router]);

  /* Se levanta cuando la carga de temporadas ya intentó restaurar, con o sin éxito.
     Va en un ref y no en estado: solo decide si el efecto de abajo puede escribir, y
     como estado provocaría un render de más sin cambiar nada de lo que se pinta. */
  const yaSeIntentoRestaurar = useRef(false);

  // Las temporadas: no dependen de nada, se piden una vez.
  useEffect(() => {
    if (!user || !puedeVer) return;
    (async () => {
      try {
        const res = await fetch("/api/inscripciones/temporadas");
        const json = await res.json();
        if (json.success) {
          setTemporadas(json.data);
          /* Se retoma el equipo que se estaba viendo. La temporada guardada solo se
             acepta si sigue en el catálogo; si no, se cae a la activa y la validación
             de más abajo suelta el equipo por su cuenta. */
          const recordado = leerEquipoRecordado();
          const existe = recordado
            && (json.data as Temporada[]).some((t) => t.IdTemporada === recordado.temporadaId);
          setTemporadaId(existe ? recordado!.temporadaId : json.temporadaActiva);
          if (existe) {
            setIdSede(recordado!.idSede);
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
      temporadaId && idSede && idEquipo ? { temporadaId, idSede, anio, idEquipo } : null,
    );
  }, [temporadaId, idSede, anio, idEquipo]);

  /* El equipo que la portada pidió abrir y que el catálogo no traería por su cuenta.

     Va en un ref porque no se pinta: solo cambia lo que se le pide al servidor. Ver
     `abrirLista` para por qué hace falta. */
  const equipoForzado = useRef<number | null>(null);
  const [recargaEquipos, setRecargaEquipos] = useState(0);

  /* Los equipos, que sí dependen de la temporada. Mismo endpoint y mismo trato que la
     Plantilla. */
  useEffect(() => {
    if (!user || !puedeVer || !temporadaId) return;
    let vigente = true;
    (async () => {
      try {
        const forzado = equipoForzado.current;
        const extra = forzado ? `&conInscritos=0&equipoId=${forzado}` : "";
        const res = await fetch(
          `/api/administracion-deportiva/equipos?temporadaId=${temporadaId}${extra}`,
          { cache: "no-store" },
        );
        const json = await res.json();
        if (!vigente) return;
        if (json.success) setEquipos({ temporadaId, forzado, lista: json.data });
        else setError(json.message ?? "Error al cargar los equipos");
      } catch {
        if (vigente) setError("Error de conexión");
      }
    })();
    return () => { vigente = false; };
  }, [user, puedeVer, temporadaId, recargaEquipos]);

  /* La lista que se está viendo ya es la que corresponde a lo que se pidió: la temporada
     de ahora Y con el equipo forzado dentro. Mientras no lo sea, nadie decide nada con
     ella —ni soltar la selección, ni traer la hoja—, porque decidiría con la anterior. */
  const listaAlDia = equipos.temporadaId === temporadaId
    && equipos.forzado === equipoForzado.current;

  /* Los equipos con lista capturada en el mes: la portada.

     Se vuelve a pedir al cambiar de mes porque el mes ES la lista, no un filtro que se
     pueda aplicar aquí: agosto y septiembre son dos conjuntos distintos de equipos. */
  const cargarListas = useCallback(async (a: number, m: number) => {
    setCargandoListas(true);
    try {
      const res = await fetch(
        `/api/administracion-deportiva/asistencia/lista?anio=${a}&mes=${m}`,
        { cache: "no-store" },
      );
      const json = await res.json();
      if (json.success) setListas(json.data);
      else setListas([]);
    } catch {
      /* Una portada vacía no impide abrir una hoja nueva, así que no se grita: el error
         que sí importa —el de guardar— aparece en su momento. */
      setListas([]);
    } finally {
      setCargandoListas(false);
    }
  }, []);

  /* Solo mientras se está EN la portada. Estando en la hoja, cambiar de mes no tiene a
     quién avisarle, y volver a la portada dispara este efecto de todas formas: por eso
     lo que se acaba de guardar aparece ahí sin que nadie lo vuelva a pedir a mano. */
  useEffect(() => {
    if (user && puedeVer && vista === "portada") cargarListas(anioMes, mes);
  }, [user, puedeVer, vista, anioMes, mes, cargarListas]);

  /* La búsqueda de la portada corre sobre el equipo, su sede y su profe: son las tres
     formas de identificar una lista —"los 2018X", "los de Saltillo", "los de Ramírez"— y
     cuál se le viene a la cabeza no lo decide esta pantalla. */
  const listasFiltradas = useMemo(() => {
    const q = buscaEquipo.trim().toLowerCase();
    if (!q) return listas;
    return listas.filter((l) =>
      `${l.equipo} ${l.sede} ${l.profesor ?? ""}`.toLowerCase().includes(q),
    );
  }, [listas, buscaEquipo]);

  // Las tres listas de los desplegables, en cascada. La regla vive en @/lib/selector-equipo.
  const sedes = useMemo(() => sedesDeEquipos(equipos.lista), [equipos]);
  const anios = useMemo(() => aniosDeSede(equipos.lista, idSede), [equipos, idSede]);
  const letras = useMemo(() => letrasDe(equipos.lista, idSede, anio), [equipos, idSede, anio]);

  // La selección que ya no existe en la temporada nueva se suelta, y arrastra a la de abajo.
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

  /**
   * Trae la hoja del equipo en ese mes.
   *
   * `conservarMarcas` es para volver a pedirla SIN pisar lo que se lleva capturado: pasa
   * al cerrar la ficha de un alumno, donde se pudo haber puesto su foto o registrado un
   * pago. Sin esa salvedad, abrir una ficha a media lista se llevaría los toques que
   * todavía no se han guardado.
   */
  const cargar = useCallback(async (
    id: number,
    temporada: number,
    a: number,
    m: number,
    conservarMarcas = false,
  ) => {
    setCargando(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/administracion-deportiva/asistencia?idEquipo=${id}&temporadaId=${temporada}&anio=${a}&mes=${m}`,
        { cache: "no-store" },
      );
      const json = await res.json();
      if (json.success) {
        const datos = json.data as Hoja;
        setHoja(datos);
        if (!conservarMarcas) {
          setMarcas(new Map(datos.marcas.map((x) => [llave(x.idJugador, x.fecha), x.marca])));
          setSucio(false);
        }
      } else {
        setError(json.message ?? "Error al cargar la asistencia");
        setHoja(null);
      }
    } catch {
      setError("Error de conexión");
      setHoja(null);
    } finally {
      setCargando(false);
    }
  }, []);

  /* La hoja solo se trae estando en ella. La selección recordada del navegador deja un
     equipo puesto desde el primer render, y sin este candado la portada pediría de fondo
     una hoja que nadie está mirando. */
  useEffect(() => {
    if (vista !== "editor") return;
    if (!idEquipo || !temporadaId) { setHoja(null); return; }
    if (!listaAlDia) return;
    if (!equipos.lista.some((e) => e.IdEquipo === idEquipo)) { setHoja(null); return; }
    cargar(idEquipo, temporadaId, anioMes, mes);
  }, [vista, idEquipo, temporadaId, anioMes, mes, listaAlDia, equipos, cargar]);

  /* Avisar antes de salir con la lista sin guardar: vive en el navegador hasta que se
     aprieta Guardar. */
  useEffect(() => {
    if (!sucio) return;
    const avisar = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener("beforeunload", avisar);
    return () => window.removeEventListener("beforeunload", avisar);
  }, [sucio]);

  const marcar = (idJugador: number, fecha: string) => {
    setMarcas((prev) => {
      const siguiente = new Map(prev);
      const k = llave(idJugador, fecha);
      const nueva = siguienteMarca(siguiente.get(k) ?? null);
      if (nueva === null) siguiente.delete(k);
      else siguiente.set(k, nueva);
      return siguiente;
    });
    setSucio(true);
  };

  /* Pasar lista de un día entero: pone A a todos los que ese día no tengan nada. No pisa
     lo ya marcado —si alguien ya trae F, quien la puso sabía por qué— y volver a tocarlo
     limpia el día completo.

     Actúa sobre los alumnos VISIBLES, no sobre todos: con una búsqueda puesta, marcar
     también a los que están escondidos sería tocar renglones que quien aprieta no está
     viendo. Sin búsqueda, visibles y todos son lo mismo y se comporta como siempre. */
  const marcarDia = (fecha: string) => {
    if (!hoja || alumnosVisibles.length === 0) return;
    const yaLleno = alumnosVisibles.every((a) => marcas.has(llave(a.idJugador, fecha)));
    setMarcas((prev) => {
      const siguiente = new Map(prev);
      alumnosVisibles.forEach((a) => {
        const k = llave(a.idJugador, fecha);
        if (yaLleno) siguiente.delete(k);
        else if (!siguiente.has(k)) siguiente.set(k, "A");
      });
      return siguiente;
    });
    setSucio(true);
  };

  const guardar = async () => {
    if (!hoja) return;
    setGuardando(true);
    setError(null);
    try {
      const res = await fetch("/api/administracion-deportiva/asistencia", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          idEquipo: hoja.idEquipo,
          anio: hoja.anio,
          mes: hoja.mes,
          marcas: [...marcas.entries()].map(([k, marca]) => {
            const [idJugador, fecha] = k.split("|");
            return { idJugador: Number(idJugador), fecha, marca };
          }),
        }),
      });
      const json = await res.json();
      if (json.success) {
        setSucio(false);
        setAviso(`Se guardó la asistencia de ${etiquetaMes(hoja.anio, hoja.mes)}.`);
      } else {
        setError(json.message ?? "Error al guardar la asistencia");
      }
    } catch {
      setError("Error de conexión");
    } finally {
      setGuardando(false);
    }
  };

  /**
   * Cambiar de mes, de equipo o de temporada recarga la hoja, y con eso se pierde lo
   * marcado que no se haya guardado. El aviso de `beforeunload` solo cubre salir del
   * navegador, no moverse dentro de la pantalla: sin esto, rozar la flecha del mes
   * despues de pasar lista a quince ninos se los llevaba sin decir nada.
   */
  const siNoSePierdeNada = (accion: () => void) => {
    if (sucio && !confirm(
      'La asistencia de este mes tiene cambios sin guardar y se van a perder. ¿Continuar de todos modos?',
    )) return;
    accion();
  };

  /**
   * Abre la lista de una tarjeta de la portada.
   *
   * Deja los tres desplegables apuntando a ese equipo —el año sale de su propio nombre,
   * con la misma función que usa el selector— para que la hoja no aparezca contradiciendo
   * a lo que se acaba de abrir, y para poder saltar a la letra de al lado sin volver.
   *
   * ── El equipo forzado ──
   *
   * El catálogo del selector solo ofrece equipos con gente INSCRITA en la temporada
   * elegida, pero la portada lista lo que se capturó en el mes, sin mirar temporadas. Un
   * equipo puede haber tenido lista en marzo y hoy no tener a nadie inscrito: su tarjeta
   * existe y el selector no lo trae. Sin esto, abrirla soltaría la selección por huérfana
   * y la tarjeta parecería no hacer nada. Se vuelve a pedir el catálogo incluyéndolo, y
   * `listaAlDia` se encarga de que nadie decida nada mientras tanto.
   */
  const abrirLista = (l: ListaDelMes) => {
    if (!equipos.lista.some((e) => e.IdEquipo === l.idEquipo)) {
      equipoForzado.current = l.idEquipo;
      setRecargaEquipos((v) => v + 1);
    }
    setIdSede(l.idSede);
    setAnio(partirCategoria(l.equipo).anio);
    setIdEquipo(l.idEquipo);
    setVista("editor");
  };

  /** Vuelve a la portada. Lo capturado sin guardar se pierde, así que se avisa. */
  const volverAPortada = () => {
    siNoSePierdeNada(() => {
      setSucio(false);
      setVista("portada");
    });
  };

  const moverMes = (paso: number) => {
    siNoSePierdeNada(() => {
      const d = new Date(anioMes, mes - 1 + paso, 1);
      setAnioMes(d.getFullYear());
      setMes(d.getMonth() + 1);
    });
  };

  /** El resumen del pie: se cuenta solo lo registrado, nunca las celdas vacías. */
  const resumen = useMemo(() => resumenDe(marcas.values()), [marcas]);
  const pct = useMemo(() => porcentajesEnteros(resumen), [resumen]);

  /**
   * Los entrenamientos del mes, y cuántos tienen lista.
   *
   * Son dos números y hacen falta los dos: el primero es cuántas veces entrena el equipo
   * este mes, y el segundo cuántos de esos días alguien pasó lista. Los porcentajes de
   * arriba solo hablan de los capturados, así que sin la segunda cifra un 100% de
   * asistencia sobre un solo día capturado de nueve se leería como un mes perfecto.
   */
  const entrenamientos = useMemo(() => {
    if (!hoja) return { total: 0, capturados: 0 };
    const conLista = hoja.dias.filter((d) =>
      hoja.alumnos.some((a) => marcas.has(llave(a.idJugador, d.fecha))),
    ).length;
    return { total: hoja.dias.length, capturados: conLista };
  }, [hoja, marcas]);

  /**
   * Celdas que nadie marcó: los huecos de la hoja.
   *
   * Es el complemento exacto de lo capturado sobre la reja completa (días × alumnos), y
   * es la cifra que dice cuánto falta por pasar. Los porcentajes de arriba la excluyen a
   * propósito, así que sin este número no habría forma de saber si un 90% se sacó de la
   * hoja entera o de tres celdas sueltas.
   */
  const sinCapturar = useMemo(() => {
    if (!hoja) return 0;
    return hoja.dias.length * hoja.alumnos.length - resumen.registradas;
  }, [hoja, resumen.registradas]);

  /**
   * Los alumnos que se están viendo. La búsqueda solo esconde renglones: NO cambia las
   * cifras de arriba, que hablan del mes del equipo entero. Un buscador que moviera los
   * totales convertiría "85% de asistencia" en el 85% de lo que uno tecleó.
   */
  const alumnosVisibles = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    if (!hoja) return [];
    if (!q) return hoja.alumnos;
    return hoja.alumnos.filter(
      (a) => a.jugador.toLowerCase().includes(q) || String(a.idJugador) === q,
    );
  }, [hoja, busqueda]);

  /**
   * Lo capturado por alumno: sus asistencias, sus faltas y su porcentaje.
   *
   * El porcentaje de cada renglón se saca con la MISMA regla que el del mes —asistencias
   * entre lo capturado, sin contar las celdas vacías— para que la columna y la tarjeta de
   * arriba no puedan decir cosas distintas del mismo equipo. `null` cuando ese alumno no
   * tiene nada marcado: un 0% ahí diría que faltó a todo, y lo que pasa es que nadie le
   * ha pasado lista.
   */
  const porAlumno = useMemo(() => {
    const out = new Map<number, { a: number; f: number; pct: number | null }>();
    if (!hoja) return out;
    hoja.alumnos.forEach((al) => {
      let a = 0;
      let f = 0;
      hoja.dias.forEach((d) => {
        const m = marcas.get(llave(al.idJugador, d.fecha));
        if (m === "A") a += 1;
        else if (m === "F") f += 1;
      });
      const registradas = a + f;
      out.set(al.idJugador, {
        a,
        f,
        pct: registradas === 0 ? null : Math.round((a / registradas) * 100),
      });
    });
    return out;
  }, [hoja, marcas]);

  /**
   * El control del mes: flechas, mes y año.
   *
   * Se dibuja una sola vez y se usa en las dos caras porque en las dos manda lo mismo —en
   * la portada decide QUÉ equipos aparecen, en la hoja cuáles son las columnas—, y si
   * fueran dos controles distintos bastaría con tocar uno para que dijeran cosas
   * diferentes del mismo mes.
   */
  const controlMes = () => (
    <div className="flex items-center gap-1">
      <button
        onClick={() => moverMes(-1)}
        className="p-2 rounded-lg bg-white/5 hover:bg-white/10 border border-white/15 text-slate-300"
        title="Mes anterior"
        aria-label="Mes anterior"
      >
        <ChevronLeft size={14} />
      </button>
      <select
        id="as-mes"
        value={mes}
        onChange={(e) => siNoSePierdeNada(() => setMes(Number(e.target.value)))}
        className={SELECT}
        aria-label="Mes"
      >
        {MESES.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
      </select>
      <select
        value={anioMes}
        onChange={(e) => siNoSePierdeNada(() => setAnioMes(Number(e.target.value)))}
        className={SELECT}
        aria-label="Año"
      >
        {[hoy.getFullYear() - 2, hoy.getFullYear() - 1, hoy.getFullYear(), hoy.getFullYear() + 1]
          .map((a) => <option key={a} value={a}>{a}</option>)}
      </select>
      <button
        onClick={() => moverMes(1)}
        className="p-2 rounded-lg bg-white/5 hover:bg-white/10 border border-white/15 text-slate-300"
        title="Mes siguiente"
        aria-label="Mes siguiente"
      >
        <ChevronRight size={14} />
      </button>
    </div>
  );

  const imprimir = (conMarcas: boolean) => {
    if (!hoja) return;
    exportarAsistenciaPdf(hoja, marcas, { conMarcas });
  };

  if (!isInitialized) return null;
  if (!puedeVer) {
    return (
      <DashboardLayout>
        <main className="p-8 flex-1">
          <div className="max-w-xl mx-auto bg-[#0f172a] border border-white/20 rounded-xl p-8 text-center">
            <AlertCircle className="mx-auto text-amber-400 mb-3" size={32} />
            <p className="text-slate-200 font-bold">No tienes permiso para ver este módulo.</p>
          </div>
        </main>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <main className="p-4 md:p-8 overflow-y-auto flex-1">
        <div className="max-w-[1500px] mx-auto">
          <div className="bg-[#0f172a] rounded-xl shadow-2xl p-4 md:p-6 border border-white/20">
            {/* Encabezado */}
            <div className="mb-5">
              <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
                <div>
                  <h2 className="text-2xl md:text-3xl font-bold text-white flex items-center gap-3">
                    <CalendarCheck className="text-emerald-400" size={28} />
                    Asistencia
                  </h2>
                  <p className="text-xs text-slate-400 mt-1">
                    {vista === "portada"
                      ? "Los equipos a los que ya se les pasó lista este mes. Abre uno para seguirle."
                      : "La lista del mes. Toca una celda para ciclar: vino, faltó, sin marcar."}
                  </p>
                </div>

                <div className="flex flex-col items-stretch lg:items-end gap-3 w-full lg:w-auto">
                  {/* La temporada va aparte de los otros selectores, arriba a la
                      derecha: no elige QUE hoja se ve como el equipo o el mes, sino de
                      donde salen los alumnos inscritos, y se toca una vez y ya.

                      En la portada no sale: ahi la lista es del MES y no mira temporadas,
                      asi que seria un desplegable que no cambia nada de lo que se ve. */}
                  <div className={`flex items-center gap-2${vista === "portada" ? " hidden" : ""}`}>
                    <label
                      htmlFor="as-temporada"
                      className="text-[9px] font-black text-slate-400 uppercase tracking-widest whitespace-nowrap"
                    >
                      Temporada
                    </label>
                    <select
                      id="as-temporada"
                      value={temporadaId ?? ""}
                      onChange={(e) => siNoSePierdeNada(() => setTemporadaId(Number(e.target.value) || null))}
                      className={SELECT}
                      title="De ella salen los alumnos inscritos"
                    >
                      {temporadas.map((t) => (
                        <option key={t.IdTemporada} value={t.IdTemporada}>
                          {t.Temporada}{t.EsActiva ? " (activa)" : ""}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                  {vista === "editor" && hoja && (
                    <>
                      <button
                        onClick={() => imprimir(false)}
                        className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white/5 hover:bg-white/10 border border-white/15 text-slate-200 text-xs font-bold transition-all"
                        title="La hoja en blanco, para llenarla a mano en la cancha"
                      >
                        <Printer size={14} /> Hoja en blanco
                      </button>
                      <button
                        onClick={() => imprimir(true)}
                        className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-blue-600/15 hover:bg-blue-600/25 border border-blue-500/30 text-blue-200 text-xs font-bold transition-all"
                      >
                        <FileText size={14} /> PDF con lo capturado
                      </button>
                      <button
                        onClick={guardar}
                        disabled={guardando || !sucio}
                        className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:bg-white/10 disabled:text-slate-500 text-white text-xs font-black transition-all"
                      >
                        {guardando ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                        {sucio ? "Guardar" : "Guardado"}
                      </button>
                    </>
                  )}
                  </div>
                </div>
              </div>

              {/* Los selectores, rotulados y en su propio renglón. El equipo solo se
                  elige en la hoja: en la portada quien manda es el mes, y los tres
                  desplegables ahí no filtrarían nada. */}
              {vista === "editor" && (
              <div className="flex flex-wrap items-end gap-2 mt-4">
                <div>
                  <span className={ETIQUETA_SELECT}>&nbsp;</span>
                  <button
                    onClick={volverAPortada}
                    title="Volver a las listas del mes"
                    className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white/5 hover:bg-white/10 border border-white/15 text-slate-300 text-xs font-bold transition-all"
                  >
                    <ArrowLeft size={14} /> Listas
                  </button>
                </div>

                <div>
                  <label htmlFor="as-sede" className={ETIQUETA_SELECT}>Sede:</label>
                  <select
                    id="as-sede"
                    value={idSede ?? ""}
                    onChange={(e) =>
                      siNoSePierdeNada(() => {
                        // Cambiar de sede invalida el año y la letra: son suyos.
                        setIdSede(Number(e.target.value) || null);
                        setAnio("");
                        setIdEquipo(null);
                      })
                    }
                    className={SELECT}
                    title="La misma categoría existe en varias sedes; ésta es la que manda"
                  >
                    <option value="">{sedes.length > 0 ? "Sede..." : "Sin inscritos"}</option>
                    {sedes.map((sd) => (
                      <option key={sd.idSede} value={sd.idSede}>{sd.sede}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label htmlFor="as-categoria" className={ETIQUETA_SELECT}>Categoría:</label>
                  <select
                    id="as-categoria"
                    value={anio}
                    onChange={(e) => siNoSePierdeNada(() => { setAnio(e.target.value); setIdEquipo(null); })}
                    className={SELECT}
                    disabled={!idSede}
                  >
                    <option value="">{idSede ? "Categoría..." : "Elige la sede"}</option>
                    {anios.map((a) => <option key={a} value={a}>{a}</option>)}
                  </select>
                </div>

                <div>
                  <label htmlFor="as-equipo" className={ETIQUETA_SELECT}>Equipo:</label>
                  <select
                    id="as-equipo"
                    value={idEquipo ?? ""}
                    onChange={(e) => siNoSePierdeNada(() => setIdEquipo(Number(e.target.value) || null))}
                    className={SELECT}
                    disabled={!anio}
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

                {/* El mes, con flechas: se consulta el anterior y el siguiente todo el tiempo. */}
                <div>
                  <label htmlFor="as-mes" className={ETIQUETA_SELECT}>Mes:</label>
                  {controlMes()}
                </div>
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
                <button onClick={() => setAviso(null)} className="text-emerald-300/70 hover:text-emerald-100">✕</button>
              </div>
            )}

            {vista === "portada" ? (
              <>
                {/* ── La tarjeta del mes ──
                    El mes va aquí y no perdido entre desplegables porque es LO que decide
                    la lista de abajo: cambiarlo no filtra estas tarjetas, las cambia por
                    otras. Puesto grande, mover la flecha y ver que la lista se renueva es
                    una sola lectura. */}
                <div className="flex flex-wrap items-center justify-between gap-3 mb-4 px-4 py-3 rounded-2xl border border-emerald-500/25 bg-emerald-500/[0.07]">
                  <div className="flex items-center gap-4">
                    <div>
                      <p className="text-[9px] font-black text-emerald-400/80 uppercase tracking-widest">Mes</p>
                      <p className="text-xl font-black text-white leading-tight">
                        {etiquetaMes(anioMes, mes)}
                      </p>
                    </div>
                    {controlMes()}
                  </div>
                  <p className="text-[11px] font-bold text-slate-300">
                    {cargandoListas
                      ? "Buscando..."
                      : listas.length === 0
                        ? "Ningún equipo con lista este mes"
                        : `${listas.length} ${listas.length === 1 ? "equipo con lista" : "equipos con lista"}`}
                  </p>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                  <div className="relative">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                    <input
                      type="search"
                      value={buscaEquipo}
                      onChange={(e) => setBuscaEquipo(e.target.value)}
                      placeholder="Buscar equipo, sede o profe..."
                      className="w-72 max-w-full pl-9 pr-3 py-2 rounded-lg bg-white/5 border border-white/15 text-slate-100 text-xs placeholder:text-slate-500 focus:outline-none focus:border-emerald-500/50"
                    />
                  </div>
                  {/* Pasar lista a otro equipo lleva a la MISMA hoja, con los desplegables
                      en blanco. No es otra pantalla: es la misma sin equipo elegido. */}
                  <button
                    onClick={() => { setIdEquipo(null); setVista("editor"); }}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black transition-all"
                  >
                    <Plus size={15} /> Pasar lista a otro equipo
                  </button>
                </div>

                {cargandoListas ? (
                  <div className="flex flex-col items-center justify-center gap-3 py-24 text-slate-400">
                    <Loader2 size={30} className="animate-spin text-emerald-400" />
                    <p className="text-sm font-bold">Cargando las listas del mes...</p>
                  </div>
                ) : listasFiltradas.length === 0 ? (
                  <div className="text-center py-20">
                    <CalendarCheck size={34} className="mx-auto text-slate-700 mb-3" />
                    <p className="text-slate-300 font-bold text-sm">
                      {listas.length === 0
                        ? `Nadie ha pasado lista en ${etiquetaMes(anioMes, mes)}`
                        : "Ningún equipo coincide con la búsqueda"}
                    </p>
                    <p className="text-slate-500 text-xs mt-1">
                      {listas.length === 0
                        ? "Cambia de mes con las flechas, o empieza una con «Pasar lista a otro equipo»."
                        : "Prueba con el año, la letra, la sede o el nombre del profe."}
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                    {listasFiltradas.map((l) => (
                      <button
                        key={l.idEquipo}
                        onClick={() => abrirLista(l)}
                        title={`Abrir la lista de ${l.equipo} de ${etiquetaMes(anioMes, mes)}`}
                        className="text-left p-3.5 rounded-2xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/10 hover:border-emerald-500/40 transition-all"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="text-sm font-black text-white truncate">{l.equipo}</p>
                            <p className="text-[10px] font-bold text-slate-400 truncate">{l.sede || "Sin sede"}</p>
                          </div>
                          {/* El porcentaje de asistencia de lo capturado, con la MISMA
                              regla del pie de la hoja. Se pinta de color porque es la
                              cifra que se busca al barrer la portada con la vista. */}
                          {l.pctAsistencia !== null && (
                            <span
                              title={`${l.asistencias} asistencias y ${l.faltas} faltas capturadas`}
                              className={`flex-shrink-0 px-2 py-1 rounded-lg text-[10px] font-black tabular-nums border ${
                                l.pctAsistencia >= 80
                                  ? "bg-emerald-500/15 border-emerald-500/30 text-emerald-300"
                                  : l.pctAsistencia >= 60
                                    ? "bg-amber-500/15 border-amber-500/30 text-amber-300"
                                    : "bg-rose-500/15 border-rose-500/30 text-rose-300"
                              }`}
                            >
                              {l.pctAsistencia}%
                            </span>
                          )}
                        </div>

                        {/* Días con lista sobre los que el equipo entrena en el mes. Es lo
                            que distingue un mes terminado de uno que alguien empezó y
                            dejó, y es justo lo que se viene a buscar aquí. */}
                        <div className="mt-2.5 flex items-center gap-2">
                          <div className="flex-1 h-1.5 rounded-full bg-white/10 overflow-hidden">
                            <div
                              className="h-full rounded-full bg-emerald-500"
                              style={{
                                width: `${l.diasDelMes > 0
                                  ? Math.min(100, Math.round((l.diasConLista / l.diasDelMes) * 100))
                                  : 100}%`,
                              }}
                            />
                          </div>
                          <span className="text-[10px] font-black text-slate-300 tabular-nums whitespace-nowrap">
                            {l.diasDelMes > 0
                              ? `${l.diasConLista}/${l.diasDelMes} días`
                              : `${l.diasConLista} ${l.diasConLista === 1 ? "día" : "días"}`}
                          </span>
                        </div>

                        <div className="mt-2 flex items-center justify-between gap-2 text-[10px] text-slate-500 font-bold">
                          <span className="inline-flex items-center gap-1 min-w-0">
                            <Users size={11} className="flex-shrink-0" />
                            <span className="truncate">
                              {l.alumnos} {l.alumnos === 1 ? "alumno" : "alumnos"}
                              {l.profesor ? ` · ${l.profesor}` : ""}
                            </span>
                          </span>
                          {l.actualizada && <span className="flex-shrink-0 tabular-nums">{l.actualizada}</span>}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </>
            ) : cargando ? (
              <div className="flex flex-col items-center justify-center gap-3 py-24 text-slate-400">
                <Loader2 size={30} className="animate-spin text-emerald-400" />
                <p className="text-sm font-bold">Cargando la lista...</p>
              </div>
            ) : !hoja ? (
              <div className="text-center py-20">
                <CalendarCheck size={34} className="mx-auto text-slate-700 mb-3" />
                <p className="text-slate-300 font-bold text-sm">Elige la sede, la categoría y su letra</p>
                <p className="text-slate-500 text-xs mt-1">
                  Solo se ofrecen los equipos con jugadores inscritos en la temporada elegida.
                </p>
              </div>
            ) : (
              <>
                {/* El encabezado de la hoja, como en el papel */}
                <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 mb-4 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-lg font-black text-white leading-tight">
                      {hoja.sede || "SIN SEDE"} · {hoja.equipo}
                    </p>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      {hoja.horario || "HORARIO SIN CAPTURAR"} · PROF: {hoja.profesor || "SIN ASIGNAR"}
                      {hoja.auxiliar ? ` · AUX: ${hoja.auxiliar}` : ""}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-black text-emerald-300">{etiquetaMes(hoja.anio, hoja.mes)}</p>
                    <p className="text-[11px] text-slate-400">
                      {resumen.registradas === 0
                        ? "Sin nada capturado"
                        : `${resumen.registradas} de ${hoja.dias.length * hoja.alumnos.length} celdas capturadas`}
                    </p>
                  </div>
                </div>

                {/* ── Lo que da el mes ──
                    Los porcentajes se miden SOLO sobre lo capturado, nunca sobre las
                    celdas vacías: meterlas como faltas castigaría al equipo por los días
                    que el profe no pasó lista, y meterlas como asistencias los regalaría.
                    Por eso la tarjeta de entrenamientos dice también cuántos tienen
                    lista: es la que deja leer los otros cuatro números. */}
                <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3 mb-4">
                  <CifraAsistencia
                    etiqueta="Entrenamientos"
                    valor={String(entrenamientos.total)}
                    clase="text-white"
                    nota={
                      entrenamientos.total === 0
                        ? undefined
                        : `${entrenamientos.capturados} con lista`
                    }
                    title="Días que este equipo entrena en el mes, según su horario. Es el número de columnas de la hoja."
                  />
                  <CifraAsistencia
                    etiqueta="Asistencias"
                    valor={String(resumen.asistencias)}
                    clase="text-emerald-300"
                    title="Celdas marcadas como que el alumno vino."
                  />
                  <CifraAsistencia
                    etiqueta="Faltas"
                    valor={String(resumen.faltas)}
                    clase="text-rose-300"
                    title="Celdas marcadas como que el alumno no vino."
                  />
                  <CifraAsistencia
                    etiqueta="% Asistencia"
                    valor={pct ? `${pct.asistencia}%` : "—"}
                    clase="text-emerald-300"
                    nota={resumen.registradas > 0 ? `de ${resumen.registradas} capturadas` : undefined}
                    title="Asistencias entre lo capturado. Las celdas sin marcar no cuentan ni arriba ni abajo de la división."
                  />
                  <CifraAsistencia
                    etiqueta="Sin capturar"
                    valor={String(sinCapturar)}
                    clase="text-slate-300"
                    nota={
                      hoja.alumnos.length > 0
                        ? `de ${hoja.dias.length * hoja.alumnos.length} celdas`
                        : undefined
                    }
                    title="Celdas que nadie marcó: ni asistencia ni falta. Es lo que falta por pasar, y no entra en ninguno de los dos porcentajes."
                  />
                  <CifraAsistencia
                    etiqueta="% Faltas"
                    valor={pct ? `${pct.falta}%` : "—"}
                    clase="text-rose-300"
                    nota={resumen.registradas > 0 ? `de ${resumen.registradas} capturadas` : undefined}
                    title="Faltas entre lo capturado. Se deriva del porcentaje de asistencia para que los dos sumen 100 exactos."
                  />
                </div>

                {hoja.dias.length === 0 ? (
                  <div className="text-center py-16 rounded-2xl border border-amber-500/30 bg-amber-500/5">
                    <AlertCircle size={28} className="mx-auto text-amber-400 mb-3" />
                    <p className="text-amber-200 font-bold text-sm">Este equipo no tiene días de entrenamiento capturados</p>
                    <p className="text-slate-400 text-xs mt-1">
                      Sin días no hay columnas que llenar. Se capturan en el horario del equipo.
                    </p>
                  </div>
                ) : hoja.alumnos.length === 0 ? (
                  <div className="text-center py-16 rounded-2xl border border-white/10">
                    <p className="text-slate-300 font-bold text-sm">Nadie del equipo está inscrito en esta temporada</p>
                  </div>
                ) : (
                  <>
                    {/* Buscador. Solo esconde renglones: las cifras de arriba siguen
                        siendo las del equipo entero. Con quince alumnos no haría falta,
                        pero los grupos de clinics pasan de setenta y ahí encontrar a uno
                        para corregirle una marca es lo que cuesta. */}
                    <div className="flex items-center gap-2 mb-3">
                      <div className="relative flex-1 max-w-sm">
                        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
                        <input
                          type="text"
                          value={busqueda}
                          onChange={(e) => setBusqueda(e.target.value)}
                          placeholder="Buscar alumno por nombre o número..."
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
                      {busqueda && (
                        <p className="text-[10px] font-bold text-slate-400 whitespace-nowrap">
                          {alumnosVisibles.length} de {hoja.alumnos.length}
                          {alumnosVisibles.length > 0 && (
                            <span className="text-slate-500"> · pasar lista solo marca a los visibles</span>
                          )}
                        </p>
                      )}
                    </div>

                    {alumnosVisibles.length === 0 ? (
                      <div className="text-center py-12 rounded-2xl border border-white/10">
                        <p className="text-slate-300 font-bold text-sm">Ningún alumno con ese nombre</p>
                        <p className="text-slate-500 text-xs mt-1">
                          Son {hoja.alumnos.length} en el equipo. Limpia la búsqueda para verlos todos.
                        </p>
                      </div>
                    ) : (
                    <div className="overflow-x-auto rounded-2xl border border-white/10">
                      <table className="w-full">
                        <thead>
                          <tr className="bg-slate-800">
                            <th className="px-2 py-2 text-[9px] font-black text-slate-400 uppercase tracking-widest w-8">#</th>
                            <th className="px-2 py-2 text-left text-[9px] font-black text-slate-400 uppercase tracking-widest">
                              Nombre del alumno
                            </th>
                            {/* La beca se dice, pero no manda: es una nota al margen de la
                                hoja, no la razón por la que alguien la abre. Estrecha y
                                chica, con el texto completo en el title. */}
                            <th className="px-2 py-2 text-left text-[9px] font-black text-slate-500 uppercase tracking-widest w-24">
                              Beca
                            </th>
                            {hoja.dias.map((d) => (
                              <th key={d.fecha} className="px-1 py-1 w-11">
                                {/* El encabezado del día pasa lista de todos de un golpe. */}
                                <button
                                  onClick={() => marcarDia(d.fecha)}
                                  title={`${d.etiqueta}${d.horas ? ` · ${d.horas}` : ""} — marcar a todos como que vinieron`}
                                  className="w-full px-1 py-1.5 rounded-md text-[10px] font-black text-slate-300 hover:bg-white/10 transition-colors"
                                >
                                  {d.etiqueta}
                                </button>
                              </th>
                            ))}
                            <th className="px-2 py-2 text-[9px] font-black text-slate-400 uppercase tracking-widest w-16">
                              Total
                            </th>
                            <th
                              className="px-2 py-2 text-[9px] font-black text-slate-400 uppercase tracking-widest w-14"
                              title="Asistencias de ese alumno entre lo que se le capturó. Las celdas sin marcar no cuentan."
                            >
                              %
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {alumnosVisibles.map((a, i) => {
                            const cuenta = porAlumno.get(a.idJugador) ?? { a: 0, f: 0, pct: null };
                            return (
                              <tr key={a.idJugador} className="border-b border-white/5 last:border-b-0 hover:bg-white/[0.03]">
                                <td className="px-2 py-1.5 text-center text-[10px] font-mono text-slate-500 tabular-nums">
                                  {i + 1}
                                </td>
                                <td className="px-2 py-1.5">
                                  <button
                                    type="button"
                                    onClick={() => setPagosTarget({ idJugador: a.idJugador, jugador: a.jugador })}
                                    title={`Ver la ficha de ${a.jugador}`}
                                    className="flex items-center gap-2 min-w-0 text-left rounded-lg -mx-1 px-1 py-0.5 hover:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60 transition-colors"
                                  >
                                    {/* El mismo avatar que la Plantilla y la Lista: sin foto
                                        pinta las iniciales, del mismo tamaño, para que los
                                        renglones no queden de distinta altura. */}
                                    <AvatarJugador
                                      idJugador={a.idJugador}
                                      nombre={a.jugador}
                                      tieneFoto={a.tieneFoto}
                                      fotoVersion={a.fotoVersion}
                                      tamano={32}
                                    />
                                    <div className="min-w-0">
                                      <span className="text-[11px] font-bold text-slate-100">{a.jugador}</span>
                                      {avisoAdeudo(a) && (
                                        <span
                                          title={avisoAdeudo(a)!.titulo}
                                          className={`ml-2 align-middle text-[9px] font-black px-1.5 py-0.5 rounded-md border whitespace-nowrap ${avisoAdeudo(a)!.clase}`}
                                        >
                                          {avisoAdeudo(a)!.texto}
                                        </span>
                                      )}
                                    </div>
                                  </button>
                                </td>
                                <td
                                  className="px-2 py-1.5 text-[9px] leading-tight text-amber-300/70 max-w-[6rem] truncate"
                                  title={a.observacion || undefined}
                                >
                                  {a.observacion}
                                </td>
                                {hoja.dias.map((d) => {
                                  const m = marcas.get(llave(a.idJugador, d.fecha)) ?? null;
                                  return (
                                    <td key={d.fecha} className="px-1 py-1 text-center">
                                      <button
                                        onClick={() => marcar(a.idJugador, d.fecha)}
                                        title={`${a.jugador} · ${d.etiqueta}`}
                                        aria-label={`${a.jugador}, ${d.etiqueta}: ${m === "A" ? "vino" : m === "F" ? "faltó" : "sin marcar"}`}
                                        className={`w-8 h-7 rounded-md text-[12px] font-black transition-colors ${
                                          m ? COLOR_MARCA[m] : "bg-white/5 text-slate-600 hover:bg-white/15"
                                        }`}
                                      >
                                        {m ? TEXTO_MARCA[m] : "·"}
                                      </button>
                                    </td>
                                  );
                                })}
                                <td className="px-2 py-1.5 text-center text-[10px] tabular-nums whitespace-nowrap">
                                  <span className="text-emerald-400 font-black">{cuenta.a}</span>
                                  <span className="text-slate-600"> / </span>
                                  <span className="text-rose-400 font-black">{cuenta.f}</span>
                                </td>
                                {/* Verde de 80% para arriba, ámbar de 60 a 79, rojo abajo.
                                    Son los cortes con los que el club ya habla de la
                                    asistencia de un niño, y un número suelto no distingue
                                    al que va bien del que hay que llamar. */}
                                <td className="px-2 py-1.5 text-center text-[11px] font-black tabular-nums whitespace-nowrap">
                                  {cuenta.pct === null ? (
                                    <span className="text-slate-600 font-normal">—</span>
                                  ) : (
                                    <span
                                      title={`${cuenta.a} de ${cuenta.a + cuenta.f} capturadas`}
                                      className={
                                        cuenta.pct >= 80
                                          ? "text-emerald-400"
                                          : cuenta.pct >= 60
                                            ? "text-amber-400"
                                            : "text-rose-400"
                                      }
                                    >
                                      {cuenta.pct}%
                                    </span>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                    )}

                    <p className="text-[10px] text-slate-500 mt-3">
                      Toca una celda para ciclar entre <b className="text-emerald-400">✓ vino</b>,{" "}
                      <b className="text-rose-400">F faltó</b> y sin marcar. Toca el encabezado de un día para pasar
                      lista de todos de un golpe. El porcentaje se saca solo sobre lo registrado: las celdas sin marcar
                      no cuentan como falta, porque no es lo mismo que el niño no viniera a que nadie pasara lista.
                    </p>
                  </>
                )}
              </>
            )}
          </div>
        </div>
      </main>

      {/* Al cerrarlo se recarga la hoja: adentro se pudo haber puesto la foto del niño o
          registrado un pago, y las dos cosas se ven en este listado. */}
      <PlayerPagosModal
        target={pagosTarget}
        temporadaId={temporadaId}
        temporadaNombre={temporadas.find((t) => t.IdTemporada === temporadaId)?.Temporada}
        onClose={() => setPagosTarget(null)}
        onDataChanged={() => {
          // Con `true`: refresca la foto y los datos SIN tirar la lista a medio capturar.
          if (idEquipo && temporadaId) cargar(idEquipo, temporadaId, anioMes, mes, true);
        }}
      />
    </DashboardLayout>
  );
}

/** Una cifra del mes. Es solo lectura: aquí no hay nada que filtrar, la hoja ya es de un
 *  equipo y un mes concretos. */
function CifraAsistencia({
  etiqueta,
  valor,
  clase,
  nota,
  title,
}: {
  etiqueta: string;
  valor: string;
  clase: string;
  /** Renglón chico bajo la cifra: contra qué se mide. */
  nota?: string;
  title?: string;
}) {
  return (
    <div title={title} className="rounded-xl px-4 py-3 border bg-white/5 border-white/10">
      <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest">{etiqueta}</p>
      <p className={`text-2xl font-black tabular-nums ${clase}`}>{valor}</p>
      {nota && <p className="text-[9px] font-bold text-slate-500">{nota}</p>}
    </div>
  );
}
