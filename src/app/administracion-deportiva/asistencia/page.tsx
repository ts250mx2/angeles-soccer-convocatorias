"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useUser, usePuedeVer } from "@/contexts/user-context";
import DashboardLayout from "@/components/DashboardLayout";
import {
  AlertCircle, CalendarCheck, ChevronLeft, ChevronRight, FileText, Loader2, Save, Printer,
} from "lucide-react";
import { partirCategoria } from "@/lib/categoria-equipo";
import {
  COLOR_MARCA, MESES, TEXTO_MARCA, etiquetaMes, resumenDe, siguienteMarca,
  type DiaClase, type Marca,
} from "@/lib/asistencia";
import AvatarJugador from "@/components/AvatarJugador";
import PlayerPagosModal, { type PagosTarget } from "@/components/PlayerPagosModal";
import { exportarAsistenciaPdf, type AlumnoHoja } from "@/lib/asistencia-export";
import { guardarEquipoRecordado, leerEquipoRecordado } from "@/lib/equipo-recordado";

/**
 * Asistencia: la hoja mensual del equipo, la misma que el club llena en papel.
 *
 * El equipo se elige igual que en la Plantilla —temporada, categoría y letra— y por la
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
  Sede: string | null;
  Jugadores: number;
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

  const [equipos, setEquipos] = useState<{ temporadaId: number; lista: EquipoOpcion[] }>(
    { temporadaId: 0, lista: [] },
  );
  const [temporadas, setTemporadas] = useState<Temporada[]>([]);
  const [temporadaId, setTemporadaId] = useState<number | null>(null);
  const [anio, setAnio] = useState("");
  const [idEquipo, setIdEquipo] = useState<number | null>(null);

  const hoy = new Date();
  const [mes, setMes] = useState(hoy.getMonth() + 1);
  const [anioMes, setAnioMes] = useState(hoy.getFullYear());

  const [hoja, setHoja] = useState<Hoja | null>(null);
  /** Lo marcado, en memoria. Se manda completo al guardar. */
  const [marcas, setMarcas] = useState<Map<string, Marca>>(new Map());
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

  /* Los equipos, que sí dependen de la temporada. Mismo endpoint y mismo trato que la
     Plantilla: la lista recuerda de qué temporada salió, para no decidir nada con la
     lista anterior mientras llega la nueva. */
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
    return () => { vigente = false; };
  }, [user, puedeVer, temporadaId]);

  const listaAlDia = equipos.temporadaId === temporadaId;

  const anios = useMemo(
    () =>
      [...new Set(equipos.lista.map((e) => partirCategoria(e.Equipo).anio).filter(Boolean))].sort(
        (a, b) => b.localeCompare(a),
      ),
    [equipos],
  );

  const letras = useMemo(
    () => (anio ? equipos.lista.filter((e) => partirCategoria(e.Equipo).anio === anio) : []),
    [equipos, anio],
  );

  // La selección que ya no existe en la temporada nueva se suelta.
  useEffect(() => {
    if (!listaAlDia) return;
    if (anio && !anios.includes(anio)) {
      setAnio("");
      setIdEquipo(null);
      return;
    }
    if (idEquipo && !equipos.lista.some((e) => e.IdEquipo === idEquipo)) setIdEquipo(null);
  }, [listaAlDia, equipos, anios, anio, idEquipo]);

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

  useEffect(() => {
    if (!idEquipo || !temporadaId) { setHoja(null); return; }
    if (!listaAlDia) return;
    if (!equipos.lista.some((e) => e.IdEquipo === idEquipo)) { setHoja(null); return; }
    cargar(idEquipo, temporadaId, anioMes, mes);
  }, [idEquipo, temporadaId, anioMes, mes, listaAlDia, equipos, cargar]);

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
     limpia el día completo. */
  const marcarDia = (fecha: string) => {
    if (!hoja) return;
    const yaLleno = hoja.alumnos.every((a) => marcas.has(llave(a.idJugador, fecha)));
    setMarcas((prev) => {
      const siguiente = new Map(prev);
      hoja.alumnos.forEach((a) => {
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

  const moverMes = (paso: number) => {
    siNoSePierdeNada(() => {
      const d = new Date(anioMes, mes - 1 + paso, 1);
      setAnioMes(d.getFullYear());
      setMes(d.getMonth() + 1);
    });
  };

  /** El resumen del pie: se cuenta solo lo registrado, nunca las celdas vacías. */
  const resumen = useMemo(() => resumenDe(marcas.values()), [marcas]);

  /** Lo capturado por alumno, para la columna del final. */
  const porAlumno = useMemo(() => {
    const out = new Map<number, { a: number; f: number }>();
    if (!hoja) return out;
    hoja.alumnos.forEach((al) => {
      let a = 0;
      let f = 0;
      hoja.dias.forEach((d) => {
        const m = marcas.get(llave(al.idJugador, d.fecha));
        if (m === "A") a += 1;
        else if (m === "F") f += 1;
      });
      out.set(al.idJugador, { a, f });
    });
    return out;
  }, [hoja, marcas]);

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
                    La lista del mes. Toca una celda para ciclar: vino, faltó, sin marcar.
                  </p>
                </div>

                <div className="flex flex-col items-stretch lg:items-end gap-3 w-full lg:w-auto">
                  {/* La temporada va aparte de los otros selectores, arriba a la
                      derecha: no elige QUE hoja se ve como el equipo o el mes, sino de
                      donde salen los alumnos inscritos, y se toca una vez y ya. */}
                  <div className="flex items-center gap-2">
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
                  {hoja && (
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

              {/* Los selectores, rotulados y en su propio renglón. */}
              <div className="flex flex-wrap items-end gap-2 mt-4">
                <div>
                  <label htmlFor="as-categoria" className={ETIQUETA_SELECT}>Categoría:</label>
                  <select
                    id="as-categoria"
                    value={anio}
                    onChange={(e) => siNoSePierdeNada(() => { setAnio(e.target.value); setIdEquipo(null); })}
                    className={SELECT}
                  >
                    <option value="">{anios.length > 0 ? "Categoría..." : "Sin inscritos"}</option>
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
                    {letras.map((e) => (
                      <option key={e.IdEquipo} value={e.IdEquipo}>
                        {partirCategoria(e.Equipo).equipo || e.Equipo}
                        {e.Sede ? ` · ${e.Sede}` : ""} ({e.Jugadores})
                      </option>
                    ))}
                  </select>
                </div>

                {/* El mes, con flechas: se consulta el anterior y el siguiente todo el tiempo. */}
                <div>
                  <label htmlFor="as-mes" className={ETIQUETA_SELECT}>Mes:</label>
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
                </div>
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
                <button onClick={() => setAviso(null)} className="text-emerald-300/70 hover:text-emerald-100">✕</button>
              </div>
            )}

            {cargando ? (
              <div className="flex flex-col items-center justify-center gap-3 py-24 text-slate-400">
                <Loader2 size={30} className="animate-spin text-emerald-400" />
                <p className="text-sm font-bold">Cargando la lista...</p>
              </div>
            ) : !hoja ? (
              <div className="text-center py-20">
                <CalendarCheck size={34} className="mx-auto text-slate-700 mb-3" />
                <p className="text-slate-300 font-bold text-sm">Elige una categoría y su letra</p>
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
                      {resumen.porcentaje === null
                        ? "Sin nada capturado"
                        : `${resumen.porcentaje.toFixed(0)}% de asistencia · ${resumen.asistencias} vinieron, ${resumen.faltas} faltaron`}
                    </p>
                  </div>
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
                    <div className="overflow-x-auto rounded-2xl border border-white/10">
                      <table className="w-full">
                        <thead>
                          <tr className="bg-slate-800">
                            <th className="px-2 py-2 text-[9px] font-black text-slate-400 uppercase tracking-widest w-8">#</th>
                            <th className="px-2 py-2 text-left text-[9px] font-black text-slate-400 uppercase tracking-widest">
                              Nombre del alumno
                            </th>
                            <th className="px-2 py-2 text-left text-[9px] font-black text-slate-400 uppercase tracking-widest">
                              Observación (beca)
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
                          </tr>
                        </thead>
                        <tbody>
                          {hoja.alumnos.map((a, i) => {
                            const cuenta = porAlumno.get(a.idJugador) ?? { a: 0, f: 0 };
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
                                <td className="px-2 py-1.5 text-[10px] text-amber-300/80">{a.observacion}</td>
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
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>

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
