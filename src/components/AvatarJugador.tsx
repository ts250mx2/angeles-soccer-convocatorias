"use client";

import { inicialesDe } from "@/lib/plantilla-equipo";

/**
 * La foto del jugador, redonda, con sus iniciales cuando todavía no tiene.
 *
 * Lo pintan cinco pantallas —Lista de Jugadores, Becas, Convocatorias, Plantilla y la
 * banca de la propia Plantilla— y cada una tiene su propia forma de fila: unas traen
 * `IdJugador` y otras `idJugador`. Por eso recibe los cuatro datos sueltos en vez de un
 * objeto con forma fija: adaptar en el sitio de uso es una línea, y obligar a todas a
 * compartir un tipo sería arrastrarlas a un molde que no les toca.
 *
 * El hueco NO se deja vacío ni con un icono genérico: con las iniciales, una lista sin
 * fotos —que hoy es toda, porque la captura acaba de estrenarse— sigue siendo legible de
 * un vistazo en vez de una columna de círculos idénticos.
 *
 * La imagen se pide a /api/jugadores/foto, que la cachea con el sello de la ficha; aquí
 * no pasa por next/image porque la ruta es dinámica y ya devuelve la imagen del tamaño
 * en que se guardó.
 */
export default function AvatarJugador({
  idJugador,
  nombre,
  tieneFoto,
  fotoVersion,
  tamano = 28,
  className = "",
}: {
  idJugador: number;
  nombre: string;
  /** Tiene foto cargada en su ficha. Sin esto no se pide la imagen y no hay 404 inútil. */
  tieneFoto: boolean | number | null | undefined;
  /** Sello que rompe el caché cuando la foto cambia (tblJugadores.FechaAct). */
  fotoVersion?: string | null;
  tamano?: number;
  className?: string;
}) {
  const hayFoto = tieneFoto === true || Number(tieneFoto) === 1;
  const estilo = { width: tamano, height: tamano };

  if (!hayFoto) {
    return (
      <span
        style={estilo}
        title={nombre}
        aria-hidden
        className={`inline-flex flex-shrink-0 items-center justify-center rounded-full bg-slate-700 text-slate-300 font-black border border-white/15 ${className}`}
      >
        <span style={{ fontSize: Math.max(8, Math.round(tamano * 0.38)) }}>
          {inicialesDe(nombre) || "?"}
        </span>
      </span>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`/api/jugadores/foto/${idJugador}?v=${fotoVersion ?? "0"}`}
      alt=""
      title={nombre}
      style={estilo}
      loading="lazy"
      className={`inline-block flex-shrink-0 rounded-full object-cover bg-slate-800 border border-white/15 ${className}`}
    />
  );
}
