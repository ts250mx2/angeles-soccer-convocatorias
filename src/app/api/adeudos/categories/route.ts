import { NextResponse } from 'next/server';
import { pool } from '@/lib/db';

export async function GET() {
    try {
        // 1. Get active season info
        const [seasonRows] = await pool.query(
            'SELECT IdTemporada, FechaInicio, FechaFin FROM tblTemporadas WHERE EsActiva = 1 LIMIT 1'
        );

        if (!Array.isArray(seasonRows) || seasonRows.length === 0) {
            return NextResponse.json({ success: false, message: 'No se encontró temporada actual' }, { status: 404 });
        }

        const activeSeason = seasonRows[0] as any;
        const seasonId = activeSeason.IdTemporada;
        const startMonth = new Date(activeSeason.FechaInicio).getUTCMonth() + 1;
        const endMonth = new Date(activeSeason.FechaFin).getUTCMonth() + 1;
        const currentMonth = new Date().getUTCMonth() + 1;

        // "todos los meses de la temporada activa"
        const numMonthsExpected = Math.max(0, endMonth - startMonth + 1);

        // 2. Query to get category summary with the new logic
        const query = `
            SELECT 
                J.Categoria,
                COUNT(CASE WHEN J.Status = 0 THEN 1 END) as Activos,
                COUNT(CASE WHEN J.Status = 2 THEN 1 END) as Bajas,
                -- Players with missing registration (Type 2)
                SUM(CASE WHEN INSCRIPCION.IdJugador IS NULL AND J.Status = 0 THEN 1 ELSE 0 END) as PendientesInscripcion,
                -- Players with missing at least one mensualidad (Type 1) in the range
                SUM(CASE WHEN COALESCE(MENSUALIDADES.PagosCount, 0) < ? AND J.Status = 0 THEN 1 ELSE 0 END) as PendientesMensualidad
            FROM tblJugadores J
            -- Check for registration payment (IdTipoProducto = 2)
            LEFT JOIN (
                SELECT P.IdJugador
                FROM tblPagos P
                INNER JOIN tblProductos PR ON P.IdProducto = PR.IdProducto
                WHERE P.IdTemporada = ? AND PR.IdTipoProducto = 2 AND P.Status = 0
                GROUP BY P.IdJugador
            ) INSCRIPCION ON J.IdJugador = INSCRIPCION.IdJugador
            -- Check for mensualidades count (IdTipoProducto = 1)
            LEFT JOIN (
                SELECT P.IdJugador, COUNT(DISTINCT P.Mes) as PagosCount
                FROM tblPagos P
                INNER JOIN tblProductos PR ON P.IdProducto = PR.IdProducto
                WHERE P.IdTemporada = ? AND PR.IdTipoProducto = 1 AND P.Status = 0
                  AND P.Mes >= ? AND P.Mes <= ?
                GROUP BY P.IdJugador
            ) MENSUALIDADES ON J.IdJugador = MENSUALIDADES.IdJugador
            GROUP BY J.Categoria
            ORDER BY J.Categoria
        `;

        const [rows] = await pool.query(query, [
            numMonthsExpected, 
            seasonId, 
            seasonId, 
            startMonth, 
            endMonth
        ]);

        return NextResponse.json({ 
            success: true, 
            data: rows,
            config: {
                seasonId,
                startMonth,
                endMonth,
                currentMonth,
                numMonthsExpected
            }
        });
    } catch (error) {
        console.error('Error fetching categories for adeudos:', error);
        return NextResponse.json(
            { success: false, message: 'Error al obtener categorías' },
            { status: 500 }
        );
    }
}
