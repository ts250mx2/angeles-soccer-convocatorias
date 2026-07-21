/**
 * Regla de negocio: pertenencia de un jugador a una temporada.
 *
 * Un jugador cuenta como inscrito/activo en una temporada si tiene al menos un
 * pago de MENSUALIDAD (IdTipoProducto = 1) o INSCRIPCIÓN (IdTipoProducto = 2)
 * registrado en esa temporada.
 *
 * NO se usa tblJugadores.IdTemporadaActiva: ese campo refleja la última
 * temporada capturada del jugador, no en cuáles realmente participó.
 *
 * Uso: `WHERE J.IdJugador IN (${JUGADORES_DE_TEMPORADA_SQL})` con un parámetro
 * posicional (el IdTemporada).
 */
export const JUGADORES_DE_TEMPORADA_SQL = `
    SELECT A.IdJugador
    FROM tblPagos A
    INNER JOIN tblProductos B ON A.IdProducto = B.IdProducto
    WHERE A.IdTemporada = ? AND B.IdTipoProducto IN (1, 2)
`;
