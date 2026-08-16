import { NextResponse } from 'next/server';
import { pool } from '@/lib/db';
import { requierePagina } from '@/lib/permisos';
import { filtroFechas, EGRESO_VIGENTE } from '../route';

export const dynamic = 'force-dynamic';

// Tope de seguridad: un rango amplio sin sede puede abarcar miles de renglones.
const MAX_FILAS = 3000;

/** Renglones de egreso de una sede (o de todas) dentro del período. */
export async function GET(request: Request) {
    const guardia = await requierePagina('/gastos/egresos');
    if (!guardia.ok) {
        return NextResponse.json({ success: false, message: guardia.message }, { status: guardia.status });
    }

    try {
        const { searchParams } = new URL(request.url);
        const periodo = searchParams.get('periodo') || 'month';
        const desde = searchParams.get('desde');
        const hasta = searchParams.get('hasta');
        const idSedeParam = searchParams.get('idSede');

        const { clause, params } = filtroFechas(periodo, desde, hasta);
        const filtros = [EGRESO_VIGENTE, clause];
        const queryParams: Array<string | number> = [...params];

        if (idSedeParam) {
            const idSede = Number(idSedeParam);
            if (!Number.isInteger(idSede)) {
                return NextResponse.json({ success: false, message: 'Sede no válida' }, { status: 400 });
            }
            filtros.push('E.IdSede = ?');
            queryParams.push(idSede);
        }

        const [rows] = await pool.query(
            `SELECT
                E.IdEgreso,
                E.IdSede,
                COALESCE(S.Sede, CONCAT('Sede ', E.IdSede))     AS Sede,
                DATE_FORMAT(E.FechaEgreso, '%d/%m/%Y %H:%i')    AS Fecha,
                DATE_FORMAT(E.FechaEgreso, '%Y-%m-%d')          AS FechaOrden,
                COALESCE(NULLIF(TRIM(E.ConceptoEgreso), ''), '—') AS Concepto,
                COALESCE(NULLIF(TRIM(E.PagarA), ''), '—')       AS PagarA,
                COALESCE(NULLIF(TRIM(E.NumeroFactura), ''), '—') AS Factura,
                COALESCE(NULLIF(TRIM(E.Recibo), ''), '—')       AS Recibo,
                COALESCE(F.FormaPago, E.FormaPago, 'SIN FORMA') AS FormaPago,
                COALESCE(E.Subtotal, 0)                         AS Subtotal,
                COALESCE(E.Iva, 0)                              AS Iva,
                COALESCE(E.Total, 0)                            AS Total
             FROM tblEgresos E
             LEFT JOIN tblSedes S ON S.IdSede = E.IdSede
             LEFT JOIN tblFormasPago F ON F.IdFormaPago = COALESCE(E.IdFormaPago, 1)
             WHERE ${filtros.join(' AND ')}
             ORDER BY E.FechaEgreso DESC, E.IdEgreso DESC
             LIMIT ${MAX_FILAS}`,
            queryParams,
        ) as unknown as [Array<Record<string, unknown>>, unknown];

        const num = (v: unknown) => Number(v) || 0;
        const data = rows.map((r) => ({
            IdEgreso: num(r.IdEgreso),
            IdSede: num(r.IdSede),
            Sede: String(r.Sede ?? '—'),
            Fecha: String(r.Fecha ?? ''),
            FechaOrden: String(r.FechaOrden ?? ''),
            Concepto: String(r.Concepto ?? '—'),
            PagarA: String(r.PagarA ?? '—'),
            Factura: String(r.Factura ?? '—'),
            Recibo: String(r.Recibo ?? '—'),
            FormaPago: String(r.FormaPago ?? '—'),
            Subtotal: num(r.Subtotal),
            Iva: num(r.Iva),
            Total: num(r.Total),
        }));

        return NextResponse.json({
            success: true,
            data,
            total: data.reduce((s, r) => s + r.Total, 0),
            // Avisa a la pantalla si el listado quedó recortado por el tope.
            truncado: data.length === MAX_FILAS,
        }, { headers: { 'Cache-Control': 'no-store' } });
    } catch (error) {
        console.error('Error fetching detalle de egresos:', error);
        return NextResponse.json(
            { success: false, message: 'Error al obtener el detalle' },
            { status: 500 },
        );
    }
}
