"use client";

import { useCallback, useRef, useState } from "react";
import { AlertCircle, X } from "lucide-react";
import { acota, sinAlta, type JugadorPlantilla } from "@/lib/plantilla-equipo";
import AvatarJugador from "@/components/AvatarJugador";

/**
 * La cancha de la hoja, con los nombres colocados y arrastrables.
 *
 * Las coordenadas son PORCENTAJE del campo, nunca píxeles: la misma plantilla se ve en
 * monitores de distinto ancho y se exporta a PDF con otras medidas, y en píxeles el
 * acomodo hecho en una pantalla saldría descuadrado en las demás.
 *
 * Se arrastra con eventos de puntero (`pointer*`) y no con la API de arrastre de HTML.
 * Son tres razones, y las tres se notan: `pointer*` funciona igual con dedo que con
 * ratón —los entrenadores acomodan esto en tablet—, no arrastra la imagen fantasma que
 * el navegador dibuja por su cuenta, y con `setPointerCapture` el nombre sigue al dedo
 * aunque se salga del recuadro, en vez de quedarse pegado a media cancha.
 *
 * En el campo caben dos clases de gente: los jugadores dados de alta y los PREREGISTROS,
 * que entrenan pero todavia no existen en tblJugadores. El preregistrado va en ROJO y
 * con su aviso escrito dentro del recuadro, no solo con un color: la hoja se imprime y
 * se pega en el pizarron, y ahi un borde de distinto tono no le dice nada a quien no
 * estuvo cuando se acomodo. Por eso tampoco se confunde con el ambar del que no tiene
 * inscripcion pagada: a aquel le falta un pago, a este le falta existir.
 *
 * Todo se referencia por `clave` ('J-12', 'P-12') y nunca por el id pelado: los dos
 * numeros salen de tablas distintas y se repiten entre si.
 */

/** Lo que la cancha necesita saber de un jugador ya colocado. */
type Colocado = JugadorPlantilla & { x: number; y: number };

interface Props {
  jugadores: JugadorPlantilla[];
  /** Mueve a alguien a un punto de la cancha (en porcentaje). Se identifica por `clave`. */
  onMover: (clave: string, x: number, y: number) => void;
  /** Lo saca de la cancha y lo regresa a la banca. */
  onQuitar: (clave: string) => void;
  /** Abre el historial de pagos. Se dispara con un clic que NO fue un arrastre. */
  onAbrir: (jugador: JugadorPlantilla) => void;
  dt: string | null;
  auxiliar: string | null;
  /** Solo lectura: durante el guardado, para que no se mueva lo que se está mandando. */
  bloqueada?: boolean;
}

/** Solo el nombre y el primer apellido: en la cancha el nombre completo no cabe. */
export function nombreCorto(completo: string): string {
  const partes = String(completo ?? "").trim().split(/\s+/);
  return partes.slice(0, 3).join(" ");
}

export default function CanchaPlantilla({
  jugadores,
  onMover,
  onQuitar,
  onAbrir,
  dt,
  auxiliar,
  bloqueada = false,
}: Props) {
  const cancha = useRef<HTMLDivElement>(null);
  const [arrastrando, setArrastrando] = useState<string | null>(null);
  /* Dónde empezó el gesto y si llegó a moverse. Es lo que separa "arrastré el nombre"
     de "le di clic para ver sus pagos": sin el umbral, el temblor normal de la mano al
     hacer clic contaría como arrastre y el historial no abriría nunca. */
  const gesto = useRef<{ x: number; y: number; movio: boolean } | null>(null);

  const colocados = jugadores.filter((j): j is Colocado => j.x !== null && j.y !== null);

  /* Del punto del puntero al porcentaje de cancha. Se mide contra el rectángulo REAL en
     cada movimiento y no una sola vez al empezar: la página puede desplazarse mientras
     se arrastra, y con una medida vieja el nombre se iría corriendo solo. */
  const aPorcentaje = useCallback((e: React.PointerEvent): { x: number; y: number } | null => {
    const caja = cancha.current?.getBoundingClientRect();
    if (!caja || caja.width === 0 || caja.height === 0) return null;
    return {
      x: acota(((e.clientX - caja.left) / caja.width) * 100),
      y: acota(((e.clientY - caja.top) / caja.height) * 100),
    };
  }, []);

  const alBajar = (e: React.PointerEvent, clave: string) => {
    if (bloqueada) return;
    // El botón de quitar vive dentro del nombre; sin esto, cerrarlo arrastraría.
    if ((e.target as HTMLElement).closest("[data-quitar]")) return;
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    gesto.current = { x: e.clientX, y: e.clientY, movio: false };
    setArrastrando(clave);
  };

  /** Cuánto hay que mover el dedo para que cuente como arrastre y no como clic. */
  const UMBRAL = 5;

  const alMover = (e: React.PointerEvent, clave: string) => {
    if (arrastrando !== clave) return;
    const inicio = gesto.current;
    if (inicio && !inicio.movio) {
      if (Math.abs(e.clientX - inicio.x) < UMBRAL && Math.abs(e.clientY - inicio.y) < UMBRAL) return;
      inicio.movio = true;
    }
    const p = aPorcentaje(e);
    if (p) onMover(clave, p.x, p.y);
  };

  const alSoltar = (e: React.PointerEvent, j: JugadorPlantilla) => {
    if (arrastrando === null) return;
    (e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId);
    const movio = gesto.current?.movio ?? false;
    gesto.current = null;
    setArrastrando(null);
    // No se movió: fue un clic, y un clic abre el historial de pagos.
    if (!movio) onAbrir(j);
  };

  return (
    <div className="rounded-2xl border border-white/15 bg-white p-2 md:p-3">
      {/* Cuerpo técnico, arriba de la cancha como en la hoja */}
      <div className="flex flex-col gap-1 mb-2">
        <div className="inline-flex w-fit items-center rounded-md bg-sky-500 px-3 py-1">
          <span className="text-[11px] font-black text-white uppercase tracking-wide">
            DT. {dt || "SIN ASIGNAR"}
          </span>
        </div>
        <div className="inline-flex w-fit items-center rounded-md border-2 border-slate-800 bg-white px-3 py-1">
          <span className="text-[11px] font-black text-slate-900 uppercase tracking-wide">
            AUX. {auxiliar || ""}
          </span>
        </div>
      </div>

      {/* ── El campo ──
          `aspect-[3/4]` lo mantiene proporcionado a cualquier ancho, que es lo que hace
          que el acomodo en porcentaje se vea igual en todas las pantallas. Y
          `touch-action: none` es obligatorio: sin él, en tablet el navegador interpreta
          el arrastre como desplazamiento de la página y el nombre no se mueve. */}
      <div
        ref={cancha}
        className="relative w-full aspect-[3/4] rounded-lg overflow-hidden select-none"
        style={{
          touchAction: "none",
          background:
            "repeating-linear-gradient(180deg, #22c55e 0 8%, #16a34a 8% 16%)",
        }}
      >
        {/* Las rayas del campo, dibujadas con bordes: no hacen falta imágenes. */}
        <div className="absolute inset-[2%] border-2 border-white/70 rounded-sm" />
        <div className="absolute left-[2%] right-[2%] top-1/2 h-0 border-t-2 border-white/70" />
        <div className="absolute left-1/2 top-1/2 w-[22%] aspect-square -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white/70" />
        {/* Áreas grandes, arriba y abajo */}
        <div className="absolute left-1/2 top-[2%] h-[14%] w-[46%] -translate-x-1/2 border-2 border-t-0 border-white/70" />
        <div className="absolute left-1/2 bottom-[2%] h-[14%] w-[46%] -translate-x-1/2 border-2 border-b-0 border-white/70" />
        {/* Áreas chicas */}
        <div className="absolute left-1/2 top-[2%] h-[6%] w-[24%] -translate-x-1/2 border-2 border-t-0 border-white/70" />
        <div className="absolute left-1/2 bottom-[2%] h-[6%] w-[24%] -translate-x-1/2 border-2 border-b-0 border-white/70" />

        {colocados.map((j) => {
          const activo = arrastrando === j.clave;
          /* Sin alta manda sobre sin inscripción: a quien no existe como jugador no se
             le puede reclamar un pago, así que encimarle los dos avisos solo taparía el
             que importa. */
          const noEstaDeAlta = sinAlta(j);
          return (
            <div
              key={j.clave}
              onPointerDown={(e) => alBajar(e, j.clave)}
              onPointerMove={(e) => alMover(e, j.clave)}
              onPointerUp={(e) => alSoltar(e, j)}
              onPointerCancel={(e) => alSoltar(e, j)}
              style={{ left: `${j.x}%`, top: `${j.y}%`, touchAction: "none" }}
              className={`absolute -translate-x-1/2 -translate-y-1/2 group ${
                bloqueada ? "cursor-default" : activo ? "cursor-grabbing z-20" : "cursor-grab z-10"
              }`}
              title={
                noEstaDeAlta
                  ? `${j.jugador} — AÚN NO ESTÁ DADO DE ALTA: es un preregistro, el alta la hace el sistema de escritorio. Arrastra para moverlo`
                  : `${j.jugador}${j.inscrito ? "" : " — SIN INSCRIPCIÓN"} — clic para ver sus pagos, arrastra para moverlo`
              }
            >
              {/* Rojo para el que todavía no está dado de alta, ámbar para el jugador sin
                  inscripción pagada. Los dos van escritos y no solo coloreados: la hoja
                  se imprime, y quien la lee después no tiene por qué acordarse de quién
                  era cada recuadro. */}
              <div
                className={`relative flex items-center rounded-md border-2 bg-white px-2 py-1 shadow-md transition-shadow ${
                  activo
                    ? "border-blue-500 shadow-xl"
                    : noEstaDeAlta
                      ? "border-rose-600 bg-rose-50"
                      : j.inscrito
                        ? "border-slate-800"
                        : "border-amber-500 bg-amber-50"
                }`}
              >
                {(noEstaDeAlta || !j.inscrito) && (
                  <AlertCircle
                    size={12}
                    className={`mr-1 flex-shrink-0 ${noEstaDeAlta ? "text-rose-600" : "text-amber-600"}`}
                    aria-label={noEstaDeAlta ? "Aún no está dado de alta" : "Sin inscripción"}
                  />
                )}
                <AvatarJugador
                  idJugador={j.idJugador ?? 0}
                  nombre={j.jugador}
                  tieneFoto={j.tieneFoto}
                  fotoVersion={j.fotoVersion}
                  tamano={22}
                  className="mr-1.5 -ml-1"
                />
                <span
                  className={`whitespace-nowrap text-[10px] md:text-[11px] font-black uppercase leading-none ${
                    noEstaDeAlta ? "text-rose-800" : "text-slate-900"
                  }`}
                >
                  {j.dorsal ? `${j.dorsal} · ` : ""}{nombreCorto(j.jugador)}
                </span>
                {/* El aviso, con todas sus letras y dentro del recuadro: es lo único que
                    sobrevive a una impresión en blanco y negro. */}
                {noEstaDeAlta && (
                  <span className="ml-1.5 flex-shrink-0 rounded bg-rose-600 px-1 py-0.5 text-[8px] font-black uppercase leading-none tracking-wide text-white">
                    Sin alta
                  </span>
                )}
                {/* Un punto rojo si debe. Es la única marca que cabe en la cancha, y con
                    el título se lee cuántos meses sin abrir nada. */}
                {j.mesesDebe > 0 && (
                  <span
                    title={`Debe ${j.mesesDebe} ${j.mesesDebe === 1 ? "mes" : "meses"}`}
                    className="ml-1.5 w-2 h-2 rounded-full bg-rose-500 ring-2 ring-white flex-shrink-0"
                  />
                )}
                {!bloqueada && (
                  <button
                    type="button"
                    data-quitar
                    onClick={() => onQuitar(j.clave)}
                    title="Quitar de la cancha"
                    className="absolute -top-2 -right-2 hidden group-hover:flex items-center justify-center w-4 h-4 rounded-full bg-rose-600 text-white shadow"
                  >
                    <X size={10} strokeWidth={3} />
                  </button>
                )}
              </div>
            </div>
          );
        })}

        {colocados.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center p-6">
            <p className="text-center text-[11px] font-black text-white/90 uppercase tracking-wide leading-relaxed drop-shadow">
              Todavía no hay nadie en la cancha.
              <br />
              Toca un jugador de la banca, o usa Acomodar.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
