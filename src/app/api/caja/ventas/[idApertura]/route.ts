import { NextResponse } from 'next/server';
import { pool } from '@/lib/db';

export const dynamic = 'force-dynamic';

// Read-only migration of frmProcCorteCaja: desglose de ventas por forma de pago.
// Reproduce los 4 grids (Membresías / Uniformes / Total / Gastos) calculando en
// vivo lo que el VB6 generaba en tblBufferCorteCaja. No escribe a la base de datos.

async function ventasPorFormaPago(idSede: number, idAp: number, tipoClause: string) {
    const [rows] = await pool.query(
        `SELECT
            COALESCE(A.IdFormaPago, 1)        AS IdFormaPago,
            COALESCE(F.FormaPago, 'EFECTIVO') AS FormaPago,
            COUNT(A.IdPago)                   AS Cantidad,
            COALESCE(SUM(A.Pago), 0)          AS Total
         FROM tblPagos A
         LEFT JOIN tblProductos B ON A.IdProducto = B.IdProducto
         LEFT JOIN tblFormasPago F ON COALESCE(A.IdFormaPago, 1) = F.IdFormaPago
         WHERE A.IdSedePago = ? AND A.IdApertura = ? AND A.Status = 0 ${tipoClause}
         GROUP BY COALESCE(A.IdFormaPago, 1), F.FormaPago
         ORDER BY IdFormaPago`,
        [idSede, idAp]
    ) as any[];
    return rows.map((r: any) => ({
        idFormaPago: Number(r.IdFormaPago),
        formaPago: r.FormaPago,
        cantidad: Number(r.Cantidad) || 0,
        total: Number(r.Total) || 0,
    }));
}

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
                COALESCE(AC.FondoCaja, 0) AS FondoCaja,
                COALESCE(CJ.Usuario, '')  AS Cajero,
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

        // ── 3 desgloses por forma de pago ──
        const membresias = await ventasPorFormaPago(idSd, idAp, 'AND B.IdTipoProducto < 6');
        const uniformes  = await ventasPorFormaPago(idSd, idAp, 'AND B.IdTipoProducto = 6');
        const total      = await ventasPorFormaPago(idSd, idAp, '');

        // Operaciones = tickets distintos (recibos) de la apertura
        const [opRows] = await pool.query(
            `SELECT COUNT(DISTINCT CASE WHEN Status = 0 THEN Recibo ELSE NULL END) AS Operaciones
             FROM tblPagos
             WHERE IdSedePago = ? AND IdApertura = ?`,
            [idSd, idAp]
        ) as any[];

        const sum = (arr: { total: number }[]) => arr.reduce((s, r) => s + r.total, 0);

        return NextResponse.json({
            success: true,
            data: {
                idApertura: ap.IdApertura,
                idSede: ap.IdSede,
                sede: ap.Sede,
                fechaApertura: ap.FechaApertura,
                fechaCierre: ap.FechaCierre,
                fondoCaja: Number(ap.FondoCaja) || 0,
                cajero: ap.Cajero,
                cerrado: ap.RawCierre != null,
                operaciones: Number(opRows[0]?.Operaciones) || 0,
                membresias,
                uniformes,
                total,
                totales: {
                    membresias: sum(membresias),
                    uniformes: sum(uniformes),
                    total: sum(total),
                },
            },
        });
    } catch (error) {
        console.error('Error fetching detalle ventas:', error);
        return NextResponse.json(
            { success: false, message: 'Error al obtener detalle de ventas', error: error instanceof Error ? error.message : 'Unknown' },
            { status: 500 }
        );
    }
}
