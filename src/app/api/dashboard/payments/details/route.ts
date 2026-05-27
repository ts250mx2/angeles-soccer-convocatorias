import { NextResponse } from 'next/server';
import { pool } from '@/lib/db';

function buildDateFilter(period: string, dateFrom: string | null, dateTo: string | null): string {
    if (dateFrom && dateTo) {
        return `DATE(CONVERT_TZ(P.FechaPago, '+00:00', '-06:00')) BETWEEN '${dateFrom}' AND '${dateTo}'`;
    }
    switch (period) {
        case 'today':
            return `DATE(CONVERT_TZ(P.FechaPago, '+00:00', '-06:00')) = DATE(CONVERT_TZ(NOW(), '+00:00', '-06:00'))`;
        case 'yesterday':
            return `DATE(CONVERT_TZ(P.FechaPago, '+00:00', '-06:00')) = DATE(CONVERT_TZ(NOW() - INTERVAL 1 DAY, '+00:00', '-06:00'))`;
        case 'week':
            return `YEARWEEK(CONVERT_TZ(P.FechaPago, '+00:00', '-06:00'), 1) = YEARWEEK(CONVERT_TZ(NOW(), '+00:00', '-06:00'), 1)`;
        case 'month':
        default:
            return `YEAR(CONVERT_TZ(P.FechaPago, '+00:00', '-06:00')) = YEAR(CONVERT_TZ(NOW(), '+00:00', '-06:00'))
                AND MONTH(CONVERT_TZ(P.FechaPago, '+00:00', '-06:00')) = MONTH(CONVERT_TZ(NOW(), '+00:00', '-06:00'))`;
    }
}

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const period = searchParams.get('period') || 'month';
        const dateFrom = searchParams.get('dateFrom');
        const dateTo = searchParams.get('dateTo');
        const idSede = searchParams.get('idSede');
        const idSedeJugador = searchParams.get('idSedeJugador');
        const idLiga = searchParams.get('idLiga');
        const categoria = searchParams.get('categoria');
 
        const dateFilter = buildDateFilter(period, dateFrom, dateTo);
 
        const [seasonRows] = await pool.query(
            'SELECT IdTemporada FROM tblTemporadas WHERE EsActiva = 1 LIMIT 1'
        ) as any[];
        const currentSeasonId = seasonRows.length > 0 ? seasonRows[0].IdTemporada : null;
 
        let query = `
            SELECT 
                P.IdPago,
                P.Pago,
                P.FechaPago,
                P.Recibo,
                J.IdJugador,
                J.Jugador,
                J.Categoria AS Categoria,
                L.Liga,
                S.Sede,
                CASE WHEN J.Jugador LIKE '%Ventas%' THEN 'VENTAS' ELSE SJ.Sede END AS SedeJugador,
                CASE WHEN J.Jugador LIKE '%Ventas%' THEN 99999 ELSE J.IdSede END AS IdSedeJugador,
                PR.Producto
            FROM tblPagos P
            INNER JOIN tblJugadores J ON P.IdJugador = J.IdJugador
            LEFT JOIN tblProductos PR ON P.IdProducto = PR.IdProducto
            LEFT JOIN tblLigas L ON PR.IdLiga = L.IdLiga
            LEFT JOIN tblSedes S ON P.IdSedePago = S.IdSede
            LEFT JOIN tblSedes SJ ON J.IdSede = SJ.IdSede
            LEFT JOIN tblDetalleConvocatorias DC ON P.IdJugador = DC.IdJugador 
                AND P.IdTemporada = DC.IdTemporada 
                AND PR.IdLiga = DC.IdLiga
            WHERE P.Status = 0
              AND ${dateFilter}
              ${currentSeasonId ? 'AND P.IdTemporada = ?' : ''}
        `;
 
        const params: any[] = currentSeasonId ? [currentSeasonId] : [];
 
        if (idSede) {
            query += ' AND P.IdSedePago = ?';
            params.push(idSede);
        }
        if (idSedeJugador) {
            if (idSedeJugador === '99999') {
                query += " AND J.Jugador LIKE '%Ventas%'";
            } else {
                query += " AND J.IdSede = ? AND J.Jugador NOT LIKE '%Ventas%'";
                params.push(idSedeJugador);
            }
        }
        if (idLiga) {
            query += ' AND PR.IdLiga = ?';
            params.push(idLiga);
        }
        if (categoria) {
            query += ' AND DC.Categoria = ?';
            params.push(categoria);
        }
 
        query += ' ORDER BY P.FechaPago DESC LIMIT 500';
 
        console.log('\n=== EJECUTANDO CONSULTA DE DETALLES DE PAGOS ===');
        console.log('SQL Query:', query.replace(/\s+/g, ' ').trim());
        console.log('Parámetros:', JSON.stringify(params));
        console.log('================================================\n');

        const [rows] = await pool.query(query, params);

        return NextResponse.json({
            success: true,
            data: rows
        });
    } catch (error) {
        console.error('Error fetching payment details:', error);
        return NextResponse.json(
            { success: false, message: 'Error al obtener detalles de pagos' },
            { status: 500 }
        );
    }
}
