import { NextResponse } from 'next/server';
import { pool } from '@/lib/db';
import { sincronizarPagados, sincronizarPrecios } from '@/lib/convocatorias-crear';
import { sqlFueraDeConvocatorias } from '@/lib/convocatorias-excluidas';

export const dynamic = 'force-dynamic';

/**
 * Pone al corriente las convocatorias existentes y AVISA de las que faltarían.
 *
 * Antes esta ruta (`autogenerar`) creaba sola las convocatorias de las ligas y copas ya
 * pagadas. Ya no: aparecían renglones en la base que nadie había capturado, y una vez
 * creados había que ir a borrarlos. Ahora solo se informa, y darlas de alta es una
 * decisión de quien captura, desde la pantalla de alta con los renglones precargados.
 *
 * Lo que SÍ sigue haciendo sola, porque no crea nada y sin ello el resumen mentiría:
 *
 *   sincronizarPagados   Quien pagó su liga o copa queda marcado como convocado en la
 *                        convocatoria que YA existe. Los pagos entran después del alta.
 *   sincronizarPrecios   El precio del sistema manda: un cambio de tarifa o de beca se
 *                        refleja en los ya convocados.
 *
 * La llave del negocio es (Temporada, Liga, Categoría): el producto pagado dice la liga
 * y el jugador dice la categoría. El color no entra —es un desempate del alta manual, no
 * parte de la identidad del torneo—, así que una categoría ya convocada en cualquier
 * color no se reporta como faltante.
 */

/** Tipos de producto que representan una liga o una copa. */
const TIPO_PRODUCTO_LIGA = 3;
const TIPO_PRODUCTO_COPA = 4;

interface Temporada {
    IdTemporada: number;
    FechaInicio: string;
    FechaFin: string;
}

interface FaltanteRow {
    IdLiga: number;
    Liga: string;
    Categoria: string;
    Jugadores: number;
}

export async function POST() {
    try {
        const [temporadas] = (await pool.query(
            `SELECT IdTemporada, DATE_FORMAT(FechaInicio, '%Y-%m-%d') AS FechaInicio,
                    DATE_FORMAT(FechaFin, '%Y-%m-%d') AS FechaFin
             FROM tblTemporadas WHERE EsActiva = 1 LIMIT 1`,
        )) as unknown as [Temporada[], unknown];

        if (temporadas.length === 0) {
            return NextResponse.json(
                { success: false, message: 'No hay temporada activa' },
                { status: 404 },
            );
        }
        const temporada = temporadas[0];

        const [ligas] = (await pool.query(
            'SELECT DISTINCT IdLiga FROM tblConvocatorias WHERE IdTemporada = ? AND Status = 0',
            [temporada.IdTemporada],
        )) as unknown as [Array<{ IdLiga: number }>, unknown];

        let convocadosPorPago = 0;
        let preciosActualizados = 0;
        for (const l of ligas) {
            convocadosPorPago += await sincronizarPagados(pool, temporada.IdTemporada, l.IdLiga);
            preciosActualizados += await sincronizarPrecios(pool, temporada.IdTemporada, l.IdLiga);
        }

        /* Ligas y copas pagadas de la temporada que todavía no tienen convocatoria. Se
           informan con cuánta gente pagó, que es lo que decide si vale la pena darlas de
           alta o si fue un cobro suelto mal capturado. */
        const [faltantes] = (await pool.query(
            `SELECT PR.IdLiga, L.Liga, J.Categoria, COUNT(DISTINCT P.IdJugador) AS Jugadores
             FROM tblPagos P
             INNER JOIN tblProductos PR ON PR.IdProducto = P.IdProducto
             INNER JOIN tblJugadores J ON J.IdJugador = P.IdJugador
             INNER JOIN tblLigas L ON L.IdLiga = PR.IdLiga
             WHERE P.Status = 0
               AND P.IdTemporada = ?
               AND PR.IdTipoProducto IN (${TIPO_PRODUCTO_LIGA}, ${TIPO_PRODUCTO_COPA})
               AND PR.IdLiga IS NOT NULL
               AND COALESCE(TRIM(J.Categoria), '') <> ''
               AND NOT ${sqlFueraDeConvocatorias('J.Categoria')}
               AND NOT ${sqlFueraDeConvocatorias('L.Liga')}
               AND NOT EXISTS (
                   SELECT 1 FROM tblConvocatorias C
                   WHERE C.IdTemporada = P.IdTemporada
                     AND C.IdLiga = PR.IdLiga
                     AND C.Categoria = J.Categoria
               )
             GROUP BY PR.IdLiga, L.Liga, J.Categoria
             ORDER BY L.Liga, J.Categoria`,
            [temporada.IdTemporada],
        )) as unknown as [FaltanteRow[], unknown];

        return NextResponse.json({
            success: true,
            convocadosPorPago,
            preciosActualizados,
            faltantes: faltantes.map((f) => ({
                idLiga: Number(f.IdLiga),
                liga: String(f.Liga ?? ''),
                categoria: String(f.Categoria ?? ''),
                jugadores: Number(f.Jugadores) || 0,
            })),
        });
    } catch (error) {
        console.error('Error revisando convocatorias pendientes:', error);
        return NextResponse.json(
            {
                success: false,
                message: 'Error al revisar las convocatorias pendientes',
                error: error instanceof Error ? error.message : 'Unknown error',
            },
            { status: 500 },
        );
    }
}
