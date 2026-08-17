import { NextResponse } from 'next/server';
import { pool } from '@/lib/db';
import { crearConvocatoria, sincronizarPagados, sincronizarPrecios } from '@/lib/convocatorias-crear';
import { sqlFueraDeConvocatorias } from '@/lib/convocatorias-excluidas';

export const dynamic = 'force-dynamic';

/**
 * Crea las convocatorias que faltan a partir de las ligas y copas YA PAGADAS.
 *
 * Si alguien pagó una liga o una copa, esa convocatoria debería existir; capturarla a
 * mano después del cobro es el paso que se olvida. Esto la da de alta sola al entrar a
 * la pantalla.
 *
 * La llave del negocio es (Temporada, Liga, Categoría). El producto pagado dice la liga
 * (tblProductos.IdLiga) y el jugador dice la categoría, así que cada pago de tipo liga
 * o copa apunta a una convocatoria concreta.
 *
 * Dos reglas que evitan sorpresas:
 *  - Solo se crea si NO existe ninguna fila con esa terna, sin importar color ni
 *    estatus. Una convocatoria eliminada existe: se eliminó a propósito y no debe
 *    resucitar sola en la siguiente visita.
 *  - Se trabaja únicamente sobre la temporada activa, que es la que la pantalla muestra.
 *  - Las ligas y categorías que no se convocan desde este módulo (clinics, INTERASE)
 *    quedan fuera, tanto por categoría como por liga: ver @/lib/convocatorias-excluidas.
 *    Si aparece un pago de ese tipo, crear la convocatoria solo la haría reaparecer en
 *    cada visita.
 * Es idempotente: correrlo dos veces no duplica nada.
 */

/** Tipos de producto que representan una liga o una copa. */
const TIPO_PRODUCTO_LIGA = 3;
const TIPO_PRODUCTO_COPA = 4;

interface Faltante {
    IdLiga: number;
    Categoria: string;
}

interface Temporada {
    IdTemporada: number;
    FechaInicio: string;
    FechaFin: string;
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

        /* Los pagos siguen entrando despues del alta, asi que cada visita pone al
           corriente lo ya existente: quien pago su liga o copa queda convocado. Va antes
           de crear las que faltan porque esas nacen ya sincronizadas. */
        const [ligas] = (await pool.query(
            'SELECT DISTINCT IdLiga FROM tblConvocatorias WHERE IdTemporada = ? AND Status = 0',
            [temporada.IdTemporada],
        )) as unknown as [Array<{ IdLiga: number }>, unknown];

        let convocadosPorPago = 0;
        let preciosActualizados = 0;
        for (const l of ligas) {
            convocadosPorPago += await sincronizarPagados(pool, temporada.IdTemporada, l.IdLiga);
            // El precio del sistema manda: un cambio de tarifa o de beca se refleja aquí.
            preciosActualizados += await sincronizarPrecios(pool, temporada.IdTemporada, l.IdLiga);
        }

        /* Ligas y copas pagadas de la temporada que todavía no tienen convocatoria.
           El NOT EXISTS mira la terna completa sin el color: el color es un
           desempate del alta manual, no parte de la identidad del torneo. */
        const [faltantes] = (await pool.query(
            `SELECT DISTINCT PR.IdLiga, J.Categoria
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
             ORDER BY PR.IdLiga, J.Categoria`,
            [temporada.IdTemporada],
        )) as unknown as [Faltante[], unknown];

        if (faltantes.length === 0) {
            return NextResponse.json({ success: true, creadas: 0, convocadosPorPago,
            preciosActualizados, detalle: [] });
        }

        /* Todo o nada: si una falla a media lista, no se queda medio poblada. El alta
           es la misma función que usa la creación manual, así que estas convocatorias
           nacen con su detalle sembrado y listas para convocar. */
        const conexion = await pool.getConnection();
        try {
            await conexion.beginTransaction();
            for (const f of faltantes) {
                await crearConvocatoria(conexion, {
                    seasonId: temporada.IdTemporada,
                    leagueId: f.IdLiga,
                    categoria: f.Categoria,
                    // Sin fechas propias, la convocatoria toma las de la temporada.
                    fechaInicio: temporada.FechaInicio,
                    fechaFin: temporada.FechaFin,
                    // El color no importa todavía; vacío es el valor por omisión del alta manual.
                    color: '',
                    idProfesor: null,
                });
            }
            await conexion.commit();
        } catch (error) {
            await conexion.rollback();
            throw error;
        } finally {
            conexion.release();
        }

        return NextResponse.json({
            success: true,
            creadas: faltantes.length,
            convocadosPorPago,
            preciosActualizados,
            detalle: faltantes.map((f) => ({ IdLiga: f.IdLiga, Categoria: f.Categoria })),
        });
    } catch (error) {
        console.error('Error autogenerando convocatorias:', error);
        return NextResponse.json(
            {
                success: false,
                message: 'Error al generar las convocatorias de ligas y copas pagadas',
                error: error instanceof Error ? error.message : 'Unknown error',
            },
            { status: 500 },
        );
    }
}
