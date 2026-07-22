import { NextResponse } from 'next/server';
import { pool } from '@/lib/db';
import { TIPO_PRODUCTO_MENSUALIDAD } from '@/lib/temporada';

export const dynamic = 'force-dynamic';

const MAX_JUGADORES = 2000;

/**
 * Movimientos (pagos) de un conjunto de jugadores, para el "Excel de Movimientos".
 *
 * Recibe los ids por POST en vez de repetir los filtros del listado: así el archivo
 * corresponde exactamente a los jugadores que el usuario tiene en pantalla, incluido
 * lo que haya escrito en el buscador.
 *
 * El alcance de temporada es el mismo del detalle por jugador: las MENSUALIDADES se
 * acotan por el mes-año que amparan y los demás conceptos por la temporada en que se
 * registraron. Las fechas se formatean en SQL para que no las desplace el huso.
 */
export async function POST(request: Request) {
    try {
        const body = await request.json();
        const idJugadores: unknown = body?.idJugadores;
        const temporadaId = body?.temporadaId ?? null;

        if (!Array.isArray(idJugadores) || idJugadores.length === 0) {
            return NextResponse.json(
                { success: false, message: 'Se requiere al menos un jugador' },
                { status: 400 }
            );
        }

        const ids = idJugadores
            .map((x) => Number(x))
            .filter((x) => Number.isInteger(x) && x > 0)
            .slice(0, MAX_JUGADORES);

        if (ids.length === 0) {
            return NextResponse.json(
                { success: false, message: 'Jugadores no válidos' },
                { status: 400 }
            );
        }

        const placeholders = ids.map(() => '?').join(',');
        const where = [`P.IdJugador IN (${placeholders})`, 'P.Status = 0'];
        const joinParams: any[] = [];
        const tailParams: any[] = [];
        let temporadaJoin = '';

        if (temporadaId) {
            temporadaJoin = 'INNER JOIN tblTemporadas TT ON TT.IdTemporada = ?';
            joinParams.push(temporadaId);
            where.push(`(
                (
                    PR.IdTipoProducto = ${TIPO_PRODUCTO_MENSUALIDAD}
                    AND P.Anio IS NOT NULL AND P.Mes BETWEEN 1 AND 12
                    AND (P.Anio * 100 + P.Mes)
                        BETWEEN (YEAR(TT.FechaInicio) * 100 + MONTH(TT.FechaInicio))
                            AND (YEAR(TT.FechaFin) * 100 + MONTH(TT.FechaFin))
                )
                OR (
                    COALESCE(PR.IdTipoProducto, 0) <> ${TIPO_PRODUCTO_MENSUALIDAD}
                    AND P.IdTemporada = ?
                )
            )`);
            tailParams.push(temporadaId);
        }

        const [rows] = await pool.query(
            `SELECT
                J.IdJugador,
                J.Jugador,
                J.Categoria,
                J.Beca,
                J.Status as StatusJugador,
                COALESCE(S.Sede, J.Sede) as SedeNombre,
                P.IdPago,
                P.Recibo,
                P.Referencia,
                DATE_FORMAT(P.FechaPago, '%d/%m/%Y %H:%i') as FechaPago,
                DATE_FORMAT(P.FechaPago, '%Y-%m-%d %H:%i:%s') as FechaOrden,
                P.Pago,
                P.Mes,
                P.Anio,
                COALESCE(PR.Producto, 'PRODUCTO ELIMINADO') as Producto,
                PR.IdTipoProducto,
                COALESCE(TP.TipoProducto, '-') as TipoProducto,
                COALESCE(F.FormaPago, 'EFECTIVO') as FormaPago,
                COALESCE(SP.Sede, '-') as SedePago,
                COALESCE(T.Temporada, '-') as Temporada
             FROM tblPagos P
             INNER JOIN tblJugadores J ON J.IdJugador = P.IdJugador
             LEFT JOIN tblSedes S ON J.IdSede = S.IdSede
             LEFT JOIN tblProductos PR ON P.IdProducto = PR.IdProducto
             LEFT JOIN tblTiposProductos TP ON PR.IdTipoProducto = TP.IdTipoProducto
             LEFT JOIN tblFormasPago F ON COALESCE(P.IdFormaPago, 1) = F.IdFormaPago
             LEFT JOIN tblSedes SP ON P.IdSedePago = SP.IdSede
             LEFT JOIN tblTemporadas T ON P.IdTemporada = T.IdTemporada
             ${temporadaJoin}
             WHERE ${where.join(' AND ')}
             ORDER BY J.Jugador ASC, P.FechaPago ASC`,
            [...joinParams, ...ids, ...tailParams]
        ) as any[];

        return NextResponse.json({ success: true, data: rows });
    } catch (error) {
        console.error('Error fetching movimientos:', error);
        return NextResponse.json(
            { success: false, message: 'Error al obtener los movimientos' },
            { status: 500 }
        );
    }
}
