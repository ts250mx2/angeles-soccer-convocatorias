import { NextResponse } from 'next/server';
import { pool } from '@/lib/db';
import { requierePagina } from '@/lib/permisos';
import {
    EGRESO_VIGENTE,
    TIPO_EGRESO_CLAVE,
    etiquetaTipoEgreso,
    filtroFechasEgreso,
    sedesConGasto,
} from '@/lib/gastos-reportes';
import { enteroOpcional } from '@/lib/gastos-movimientos';

export const dynamic = 'force-dynamic';

/**
 * Gastos agrupados por tipo de gasto (pago a personal / pago a proveedor).
 *
 * La etiqueta se arma en el servidor porque la base no tiene catálogo de tipos:
 * tblEgresos.IdTipoEgreso solo distingue 0 = personal de cualquier otro = proveedor.
 */
export async function GET(request: Request) {
    const guardia = await requierePagina('/gastos/por-tipo');
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
                ${TIPO_EGRESO_CLAVE}        AS TipoClave,
                COUNT(*)                    AS Cantidad,
                COALESCE(SUM(E.Total), 0)   AS Total
             FROM tblEgresos E
             WHERE ${filtros.join(' AND ')}
             GROUP BY ${TIPO_EGRESO_CLAVE}
             ORDER BY Total DESC`,
            params,
        ) as unknown as [Array<Record<string, unknown>>, unknown];

        const data = rows.map((r) => {
            const clave = Number(r.TipoClave) || 0;
            return {
                TipoClave: clave,
                TipoEgreso: etiquetaTipoEgreso(clave),
                Cantidad: Number(r.Cantidad) || 0,
                Total: Number(r.Total) || 0,
            };
        });

        return NextResponse.json({
            success: true,
            data,
            sedes: await sedesConGasto(df),
        }, { headers: { 'Cache-Control': 'no-store' } });
    } catch (error) {
        console.error('Error fetching gastos por tipo:', error);
        return NextResponse.json(
            { success: false, message: 'Error al obtener los gastos por tipo' },
            { status: 500 },
        );
    }
}
