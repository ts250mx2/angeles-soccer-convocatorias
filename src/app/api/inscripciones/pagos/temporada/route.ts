import { NextResponse } from 'next/server';
import { pool } from '@/lib/db';
import { requireAdmin } from '@/lib/auth';
import { TIPO_PRODUCTO_INSCRIPCION } from '@/lib/temporada';

export const dynamic = 'force-dynamic';

/**
 * Reasigna un pago de INSCRIPCIÓN a otra temporada (tblPagos.IdTemporada).
 *
 * Se usa para corregir inscripciones capturadas con la temporada equivocada: un pago
 * de inscripción cobrado junto a las mensualidades de una temporada pero archivado en
 * otra. Al moverlo, el jugador pasa a contar como inscrito en la temporada destino.
 *
 * Por seguridad:
 *  - exige administrador,
 *  - solo acepta pagos de tipo INSCRIPCIÓN (no toca mensualidades, ligas, copas, etc.),
 *  - no toca pagos cancelados,
 *  - valida que la temporada destino exista,
 *  - deja rastro en el log con quién hizo el cambio.
 */
export async function PATCH(request: Request) {
    const auth = await requireAdmin();
    if (!auth.ok) {
        return NextResponse.json({ success: false, message: auth.message }, { status: auth.status });
    }

    try {
        const body = await request.json();
        const idPago = Number(body?.idPago);
        const temporadaId = Number(body?.temporadaId);

        if (!Number.isInteger(idPago) || idPago <= 0) {
            return NextResponse.json({ success: false, message: 'Pago no válido' }, { status: 400 });
        }
        if (!Number.isInteger(temporadaId) || temporadaId <= 0) {
            return NextResponse.json({ success: false, message: 'Temporada no válida' }, { status: 400 });
        }

        const [temporadaRows] = await pool.query(
            `SELECT IdTemporada, Temporada FROM tblTemporadas WHERE IdTemporada = ?`,
            [temporadaId]
        ) as any[];

        if (temporadaRows.length === 0) {
            return NextResponse.json({ success: false, message: 'La temporada destino no existe' }, { status: 404 });
        }

        const [pagoRows] = await pool.query(
            `SELECT P.IdPago, P.IdJugador, P.IdTemporada, P.Status, PR.IdTipoProducto
             FROM tblPagos P
             LEFT JOIN tblProductos PR ON P.IdProducto = PR.IdProducto
             WHERE P.IdPago = ?`,
            [idPago]
        ) as any[];

        if (pagoRows.length === 0) {
            return NextResponse.json({ success: false, message: 'Pago no encontrado' }, { status: 404 });
        }

        const pago = pagoRows[0];

        if (pago.Status !== 0) {
            return NextResponse.json(
                { success: false, message: 'No se puede editar un pago cancelado' },
                { status: 409 }
            );
        }
        if (pago.IdTipoProducto !== TIPO_PRODUCTO_INSCRIPCION) {
            return NextResponse.json(
                { success: false, message: 'Solo se puede reasignar un pago de inscripción' },
                { status: 409 }
            );
        }
        if (Number(pago.IdTemporada) === temporadaId) {
            return NextResponse.json(
                { success: false, message: 'El pago ya está en esa temporada' },
                { status: 409 }
            );
        }

        const [result] = await pool.query(
            `UPDATE tblPagos SET IdTemporada = ? WHERE IdPago = ? AND Status = 0`,
            [temporadaId, idPago]
        ) as any[];

        if (result.affectedRows !== 1) {
            return NextResponse.json(
                { success: false, message: 'No se pudo actualizar el pago' },
                { status: 500 }
            );
        }

        console.info(
            `[inscripciones] ${auth.user.Usuario ?? auth.user.IdUsuario} reasignó la inscripción ${idPago} ` +
            `(jugador ${pago.IdJugador}): IdTemporada ${pago.IdTemporada} -> ${temporadaId}`
        );

        return NextResponse.json({
            success: true,
            data: {
                idPago,
                temporadaAnterior: pago.IdTemporada,
                temporadaNueva: temporadaId,
                temporadaNombre: temporadaRows[0].Temporada,
            },
        });
    } catch (error) {
        console.error('Error al reasignar la temporada del pago:', error);
        return NextResponse.json(
            { success: false, message: 'Error al reasignar el pago' },
            { status: 500 }
        );
    }
}
