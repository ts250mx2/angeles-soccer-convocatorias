import { NextResponse } from 'next/server';
import { pool } from '@/lib/db';
import { TIPO_PRODUCTO_INSCRIPCION, TIPO_PRODUCTO_MENSUALIDAD } from '@/lib/temporada';

export const dynamic = 'force-dynamic';

const MAX_ROWS = 1000;

/**
 * Pagos de un jugador. Si viene temporadaId se acotan a esa temporada;
 * sin ella se devuelve el histórico completo.
 *
 * tblPagos.FechaPago ya está en hora LOCAL (sigue el reloj NOW() del servidor MySQL:
 * el último pago queda a minutos de NOW() y a ~6 h de UTC_TIMESTAMP()), por lo que
 * NO se le aplica CONVERT_TZ. Se formatea en SQL para que ni mysql2 ni el navegador
 * la vuelvan a desplazar.
 */
export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const idJugador = searchParams.get('idJugador');
        const temporadaId = searchParams.get('temporadaId');

        if (!idJugador) {
            return NextResponse.json(
                { success: false, message: 'Se requiere el jugador' },
                { status: 400 }
            );
        }

        const [jugadorRows] = await pool.query(
            `SELECT
                J.IdJugador,
                J.Jugador,
                J.Categoria,
                J.Status,
                J.Beca,
                COALESCE(S.Sede, J.Sede) as SedeNombre
             FROM tblJugadores J
             LEFT JOIN tblSedes S ON J.IdSede = S.IdSede
             WHERE J.IdJugador = ?`,
            [parseInt(idJugador)]
        ) as any[];

        if (jugadorRows.length === 0) {
            return NextResponse.json(
                { success: false, message: 'Jugador no encontrado' },
                { status: 404 }
            );
        }

        /* Acotar la temporada por P.IdTemporada no sirve para las mensualidades: bajo
           una temporada hay pagos capturados que amparan meses de otro periodo e incluso
           de otro año (p.ej. bajo AGO-DIC 2026 aparecen meses de 2027). Como el módulo
           de inscripciones define la pertenencia por el mes-año que ampara el pago, aquí
           se usa el mismo criterio para que el detalle coincida con los cuadritos.

           Los demás conceptos (inscripción, liga, copa, ropa) no tienen mes que amparar,
           así que esos sí se acotan por la temporada en que se registraron. */
        const where = ['P.IdJugador = ?', 'P.Status = 0'];
        const params: any[] = [];
        const joinParams: any[] = [];
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
            params.push(temporadaId);
        }

        params.unshift(parseInt(idJugador));

        const [pagos] = await pool.query(
            `SELECT
                P.IdPago,
                DATE_FORMAT(P.FechaPago, '%d/%m/%Y %H:%i') as FechaPago,
                DATE_FORMAT(P.FechaPago, '%Y-%m-%d %H:%i:%s') as FechaOrden,
                P.Pago,
                P.Mes,
                P.Anio,
                P.Recibo,
                P.Referencia,
                COALESCE(PR.Producto, 'PRODUCTO ELIMINADO') as Producto,
                PR.IdTipoProducto,
                COALESCE(TP.TipoProducto, '-') as TipoProducto,
                COALESCE(F.FormaPago, 'EFECTIVO') as FormaPago,
                COALESCE(SP.Sede, '-') as SedePago,
                COALESCE(T.Temporada, '-') as Temporada
             FROM tblPagos P
             LEFT JOIN tblProductos PR ON P.IdProducto = PR.IdProducto
             LEFT JOIN tblTiposProductos TP ON PR.IdTipoProducto = TP.IdTipoProducto
             LEFT JOIN tblFormasPago F ON COALESCE(P.IdFormaPago, 1) = F.IdFormaPago
             LEFT JOIN tblSedes SP ON P.IdSedePago = SP.IdSede
             LEFT JOIN tblTemporadas T ON P.IdTemporada = T.IdTemporada
             ${temporadaJoin}
             WHERE ${where.join(' AND ')}
             ORDER BY P.FechaPago DESC
             LIMIT ${MAX_ROWS}`,
            [...joinParams, ...params]
        ) as any[];

        /* Primer pago de INSCRIPCIÓN (IdTipoProducto = 2): es la fecha de inscripción.
           Se compara por FechaOrden (YYYY-MM-DD HH:mm:ss), que ordena bien como texto,
           y se muestra el FechaPago ya formateado de ese mismo pago. */
        const inscripcion = pagos
            .filter((p: any) => p.IdTipoProducto === TIPO_PRODUCTO_INSCRIPCION)
            .reduce(
                (min: any, p: any) => (!min || p.FechaOrden < min.FechaOrden ? p : min),
                null as any
            );

        const total = pagos.reduce((sum: number, p: any) => sum + Number(p.Pago ?? 0), 0);

        return NextResponse.json({
            success: true,
            data: {
                jugador: jugadorRows[0],
                pagos,
                total,
                fechaInscripcion: inscripcion?.FechaPago ?? null,
            },
        });
    } catch (error) {
        console.error('Error fetching pagos del jugador:', error);
        return NextResponse.json(
            { success: false, message: 'Error al obtener los pagos' },
            { status: 500 }
        );
    }
}
