import { NextResponse } from 'next/server';
import { pool } from '@/lib/db';
import { sqlFueraDeConvocatorias } from '@/lib/convocatorias-excluidas';

export async function GET() {
    try {
        // Get current season
        const [seasonRows] = await pool.query(
            'SELECT IdTemporada FROM tblTemporadas WHERE EsActiva = 1 LIMIT 1'
        ) as unknown as [Array<{ IdTemporada: number }>, unknown];

        if (!Array.isArray(seasonRows) || seasonRows.length === 0) {
            return NextResponse.json(
                { success: false, message: 'No se encontró temporada actual' },
                { status: 404 }
            );
        }

        const currentSeasonId = seasonRows[0].IdTemporada;

        /* Quien tiene acceso a Convocatorias ve TODAS las de la temporada, no solo las
           suyas. Antes se filtraba por IdProfesor a quien no fuera administrador, y eso
           dejaba a un entrenador sin manera de ver el resto del torneo. */
        const queryParams: unknown[] = [currentSeasonId];

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
                -- Copa o liga: lo dice el catalogo, y la portada agrupa por torneo.
                C.IdTipoLiga,
                -- Escudo del torneo (catálogo de Copas y Ligas). Solo viaja si lo hay y
                -- cuándo cambió; la imagen la pide el navegador a /api/copas-ligas/foto.
                CASE WHEN C.Foto IS NOT NULL AND C.Foto <> '' THEN 1 ELSE 0 END AS TieneFoto,
                DATE_FORMAT(C.FechaAct, '%Y%m%d%H%i%s') AS FotoVersion,
                A.FechaInicio,
                A.FechaFin, 
                A.Cerrada, 
                A.CostoLiga,
                A.CostoProfesor,
                A.CostoArbitro,
                A.CantidadJornadas,
                A.Eliminatoria,
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
            WHERE A.IdTemporada = ? AND A.Status = 0
              -- Ligas y categorías que no se convocan desde este módulo: ver
              -- @/lib/convocatorias-excluidas. Las filas siguen en la base; lo que se
              -- va es su presencia en esta pantalla.
              AND NOT ${sqlFueraDeConvocatorias('C.Liga')}
              AND NOT ${sqlFueraDeConvocatorias('A.Categoria')}
            GROUP BY A.IdTemporada, A.IdLiga, A.Categoria, A.Color, A.IdProfesor, U.Usuario, B.Temporada, C.Liga,
                     C.IdTipoLiga,
                     TieneFoto, FotoVersion,
                     A.FechaInicio, A.FechaFin, A.Cerrada, A.CostoLiga, A.CostoProfesor, A.CostoArbitro,
                     A.CantidadJornadas, A.Eliminatoria, PAGOS.TotalPagos
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
