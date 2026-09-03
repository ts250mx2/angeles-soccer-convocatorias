import type { Pool } from 'mysql2/promise';
import { sqlFueraDeConvocatorias } from '@/lib/convocatorias-excluidas';
import type { DuplicadosDeTorneo, JugadorDuplicado } from '@/lib/convocatorias-duplicados';

/**
 * Quién está convocado a dos equipos de la misma copa o liga.
 *
 * El porqué de la regla está en `convocatorias-duplicados.ts`. Aquí solo se traduce a
 * SQL, con tres detalles que conviene no perder:
 *
 *   Se cuentan CONVOCADOS, no renglones del detalle. Cada convocatoria siembra a toda la
 *   categoría, así que un niño aparece en muchas filas sin estar en ningún equipo: sin
 *   `EsConvocado = 1` saldría duplicado prácticamente todo el club.
 *
 *   El renglón tiene que tener su convocatoria viva (tblConvocatorias.Status = 0). El
 *   detalle sobrevive a la baja de una convocatoria, y sin este JOIN un equipo borrado
 *   seguiría contando como duplicado para siempre.
 *
 *   Las ligas y categorías que este módulo no convoca (clinics, INTERASE) quedan fuera,
 *   igual que en el resumen: avisar de algo que la pantalla ni siquiera lista solo deja
 *   un aviso que no se puede atender.
 *
 * Las convocatorias CERRADAS sí cuentan. El cobro doble ya ocurrió y sigue en el estado
 * de cuenta; que esté cerrada no lo arregla, solo lo esconde. Va marcado para que quien
 * decide sepa qué está tocando.
 */

interface FilaDuplicado {
    IdLiga: number;
    Liga: string;
    IdJugador: number;
    Jugador: string;
    Categoria: string;
    Color: string | null;
    Precio: number | null;
    Cerrada: number | null;
}

/* El renglón del detalle empata con su convocatoria por la llave completa. */
const empataConvocatoria = (detalle: string, convocatoria: string) => `
    ${convocatoria}.IdTemporada = ${detalle}.IdTemporada
AND ${convocatoria}.IdLiga = ${detalle}.IdLiga
AND ${convocatoria}.Categoria = ${detalle}.Categoria
AND COALESCE(${convocatoria}.Color, '') = COALESCE(${detalle}.Color, '')
AND ${convocatoria}.Status = 0`;

/** Los duplicados de una temporada, agrupados por torneo. Vacío cuando no hay ninguno. */
export async function duplicadosDeTemporada(
    pool: Pool,
    seasonId: number,
): Promise<DuplicadosDeTorneo[]> {
    const [filas] = (await pool.query(
        `SELECT L.IdLiga, L.Liga, D.IdJugador, J.Jugador,
                D.Categoria, D.Color, D.Precio, C.Cerrada
           FROM tblDetalleConvocatorias D
           INNER JOIN tblConvocatorias C ON ${empataConvocatoria('D', 'C')}
           INNER JOIN tblLigas L ON L.IdLiga = D.IdLiga
           INNER JOIN tblJugadores J ON J.IdJugador = D.IdJugador
           -- Los pares (torneo, jugador) que aparecen en más de un equipo. Se resuelve
           -- aparte y no con un HAVING de la consulta grande porque hacen falta TODOS
           -- los equipos de cada par, no solo el que hizo saltar la cuenta.
           INNER JOIN (
               SELECT D2.IdLiga, D2.IdJugador
                 FROM tblDetalleConvocatorias D2
                 INNER JOIN tblConvocatorias C2 ON ${empataConvocatoria('D2', 'C2')}
                WHERE D2.IdTemporada = ? AND D2.EsConvocado = 1
                GROUP BY D2.IdLiga, D2.IdJugador
               HAVING COUNT(DISTINCT D2.Categoria, COALESCE(D2.Color, '')) > 1
           ) DUP ON DUP.IdLiga = D.IdLiga AND DUP.IdJugador = D.IdJugador
          WHERE D.IdTemporada = ? AND D.EsConvocado = 1
            AND NOT ${sqlFueraDeConvocatorias('L.Liga')}
            AND NOT ${sqlFueraDeConvocatorias('D.Categoria')}
          ORDER BY L.Liga ASC, J.Jugador ASC, D.Categoria ASC, D.Color ASC`,
        [seasonId, seasonId],
    )) as [FilaDuplicado[], unknown];

    const torneos = new Map<number, DuplicadosDeTorneo & { _jug: Map<number, JugadorDuplicado> }>();

    for (const f of filas) {
        const idLiga = Number(f.IdLiga);
        let torneo = torneos.get(idLiga);
        if (!torneo) {
            torneo = { idLiga, liga: String(f.Liga ?? ''), jugadores: [], _jug: new Map() };
            torneos.set(idLiga, torneo);
        }

        const idJugador = Number(f.IdJugador);
        const jugador = torneo._jug.get(idJugador) ?? {
            idJugador,
            jugador: String(f.Jugador ?? ''),
            equipos: [],
        };
        jugador.equipos.push({
            categoria: String(f.Categoria ?? ''),
            color: String(f.Color ?? ''),
            precio: Number(f.Precio) || 0,
            cerrada: Number(f.Cerrada) === 1,
        });
        torneo._jug.set(idJugador, jugador);
    }

    return [...torneos.values()].map(({ _jug, ...t }) => ({ ...t, jugadores: [..._jug.values()] }));
}
