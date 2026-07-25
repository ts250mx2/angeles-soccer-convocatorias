/**
 * Fragmentos SQL compartidos para clasificar jugadores en adeudos e inscripciones.
 *
 * Todos asumen la tabla de jugadores con alias `J`. El de keeper recibe el alias de
 * la sede porque en cada consulta cambia (SD / S).
 */

/**
 * Registros "dummy" de venta al público (p.ej. "VENTAS PUBLICO EN GENERAL"): no son
 * jugadores reales, así que se separan de los conteos y se sacan de todo adeudo.
 * Se identifican por el NOMBRE del jugador. Requiere alias J.
 */
export const ES_VENTA_PUBLICO = `UPPER(J.Jugador) LIKE '%VENTA%PUBLIC%'`;

/**
 * Categoría de portero/keeper: cualquier categoría cuyo nombre contenga PORT o KEEP
 * (cubre PORTERO, CLPORTSLT, VERANOKEEP, etc.). Requiere alias J.
 */
export const ES_CATEGORIA_PORTERO =
    `(UPPER(J.Categoria) LIKE '%PORT%' OR UPPER(J.Categoria) LIKE '%KEEP%')`;

/**
 * Jugador "tipo portero": sede keeper (tblSedes.EsKeeper = 1) o categoría de
 * portero/keeper. `sedeAlias` es el alias de la tabla de sedes en esa consulta.
 */
export const esKeeperOPortero = (sedeAlias: string) =>
    `(COALESCE(${sedeAlias}.EsKeeper, 0) = 1 OR ${ES_CATEGORIA_PORTERO})`;
