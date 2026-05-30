import { NextResponse } from 'next/server';
import { pool } from '@/lib/db';

export const dynamic = 'force-dynamic';

// Read-only: detalle de egresos de una apertura.
// Devuelve el desglose por forma de pago y las líneas individuales de gastos.
// No escribe a la base de datos.
export async function GET(
    request: Request,
    { params }: { params: Promise<{ idApertura: string }> }
) {
    try {
        const { idApertura } = await params;
        const { searchParams } = new URL(request.url);
        const idSede = searchParams.get('idSede');

        if (!idApertura || !idSede) {
            return NextResponse.json(
                { success: false, message: 'Faltan parámetros idApertura / idSede' },
                { status: 400 }
            );
        }

        const idAp = parseInt(idApertura, 10);
        const idSd = parseInt(idSede, 10);

        // ── Encabezado de la apertura ──
        const [apRows] = await pool.query(
            `SELECT
                AC.IdApertura,
                AC.IdSede,
                S.Sede,
                AC.FechaApertura AS FechaApertura,
                AC.FechaCierre AS FechaCierre,
                COALESCE(CJ.Usuario, '') AS Cajero,
                AC.FechaCierre AS RawCierre
            FROM tblAperturasCierres AC
            LEFT JOIN tblSedes    S  ON AC.IdSede = S.IdSede
            LEFT JOIN tblUsuarios CJ ON AC.IdCajero = CJ.IdUsuario
            WHERE AC.IdApertura = ? AND AC.IdSede = ?
            LIMIT 1`,
            [idAp, idSd]
        ) as any[];

        if (apRows.length === 0) {
            return NextResponse.json(
                { success: false, message: 'Apertura no encontrada' },
                { status: 404 }
            );
        }
        const ap = apRows[0];

        // ── Desglose por forma de pago ──
        const [fpRows] = await pool.query(
            `SELECT
                COALESCE(A.IdFormaPago, 1)        AS IdFormaPago,
                COALESCE(F.FormaPago, 'EFECTIVO') AS FormaPago,
                COUNT(A.IdEgreso)                 AS Cantidad,
                COALESCE(SUM(A.Total), 0)         AS Total
             FROM tblEgresos A
             LEFT JOIN tblFormasPago F ON COALESCE(A.IdFormaPago, 1) = F.IdFormaPago
             WHERE A.IdSedePago = ? AND A.IdApertura = ? AND A.Status = 0
             GROUP BY COALESCE(A.IdFormaPago, 1), F.FormaPago
             ORDER BY IdFormaPago`,
            [idSd, idAp]
        ) as any[];
        const porFormaPago = fpRows.map((r: any) => ({
            idFormaPago: Number(r.IdFormaPago),
            formaPago: r.FormaPago,
            cantidad: Number(r.Cantidad) || 0,
            total: Number(r.Total) || 0,
        }));

        // ── Líneas individuales de egresos ──
        const [detRows] = await pool.query(
            `SELECT
                A.IdEgreso,
                A.FechaEgreso AS Fecha,
                COALESCE(A.ConceptoEgreso, '—')         AS Concepto,
                COALESCE(A.Total, 0)              AS Total,
                COALESCE(F.FormaPago, 'EFECTIVO') AS FormaPago
             FROM tblEgresos A
             LEFT JOIN tblFormasPago F ON COALESCE(A.IdFormaPago, 1) = F.IdFormaPago
             WHERE A.IdSedePago = ? AND A.IdApertura = ? AND A.Status = 0
             ORDER BY A.FechaEgreso ASC`,
            [idSd, idAp]
        ) as any[];
        const detalle = detRows.map((r: any) => ({
            idEgreso: Number(r.IdEgreso),
            fecha: r.Fecha,
            concepto: r.Concepto,
            total: Number(r.Total) || 0,
            formaPago: r.FormaPago,
            usuario: r.Usuario,
        }));

        const totalEgresos = porFormaPago.reduce((s: number, r: any) => s + r.total, 0);

        return NextResponse.json({
            success: true,
            data: {
                idApertura: ap.IdApertura,
                idSede: ap.IdSede,
                sede: ap.Sede,
                fechaApertura: ap.FechaApertura,
                fechaCierre: ap.FechaCierre,
                cajero: ap.Cajero,
                cerrado: ap.RawCierre != null,
                porFormaPago,
                detalle,
                totalEgresos,
                numEgresos: detalle.length,
            },
        });
    } catch (error) {
        console.error('Error fetching detalle egresos:', error);
        return NextResponse.json(
            { success: false, message: 'Error al obtener detalle de egresos', error: error instanceof Error ? error.message : 'Unknown' },
            { status: 500 }
        );
    }
}
