"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertCircle, AlertTriangle, Check, GraduationCap, Loader2, MapPin,
  Save, Search, Users, X,
} from "lucide-react";
import {
  ACTIVO, BAJA, ESQUEMAS_PAGO, FICHA_NUEVA, GENEROS, TIPOS_JUGADOR, VIVE_CON,
  type OpcionCatalogo,
} from "@/lib/jugador-form";
import FotoJugador from "@/components/FotoJugador";
import PedirFotoJugador from "@/components/PedirFotoJugador";

/**
 * La Hoja de Registro: alta y edición de la ficha del jugador.
 *
 * Es el frmCapJugador del sistema de escritorio, con sus mismos apartados —generales,
 * escolares, familiares y observaciones— para que quien captura en los dos lados
 * encuentre los campos donde ya sabe, presentado como el formato de papel que le da
 * nombre: membrete arriba, folio a la derecha y la foto en su recuadro.
 *
 * Lo único que la hoja de papel no tiene es la FOTO, que aquí sí se captura (cámara,
 * arrastrar, pegar o archivo) y se guarda en tblJugadores.Foto. Ver `FotoJugador` y
 * migrations/019-foto-jugador.sql.
 *
 * Tres cosas se resuelven aquí y no se teclean, porque tecleadas es como se llenó la
 * base de datos que no empatan con ningún catálogo:
 *
 *   La CATEGORÍA sale del selector de equipos, y arrastra el IdEquipo y el entrenador.
 *   Depende de la sede, del año de nacimiento y del género, así que el selector se
 *   apaga hasta que esos tres están capturados, y se limpia si alguno cambia: un equipo
 *   elegido para un 2015 no vale si luego resulta que el niño es 2017.
 *
 *   La ESCUELA sale del catálogo del estado de la sede, igual que en el escritorio.
 *
 *   La DIRECCIÓN se autocompleta con el código postal (catálogo SEPOMEX), como en el
 *   preregistro público. El estado y el municipio siguen siendo editables: hay
 *   domicilios que el catálogo no trae.
 */

export interface OpcionSede {
  IdSede: number;
  Sede: string;
  Estado: string | null;
}

interface EquipoDisponible {
  IdEquipo: number;
  Equipo: string;
  Coach: string | null;
  Cupo: number | null;
  Inscritos: number;
  Dias: string | null;
}

interface EscuelaOpcion {
  IdEscuela: number;
  Escuela: string;
  Municipio: string | null;
  NivelEducativo: string | null;
}

type Ficha = typeof FICHA_NUEVA;

const CAMPO =
  "w-full bg-slate-800/70 border border-slate-600 focus:border-blue-400 rounded-xl px-3 py-2.5 text-sm text-white outline-none transition-colors placeholder-slate-600 disabled:opacity-40 disabled:cursor-not-allowed";
const ETIQUETA = "block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5";
const SECCION = "bg-white/[0.03] border border-white/10 rounded-2xl p-4 md:p-5";
const TITULO_SECCION =
  "text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-1.5";

/** El año de nacimiento con el que se filtran los equipos. 0 si aún no hay fecha. */
const anioDe = (fecha: string): number => {
  const m = /^(\d{4})-\d{2}-\d{2}$/.exec(fecha);
  return m ? Number(m[1]) : 0;
};

export default function JugadorModal({
  idJugador,
  sedes,
  onCerrar,
  onGuardado,
}: {
  /** null para dar de alta; el id del jugador para editar su ficha. */
  idJugador: number | null;
  sedes: OpcionSede[];
  onCerrar: () => void;
  /** Se llama tras guardar, para que la lista se recargue. */
  onGuardado: (idJugador: number, esAlta: boolean) => void;
}) {
  const esAlta = idJugador === null;

  const [ficha, setFicha] = useState<Ficha>(FICHA_NUEVA);
  const [nivelEducativo, setNivelEducativo] = useState("");
  const [cargando, setCargando] = useState(!esAlta);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cambia = useCallback(<K extends keyof Ficha>(campo: K, valor: Ficha[K]) => {
    setFicha((prev) => ({ ...prev, [campo]: valor }));
  }, []);

  // ── La ficha que se va a editar ──
  useEffect(() => {
    if (idJugador === null) return;
    let vivo = true;
    setCargando(true);
    (async () => {
      try {
        const res = await fetch(`/api/jugadores/ficha/${idJugador}`, { cache: "no-store" });
        const json = await res.json();
        if (!vivo) return;
        if (json.success) {
          setFicha({ ...FICHA_NUEVA, ...json.data.ficha });
          setNivelEducativo(json.data.nivelEducativo ?? "");
        } else {
          setError(json.message ?? "No se pudo abrir la ficha del jugador.");
        }
      } catch {
        if (vivo) setError("Error de conexión al abrir la ficha.");
      } finally {
        if (vivo) setCargando(false);
      }
    })();
    return () => { vivo = false; };
  }, [idJugador]);

  // Cerrar con Escape, salvo mientras se guarda: interrumpir a media escritura confunde.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" && !guardando) onCerrar(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onCerrar, guardando]);

  const anio = anioDe(ficha.fechaNacimiento);
  const sedeElegida = sedes.find((s) => s.IdSede === Number(ficha.idSede));
  /* El catálogo de escuelas se consulta por estado, y el que manda es el de la SEDE, no
     el del domicilio del jugador: así lo hace el escritorio, y es lo que hace que a un
     niño de Saltillo se le ofrezcan las escuelas de Coahuila. */
  const estadoSede = sedeElegida?.Estado ?? ficha.estado;

  // ── Equipos disponibles: dependen de sede + año + género ──

  /* Los tres datos que mandan, juntos en una cadena. La lista de equipos se guarda con
     la clave para la que se pidió, y no suelta: así se sabe SI la lista que hay en la
     mano corresponde a lo que está capturado, que es distinto de "ya no está cargando".
     Con un simple interruptor de carga había una ventana —el primer render en que los
     tres datos quedan completos— en la que la lista estaba vacía y el interruptor
     todavía apagado, y ahí se borraba la categoría de un jugador que sí la tenía. */
  const puedeElegirEquipo = Number(ficha.idSede) > 0 && anio > 0 && Number(ficha.genero) > 0;
  const claveEquipos = puedeElegirEquipo ? `${ficha.idSede}|${anio}|${ficha.genero}` : "";

  const [equiposDe, setEquiposDe] = useState<{
    clave: string;
    lista: EquipoDisponible[];
    aviso: string | null;
  } | null>(null);

  const listaAlDia = equiposDe?.clave === claveEquipos;
  /* Memorizada porque de ella cuelga el efecto que suelta la categoría: sin esto, el
     `[]` de "todavía no hay lista" sería un arreglo nuevo en cada render y el efecto se
     volvería a disparar en todos. */
  const equipos = useMemo(
    () => (listaAlDia && equiposDe ? equiposDe.lista : []),
    [listaAlDia, equiposDe],
  );
  const avisoEquipos = listaAlDia ? equiposDe!.aviso : null;
  const cargandoEquipos = puedeElegirEquipo && !listaAlDia;

  useEffect(() => {
    if (!claveEquipos) return;
    let vivo = true;
    (async () => {
      const params = new URLSearchParams({
        idSede: String(ficha.idSede),
        anioNacimiento: String(anio),
        genero: String(ficha.genero),
      });
      try {
        const res = await fetch(`/api/jugadores/equipos?${params}`, { cache: "no-store" });
        const json = await res.json();
        if (!vivo) return;
        setEquiposDe({
          clave: claveEquipos,
          lista: json.success ? json.data : [],
          aviso: json.success
            ? json.data.length === 0
              ? "Esa sede no tiene equipos abiertos para ese año y género."
              : null
            : json.message ?? "No se pudieron cargar los equipos.",
        });
      } catch {
        if (vivo) {
          setEquiposDe({ clave: claveEquipos, lista: [], aviso: "Error de conexión al cargar los equipos." });
        }
      }
    })();
    return () => { vivo = false; };
  }, [claveEquipos, ficha.idSede, ficha.genero, anio]);

  /* Si la categoría capturada no está entre los equipos que le tocan al jugador, se
     suelta: dejarla puesta guardaría un IdEquipo que no corresponde a la sede, el año o
     el género que se acaban de capturar. Solo se hace con la lista ya al día, nunca
     mientras viene en camino. */
  useEffect(() => {
    if (!listaAlDia || !ficha.idEquipo) return;
    if (!equipos.some((e) => e.IdEquipo === Number(ficha.idEquipo))) {
      setFicha((prev) => ({ ...prev, idEquipo: 0, categoria: "", coach: "" }));
    }
  }, [listaAlDia, equipos, ficha.idEquipo]);

  const eligeEquipo = (id: number) => {
    const eq = equipos.find((e) => e.IdEquipo === id);
    setFicha((prev) => ({
      ...prev,
      idEquipo: id,
      categoria: eq?.Equipo ?? "",
      coach: eq?.Coach ?? "",
    }));
  };

  // ── Escuelas del estado de la sede ──
  const [buscaEscuela, setBuscaEscuela] = useState("");
  const [escuelas, setEscuelas] = useState<EscuelaOpcion[]>([]);

  useEffect(() => {
    if (!estadoSede || buscaEscuela.trim().length < 2) {
      setEscuelas([]);
      return;
    }
    let vivo = true;
    // Medio segundo de espera: se consulta al dejar de teclear, no en cada letra.
    const t = setTimeout(async () => {
      try {
        const params = new URLSearchParams({ estado: estadoSede, q: buscaEscuela.trim() });
        const res = await fetch(`/api/preregistro/escuelas?${params}`, { cache: "no-store" });
        const json = await res.json();
        if (vivo && json.success) setEscuelas(json.data);
      } catch {
        /* Que no se sugiera nada no debe romper la captura: la escuela se puede escribir. */
      }
    }, 500);
    return () => { vivo = false; clearTimeout(t); };
  }, [buscaEscuela, estadoSede]);

  const eligeEscuela = (e: EscuelaOpcion) => {
    setFicha((prev) => ({ ...prev, idEscuela: e.IdEscuela, escuela: e.Escuela }));
    setNivelEducativo(e.NivelEducativo ?? "");
    setBuscaEscuela("");
    setEscuelas([]);
  };

  // ── Autollenado por código postal ──
  const [colonias, setColonias] = useState<string[]>([]);

  const buscaCP = async (cp: string) => {
    if (!/^\d{5}$/.test(cp)) return;
    try {
      const res = await fetch(`/api/preregistro/cp/${cp}`, { cache: "no-store" });
      const json = await res.json();
      if (!json.success) return;
      setColonias(json.data.colonias ?? []);
      setFicha((prev) => ({
        ...prev,
        estado: json.data.estado ?? prev.estado,
        municipio: json.data.municipio ?? prev.municipio,
      }));
    } catch {
      /* Sin catálogo, el domicilio se captura a mano: no es motivo para detener nada. */
    }
  };

  // ── Guardar ──
  const guardar = async () => {
    setGuardando(true);
    setError(null);
    try {
      const res = await fetch(
        esAlta ? "/api/jugadores/ficha" : `/api/jugadores/ficha/${idJugador}`,
        {
          method: esAlta ? "POST" : "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(ficha),
        },
      );
      const json = await res.json();
      if (!json.success) {
        setError(json.message ?? "No se pudo guardar la ficha.");
        return;
      }
      /* Un homónimo en la misma sede no impide el alta —hay tocayos de verdad— pero sí
         se avisa en el momento, que es cuando todavía se puede deshacer. */
      if (esAlta && json.homonimos?.length > 0) {
        const otros = json.homonimos
          .map((h: { idJugador: number; categoria: string; baja: boolean }) =>
            `#${h.idJugador} ${h.categoria || "sin categoría"}${h.baja ? " (baja)" : ""}`)
          .join("\n");
        alert(
          `Jugador dado de alta con el número ${json.idJugador}.\n\n` +
          `OJO: en esa sede ya había alguien con ese mismo nombre:\n${otros}\n\n` +
          "Si se trata del mismo niño, borra la ficha nueva desde el sistema de escritorio.",
        );
      }
      onGuardado(esAlta ? json.idJugador : idJugador!, esAlta);
    } catch {
      setError("Error de conexión al guardar la ficha.");
    } finally {
      setGuardando(false);
    }
  };

  const faltante = useMemo(() => {
    if (!ficha.jugador.trim()) return "Captura el nombre del jugador.";
    if (!Number(ficha.idSede)) return "Selecciona la sede.";
    if (!Number(ficha.genero)) return "Selecciona el género.";
    if (!ficha.fechaNacimiento) return "Captura la fecha de nacimiento.";
    if (!Number(ficha.idEquipo)) return "Selecciona la categoría.";
    return null;
  }, [ficha]);

  return (
    <div className="fixed inset-0 z-[130] flex items-start justify-center bg-black/70 backdrop-blur-md p-3 md:p-4 overflow-y-auto">
      <div className="w-full max-w-5xl my-6 bg-[#0f172a] border border-white/15 rounded-3xl shadow-2xl">
        {/* ── Membrete de la hoja ──
            La franja de arriba es el encabezado del formato impreso: quién lo emite a la
            izquierda, y a la derecha el folio, que en una hoja de papel iría preimpreso y
            aquí es el IdJugador. En un alta todavía no hay folio, y decirlo ("se asigna
            al guardar") es más honesto que enseñar un hueco. */}
        <div className="sticky top-0 z-20 rounded-t-3xl bg-[#0f172a] border-b-2 border-blue-500/40">
          <div className="flex items-start justify-between gap-3 px-5 md:px-7 pt-5 pb-4">
            <div className="flex items-center gap-3 min-w-0">
              <span className="w-1.5 h-11 rounded-full bg-blue-400 flex-shrink-0" />
              <div className="min-w-0">
                <p className="text-[10px] font-black text-blue-300 uppercase tracking-[0.2em]">
                  Ángeles Soccer
                </p>
                <h2 className="text-xl md:text-2xl font-black text-white leading-tight tracking-tight">
                  Hoja de Registro
                </h2>
                <p className="text-[11px] text-slate-500 mt-0.5 truncate">
                  {esAlta ? "Alta de jugador" : ficha.jugador || "Jugador sin nombre"}
                </p>
              </div>
            </div>
            <div className="flex items-start gap-2 flex-shrink-0">
              <div className="hidden sm:block text-right px-3 py-1.5 rounded-xl border border-white/15 bg-white/5">
                <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Folio</p>
                <p className="text-sm font-black text-slate-200 tabular-nums leading-tight">
                  {esAlta ? "—" : idJugador}
                </p>
              </div>
              <button
                onClick={onCerrar}
                disabled={guardando}
                title="Cerrar"
                className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-white/10 transition-all disabled:opacity-40"
              >
                <X size={18} />
              </button>
            </div>
          </div>
        </div>

        {cargando ? (
          <div className="flex flex-col items-center justify-center gap-3 py-24 text-slate-400">
            <Loader2 size={30} className="animate-spin text-blue-400" />
            <p className="text-sm font-bold">Cargando la ficha...</p>
          </div>
        ) : (
          <div className="p-5 md:p-6 space-y-5">
            {error && (
              <div className="px-4 py-3 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-200 text-sm font-bold flex items-start gap-2">
                <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />
                {error}
              </div>
            )}

            {/* ── Datos generales ──
                La foto va en su propia columna a la derecha, como el recuadro pegado en
                la esquina de la hoja de papel. En pantalla angosta baja al principio del
                apartado, que es donde se espera encontrarla. */}
            <section className={SECCION}>
              <p className={TITULO_SECCION}><Users size={12} /> Datos generales</p>

              <div className="flex flex-col-reverse md:flex-row gap-5">
                <div className="flex-1 min-w-0 grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="md:col-span-3">
                  <label className={ETIQUETA}>Jugador *</label>
                  <input
                    className={CAMPO}
                    value={ficha.jugador}
                    onChange={(e) => cambia("jugador", e.target.value)}
                    placeholder="NOMBRE COMPLETO"
                    autoFocus
                  />
                </div>
                <div>
                  <label className={ETIQUETA}>Fecha de nacimiento *</label>
                  <input
                    type="date"
                    className={`${CAMPO} [color-scheme:dark]`}
                    value={ficha.fechaNacimiento}
                    onChange={(e) => cambia("fechaNacimiento", e.target.value)}
                  />
                </div>
                <div>
                  <label className={ETIQUETA}>Género *</label>
                  <Combo
                    catalogo={GENEROS}
                    valor={Number(ficha.genero)}
                    onCambia={(v) => cambia("genero", v)}
                  />
                </div>

                <div>
                  <label className={ETIQUETA}>Sede *</label>
                  <select
                    className={CAMPO}
                    value={ficha.idSede}
                    onChange={(e) => cambia("idSede", Number(e.target.value))}
                  >
                    <option value={0}>Seleccione...</option>
                    {sedes.map((s) => (
                      <option key={s.IdSede} value={s.IdSede}>{s.Sede}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={ETIQUETA}>Tipo de jugador</label>
                  <Combo
                    catalogo={TIPOS_JUGADOR}
                    valor={Number(ficha.idTipoJugador)}
                    onCambia={(v) => cambia("idTipoJugador", v)}
                  />
                </div>
                <div>
                  <label className={ETIQUETA}>Esquema de pago</label>
                  <Combo
                    catalogo={ESQUEMAS_PAGO}
                    valor={Number(ficha.idEsquemaPago)}
                    onCambia={(v) => cambia("idEsquemaPago", v)}
                  />
                </div>
                <div>
                  <label className={ETIQUETA}>Vive con</label>
                  <select
                    className={CAMPO}
                    value={ficha.viveCon}
                    onChange={(e) => cambia("viveCon", Number(e.target.value))}
                  >
                    {VIVE_CON.map((o) => (
                      <option key={o.id} value={o.id}>{o.texto}</option>
                    ))}
                  </select>
                </div>
                </div>

                {/* El recuadro de la foto */}
                <div className="w-full md:w-44 lg:w-48 flex-shrink-0">
                  <label className={ETIQUETA}>Fotografía</label>
                  <FotoJugador
                    valor={ficha.foto}
                    onChange={(dataUrl) => cambia("foto", dataUrl)}
                    alt={ficha.jugador ? `Foto de ${ficha.jugador}` : "Foto del jugador"}
                  />
                  {/* Solo al editar: el alta todavía no tiene IdJugador que firmar
                      en la liga, y su ficha se está capturando aquí mismo. */}
                  {idJugador !== null && (
                    <PedirFotoJugador
                      idJugador={idJugador}
                      nombre={ficha.jugador}
                      telPadre={ficha.telPadre}
                      telMadre={ficha.telMadre}
                    />
                  )}
                </div>
              </div>

              {/* Categoría: el selector de equipos del escritorio */}
              <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.02] p-4">
                <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                  <label className={`${ETIQUETA} mb-0`}>Categoría *</label>
                  {ficha.categoria && (
                    <span className="text-[11px] font-black px-2.5 py-1 rounded-lg bg-blue-500/15 text-blue-300 border border-blue-500/30">
                      {ficha.categoria}{ficha.coach ? ` · ${ficha.coach}` : ""}
                    </span>
                  )}
                </div>

                {!puedeElegirEquipo ? (
                  <p className="text-[11px] text-slate-500 font-semibold">
                    Captura primero la sede, la fecha de nacimiento y el género: los equipos
                    que le tocan dependen de esos tres datos.
                  </p>
                ) : cargandoEquipos ? (
                  <p className="text-[11px] text-slate-400 font-semibold flex items-center gap-2">
                    <Loader2 size={13} className="animate-spin" /> Buscando equipos...
                  </p>
                ) : avisoEquipos ? (
                  <p className="text-[11px] text-amber-300 font-semibold flex items-start gap-1.5">
                    <AlertTriangle size={13} className="flex-shrink-0 mt-0.5" /> {avisoEquipos}
                  </p>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                    {equipos.map((e) => {
                      const elegido = Number(ficha.idEquipo) === e.IdEquipo;
                      const lleno = e.Cupo != null && e.Cupo > 0 && e.Inscritos >= e.Cupo;
                      return (
                        <button
                          key={e.IdEquipo}
                          type="button"
                          onClick={() => eligeEquipo(e.IdEquipo)}
                          className={`text-left rounded-xl border px-3 py-2.5 transition-all ${
                            elegido
                              ? "bg-blue-600/20 border-blue-500/50"
                              : "bg-white/5 border-white/10 hover:bg-white/10 hover:border-white/20"
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-xs font-black text-white truncate">{e.Equipo}</span>
                            {elegido && <Check size={13} className="text-blue-300 flex-shrink-0" />}
                          </div>
                          <p className="text-[10px] text-slate-400 mt-0.5 truncate">
                            {e.Coach || "Sin entrenador"}
                          </p>
                          <p className={`text-[10px] font-bold tabular-nums mt-0.5 ${lleno ? "text-amber-400" : "text-slate-500"}`}>
                            {e.Inscritos}{e.Cupo ? ` / ${e.Cupo}` : ""} jugadores{lleno ? " · lleno" : ""}
                          </p>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4">
                <div>
                  <label className={ETIQUETA}>Dorsal</label>
                  <input className={CAMPO} value={ficha.dorsal} onChange={(e) => cambia("dorsal", e.target.value)} />
                </div>
                <div>
                  <label className={ETIQUETA}>Número de socio</label>
                  <input className={CAMPO} value={ficha.numeroSocio} onChange={(e) => cambia("numeroSocio", e.target.value)} />
                </div>
                <div>
                  <label className={ETIQUETA}>Beca sem. (%)</label>
                  <input
                    type="number" min={0} max={100} className={CAMPO}
                    value={ficha.beca} onChange={(e) => cambia("beca", e.target.value)}
                    title="Descuento de mensualidades"
                  />
                </div>
                <div>
                  <label className={ETIQUETA}>Beca copas (%)</label>
                  <input
                    type="number" min={0} max={100} className={CAMPO}
                    value={ficha.becaCopas} onChange={(e) => cambia("becaCopas", e.target.value)}
                    title="Descuento de las copas. Va aparte de la de ligas y de la de mensualidades"
                  />
                </div>
                <div>
                  <label className={ETIQUETA}>Beca ligas (%)</label>
                  <input
                    type="number" min={0} max={100} className={CAMPO}
                    value={ficha.becaLigas} onChange={(e) => cambia("becaLigas", e.target.value)}
                    title="Descuento de las ligas. Va aparte de la de copas y de la de mensualidades"
                  />
                </div>
                <div>
                  <label className={ETIQUETA}>CURP</label>
                  <input className={CAMPO} value={ficha.curp} onChange={(e) => cambia("curp", e.target.value)} />
                </div>
                <div>
                  <label className={ETIQUETA}>Entidad de nacimiento</label>
                  <input className={CAMPO} value={ficha.entidadNacimiento} onChange={(e) => cambia("entidadNacimiento", e.target.value)} />
                </div>
                <div className="col-span-2">
                  <label className={ETIQUETA}>Contacto de emergencia</label>
                  <input className={CAMPO} value={ficha.contactoEmergencia} onChange={(e) => cambia("contactoEmergencia", e.target.value)} />
                </div>
              </div>
            </section>

            {/* ── Datos escolares ── */}
            <section className={SECCION}>
              <p className={TITULO_SECCION}><GraduationCap size={12} /> Datos escolares</p>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="md:col-span-2 relative">
                  <label className={ETIQUETA}>Escuela</label>
                  <input
                    className={CAMPO}
                    value={ficha.escuela}
                    onChange={(e) => {
                      /* Escribir suelta la escuela del catálogo: si el texto ya no es el
                         del IdEscuela guardado, el id dejaría de corresponderle. */
                      cambia("escuela", e.target.value);
                      cambia("idEscuela", 0);
                      setBuscaEscuela(e.target.value);
                    }}
                    placeholder={estadoSede ? `Buscar en ${estadoSede}...` : "Selecciona antes la sede"}
                    disabled={!estadoSede}
                  />
                  {escuelas.length > 0 && (
                    <ul className="absolute z-20 left-0 right-0 mt-1 max-h-56 overflow-y-auto rounded-xl border border-white/15 bg-slate-900 shadow-2xl">
                      {escuelas.map((e) => (
                        <li key={e.IdEscuela}>
                          <button
                            type="button"
                            onClick={() => eligeEscuela(e)}
                            className="w-full text-left px-3 py-2 hover:bg-white/10 transition-colors"
                          >
                            <p className="text-xs font-bold text-slate-100">{e.Escuela}</p>
                            <p className="text-[10px] text-slate-500">
                              {[e.NivelEducativo, e.Municipio].filter(Boolean).join(" · ")}
                            </p>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <div>
                  <label className={ETIQUETA}>Nivel escolar</label>
                  <input className={CAMPO} value={nivelEducativo} disabled readOnly />
                </div>
              </div>
            </section>

            {/* ── Datos familiares y domicilio ── */}
            <section className={SECCION}>
              <p className={TITULO_SECCION}><MapPin size={12} /> Datos familiares y domicilio</p>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className={ETIQUETA}>Padre</label>
                  <input className={CAMPO} value={ficha.padre} onChange={(e) => cambia("padre", e.target.value)} />
                </div>
                <div>
                  <label className={ETIQUETA}>Teléfonos del padre</label>
                  <input className={CAMPO} value={ficha.telPadre} onChange={(e) => cambia("telPadre", e.target.value)} />
                </div>
                <div>
                  <label className={ETIQUETA}>Correo del padre</label>
                  <input
                    type="email" className={CAMPO}
                    value={ficha.correoElectronicoPadre}
                    onChange={(e) => cambia("correoElectronicoPadre", e.target.value)}
                  />
                </div>
                <div>
                  <label className={ETIQUETA}>Madre</label>
                  <input className={CAMPO} value={ficha.madre} onChange={(e) => cambia("madre", e.target.value)} />
                </div>
                <div>
                  <label className={ETIQUETA}>Teléfonos de la madre</label>
                  <input className={CAMPO} value={ficha.telMadre} onChange={(e) => cambia("telMadre", e.target.value)} />
                </div>
                <div>
                  <label className={ETIQUETA}>Correo de la madre</label>
                  <input
                    type="email" className={CAMPO}
                    value={ficha.correoElectronicoMadre}
                    onChange={(e) => cambia("correoElectronicoMadre", e.target.value)}
                  />
                </div>
                <div>
                  <label className={ETIQUETA}>Teléfono de casa</label>
                  <input className={CAMPO} value={ficha.telCasa} onChange={(e) => cambia("telCasa", e.target.value)} />
                </div>
                <div>
                  <label className={ETIQUETA}>Ingresos mensuales</label>
                  <input
                    type="number" min={0} className={CAMPO}
                    value={ficha.ingresosMensuales}
                    onChange={(e) => cambia("ingresosMensuales", e.target.value)}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4 pt-4 border-t border-white/10">
                <div className="col-span-2">
                  <label className={ETIQUETA}>Calle</label>
                  <input className={CAMPO} value={ficha.calle} onChange={(e) => cambia("calle", e.target.value)} />
                </div>
                <div>
                  <label className={ETIQUETA}>Núm. exterior</label>
                  <input className={CAMPO} value={ficha.numExterior} onChange={(e) => cambia("numExterior", e.target.value)} />
                </div>
                <div>
                  <label className={ETIQUETA}>Núm. interior</label>
                  <input className={CAMPO} value={ficha.numInterior} onChange={(e) => cambia("numInterior", e.target.value)} />
                </div>
                <div>
                  <label className={ETIQUETA}>Código postal</label>
                  <div className="relative">
                    <input
                      className={CAMPO}
                      value={ficha.codigoPostal}
                      onChange={(e) => {
                        const cp = e.target.value.replace(/\D/g, "").slice(0, 5);
                        cambia("codigoPostal", cp);
                        if (cp.length === 5) buscaCP(cp);
                      }}
                      placeholder="00000"
                      inputMode="numeric"
                    />
                    <Search size={13} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-600 pointer-events-none" />
                  </div>
                </div>
                <div>
                  <label className={ETIQUETA}>Colonia</label>
                  {colonias.length > 0 ? (
                    <select
                      className={CAMPO}
                      value={ficha.colonia}
                      onChange={(e) => cambia("colonia", e.target.value)}
                    >
                      <option value="">Seleccione...</option>
                      {colonias.map((c) => <option key={c} value={c}>{c}</option>)}
                      {/* La capturada que no venga en el catálogo no se pierde. */}
                      {ficha.colonia && !colonias.includes(ficha.colonia) && (
                        <option value={ficha.colonia}>{ficha.colonia}</option>
                      )}
                    </select>
                  ) : (
                    <input className={CAMPO} value={ficha.colonia} onChange={(e) => cambia("colonia", e.target.value)} />
                  )}
                </div>
                <div>
                  <label className={ETIQUETA}>Municipio</label>
                  <input className={CAMPO} value={ficha.municipio} onChange={(e) => cambia("municipio", e.target.value)} />
                </div>
                <div>
                  <label className={ETIQUETA}>Estado</label>
                  <input className={CAMPO} value={ficha.estado} onChange={(e) => cambia("estado", e.target.value)} />
                </div>
              </div>
            </section>

            {/* ── Observaciones y, al editar, el estatus ── */}
            <section className={SECCION}>
              <p className={TITULO_SECCION}>Observaciones</p>
              <textarea
                className={`${CAMPO} min-h-[80px] resize-y`}
                value={ficha.observaciones}
                onChange={(e) => cambia("observaciones", e.target.value)}
              />

              {!esAlta && (
                <div className="mt-4 pt-4 border-t border-white/10 grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className={ETIQUETA}>Estatus</label>
                    <select
                      className={CAMPO}
                      value={ficha.status}
                      onChange={(e) => cambia("status", Number(e.target.value))}
                    >
                      <option value={ACTIVO}>ACTIVO</option>
                      <option value={BAJA}>BAJA</option>
                    </select>
                  </div>
                  <div className="md:col-span-2">
                    <label className={ETIQUETA}>Motivo de la baja</label>
                    <input
                      className={CAMPO}
                      value={ficha.motivoBaja}
                      onChange={(e) => cambia("motivoBaja", e.target.value)}
                      disabled={Number(ficha.status) !== BAJA}
                      placeholder={Number(ficha.status) === BAJA ? "Por qué se va" : "Solo aplica a las bajas"}
                    />
                  </div>
                </div>
              )}
            </section>
          </div>
        )}

        {/* Pie */}
        {!cargando && (
          <div className="flex flex-wrap items-center justify-between gap-3 px-5 md:px-6 py-4 border-t border-white/10 sticky bottom-0 bg-[#0f172a] rounded-b-3xl">
            <p className="text-[11px] font-semibold text-slate-500">
              {faltante ?? "Listo para guardar."}
            </p>
            <div className="flex gap-2">
              <button
                onClick={onCerrar}
                disabled={guardando}
                className="px-4 py-2.5 rounded-xl bg-white/10 hover:bg-white/15 text-white text-xs font-black transition-colors disabled:opacity-40"
              >
                Cancelar
              </button>
              <button
                onClick={guardar}
                disabled={guardando || faltante !== null}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:bg-white/10 disabled:text-slate-500 disabled:cursor-not-allowed text-white text-xs font-black transition-colors shadow-sm"
              >
                {guardando ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                {esAlta ? "Dar de alta" : "Guardar cambios"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/** Un combo del escritorio: el 0 es "Seleccione...", que la base guarda sin capturar. */
function Combo({
  catalogo,
  valor,
  onCambia,
}: {
  catalogo: OpcionCatalogo[];
  valor: number;
  onCambia: (v: number) => void;
}) {
  return (
    <select className={CAMPO} value={valor} onChange={(e) => onCambia(Number(e.target.value))}>
      <option value={0}>Seleccione...</option>
      {catalogo.map((o) => (
        <option key={o.id} value={o.id}>{o.texto}</option>
      ))}
    </select>
  );
}
