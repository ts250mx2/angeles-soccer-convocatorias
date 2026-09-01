/**
 * La categoría del jugador trae dos cosas pegadas en un solo campo: el año (o los años)
 * de nacimiento y el equipo.
 *
 *   2013SUR              el SUR de los 2013
 *   2009-2010F           el F de los 2009-2010
 *   2015A SLT            el A SLT de los 2015 (Saltillo)
 *   2008FEM D            el FEM D de los 2008
 *   2017PORTERO7-8       el PORTERO7-8 de los 2017 — el guion de en medio NO es un rango
 *
 * Viene así de tblJugadores, que la captura el sistema de escritorio, y se parte aquí
 * para que ninguna pantalla invente su propia regla.
 *
 * La regla es la que aguantan los 334 valores que hay hoy en la base: al principio, un
 * año de cuatro cifras o un rango de dos; lo que sigue, sea lo que sea, es el equipo.
 * Por eso el año se busca ANCLADO al inicio y el rango solo se acepta ahí: `PORTERO7-8`
 * lleva guion y no es un rango de años, y `2010-2022INTERASE` sí lo es.
 */

export interface CategoriaPartida {
    /** El año o el rango: `2013`, `2009-2010`. Vacío si la categoría no empieza con uno. */
    anio: string;
    /** Lo que sigue al año: `SUR`, `A SLT`, `PORTERO7-8`. Puede venir vacío. */
    equipo: string;
}

const PATRON = /^(\d{4}(?:\s*-\s*\d{4})?)\s*(.*)$/;

/* Son ~4,000 jugadores repartidos en ~334 categorías distintas, y la partición se pide
   en cada filtro y en cada renglón que se pinta. Guardar lo ya resuelto ahorra el
   trabajo repetido sin que ninguna pantalla tenga que acordarse de memorizarlo. */
const cache = new Map<string, CategoriaPartida>();

/**
 * Parte la categoría en año y equipo.
 *
 * Si no empieza con un año —hoy no pasa, pero el campo es texto libre— el valor entero
 * se devuelve como equipo, a propósito: así sigue apareciendo en el filtro de equipos
 * en lugar de desaparecer de las dos listas.
 */
export function partirCategoria(categoria: string | null | undefined): CategoriaPartida {
    const texto = String(categoria ?? '').trim();
    const guardado = cache.get(texto);
    if (guardado) return guardado;

    const m = PATRON.exec(texto);
    const partida: CategoriaPartida = m
        ? { anio: m[1].replace(/\s*-\s*/, '-'), equipo: m[2].trim() }
        : { anio: '', equipo: texto };

    cache.set(texto, partida);
    return partida;
}

/** Solo el año, para filtrar y ordenar. */
export const anioDeCategoria = (categoria: string | null | undefined): string =>
    partirCategoria(categoria).anio;

/** Solo el equipo, para filtrar y ordenar. */
export const equipoDeCategoria = (categoria: string | null | undefined): string =>
    partirCategoria(categoria).equipo;
