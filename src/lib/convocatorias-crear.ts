import type { Pool, PoolConnection } from 'mysql2/promise';
import { normalizarEliminatoria, normalizarJornadas } from '@/lib/convocatoria-opciones';

/**
 * Alta de una convocatoria, en un solo lugar.
 *
 * La usan la creación manual (/api/convocatorias/create) y la automática por ligas y
 * copas pagadas (/api/convocatorias/autogenerar). Que compartan esta función es lo que
 * garantiza que una convocatoria creada sola quede idéntica a una creada a mano: misma
 * fila y, sobre todo, el mismo sembrado de jugadores en el detalle. Si el alta
 * cambiara solo en una de las dos, la automática produciría convocatorias vacías o con
 * columnas distintas.
 */

/** Ejecutor de consultas: el pool o una conexión dentro de una transacción. */
type Ejecutor = Pool | PoolConnection;

export interface NuevaConvocatoria {
    seasonId: number | string;
    leagueId: number | string;
    categoria: string;
    fechaInicio: string;
    fechaFin: string;
    /** Parte de la llave primaria; cadena vacía es el valor por omisión del formulario. */
    color: string;
    idProfesor?: number | string | null;
    costoLiga?: number | null;
    costoProfesor?: number | null;
    costoArbitro?: number | null;
    cantidadJornadas?: unknown;
    eliminatoria?: unknown;
}

/**
 * Escribe la convocatoria y siembra su detalle con los jugadores de esa categoría.
 *
 * REPLACE reescribe la fila completa, así que Cerrada y Status vuelven a 0: una
 * convocatoria que estaba eliminada queda otra vez vigente y abierta. Es seguro porque
 * /api/convocatorias/delete ya borra sus renglones de detalle, así que la nueva no
 * hereda jugadores. Quien llame debe haber decidido ya que reemplazar es lo correcto.
 */
export async function crearConvocatoria(db: Ejecutor, c: NuevaConvocatoria): Promise<void> {
    await db.query(
        `REPLACE INTO tblConvocatorias
            (IdTemporada, IdLiga, Categoria, FechaInicio, FechaFin, Color, IdProfesor,
             CostoLiga, CostoProfesor, CostoArbitro, CantidadJornadas, Eliminatoria,
             Cerrada, Status, FechaAlta)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, NOW())`,
        [
            c.seasonId, c.leagueId, c.categoria, c.fechaInicio, c.fechaFin, c.color,
            c.idProfesor ?? null,
            c.costoLiga || 0, c.costoProfesor || 0, c.costoArbitro || 0,
            normalizarJornadas(c.cantidadJornadas), normalizarEliminatoria(c.eliminatoria),
        ],
    );

    // Siembra el detalle con los jugadores de la categoría que aún no estén en ella.
    await db.query(
        `INSERT INTO tblDetalleConvocatorias
            (IdJugador, IdTemporada, IdLiga, Precio, EsConvocado, EsEliminado, Categoria, Color)
         SELECT DISTINCT IdJugador, ?, ?, 0, 0, 0, ?, ?
         FROM tblJugadores
         WHERE Categoria = ?
           AND IdJugador NOT IN (
               SELECT IdJugador FROM tblDetalleConvocatorias
               WHERE IdTemporada = ? AND IdLiga = ? AND Categoria = ? AND Color = ?
           )`,
        [
            c.seasonId, c.leagueId, c.categoria, c.color,
            c.categoria,
            c.seasonId, c.leagueId, c.categoria, c.color,
        ],
    );

    await sincronizarPagados(db, c.seasonId, c.leagueId);
}

/**
 * Quien ya pagó la liga o la copa queda convocado.
 *
 * El pago es la decisión: si el niño pagó, está dentro, y tener que marcarlo además a
 * mano solo abre la puerta a que el cobro y la convocatoria digan cosas distintas. Se
 * le pone también el precio del producto, que es lo que la pantalla compara contra lo
 * pagado para sacar el saldo.
 *
 * No toca a los que están marcados como eliminados: a esos se les sacó a propósito, y
 * un pago viejo no debe regresarlos solos.
 *
 * Corre sobre toda la liga de la temporada, no solo sobre la categoría recién creada,
 * porque los pagos siguen entrando después del alta.
 */
/**
 * Pone el precio de cada convocado al del producto de la liga, con su BecaLigas aplicada.
 *
 * El precio del sistema manda. Antes solo se escribía al convocar, así que un cambio de
 * tarifa o de beca dejaba a los ya convocados con el importe viejo y el saldo salía mal
 * sin que nada lo delatara.
 *
 * OJO: esto pisa los precios ajustados a mano. Es a propósito —se pidió que el precio
 * refleje el del sistema— pero significa que un ajuste manual dura hasta la siguiente
 * visita a la pantalla.
 *
 * Solo toca a los convocados: quien no lo está va en 0 por convención, y ahí se queda.
 */
export async function sincronizarPrecios(
    db: Ejecutor,
    seasonId: number | string,
    leagueId: number | string,
): Promise<number> {
    const [res] = await db.query(
        `UPDATE tblDetalleConvocatorias D
         INNER JOIN tblJugadores J ON J.IdJugador = D.IdJugador
         INNER JOIN (
             SELECT IdLiga, MAX(Precio) AS Precio
             FROM tblProductos
             WHERE IdLiga = ? AND IdTipoProducto IN (3, 4)
             GROUP BY IdLiga
         ) PR ON PR.IdLiga = D.IdLiga
         SET D.Precio = ROUND(
                 PR.Precio * (1 - LEAST(GREATEST(COALESCE(J.BecaLigas, 0), 0), 100) / 100), 2)
         WHERE D.IdTemporada = ? AND D.IdLiga = ? AND D.EsConvocado = 1
           AND D.Precio <> ROUND(
                 PR.Precio * (1 - LEAST(GREATEST(COALESCE(J.BecaLigas, 0), 0), 100) / 100), 2)`,
        [leagueId, seasonId, leagueId],
    );
    return (res as { affectedRows?: number }).affectedRows ?? 0;
}

export async function sincronizarPagados(
    db: Ejecutor,
    seasonId: number | string,
    leagueId: number | string,
): Promise<number> {
    const [res] = await db.query(
        `UPDATE tblDetalleConvocatorias D
         INNER JOIN (
             SELECT P.IdJugador, MAX(PR.Precio) AS Precio
             FROM tblPagos P
             INNER JOIN tblProductos PR ON PR.IdProducto = P.IdProducto
             WHERE P.Status = 0 AND P.IdTemporada = ? AND PR.IdLiga = ?
               AND PR.IdTipoProducto IN (3, 4)
             GROUP BY P.IdJugador
         ) PAG ON PAG.IdJugador = D.IdJugador
         INNER JOIN tblJugadores J ON J.IdJugador = D.IdJugador
         SET D.EsConvocado = 1,
             D.Precio = COALESCE(
                 NULLIF(D.Precio, 0),
                 ROUND(PAG.Precio * (1 - LEAST(GREATEST(COALESCE(J.BecaLigas, 0), 0), 100) / 100), 2),
                 0
             )
         WHERE D.IdTemporada = ? AND D.IdLiga = ?
           AND D.EsConvocado = 0 AND D.EsEliminado = 0`,
        [seasonId, leagueId, seasonId, leagueId],
    );
    return (res as { affectedRows?: number }).affectedRows ?? 0;
}
