import { NextResponse } from 'next/server';
import { pool } from '@/lib/db';
import { requireAdmin } from '@/lib/auth';

export const dynamic = 'force-dynamic';

/**
 * Manda TODOS los pagos vigentes de una copa/liga de una temporada a la temporada
 * INMEDIATA ANTERIOR. Atiende la sugerencia de la pantalla de Pagos de Copas y
 * Ligas: torneos capturados en la temporada nueva que en realidad son del ciclo
 * pasado.
 *
 * Es una escritura sobre pagos, así que sigue las mismas reglas que la corrección
 * de año de inscripciones:
 *  - exige administrador,
 *  - no toca pagos cancelados,
 *  - recalcula el destino en el servidor: el cliente propone, pero solo se acepta
 *    la temporada inmediata anterior a la de origen (por FechaInicio, con
 *    IdTemporada como desempate), nunca una temporada arbitraria,
 *  - deja rastro en el log del servidor con quién hizo el cambio.
 */
export async function PATCH(request: Request) {
    const auth = await requireAdmin();
    if (!auth.ok) {
        return NextResponse.json({ success: false, message: auth.message }, { status: auth.status });
    }

    try {
        const body = await request.json();
        const idProducto = Number(body?.idProducto);
        const temporadaOrigen = Number(body?.temporadaOrigen);
        const temporadaDestino = Number(body?.temporadaDestino);

        if (!Number.isInteger(idProducto) || idProducto <= 0) {
            return NextResponse.json({ success: false, message: 'Torneo no válido' }, { status: 400 });
        }
        if (!Number.isInteger(temporadaOrigen) || temporadaOrigen <= 0
            || !Number.isInteger(temporadaDestino) || temporadaDestino <= 0) {
            return NextResponse.json({ success: false, message: 'Temporada no válida' }, { status: 400 });
        }

        const [prodRows] = await pool.query(
            'SELECT IdProducto, Producto, IdTipoProducto FROM tblProductos WHERE IdProducto = ? LIMIT 1',
            [idProducto],
        ) as unknown as [Array<{ IdProducto: number; Producto: string; IdTipoProducto: number }>, unknown];
        if (prodRows.length === 0) {
            return NextResponse.json({ success: false, message: 'Torneo no encontrado' }, { status: 404 });
        }
        const producto = prodRows[0];
        // Solo copas y ligas: mover mensualidades o inscripciones de temporada
        // descuadraría los adeudos, y esta pantalla no las maneja.
        if (![3, 4].includes(Number(producto.IdTipoProducto))) {
            return NextResponse.json(
                { success: false, message: 'Solo se pueden reasignar copas y ligas' },
                { status: 409 },
            );
        }

        const [origenRows] = await pool.query(
            'SELECT IdTemporada, Temporada, FechaInicio FROM tblTemporadas WHERE IdTemporada = ? LIMIT 1',
            [temporadaOrigen],
        ) as unknown as [Array<{ IdTemporada: number; Temporada: string; FechaInicio: Date | string }>, unknown];
        if (origenRows.length === 0) {
            return NextResponse.json({ success: false, message: 'No se encontró la temporada de origen' }, { status: 404 });
        }
        const origen = origenRows[0];

        // La inmediata anterior según el servidor; el destino del cliente debe coincidir.
        const [antRows] = await pool.query(
            `SELECT IdTemporada, Temporada
             FROM tblTemporadas
             WHERE (FechaInicio < ?) OR (FechaInicio = ? AND IdTemporada < ?)
             ORDER BY FechaInicio DESC, IdTemporada DESC
             LIMIT 1`,
            [origen.FechaInicio, origen.FechaInicio, origen.IdTemporada],
        ) as unknown as [Array<{ IdTemporada: number; Temporada: string }>, unknown];
        if (antRows.length === 0) {
            return NextResponse.json(
                { success: false, message: 'La temporada de origen no tiene una temporada anterior' },
                { status: 409 },
            );
        }
        const anterior = antRows[0];
        if (Number(anterior.IdTemporada) !== temporadaDestino) {
            return NextResponse.json(
                { success: false, message: `Solo se permite mover a la temporada inmediata anterior (${anterior.Temporada})` },
                { status: 409 },
            );
        }

        const [result] = await pool.query(
            'UPDATE tblPagos SET IdTemporada = ? WHERE IdProducto = ? AND IdTemporada = ? AND Status = 0',
            [anterior.IdTemporada, idProducto, temporadaOrigen],
        ) as unknown as [{ affectedRows: number }, unknown];

        if (result.affectedRows === 0) {
            return NextResponse.json(
                { success: false, message: 'El torneo no tiene pagos vigentes en esa temporada' },
                { status: 409 },
            );
        }

        console.info(
            `[pagos-copas] ${auth.user.Usuario ?? auth.user.IdUsuario} movio ${result.affectedRows} pago(s) ` +
            `del torneo ${idProducto} (${producto.Producto}): ` +
            `IdTemporada ${origen.IdTemporada} (${origen.Temporada}) -> ${anterior.IdTemporada} (${anterior.Temporada})`
        );

        return NextResponse.json({
            success: true,
            data: {
                idProducto,
                producto: producto.Producto,
                pagosMovidos: result.affectedRows,
                temporadaOrigen: { IdTemporada: origen.IdTemporada, Temporada: origen.Temporada },
                temporadaDestino: { IdTemporada: anterior.IdTemporada, Temporada: anterior.Temporada },
            },
        });
    } catch (error) {
        console.error('Error al reasignar pagos de copas y ligas:', error);
        return NextResponse.json(
            { success: false, message: 'Error al reasignar los pagos' },
            { status: 500 },
        );
    }
}
