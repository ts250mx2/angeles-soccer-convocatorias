import { NextResponse } from 'next/server';
import { pool } from '@/lib/db';
import { requierePagina } from '@/lib/permisos';
import {
    EGRESO_VIGENTE,
    JOIN_FORMA,
    ETIQUETA_FORMA,
    filtroFechasEgreso,
    sedesConGasto,
} from '@/lib/gastos-reportes';
import { enteroOpcional } from '@/lib/gastos-movimientos';

export const dynamic = 'force-dynamic';

/**
 * Gastos agrupados por forma de pago, para el treemap y el grid de la pantalla.
 *
 * Se agrupa por COALESCE(IdFormaPago, 1): igual que Egresos por Sede, un egreso sin
 * forma capturada se trata como efectivo (1), que es como lo dio de alta el sistema
 * de escritorio.
 */
export async function GET(request: Request) {
    const guardia = await requierePagina('/gastos/por-forma-pago');
    if (!guardia.ok) {
        return NextResponse.json({ success: false, message: guardia.message }, { status: guardia.status });
    }

    try {
        const { searchParams } = new URL(request.url);
        const dateFrom = searchParams.get('dateFrom');
        const dateTo = searchParams.get('dateTo');
        const idSede = enteroOpcional(searchParams.get('idSede'));
        if (idSede === null) {
            return NextResponse.json({ success: false, message: 'Sede no válida' }, { status: 400 });
        }

        const df = filtroFechasEgreso(dateFrom, dateTo);
        const filtros = [EGRESO_VIGENTE, df.clause];
        const params: Array<string | number> = [...df.params];
        if (idSede !== undefined) {
            filtros.push('COALESCE(E.IdSede, 0) = ?');
            params.push(idSede);
        }

        const [rows] = await pool.query(
            `SELECT
                COALESCE(E.IdFormaPago, 1)  AS IdFormaPago,
                ${ETIQUETA_FORMA}           AS FormaPago,
                COUNT(*)                    AS Cantidad,
                COALESCE(SUM(E.Total), 0)   AS Total
             FROM tblEgresos E
             ${JOIN_FORMA}
             WHERE ${filtros.join(' AND ')}
             GROUP BY COALESCE(E.IdFormaPago, 1), ${ETIQUETA_FORMA}
             ORDER BY Total DESC`,
            params,
        ) as unknown as [Array<Record<string, unknown>>, unknown];

        const data = rows.map((r) => ({
            IdFormaPago: Number(r.IdFormaPago) || 0,
            FormaPago: String(r.FormaPago ?? '—'),
            Cantidad: Number(r.Cantidad) || 0,
            Total: Number(r.Total) || 0,
        }));

        return NextResponse.json({
            success: true,
            data,
            sedes: await sedesConGasto(df),
        }, { headers: { 'Cache-Control': 'no-store' } });
    } catch (error) {
        console.error('Error fetching gastos por forma de pago:', error);
        return NextResponse.json(
            { success: false, message: 'Error al obtener los gastos por forma de pago' },
            { status: 500 },
        );
    }
}
