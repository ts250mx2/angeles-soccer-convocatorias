import { NextResponse } from 'next/server';
import { pool } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(
    request: Request,
    { params }: { params: Promise<{ idApertura: string }> }
) {
    try {
        const { idApertura } = await params;
        const { searchParams } = new URL(request.url);
        const idSede = searchParams.get('idSede');
        const idGridStr = searchParams.get('idGrid') || '2'; // 0 = Membresias, 1 = Uniformes, 2 = Total
        const idFormaPagoStr = searchParams.get('idFormaPago') || '0'; // 0 = Total/Todos

        if (!idApertura || !idSede) {
            return NextResponse.json(
                { success: false, message: 'Faltan parámetros idApertura / idSede' },
                { status: 400 }
            );
        }

        const idAp = parseInt(idApertura, 10);
        const idSd = parseInt(idSede, 10);
        const idGrid = parseInt(idGridStr, 10);
        const idFormaPago = parseInt(idFormaPagoStr, 10);

        let query = `
            SELECT 
                A.IdPago,
                A.FechaPago AS Fecha,
                COALESCE(A.Pago, 0) AS Pago,
                COALESCE(A.Recibo, '') AS Recibo,
                COALESCE(A.Referencia, '') AS Referencia,
                COALESCE(J.Jugador, 'Venta General') AS Jugador,
                COALESCE(J.Categoria, '') AS Categoria,
                COALESCE(D.Producto, '—') AS Producto,
                COALESCE(A.FormaPago, 'EFECTIVO') AS FormaPago
            FROM tblPagos A
            LEFT JOIN tblSedes B ON A.IdSede = B.IdSede
            LEFT JOIN tblJugadores J ON A.IdJugador = J.IdJugador
            LEFT JOIN tblProductos D ON A.IdProducto = D.IdProducto
            WHERE A.IdSedePago = ? AND A.IdApertura = ? AND A.Status = 0
        `;
        const queryParams: any[] = [idSd, idAp];

        // Replicate VB6 select case logic on idGrid
        // Case 0 (Membresias): D.IdTipoProducto < 6
        // Case 1 (Uniformes): D.IdTipoProducto = 6
        // Case 2 (Total): no filter
        if (idGrid === 0) {
            query += " AND D.IdTipoProducto < 6";
        } else if (idGrid === 1) {
            query += " AND D.IdTipoProducto = 6";
        }

        // Replicate VB6 payment method filter logic
        if (idFormaPago > 0) {
            query += " AND A.IdFormaPago = ?";
            queryParams.push(idFormaPago);
        }

        query += " ORDER BY A.FechaPago ASC";

        const [rows] = await pool.query(query, queryParams) as any[];

        return NextResponse.json({
            success: true,
            data: rows
        });
    } catch (error) {
        console.error('Error fetching sales detail:', error);
        return NextResponse.json(
            { success: false, message: 'Error al obtener detalle de ventas', error: error instanceof Error ? error.message : 'Unknown' },
            { status: 500 }
        );
    }
}
