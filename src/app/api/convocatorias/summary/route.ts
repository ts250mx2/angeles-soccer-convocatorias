import { NextResponse } from 'next/server';
import { pool } from '@/lib/db';

export async function GET(request: Request) {
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

        const { searchParams } = new URL(request.url);
        const userId = searchParams.get('userId');
        const adminLevel = parseInt(searchParams.get('adminLevel') || '0');

        let filterClause = '';
        const queryParams: any[] = [currentSeasonId];

        if (adminLevel < 2 && userId) {
            filterClause = ' AND A.IdProfesor = ?';
            queryParams.push(userId);
        }

        const query = `
            SELECT 
                A.IdTemporada, 
                A.IdLiga, 
                A.Categoria, 
                A.Color,
                A.IdProfesor,
                U.Usuario AS Profesor,
                B.Temporada, 
                C.Liga, 
                A.FechaInicio, 
                A.FechaFin, 
                A.Cerrada, 
                COALESCE(SUM(D.EsConvocado), 0) AS JugadoresConvocados,
                COALESCE(SUM(CASE WHEN D.EsConvocado = 1 THEN D.Precio ELSE 0 END), 0) AS Total,
                COALESCE(PAGOS.TotalPagos, 0) AS Pagos,
                (COALESCE(SUM(CASE WHEN D.EsConvocado = 1 THEN D.Precio ELSE 0 END), 0) - COALESCE(PAGOS.TotalPagos, 0)) AS CXC
            FROM tblConvocatorias A
            INNER JOIN tblTemporadas B ON A.IdTemporada = B.IdTemporada
            INNER JOIN tblLigas C ON A.IdLiga = C.IdLiga
            LEFT JOIN tblUsuarios U ON A.IdProfesor = U.IdUsuario
            LEFT JOIN tblDetalleConvocatorias D ON A.IdTemporada = D.IdTemporada 
                AND A.IdLiga = D.IdLiga AND A.Categoria = D.Categoria AND A.Color = D.Color
            LEFT JOIN (
                SELECT DC.IdTemporada, DC.IdLiga, DC.Categoria, DC.Color, SUM(P.Pago) as TotalPagos
                FROM tblPagos P
                INNER JOIN tblProductos PR ON P.IdProducto = PR.IdProducto
                INNER JOIN tblDetalleConvocatorias DC ON P.IdJugador = DC.IdJugador 
                    AND P.IdTemporada = DC.IdTemporada
                    AND PR.IdLiga = DC.IdLiga
                WHERE P.Status = 0 AND DC.EsConvocado = 1
                GROUP BY DC.IdTemporada, DC.IdLiga, DC.Categoria, DC.Color
            ) PAGOS ON A.IdTemporada = PAGOS.IdTemporada 
                AND A.IdLiga = PAGOS.IdLiga 
                AND A.Categoria = PAGOS.Categoria
                AND A.Color = PAGOS.Color
            WHERE A.IdTemporada = ? AND A.Status = 0 ${filterClause}
            GROUP BY A.IdTemporada, A.IdLiga, A.Categoria, A.Color, A.IdProfesor, U.Usuario, B.Temporada, C.Liga, 
                     A.FechaInicio, A.FechaFin, A.Cerrada, PAGOS.TotalPagos
            ORDER BY C.Liga ASC, A.Categoria ASC
        `;

        const [rows] = await pool.query(query, queryParams);

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
