import { NextResponse } from 'next/server';
import { pool } from '@/lib/db';

export const dynamic = 'force-dynamic';

// Detalle de ventas (tblPagos) y gastos (tblEgresos) de un día concreto (para el modal)
// o de todo un rango (para el export "detalle agrupado por día"). Las fechas ya están
// en hora LOCAL, así que NO se convierten de zona horaria.
export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const idSede = searchParams.get('idSede');
        const dateFrom = searchParams.get('dateFrom');
        const dateTo = searchParams.get('dateTo');
        const dia = searchParams.get('dia'); // opcional: un solo día

        if (!dia && !(dateFrom && dateTo)) {
            return NextResponse.json({ success: false, message: 'Falta el día o el rango de fechas' }, { status: 400 });
        }

        // Ventas
        const vParams: any[] = [];
        let vWhere = `P.Status = 0`;
        if (dia) { vWhere += ` AND DATE(P.FechaPago) = ?`; vParams.push(dia); }
        else { vWhere += ` AND DATE(P.FechaPago) BETWEEN ? AND ?`; vParams.push(dateFrom, dateTo); }
        if (idSede) { vWhere += ' AND P.IdSedePago = ?'; vParams.push(idSede); }
        const [vRows] = await pool.query(
            `SELECT P.IdPago,
                    DATE_FORMAT(P.FechaPago, '%Y-%m-%d') AS Dia,
                    DATE_FORMAT(P.FechaPago, '%Y-%m-%dT%H:%i:%s') AS Fecha,
                    P.Jugador, PR.Producto, P.FormaPago, P.Recibo, S.Sede, P.Pago
             FROM tblPagos P
             INNER JOIN tblProductos PR ON P.IdProducto = PR.IdProducto
             LEFT JOIN tblSedes S ON P.IdSedePago = S.IdSede
             WHERE ${vWhere}
             ORDER BY P.FechaPago DESC
             LIMIT 5000`,
            vParams
        ) as any[];
        const ventas = (vRows as any[]).map((r) => ({
            IdPago: r.IdPago, Dia: r.Dia, Fecha: r.Fecha, Jugador: r.Jugador, Producto: r.Producto,
            FormaPago: r.FormaPago, Recibo: r.Recibo, Sede: r.Sede, Pago: Number(r.Pago) || 0,
        }));

        // Gastos
        const gParams: any[] = [];
        let gWhere = `E.Status = 0`;
        if (dia) { gWhere += ` AND DATE(E.FechaEgreso) = ?`; gParams.push(dia); }
        else { gWhere += ` AND DATE(E.FechaEgreso) BETWEEN ? AND ?`; gParams.push(dateFrom, dateTo); }
        if (idSede) { gWhere += ' AND E.IdSedePago = ?'; gParams.push(idSede); }
        const [gRows] = await pool.query(
            `SELECT E.IdEgreso,
                    DATE_FORMAT(E.FechaEgreso, '%Y-%m-%d') AS Dia,
                    DATE_FORMAT(E.FechaEgreso, '%Y-%m-%dT%H:%i:%s') AS Fecha,
                    COALESCE(E.ConceptoEgreso, '—') AS Concepto,
                    COALESCE(F.FormaPago, 'EFECTIVO') AS FormaPago, S.Sede, E.Total
             FROM tblEgresos E
             LEFT JOIN tblFormasPago F ON COALESCE(E.IdFormaPago, 1) = F.IdFormaPago
             LEFT JOIN tblSedes S ON E.IdSedePago = S.IdSede
             WHERE ${gWhere}
             ORDER BY E.FechaEgreso DESC
             LIMIT 5000`,
            gParams
        ) as any[];
        const gastos = (gRows as any[]).map((r) => ({
            IdEgreso: r.IdEgreso, Dia: r.Dia, Fecha: r.Fecha, Concepto: r.Concepto,
            FormaPago: r.FormaPago, Sede: r.Sede, Total: Number(r.Total) || 0,
        }));

        return NextResponse.json({ success: true, ventas, gastos });
    } catch (error) {
        console.error('Error detalle ventas por día:', error);
        return NextResponse.json(
            { success: false, message: 'Error al obtener el detalle', error: error instanceof Error ? error.message : 'Unknown' },
            { status: 500 }
        );
    }
}
