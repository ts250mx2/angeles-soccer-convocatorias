/**
 * Regla de negocio: pertenencia de un jugador a una temporada.
 *
 * Un jugador cuenta como inscrito/activo en una temporada si tiene al menos un
 * pago de INSCRIPCIÓN / REINSCRIPCIÓN (IdTipoProducto = 2) registrado en esa
 * temporada. Las mensualidades (IdTipoProducto = 1) NO cuentan: lo que define
 * la inscripción es el pago de inscripción.
 *
 * NO se usa tblJugadores.IdTemporadaActiva: ese campo refleja la última
 * temporada capturada del jugador, no en cuáles realmente participó.
 *
 * Uso: `WHERE J.IdJugador IN (${JUGADORES_DE_TEMPORADA_SQL})` con un parámetro
 * posicional (el IdTemporada).
 */
export const TIPO_PRODUCTO_INSCRIPCION = 2;

export const TIPO_PRODUCTO_MENSUALIDAD = 1;

/**
 * Un pago cobrado con esta antelación al inicio de la temporada casi siempre es un
 * error de captura del año (p.ej. se cobró nov-2025 y quedó amparando nov-2026).
 * Los pagos legítimos de preventa se concentran 1 o 2 meses antes del arranque.
 */
export const MESES_ANTICIPO_SOSPECHOSO = 3;

/**
 * Ventana en días para emparejar un pago de inscripción con las mensualidades de un
 * jugador. Si la inscripción se cobró dentro de esta ventana respecto a alguna
 * mensualidad de la temporada pero quedó archivada en otra temporada, es casi seguro
 * un error de captura: la inscripción corresponde a la temporada de esas mensualidades.
 * En los datos el 90% de estos casos cae el mismo día y hay un hueco limpio después de
 * los 30 días.
 */
export const DIAS_INSCRIPCION_CERCANA = 30;

export const JUGADORES_DE_TEMPORADA_SQL = `
    SELECT A.IdJugador
    FROM tblPagos A
    INNER JOIN tblProductos B ON A.IdProducto = B.IdProducto
    WHERE A.IdTemporada = ? AND B.IdTipoProducto = ${TIPO_PRODUCTO_INSCRIPCION}
`;

/**
 * Jugadores con al menos una MENSUALIDAD (IdTipoProducto = 1) cuyo mes-año pagado
 * (tblPagos.Mes / tblPagos.Anio) cae dentro del rango de la temporada.
 *
 * OJO: se acota por el mes-año que ampara el pago, NO por P.IdTemporada. Así se
 * detectan también las mensualidades capturadas bajo otra temporada pero que cubren
 * meses de esta. El rango se deriva de tblTemporadas dentro del propio SQL para no
 * depender de cómo interprete JavaScript las fechas.
 *
 * Comparar (Anio * 100 + Mes) permite temporadas que cruzan el fin de año.
 *
 * Uso: `WHERE J.IdJugador IN (${MENSUALIDADES_EN_TEMPORADA_SQL})` con un parámetro
 * posicional (el IdTemporada).
 */
export const MENSUALIDADES_EN_TEMPORADA_SQL = `
    SELECT A.IdJugador
    FROM tblPagos A
    INNER JOIN tblProductos B ON A.IdProducto = B.IdProducto
    INNER JOIN tblTemporadas T ON T.IdTemporada = ?
    WHERE A.Status = 0
      AND B.IdTipoProducto = ${TIPO_PRODUCTO_MENSUALIDAD}
      AND A.Anio IS NOT NULL AND A.Mes BETWEEN 1 AND 12
      AND (A.Anio * 100 + A.Mes)
          BETWEEN (YEAR(T.FechaInicio) * 100 + MONTH(T.FechaInicio))
              AND (YEAR(T.FechaFin) * 100 + MONTH(T.FechaFin))
`;
