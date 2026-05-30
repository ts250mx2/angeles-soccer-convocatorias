import { NextResponse } from 'next/server';
import { pool } from '@/lib/db';

export const dynamic = 'force-dynamic';

// Read-only migration of frmProcDetalleCorteCaja (VB6).
// Lista las líneas individuales (pagos o egresos) de una apertura, filtradas por:
//   grid: 0=Membresías (IdTipoProducto<6), 1=Uniformes (=6), 2=Total, 3=Gastos
//   idFormaPago: 0 = todas las formas de pago; otro = forma de pago específica
// No escribe a la base de datos.
export async function GET(
    request: Request,
    { params }: { params: Promise<{ idApertura: string }> }
) {
    try {
        const { idApertura } = await params;
        const { searchParams } = new URL(request.url);
        const idSede = searchParams.get('idSede');
        const grid = parseInt(searchParams.get('grid') ?? '2', 10);
        const idFormaPago = parseInt(searchParams.get('idFormaPago') ?? '0', 10);

        if (!idApertura || !idSede) {
            return NextResponse.json(
                { success: false, message: 'Faltan parámetros idApertura / idSede' },
                { status: 400 }
            );
        }

        const idAp = parseInt(idApertura, 10);
        const idSd = parseInt(idSede, 10);
        const fpParams: any[] = [idSd, idAp];

        let query: string;

        if (grid === 3) {
            // ── Gastos (tblEgresos) ──
            query = `
                SELECT
                    A.Recibo,
                    COALESCE(A.ConceptoEgreso, '—')   AS Nombre,
                    COALESCE(A.Total, 0)              AS Monto,
                    CONVERT_TZ(A.FechaEgreso, '+00:00', '-06:00') AS Fecha,
                    COALESCE(F.FormaPago, A.FormaPago, 'EFECTIVO') AS FormaPago,
                    COALESCE(A.PagarA, '')            AS Extra
                FROM tblEgresos A
                LEFT JOIN tblFormasPago F ON COALESCE(A.IdFormaPago, 1) = F.IdFormaPago
                WHERE A.IdSedePago = ? AND A.IdApertura = ? AND A.Status = 0
            `;
            if (idFormaPago !== 0) {
                query += ' AND COALESCE(A.IdFormaPago, 1) = ?';
                fpParams.push(idFormaPago);
            }
            query += ' ORDER BY A.FechaEgreso ASC';
        } else {
            // ── Pagos (tblPagos) — grid 0/1/2 ──
            let tipoClause = '';
            if (grid === 0) tipoClause = 'AND B.IdTipoProducto < 6';
            else if (grid === 1) tipoClause = 'AND B.IdTipoProducto = 6';
            // grid 2 = total (sin filtro de tipo)

            query = `
                SELECT
                    A.Recibo,
                    C.Jugador                         AS Nombre,
                    COALESCE(A.Pago, 0)              AS Monto,
                    CONVERT_TZ(A.FechaPago, '+00:00', '-06:00') AS Fecha,
                    COALESCE(D.FormaPago, 'EFECTIVO') AS FormaPago,
                    COALESCE(PR.Producto, '')         AS Extra
                FROM tblPagos A
                LEFT JOIN tblProductos B ON A.IdProducto = B.IdProducto
                LEFT JOIN tblProductos PR ON A.IdProducto = PR.IdProducto
                LEFT JOIN tblJugadores C ON A.IdJugador = C.IdJugador
                LEFT JOIN tblFormasPago D ON COALESCE(A.IdFormaPago, 1) = D.IdFormaPago
                WHERE A.IdSedePago = ? AND A.IdApertura = ? AND A.Status = 0 ${tipoClause}
            `;
            if (idFormaPago !== 0) {
                query += ' AND COALESCE(A.IdFormaPago, 1) = ?';
                fpParams.push(idFormaPago);
            }
            query += ' ORDER BY A.FechaPago ASC';
        }

        const [rows] = await pool.query(query, fpParams) as any[];

        const data = rows.map((r: any) => ({
            recibo: r.Recibo ?? '',
            nombre: r.Nombre ?? '—',
            monto: Number(r.Monto) || 0,
            fecha: r.Fecha,
            formaPago: r.FormaPago,
            extra: r.Extra ?? '',
        }));

        const total = data.reduce((s: number, r: any) => s + r.monto, 0);

        return NextResponse.json({
            success: true,
            data,
            total,
            count: data.length,
            grid,
            idFormaPago,
        });
    } catch (error) {
        console.error('Error fetching detalle corte:', error);
        return NextResponse.json(
            { success: false, message: 'Error al obtener detalle', error: error instanceof Error ? error.message : 'Unknown' },
            { status: 500 }
        );
    }
}
