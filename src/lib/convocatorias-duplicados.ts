/**
 * Niños convocados a DOS equipos de la misma copa o liga.
 *
 * Dentro de un torneo, un equipo es una convocatoria: categoría más color. Un niño puede
 * terminar en dos —el 2020A BLANCO y el 2020A AZUL de DESTACA, o dos categorías de REY
 * DE REYES— y casi siempre es un descuido: se le convocó en una, alguien lo buscó en la
 * otra y lo volvió a convocar. Nadie lo nota porque cada convocatoria se abre por
 * separado y en la suya se ve bien.
 *
 * Cuesta caro de tres maneras:
 *
 *   Se le cobra dos veces. Cada renglón lleva su precio y los dos suman al total
 *   esperado del torneo, así que el club le está facturando dos inscripciones al mismo
 *   niño por el mismo torneo.
 *
 *   El pago se cuenta doble. Lo pagado se busca por jugador y liga, no por equipo: el
 *   mismo pago aparece en las dos convocatorias, y el recaudado del torneo lo suma dos
 *   veces. Mientras el niño esté duplicado, ni el esperado ni el recaudado cuadran.
 *
 *   El día del partido falta en uno. Los dos equipos lo tienen en su lista y solo uno lo
 *   va a tener en la cancha.
 *
 * Por eso el aviso va en la tarjeta del torneo, que es donde se ve el dinero, y no
 * escondido dentro de una categoría: desde afuera es el único lugar donde las dos
 * convocatorias se ven juntas.
 *
 * Es un aviso con salida, no un candado: quien convoca elige en qué equipo se queda y de
 * los demás se le saca. Este archivo NO toca la base: son los tipos y los textos que
 * comparten el servidor y la pantalla; la consulta vive en `convocatorias-duplicados-db`.
 */

/** Un equipo del torneo en el que el niño está convocado. */
export interface EquipoDuplicado {
    categoria: string;
    /** Color de la convocatoria: el desempate cuando una categoría tiene varios equipos. */
    color: string;
    precio: number;
    /** La convocatoria está cerrada; se puede tocar, pero conviene saberlo. */
    cerrada: boolean;
}

/** Un niño y todos los equipos del mismo torneo en los que quedó convocado. */
export interface JugadorDuplicado {
    idJugador: number;
    jugador: string;
    equipos: EquipoDuplicado[];
}

/** Los duplicados de una copa o liga. Un torneo sin duplicados no aparece en la lista. */
export interface DuplicadosDeTorneo {
    idLiga: number;
    liga: string;
    jugadores: JugadorDuplicado[];
}

/** Cómo se nombra un equipo: '2020A · BLANCO', o solo la categoría si no trae color. */
export function etiquetaEquipo(e: Pick<EquipoDuplicado, 'categoria' | 'color'>): string {
    return e.color ? `${e.categoria} · ${e.color}` : e.categoria;
}

/** Cuántos niños duplicados tiene cada torneo, listo para preguntar por IdLiga. */
export function duplicadosPorLiga(lista: DuplicadosDeTorneo[]): Record<number, number> {
    return lista.reduce<Record<number, number>>(
        (acc, t) => ({ ...acc, [t.idLiga]: t.jugadores.length }),
        {},
    );
}

/** El aviso de la tarjeta: '1 niño en 2 equipos', '3 niños en 2 equipos'. */
export function textoDuplicados(cuantos: number): string {
    return cuantos === 1 ? '1 niño está en dos equipos' : `${cuantos} niños están en dos equipos`;
}

/** Lo que se cobra de más mientras el niño siga en todos: todo menos el equipo elegido. */
export function cobradoDeMas(j: JugadorDuplicado): number {
    const total = j.equipos.reduce((s, e) => s + (Number(e.precio) || 0), 0);
    const mayor = j.equipos.reduce((m, e) => Math.max(m, Number(e.precio) || 0), 0);
    return total - mayor;
}
