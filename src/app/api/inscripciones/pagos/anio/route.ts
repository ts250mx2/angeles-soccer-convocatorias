import { NextResponse } from 'next/server';
import { pool } from '@/lib/db';
import { requireAdmin } from '@/lib/auth';

export const dynamic = 'force-dynamic';

const ANIO_MIN = 2015;
const ANIO_MAX = new Date().getFullYear() + 2;

/**
 * Corrige el año que ampara un pago (tblPagos.Anio) y reasigna su IdTemporada
 * a la temporada cuyo rango de meses contiene el nuevo mes-año.
 *
 * Es la única escritura del módulo de inscripciones, así que:
 *  - exige administrador,
 *  - no toca pagos cancelados,
 *  - recalcula la temporada en el servidor (nunca confía en el cliente),
 *  - deja rastro en el log del servidor con quién hizo el cambio.
 *
 * Sobre la reasignación: los rangos de tblTemporadas se traslapan en algunos meses
 * (p.ej. junio y julio de 2025 caen en ENERO-JULIO 2025 y en AGOSTO-DICIEMBRE 2025).
 * Cuando hay varias candidatas se toma la más reciente y se avisa al cliente en vez
 * de resolverlo en silencio. Las temporadas con rango invertido se ignoran.
 */
export async function PATCH(request: Request) {
    const auth = await requireAdmin();
    if (!auth.ok) {
        return NextResponse.json({ success: false, message: auth.message }, { status: auth.status });
    }

    try {
        const body = await request.json();
        const idPago = Number(body?.idPago);
        const anio = Number(body?.anio);

        if (!Number.isInteger(idPago) || idPago <= 0) {
            return NextResponse.json({ success: false, message: 'Pago no válido' }, { status: 400 });
        }
        if (!Number.isInteger(anio) || anio < ANIO_MIN || anio > ANIO_MAX) {
            return NextResponse.json(
                { success: false, message: `El año debe estar entre ${ANIO_MIN} y ${ANIO_MAX}` },
                { status: 400 }
            );
        }

        const [pagoRows] = await pool.query(
            `SELECT IdPago, IdJugador, Mes, Anio, IdTemporada, Status FROM tblPagos WHERE IdPago = ?`,
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
        if (!pago.Mes || pago.Mes < 1 || pago.Mes > 12) {
            return NextResponse.json(
                { success: false, message: 'El pago no tiene un mes válido que amparar' },
                { status: 409 }
            );
        }
        if (Number(pago.Anio) === anio) {
            return NextResponse.json(
                { success: false, message: 'El pago ya tiene ese año' },
                { status: 409 }
            );
        }

        // Temporadas cuyo rango contiene el nuevo mes-año (se descartan rangos invertidos).
        const codigo = anio * 100 + Number(pago.Mes);
        const [candidatas] = await pool.query(
            `SELECT IdTemporada, Temporada
             FROM tblTemporadas
             WHERE (YEAR(FechaInicio) * 100 + MONTH(FechaInicio)) <= (YEAR(FechaFin) * 100 + MONTH(FechaFin))
               AND ? BETWEEN (YEAR(FechaInicio) * 100 + MONTH(FechaInicio))
                         AND (YEAR(FechaFin)   * 100 + MONTH(FechaFin))
             ORDER BY IdTemporada DESC`,
            [codigo]
        ) as any[];

        // Sin temporada que lo contenga se conserva la actual: mejor eso que dejarla nula.
        const nuevaTemporada = candidatas.length > 0 ? candidatas[0].IdTemporada : pago.IdTemporada;

        const [result] = await pool.query(
            `UPDATE tblPagos SET Anio = ?, IdTemporada = ? WHERE IdPago = ? AND Status = 0`,
            [anio, nuevaTemporada, idPago]
        ) as any[];

        if (result.affectedRows !== 1) {
            return NextResponse.json(
                { success: false, message: 'No se pudo actualizar el pago' },
                { status: 500 }
            );
        }

        console.info(
            `[inscripciones] ${auth.user.Usuario ?? auth.user.IdUsuario} corrigio el pago ${idPago} ` +
            `(jugador ${pago.IdJugador}): Anio ${pago.Anio} -> ${anio}, ` +
            `IdTemporada ${pago.IdTemporada} -> ${nuevaTemporada}`
        );

        return NextResponse.json({
            success: true,
            data: {
                idPago,
                anioAnterior: pago.Anio,
                anioNuevo: anio,
                temporadaAnterior: pago.IdTemporada,
                temporadaNueva: nuevaTemporada,
                temporadaNombre: candidatas.length > 0 ? candidatas[0].Temporada : null,
                sinTemporada: candidatas.length === 0,
                ambigua: candidatas.length > 1,
                candidatas: candidatas.map((c: any) => c.Temporada),
            },
        });
    } catch (error) {
        console.error('Error al corregir el año del pago:', error);
        return NextResponse.json(
            { success: false, message: 'Error al corregir el pago' },
            { status: 500 }
        );
    }
}
