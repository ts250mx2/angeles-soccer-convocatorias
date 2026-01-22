import { NextResponse } from 'next/server';
import { pool } from '@/lib/db';

export async function GET() {
    try {
        // Get current season
        const [seasonRows] = await pool.query(
            'SELECT IdTemporada FROM tblTemporadas WHERE EsActiva = 1 LIMIT 1'
        );

        if (!Array.isArray(seasonRows) || seasonRows.length === 0) {
            return NextResponse.json(
                { success: false, message: 'No se encontró temporada actual' },
                { status: 404 }
            );
        }

        const currentSeasonId = (seasonRows[0] as any).IdTemporada;

        const query = `
            SELECT 
                A.IdTemporada, 
                A.IdLiga, 
                A.Categoria, 
                B.Temporada, 
                C.Liga, 
                A.FechaInicio, 
                A.FechaFin, 
                A.Cerrada, 
                SUM(D.EsConvocado) AS JugadoresConvocados,
                SUM(CASE WHEN D.EsConvocado = 1 THEN D.Precio ELSE 0 END) AS Total
            FROM tblConvocatorias A
            INNER JOIN tblTemporadas B ON A.IdTemporada = B.IdTemporada
            INNER JOIN tblLigas C ON A.IdLiga = C.IdLiga
            LEFT JOIN tblDetalleConvocatorias D ON A.IdTemporada = D.IdTemporada 
                AND A.IdLiga = D.IdLiga AND A.Categoria = D.Categoria
            WHERE A.IdTemporada = ?
            GROUP BY A.IdTemporada, A.IdLiga, A.Categoria, B.Temporada, C.Liga, 
                     A.FechaInicio, A.FechaFin, A.Cerrada
            ORDER BY C.Liga ASC, A.Categoria ASC
        `;

        const [rows] = await pool.query(query, [currentSeasonId]);

        return NextResponse.json({
            success: true,
            data: rows
        });
    } catch (error) {
        console.error('Error fetching convocatorias summary:', error);
        return NextResponse.json(
            {
                success: false,
                message: 'Error al obtener el resumen de convocatorias',
                error: error instanceof Error ? error.message : 'Unknown error'
            },
            { status: 500 }
        );
    }
}
