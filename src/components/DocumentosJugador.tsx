"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertCircle, Check, Download, Eye, FileSpreadsheet, FileText, FileType,
  Image as IconoImagen, Loader2, Pencil, Sparkles, Trash2, Upload, X,
} from "lucide-react";
import {
  ACEPTA_ARCHIVOS, MAX_DOCUMENTOS_POR_JUGADOR, MAX_DOCUMENTO_TEXTO,
  familiaDeMime, motivoRechazo, pesoCorto, seVeEnElNavegador,
  type DocumentoJugador, type FamiliaDocumento,
} from "@/lib/jugador-documentos";

/**
 * La carpeta de documentos del jugador: el acta, la CURP, la credencial del papá, el
 * certificado médico.
 *
 * Se llenan como se llena una carpeta de verdad —soltando los archivos encima— y por eso
 * acepta varios de un jaladón, aunque los suba de uno en uno: si el tercero pesa de más,
 * los otros cuatro ya quedaron guardados y el aviso dice cuál falló. Subirlos en un solo
 * envío haría que un archivo malo tirara la tanda completa.
 *
 * Los archivos viven dentro de la base (ver migrations/028-documentos-jugador.sql), así
 * que nunca viajan enteros a esta pantalla: la lista solo trae nombre, tipo, peso y
 * fecha, y el contenido se pide al tocar Ver o Descargar.
 *
 * ── La descripción ──
 *
 * Cada documento lleva una línea que dice QUÉ ES, porque los archivos llegan llamándose
 * `IMG_20260904_113052.jpg` y con veinte así encontrar el acta es abrirlos de uno en uno.
 *
 * Se propone sola: al terminar de subir, el servidor lee el archivo y escribe qué
 * encontró (ver /api/jugadores/documentos/[id]/descripcion). Es una propuesta, no un
 * dato: se corrige tocándola, y el botón de la varita la vuelve a pedir. Los que no se
 * pueden leer —HEIC, Word y Excel viejos— se quedan esperando a que alguien la escriba.
 */

const ICONO: Record<FamiliaDocumento, typeof FileText> = {
  imagen: IconoImagen,
  pdf: FileType,
  word: FileText,
  excel: FileSpreadsheet,
};

/* Cada familia con su color, que es lo que deja reconocer el archivo sin leer el nombre
   cuando la carpeta ya tiene diez. */
const TONO: Record<FamiliaDocumento, string> = {
  imagen: "text-violet-300 bg-violet-500/10 border-violet-500/30",
  pdf: "text-rose-300 bg-rose-500/10 border-rose-500/30",
  word: "text-blue-300 bg-blue-500/10 border-blue-500/30",
  excel: "text-emerald-300 bg-emerald-500/10 border-emerald-500/30",
};

export default function DocumentosJugador({ idJugador }: { idJugador: number }) {
  const [documentos, setDocumentos] = useState<DocumentoJugador[]>([]);
  const [cargando, setCargando] = useState(true);
  const [subiendo, setSubiendo] = useState<string | null>(null);
  const [borrando, setBorrando] = useState<number | null>(null);
  /* Qué documento se está describiendo, y cuál se está editando a mano. Son dos cosas
     distintas: la varita pide una propuesta, el lápiz abre el renglón para escribir. */
  const [describiendo, setDescribiendo] = useState<number | null>(null);
  const [editando, setEditando] = useState<number | null>(null);
  const [borrador, setBorrador] = useState("");
  const [arrastrando, setArrastrando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const entradaArchivo = useRef<HTMLInputElement>(null);

  /** Recarga la lista y la devuelve, para que quien suba pueda describir lo nuevo. */
  const cargar = useCallback(async (): Promise<DocumentoJugador[]> => {
    setCargando(true);
    try {
      const res = await fetch(`/api/jugadores/documentos?idJugador=${idJugador}`, { cache: "no-store" });
      const json = await res.json();
      if (json.success) {
        setDocumentos(json.data ?? []);
        return json.data ?? [];
      }
      setError(json.message ?? "No se pudieron cargar los documentos");
    } catch {
      setError("Error de conexión al cargar los documentos");
    } finally {
      setCargando(false);
    }
    return [];
  }, [idJugador]);

  useEffect(() => { void cargar(); }, [cargar]);

  /**
   * Le pide al servidor que lea el documento y proponga qué es.
   *
   * `silencioso` es para la pasada automática de después de subir: ahí un archivo que no
   * se puede leer es lo normal —un HEIC, un Word viejo— y no tiene por qué pintarse como
   * un error. Cuando lo pide una persona con el botón, sí se le contesta.
   */
  const describir = useCallback(async (idDocumento: number, silencioso = false) => {
    setDescribiendo(idDocumento);
    try {
      const res = await fetch(`/api/jugadores/documentos/${idDocumento}/descripcion`, { method: "POST" });
      const json = await res.json();
      if (json.success) {
        setDocumentos((prev) => prev.map((d) =>
          d.idDocumento === idDocumento ? { ...d, descripcion: json.descripcion } : d));
      } else if (!silencioso) {
        setError(json.message ?? "No se pudo describir el documento");
      }
    } catch {
      if (!silencioso) setError("Error de conexión al describir el documento");
    } finally {
      setDescribiendo(null);
    }
  }, []);

  /**
   * Sube los archivos, uno por uno.
   *
   * Se revisa cada uno ANTES de mandarlo, con la misma función que usa el servidor: así
   * el que pesa de más ni sale del navegador, y el usuario se entera en el acto en lugar
   * de después de esperar la subida.
   */
  const subir = useCallback(async (archivos: File[]) => {
    if (archivos.length === 0) return;
    setError(null);

    const problemas: string[] = [];
    let subidos = 0;

    for (const archivo of archivos) {
      const rechazo = motivoRechazo(archivo.name, archivo.size);
      if (rechazo) {
        problemas.push(rechazo);
        continue;
      }
      setSubiendo(archivo.name);
      try {
        const cuerpo = new FormData();
        cuerpo.append("idJugador", String(idJugador));
        cuerpo.append("archivo", archivo);
        const res = await fetch("/api/jugadores/documentos", { method: "POST", body: cuerpo });
        const json = await res.json();
        if (json.success) subidos += 1;
        else problemas.push(json.message ?? `No se pudo subir "${archivo.name}".`);
      } catch {
        problemas.push(`Error de conexión al subir "${archivo.name}".`);
      }
    }

    setSubiendo(null);
    setError(problemas.length > 0 ? problemas.join(" ") : null);
    if (subidos === 0) return;

    /* La lista se refresca ANTES de describir: los archivos ya están guardados y no
       tienen por qué esperar a que la IA los lea para aparecer. */
    const antes = new Set(documentos.map((d) => d.idDocumento));
    const frescos = await cargar();
    for (const doc of frescos) {
      if (!antes.has(doc.idDocumento) && !doc.descripcion) await describir(doc.idDocumento, true);
    }
  }, [idJugador, cargar, describir, documentos]);

  /** Guarda la descripción escrita a mano. Vacía la quita. */
  const guardarDescripcion = useCallback(async (idDocumento: number, texto: string) => {
    const descripcion = texto.trim().slice(0, 255);
    setEditando(null);
    setDocumentos((prev) => prev.map((d) =>
      d.idDocumento === idDocumento ? { ...d, descripcion } : d));
    try {
      const res = await fetch(`/api/jugadores/documentos/${idDocumento}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ descripcion }),
      });
      const json = await res.json();
      /* Si el servidor la rechazó, se recarga: es preferible que la pantalla vuelva a
         decir la verdad a que se quede enseñando algo que no se guardó. */
      if (!json.success) {
        setError(json.message ?? "No se pudo guardar la descripción");
        await cargar();
      }
    } catch {
      setError("Error de conexión al guardar la descripción");
      await cargar();
    }
  }, [cargar]);

  const borrar = useCallback(async (doc: DocumentoJugador) => {
    /* Se pregunta porque el borrado es de verdad: el archivo solo existe dentro de la
       base, no hay copia en disco de donde sacarlo otra vez. */
    if (!confirm(`¿Borrar "${doc.nombre}"?\n\nNo se puede deshacer: el archivo solo existe aquí.`)) return;
    setBorrando(doc.idDocumento);
    setError(null);
    try {
      const res = await fetch(`/api/jugadores/documentos/${doc.idDocumento}`, { method: "DELETE" });
      const json = await res.json();
      if (json.success) await cargar();
      else setError(json.message ?? "No se pudo borrar el documento");
    } catch {
      setError("Error de conexión al borrar el documento");
    } finally {
      setBorrando(null);
    }
  }, [cargar]);

  const lleno = documentos.length >= MAX_DOCUMENTOS_POR_JUGADOR;
  const ocupado = subiendo !== null;

  return (
    <div>
      {/* La zona de soltar. También abre el explorador al tocarla: no todo el mundo
          arrastra archivos, y esconder la única vía detrás de un gesto deja gente fuera. */}
      <button
        type="button"
        onClick={() => entradaArchivo.current?.click()}
        onDragOver={(e) => { e.preventDefault(); if (!lleno) setArrastrando(true); }}
        onDragLeave={() => setArrastrando(false)}
        onDrop={(e) => {
          e.preventDefault();
          setArrastrando(false);
          if (!lleno && !ocupado) void subir(Array.from(e.dataTransfer.files));
        }}
        disabled={lleno || ocupado}
        className={`w-full rounded-2xl border-2 border-dashed px-4 py-6 text-center transition-colors ${
          arrastrando
            ? "border-blue-400 bg-blue-500/10"
            : "border-white/15 hover:border-white/30 hover:bg-white/[0.03]"
        } disabled:opacity-40 disabled:cursor-not-allowed`}
      >
        {ocupado ? (
          <span className="inline-flex items-center gap-2 text-xs font-bold text-slate-300">
            <Loader2 size={15} className="animate-spin text-blue-400" /> Subiendo {subiendo}...
          </span>
        ) : (
          <>
            <Upload size={20} className="mx-auto text-slate-500 mb-2" />
            <p className="text-xs font-black text-slate-200">
              {lleno ? "La carpeta está llena" : "Arrastra los archivos aquí, o toca para buscarlos"}
            </p>
            <p className="text-[10px] text-slate-500 mt-1">
              {lleno
                ? `El tope son ${MAX_DOCUMENTOS_POR_JUGADOR} documentos. Borra alguno para subir otro.`
                : `Imagen, PDF, Word o Excel · hasta ${MAX_DOCUMENTO_TEXTO} cada uno · varios a la vez`}
            </p>
          </>
        )}
      </button>

      <input
        ref={entradaArchivo}
        type="file"
        multiple
        accept={ACEPTA_ARCHIVOS}
        className="hidden"
        onChange={(e) => {
          const elegidos = Array.from(e.target.files ?? []);
          /* Se limpia para que volver a elegir el MISMO archivo dispare el evento: sin
             esto, subir uno, borrarlo y volver a elegirlo no hace nada. */
          e.target.value = "";
          void subir(elegidos);
        }}
      />

      {error && (
        <div className="mt-3 flex items-start gap-2 px-3 py-2.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-200">
          <AlertCircle size={14} className="flex-shrink-0 mt-0.5" />
          <p className="text-[11px] font-semibold leading-relaxed">{error}</p>
        </div>
      )}

      {/* La lista */}
      <div className="mt-4">
        {cargando ? (
          <div className="flex items-center justify-center gap-2 py-8 text-slate-400">
            <Loader2 size={16} className="animate-spin" />
            <span className="text-xs font-bold">Cargando documentos...</span>
          </div>
        ) : documentos.length === 0 ? (
          <p className="text-center text-[11px] text-slate-500 py-6">
            Todavía no hay documentos de este jugador.
          </p>
        ) : (
          <ul className="space-y-2">
            {documentos.map((d) => {
              const familia = familiaDeMime(d.tipoMime);
              const Icono = ICONO[familia];
              return (
                <li
                  key={d.idDocumento}
                  className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5"
                >
                  <span className={`flex-shrink-0 w-9 h-9 rounded-lg border flex items-center justify-center ${TONO[familia]}`}>
                    <Icono size={16} />
                  </span>

                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-bold text-slate-100 truncate" title={d.nombre}>
                      {d.nombre}
                    </p>

                    {/* Qué es el documento. Se toca para corregirlo. */}
                    {editando === d.idDocumento ? (
                      <div className="flex items-center gap-1 mt-1">
                        <input
                          autoFocus
                          value={borrador}
                          maxLength={255}
                          onChange={(e) => setBorrador(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") void guardarDescripcion(d.idDocumento, borrador);
                            if (e.key === "Escape") setEditando(null);
                          }}
                          placeholder="Qué es este documento"
                          className="flex-1 min-w-0 bg-slate-800/70 border border-slate-600 focus:border-blue-400 rounded-lg px-2 py-1 text-[11px] text-white outline-none"
                        />
                        <button
                          type="button"
                          onClick={() => void guardarDescripcion(d.idDocumento, borrador)}
                          title="Guardar"
                          className="p-1 rounded text-emerald-300 hover:bg-white/10"
                        >
                          <Check size={13} />
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditando(null)}
                          title="Cancelar"
                          className="p-1 rounded text-slate-400 hover:bg-white/10"
                        >
                          <X size={13} />
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => { setEditando(d.idDocumento); setBorrador(d.descripcion); }}
                        title="Tocar para escribir qué es este documento"
                        className="group/desc flex items-center gap-1 text-left max-w-full mt-0.5"
                      >
                        <span className={`text-[11px] truncate ${d.descripcion ? "text-amber-200/90" : "text-slate-600 italic"}`}>
                          {describiendo === d.idDocumento
                            ? "Leyendo el documento..."
                            : d.descripcion || "Sin descripción"}
                        </span>
                        <Pencil size={10} className="flex-shrink-0 text-slate-600 opacity-0 group-hover/desc:opacity-100 transition-opacity" />
                      </button>
                    )}

                    <p className="text-[10px] text-slate-500 truncate">
                      {pesoCorto(d.bytes)} · {d.fecha}
                      {d.usuario ? ` · ${d.usuario}` : ""}
                    </p>
                  </div>

                  <div className="flex items-center gap-1 flex-shrink-0">
                    {/* Volver a pedirle al servidor que lea el archivo y diga qué es. */}
                    <button
                      type="button"
                      onClick={() => void describir(d.idDocumento)}
                      disabled={describiendo === d.idDocumento}
                      title={d.descripcion ? "Volver a leer el documento y proponer la descripción" : "Leer el documento y proponer qué es"}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-violet-300 hover:bg-white/10 transition-colors disabled:opacity-40"
                    >
                      {describiendo === d.idDocumento
                        ? <Loader2 size={15} className="animate-spin" />
                        : <Sparkles size={15} />}
                    </button>
                    {/* Ver solo lo que el navegador sabe pintar: un Word abierto en una
                        pestaña solo consigue que el navegador lo ofrezca guardar. */}
                    {seVeEnElNavegador(d.tipoMime) && (
                      <a
                        href={`/api/jugadores/documentos/${d.idDocumento}?ver=1`}
                        target="_blank"
                        rel="noopener noreferrer"
                        title={`Ver ${d.nombre}`}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-blue-300 hover:bg-white/10 transition-colors"
                      >
                        <Eye size={15} />
                      </a>
                    )}
                    <a
                      href={`/api/jugadores/documentos/${d.idDocumento}`}
                      title={`Descargar ${d.nombre}`}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-emerald-300 hover:bg-white/10 transition-colors"
                    >
                      <Download size={15} />
                    </a>
                    <button
                      type="button"
                      onClick={() => void borrar(d)}
                      disabled={borrando === d.idDocumento}
                      title={`Borrar ${d.nombre}`}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-rose-300 hover:bg-white/10 transition-colors disabled:opacity-40"
                    >
                      {borrando === d.idDocumento
                        ? <Loader2 size={15} className="animate-spin" />
                        : <Trash2 size={15} />}
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
