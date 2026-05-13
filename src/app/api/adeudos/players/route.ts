import { NextResponse } from 'next/server';
import { pool } from '@/lib/db';

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const categoriaParam = searchParams.get('categoria');

        if (!categoriaParam) {
            return NextResponse.json({ success: false, message: 'La categoría es requerida' }, { status: 400 });
        }

        const categorias = categoriaParam.split(',').map(c => c.trim());

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

        // 2. Query to get players and their payment status
        const query = `
            SELECT 
                J.IdJugador, 
                J.Jugador, 
                J.Categoria, 
                J.Status,
                J.Beca,
                CASE WHEN INSCRIPCION.IdJugador IS NOT NULL THEN 1 ELSE 0 END as InscripcionPagada,
                COALESCE(MENSUALIDADES.MesesPagados, '') as MesesPagados
            FROM tblJugadores J
            LEFT JOIN (
                SELECT P.IdJugador
                FROM tblPagos P
                INNER JOIN tblProductos PR ON P.IdProducto = PR.IdProducto
                WHERE P.IdTemporada = ? AND PR.IdTipoProducto = 2 AND P.Status = 0
                GROUP BY P.IdJugador
            ) INSCRIPCION ON J.IdJugador = INSCRIPCION.IdJugador
            LEFT JOIN (
                SELECT P.IdJugador, COUNT(DISTINCT P.Mes) as MesesCount, GROUP_CONCAT(DISTINCT P.Mes) as MesesPagados
                FROM tblPagos P
                INNER JOIN tblProductos PR ON P.IdProducto = PR.IdProducto
                WHERE P.IdTemporada = ? AND PR.IdTipoProducto = 1 AND P.Status = 0
                  AND P.Mes >= ? AND P.Mes <= ?
                GROUP BY P.IdJugador
            ) MENSUALIDADES ON J.IdJugador = MENSUALIDADES.IdJugador
            WHERE J.Categoria IN (${categorias.map(() => '?').join(',')})
            ORDER BY J.Categoria ASC, J.Jugador ASC
        `;

        const [rows] = await pool.query(query, [
            seasonId, 
            seasonId, 
            startMonth, 
            endMonth, 
            ...categorias
        ]);

        return NextResponse.json({ 
            success: true, 
            data: rows,
            config: {
                startMonth,
                endMonth,
                currentMonth,
                seasonId
            }
        });
    } catch (error) {
        console.error('Error fetching players for category:', error);
        return NextResponse.json(
            { success: false, message: 'Error al obtener jugadores' },
            { status: 500 }
        );
    }
}
