import type { Pool } from 'mysql2/promise';
import { sqlFueraDeConvocatorias } from '@/lib/convocatorias-excluidas';
import { TIPO_COPA } from '@/lib/copas-ligas';
import type { Empalme } from '@/lib/convocatorias-empalme';

/**
 * Quién de estos jugadores ya está convocado a otra copa de las mismas fechas.
 *
 * La regla —y por qué solo entre copas— está explicada en `convocatorias-empalme.ts`.
 * Aquí solo se traduce a SQL, con tres detalles que conviene no perder:
 *
 *   Las fechas se normalizan con LEAST/GREATEST. Hay convocatorias capturadas al revés
 *   (REY DE REYES 2014X va del 27 de agosto al 20 de junio) y sin normalizar su rango
 *   queda vacío, así que nunca empalmaría con nada.
 *
 *   Las ligas y categorías que este módulo no convoca (clinics, INTERASE) quedan fuera
 *   también aquí. INTERASE es una copa que dura la temporada entera: dejarla dentro
 *   marcaría como empalmada absolutamente toda copa del calendario.
 *
 *   El Color entra al comparar con COALESCE porque la columna admite NULL y '' para
 *   decir lo mismo: sin COALESCE, `B.Color <> A.Color` da NULL y la fila se cae sola.
 */

/** La convocatoria contra la que se mide: la que está abierta en pantalla. */
export interface ClaveConvocatoria {
    idLiga: number;
    categoria: string;
    color: string;
}

interface FilaEmpalme {
    IdJugador: number;
    IdLiga: number;
    Liga: string;
    Categoria: string;
    Color: string | null;
    Desde: string;
    Hasta: string;
    MismaCopa: number;
}

/* Rango normalizado de una convocatoria, por si la captura invirtió las fechas. */
const desde = (alias: string) => `LEAST(${alias}.FechaInicio, ${alias}.FechaFin)`;
const hasta = (alias: string) => `GREATEST(${alias}.FechaInicio, ${alias}.FechaFin)`;

/**
 * Empalmes por jugador. Los jugadores sin empalme no aparecen en el mapa.
 *
 * Devuelve vacío —sin ir a la base— cuando no hay a quién revisar, y vacío también
 * cuando la convocatoria de referencia no es una copa: la consulta lo exige.
 */
export async function empalmesDeConvocatoria(
    pool: Pool,
    seasonId: number,
    clave: ClaveConvocatoria,
    idsJugadores: number[],
): Promise<Map<number, Empalme[]>> {
    const out = new Map<number, Empalme[]>();
    if (idsJugadores.length === 0) return out;

    const [filas] = (await pool.query(
        `SELECT D.IdJugador,
                B.IdLiga,
                LB.Liga,
                B.Categoria,
                B.Color,
                DATE_FORMAT(${desde('B')}, '%Y-%m-%d') AS Desde,
                DATE_FORMAT(${hasta('B')}, '%Y-%m-%d') AS Hasta,
                CASE WHEN B.IdLiga = A.IdLiga THEN 1 ELSE 0 END AS MismaCopa
           FROM tblConvocatorias A
           INNER JOIN tblLigas LA ON LA.IdLiga = A.IdLiga
           INNER JOIN tblConvocatorias B
                   ON B.IdTemporada = A.IdTemporada
                  AND B.Status = 0
                  -- Otra convocatoria: la llave es liga + categoría + color.
                  AND (B.IdLiga <> A.IdLiga
                       OR B.Categoria <> A.Categoria
                       OR COALESCE(B.Color, '') <> COALESCE(A.Color, ''))
                  -- Dos periodos se tocan si cada uno empieza antes de que acabe el otro.
                  AND ${desde('A')} <= ${hasta('B')}
                  AND ${desde('B')} <= ${hasta('A')}
           INNER JOIN tblLigas LB ON LB.IdLiga = B.IdLiga AND LB.IdTipoLiga = ${TIPO_COPA}
           INNER JOIN tblDetalleConvocatorias D
                   ON D.IdTemporada = B.IdTemporada
                  AND D.IdLiga = B.IdLiga
                  AND D.Categoria = B.Categoria
                  AND COALESCE(D.Color, '') = COALESCE(B.Color, '')
                  AND D.EsConvocado = 1
                  AND D.IdJugador IN (?)
          WHERE A.IdTemporada = ?
            AND A.IdLiga = ?
            AND A.Categoria = ?
            AND COALESCE(A.Color, '') = ?
            AND A.Status = 0
            AND LA.IdTipoLiga = ${TIPO_COPA}
            AND NOT ${sqlFueraDeConvocatorias('LB.Liga')}
            AND NOT ${sqlFueraDeConvocatorias('B.Categoria')}
          ORDER BY Desde ASC, LB.Liga ASC, B.Categoria ASC`,
        [idsJugadores, seasonId, clave.idLiga, clave.categoria, clave.color ?? ''],
    )) as [FilaEmpalme[], unknown];

    for (const f of filas) {
        const id = Number(f.IdJugador);
        const lista = out.get(id) ?? [];
        lista.push({
            idLiga: Number(f.IdLiga),
            liga: String(f.Liga ?? ''),
            categoria: String(f.Categoria ?? ''),
            color: String(f.Color ?? ''),
            desde: String(f.Desde ?? ''),
            hasta: String(f.Hasta ?? ''),
            mismaCopa: Number(f.MismaCopa) === 1,
        });
        out.set(id, lista);
    }
    return out;
}
