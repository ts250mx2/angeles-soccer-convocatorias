import { NextResponse } from 'next/server';
import { pool } from '@/lib/db';

function buildAperturaDateFilter(period: string, dateFrom: string | null, dateTo: string | null): string {
    if (dateFrom && dateTo) {
        return `DATE(AC.FechaApertura) BETWEEN '${dateFrom}' AND '${dateTo}'`;
    }
    switch (period) {
        case 'today':
            return `DATE(AC.FechaApertura) = DATE(CONVERT_TZ(UTC_TIMESTAMP(), '+00:00', '-06:00'))`;
        case 'yesterday':
            return `DATE(AC.FechaApertura) = DATE(CONVERT_TZ(UTC_TIMESTAMP(), '+00:00', '-06:00') - INTERVAL 1 DAY)`;
        case 'month':
            return `YEAR(AC.FechaApertura) = YEAR(CONVERT_TZ(UTC_TIMESTAMP(), '+00:00', '-06:00'))
                AND MONTH(AC.FechaApertura) = MONTH(CONVERT_TZ(UTC_TIMESTAMP(), '+00:00', '-06:00'))`;
        case 'week':
        default:
            return `YEARWEEK(AC.FechaApertura, 1) = YEARWEEK(CONVERT_TZ(UTC_TIMESTAMP(), '+00:00', '-06:00'), 1)`;
    }
}

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const period = searchParams.get('period') || 'week';
        const dateFrom = searchParams.get('dateFrom');
        const dateTo = searchParams.get('dateTo');

        const dateFilter = buildAperturaDateFilter(period, dateFrom, dateTo);

        const query = `
            SELECT
                AC.IdApertura,
                AC.IdSede,
                S.Sede,
                AC.FechaApertura AS FechaApertura,
                UA.Usuario AS UsuarioApertura,
                AC.FechaCierre AS FechaCierre,
                UC.Usuario AS UsuarioCierre,
                CJ.Usuario AS Cajero,
                COALESCE(AC.FondoCaja, 0) AS FondoCaja,
                COALESCE(V.TotalPagos,  0) AS TotalPagos,
                COALESCE(V.TotalVentas, 0) AS TotalVentas,
                COALESCE(E.NumEgresos,  0) AS NumEgresos,
                COALESCE(E.TotalEgresos,0) AS TotalEgresos
            FROM tblAperturasCierres AC
            LEFT JOIN tblSedes S    ON AC.IdSede = S.IdSede
            LEFT JOIN tblUsuarios UA ON AC.IdSupervisorApertura = UA.IdUsuario
            LEFT JOIN tblUsuarios UC ON AC.IdSupervisorCierre   = UC.IdUsuario
            LEFT JOIN tblUsuarios CJ ON AC.IdCajero          = CJ.IdUsuario
            LEFT JOIN (
                SELECT
                    IdApertura,
                    IdSedePago,
                    COUNT(IdPago)           AS TotalPagos,
                    COALESCE(SUM(Pago), 0)  AS TotalVentas
                FROM tblPagos
                WHERE Status = 0
                GROUP BY IdApertura, IdSedePago
            ) V ON V.IdApertura = AC.IdApertura AND V.IdSedePago = AC.IdSede
            LEFT JOIN (
                SELECT
                    IdApertura,
                    IdSedePago,
                    COUNT(IdEgreso)          AS NumEgresos,
                    COALESCE(SUM(Total), 0)  AS TotalEgresos
                FROM tblEgresos
                GROUP BY IdApertura, IdSedePago
            ) E ON E.IdApertura = AC.IdApertura AND E.IdSedePago = AC.IdSede
            WHERE ${dateFilter}
            ORDER BY S.Sede ASC, AC.FechaApertura ASC
        `;

        const [rows] = await pool.query(query) as any[];

        return NextResponse.json({ success: true, data: rows });
    } catch (error) {
        console.error('Error fetching aperturas:', error);
        return NextResponse.json(
            { success: false, message: 'Error al obtener aperturas', error: error instanceof Error ? error.message : 'Unknown' },
            { status: 500 }
        );
    }
}
