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
}
