import { NextResponse } from 'next/server';
import { pool } from '@/lib/db';

export const dynamic = 'force-dynamic';

// Rango de fechas sobre FechaPago / FechaEgreso, que YA están en hora LOCAL (siguen
// el reloj NOW() del servidor); por eso NO se convierte de zona horaria. Por defecto,
// el mes en curso.
function rango(dateFrom: string | null, dateTo: string | null): { from: string; to: string } {
    if (dateFrom && dateTo) return { from: dateFrom, to: dateTo };
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    return {
        from: `${now.getFullYear()}-${pad(now.getMonth() + 1)}-01`,
        to: `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`,
    };
}

// Resumen por día: total de ventas (tblPagos) y de gastos (tblEgresos), en un rango
// de fechas y opcionalmente por sede.
export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const idSede = searchParams.get('idSede');
        const { from, to } = rango(searchParams.get('dateFrom'), searchParams.get('dateTo'));

        const vParams: any[] = [from, to];
        let vWhere = `P.Status = 0 AND DATE(P.FechaPago) BETWEEN ? AND ?`;
        if (idSede) { vWhere += ' AND P.IdSedePago = ?'; vParams.push(idSede); }
        const [ventasRows] = await pool.query(
            `SELECT DATE_FORMAT(P.FechaPago, '%Y-%m-%d') AS dia, COUNT(*) AS num, COALESCE(SUM(P.Pago), 0) AS total
             FROM tblPagos P
             WHERE ${vWhere}
             GROUP BY DATE_FORMAT(P.FechaPago, '%Y-%m-%d')`,
            vParams
        ) as any[];

        const gParams: any[] = [from, to];
        let gWhere = `E.Status = 0 AND DATE(E.FechaEgreso) BETWEEN ? AND ?`;
        if (idSede) { gWhere += ' AND E.IdSedePago = ?'; gParams.push(idSede); }
        const [gastosRows] = await pool.query(
            `SELECT DATE_FORMAT(E.FechaEgreso, '%Y-%m-%d') AS dia, COUNT(*) AS num, COALESCE(SUM(E.Total), 0) AS total
             FROM tblEgresos E
             WHERE ${gWhere}
             GROUP BY DATE_FORMAT(E.FechaEgreso, '%Y-%m-%d')`,
            gParams
        ) as any[];

        // Combina ventas y gastos por día.
        const map = new Map<string, { dia: string; ventas: number; numVentas: number; gastos: number; numGastos: number }>();
        for (const r of ventasRows as any[]) {
            map.set(r.dia, { dia: r.dia, ventas: Number(r.total) || 0, numVentas: Number(r.num) || 0, gastos: 0, numGastos: 0 });
        }
        for (const r of gastosRows as any[]) {
            const e = map.get(r.dia) ?? { dia: r.dia, ventas: 0, numVentas: 0, gastos: 0, numGastos: 0 };
            e.gastos = Number(r.total) || 0;
            e.numGastos = Number(r.num) || 0;
            map.set(r.dia, e);
        }
        const data = [...map.values()]
            .map((d) => ({ ...d, neto: d.ventas - d.gastos }))
            .sort((a, b) => b.dia.localeCompare(a.dia)); // más reciente primero

        // Sedes con ventas en el rango (para las tarjetas de filtro).
        const [sedeRows] = await pool.query(
            `SELECT S.IdSede, S.Sede, COALESCE(SUM(P.Pago), 0) AS Total
             FROM tblPagos P
             INNER JOIN tblSedes S ON P.IdSedePago = S.IdSede
             WHERE P.Status = 0 AND S.Status = 0 AND DATE(P.FechaPago) BETWEEN ? AND ?
             GROUP BY S.IdSede, S.Sede
             HAVING Total <> 0
             ORDER BY S.Sede ASC`,
            [from, to]
        ) as any[];
        const sedes = (sedeRows as any[]).map((r) => ({ IdSede: r.IdSede, Sede: r.Sede, Total: Number(r.Total) || 0 }));

        return NextResponse.json({ success: true, data, sedes, from, to });
    } catch (error) {
        console.error('Error ventas por día:', error);
        return NextResponse.json(
            { success: false, message: 'Error al obtener ventas por día', error: error instanceof Error ? error.message : 'Unknown' },
            { status: 500 }
        );
    }
}
