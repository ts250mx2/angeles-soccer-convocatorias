import { NextResponse } from 'next/server';
import { pool } from '@/lib/db';

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const seasonId = searchParams.get('seasonId');
        const leagueId = searchParams.get('leagueId');
        const categoria = searchParams.get('categoria');
        const color = searchParams.get('color');

        if (!seasonId || !leagueId || !categoria || color === null) {
            return NextResponse.json(
                { success: false, message: 'Faltan parámetros requeridos (incluyendo color)' },
                { status: 400 }
            );
        }

        const selectQuery = `
            SELECT A.IdJugador, B.Jugador, B.Categoria, A.Precio, A.EsConvocado, A.EsEliminado,
                   CASE WHEN A.Categoria <> B.Categoria THEN 1 ELSE 0 END AS EsInvitado,
                   CASE WHEN A.EsConvocado = 1 THEN COALESCE(PAGOS.TotalPago, 0) ELSE 0 END AS PagoJugador,
                   CASE WHEN A.EsConvocado = 1 THEN (A.Precio - COALESCE(PAGOS.TotalPago, 0)) ELSE 0 END AS CXC
            FROM tblDetalleConvocatorias A 
            INNER JOIN tblJugadores B ON A.IdJugador = B.IdJugador 
            LEFT JOIN (
                SELECT P.IdJugador, SUM(P.Pago) as TotalPago
                FROM tblPagos P
                INNER JOIN tblProductos PR ON P.IdProducto = PR.IdProducto
                WHERE P.IdTemporada = ? AND PR.IdLiga = ? AND P.Status = 0
                GROUP BY P.IdJugador
            ) PAGOS ON A.IdJugador = PAGOS.IdJugador
            WHERE A.IdTemporada = ? AND A.IdLiga = ? AND A.Categoria = ? AND A.Color = ?
            ORDER BY B.Jugador ASC
        `;

        const [rows] = await pool.query(selectQuery, [seasonId, leagueId, seasonId, leagueId, categoria, color]);

        // Get total sum and count
        const [totalRows] = await pool.query(
            `SELECT COALESCE(SUM(Precio), 0) as total FROM tblDetalleConvocatorias 
             WHERE EsConvocado = 1 AND IdTemporada = ? AND IdLiga = ? AND Categoria = ? AND Color = ?`,
            [seasonId, leagueId, categoria, color]
        );

        const total = Array.isArray(totalRows) && totalRows.length > 0 ? (totalRows[0] as any).total || 0 : 0;

        const [countRows] = await pool.query(
            `SELECT COALESCE(COUNT(*), 0) as count FROM tblDetalleConvocatorias 
             WHERE EsConvocado = 1 AND IdTemporada = ? AND IdLiga = ? AND Categoria = ? AND Color = ?`,
            [seasonId, leagueId, categoria, color]
        );

        const count = Array.isArray(countRows) && countRows.length > 0 ? (countRows[0] as any).count || 0 : 0;

        // Get total payments for the category/color
        const [paymentRows] = await pool.query(
            `SELECT COALESCE(SUM(P.Pago), 0) as totalPagos
             FROM tblPagos P
             INNER JOIN tblProductos PR ON P.IdProducto = PR.IdProducto
             INNER JOIN tblDetalleConvocatorias DC ON P.IdJugador = DC.IdJugador 
                 AND P.IdTemporada = DC.IdTemporada
                 AND PR.IdLiga = DC.IdLiga
             WHERE DC.IdTemporada = ? AND DC.IdLiga = ? AND DC.Categoria = ? AND DC.Color = ?
               AND P.Status = 0 AND DC.EsConvocado = 1`,
            [seasonId, leagueId, categoria, color]
        );
        const totalPagos = Array.isArray(paymentRows) && paymentRows.length > 0 ? (paymentRows[0] as any).totalPagos || 0 : 0;
        const totalCXC = total - totalPagos;

        return NextResponse.json({ success: true, data: rows, total, count, totalPagos, totalCXC });
    } catch (error) {
        console.error('Error fetching players:', error);
        return NextResponse.json(
            { success: false, message: 'Error al obtener jugadores' },
            { status: 500 }
        );
    }
}
