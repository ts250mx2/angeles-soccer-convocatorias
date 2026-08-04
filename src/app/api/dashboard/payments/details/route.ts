import { NextResponse } from 'next/server';
import { pool } from '@/lib/db';

// FechaPago se guarda en hora LOCAL (sigue el reloj NOW() del servidor); NO se convierte
// de zona horaria: se compara directamente contra NOW(). Debe coincidir con el mismo
// criterio en /api/dashboard/kpis para que el detalle cuadre con la KPI.
function buildDateFilter(period: string, dateFrom: string | null, dateTo: string | null): string {
    if (dateFrom && dateTo) {
        return `DATE(P.FechaPago) BETWEEN '${dateFrom}' AND '${dateTo}'`;
    }
    switch (period) {
        case 'today':
            return `DATE(P.FechaPago) = DATE(NOW())`;
        case 'yesterday':
            return `DATE(P.FechaPago) = DATE(NOW() - INTERVAL 1 DAY)`;
        case 'week':
            return `YEARWEEK(P.FechaPago, 1) = YEARWEEK(NOW(), 1)`;
        case 'month':
        default:
            return `YEAR(P.FechaPago) = YEAR(NOW())
                AND MONTH(P.FechaPago) = MONTH(NOW())`;
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
        const otrasCuotas = searchParams.get('otrasCuotas');
        const idTipoProducto = searchParams.get('idTipoProducto');
        const idProducto = searchParams.get('idProducto');
 
        const dateFilter = buildDateFilter(period, dateFrom, dateTo);
 
        const [seasonRows] = await pool.query(
            'SELECT IdTemporada FROM tblTemporadas WHERE EsActiva = 1 LIMIT 1'
        ) as any[];
        const currentSeasonId = seasonRows.length > 0 ? seasonRows[0].IdTemporada : null;
 
        let query = `
            SELECT 
                P.IdPago,
                P.Pago,
                -- FechaPago ya está en hora LOCAL; se devuelve como ISO sin offset para
                -- que el navegador la interprete como local (sin desfase de zona).
                DATE_FORMAT(P.FechaPago, '%Y-%m-%dT%H:%i:%s') AS FechaPago,
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
            
            if (otrasCuotas === 'true') {
                query += " AND (J.IdSede != ? OR J.Jugador LIKE '%Ventas%')";
                params.push(idSede);
            }
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
        if (idTipoProducto) {
            query += ' AND PR.IdTipoProducto = ?';
            params.push(idTipoProducto);
        }
        if (idProducto) {
            query += ' AND P.IdProducto = ?';
            params.push(idProducto);
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
