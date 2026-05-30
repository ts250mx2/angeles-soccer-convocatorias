import { NextResponse } from 'next/server';
import { pool } from '@/lib/db';

export const dynamic = 'force-dynamic';

function buildVentasDateFilter(period: string, dateFrom: string | null, dateTo: string | null): { clause: string; params: any[] } {
    if (dateFrom && dateTo) {
        return { clause: `DATE(V.FechaVenta) BETWEEN ? AND ?`, params: [dateFrom, dateTo] };
    }
    const localNow = `CONVERT_TZ(UTC_TIMESTAMP(), '+00:00', '-06:00')`;
    switch (period) {
        case 'today':
            return { clause: `DATE(V.FechaVenta) = DATE(${localNow})`, params: [] };
        case 'yesterday':
            return { clause: `DATE(V.FechaVenta) = DATE(${localNow} - INTERVAL 1 DAY)`, params: [] };
        case 'week':
            return { clause: `YEARWEEK(V.FechaVenta, 1) = YEARWEEK(${localNow}, 1)`, params: [] };
        case 'month':
            return { clause: `YEAR(V.FechaVenta) = YEAR(${localNow}) AND MONTH(V.FechaVenta) = MONTH(${localNow})`, params: [] };
        case 'all':
            return { clause: `1=1`, params: [] };
        default:
            // Default to last 30 days
            return { clause: `V.FechaVenta >= DATE_SUB(${localNow}, INTERVAL 30 DAY)`, params: [] };
    }
}

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const idSede = searchParams.get('idSede');
        const buyerName = searchParams.get('q') || '';
        const period = searchParams.get('period') || 'default';
        const dateFrom = searchParams.get('dateFrom');
        const dateTo = searchParams.get('dateTo');

        let query = `
            SELECT 
                V.IdVenta,
                V.FechaVenta,
                V.IdJugador,
                V.Jugador,
                V.ConceptoVenta,
                V.IdFormaPago,
                V.Referencia,
                V.Subtotal,
                V.Iva,
                V.Total,
                V.Status,
                V.IdSede,
                S.Sede,
                V.FormaPago,
                V.Recibo
            FROM tblVentas V
            LEFT JOIN tblSedes S ON V.IdSede = S.IdSede
            WHERE V.Status = 0
        `;
        const params: any[] = [];

        if (idSede) {
            query += ' AND V.IdSede = ?';
            params.push(idSede);
        }

        if (buyerName.trim()) {
            query += ' AND V.Jugador LIKE ?';
            params.push(`%${buyerName.trim()}%`);
        }

        const dateFilter = buildVentasDateFilter(period, dateFrom, dateTo);
        query += ` AND ${dateFilter.clause}`;
        params.push(...dateFilter.params);

        query += ' ORDER BY V.FechaVenta DESC, V.IdVenta DESC LIMIT 200';

        const [rows] = await pool.query(query, params);
        return NextResponse.json({ success: true, data: rows });
    } catch (error) {
        console.error('Error fetching sales:', error);
        return NextResponse.json(
            { success: false, message: 'Error al obtener el historial de ventas', error: error instanceof Error ? error.message : 'Unknown' },
            { status: 500 }
        );
    }
}

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const {
            idSede,
            idJugador,
            jugador,
            conceptoVenta,
            idFormaPago,
            formaPago,
            referencia,
            recibo,
            total,
            fechaVenta
        } = body;

        if (!idSede || !jugador || !conceptoVenta || total === undefined) {
            return NextResponse.json(
                { success: false, message: 'Los campos sede, comprador, concepto y total son requeridos.' },
                { status: 400 }
            );
        }

        const subtotal = Number((total / 1.16).toFixed(2));
        const iva = Number((total - subtotal).toFixed(2));

        const insertQuery = `
            INSERT INTO tblVentas (
                FechaVenta,
                IdJugador,
                Jugador,
                ConceptoVenta,
                IdFormaPago,
                Referencia,
                Subtotal,
                Iva,
                Total,
                Status,
                IdSede,
                FormaPago,
                IdComputadora,
                Recibo
            ) VALUES (
                ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, 1, ?
            )
        `;

        // If no custom fechaVenta provided, use the current database local time
        const dbDate = fechaVenta 
            ? new Date(fechaVenta).toISOString().slice(0, 19).replace('T', ' ')
            : new Date().toISOString().slice(0, 19).replace('T', ' '); // fallback to system date if necessary, wait, let's use current time

        const values = [
            fechaVenta ? dbDate : new Date(new Date().getTime() - 6 * 60 * 60 * 1000).toISOString().slice(0, 19).replace('T', ' '), // subtract 6 hours for Mexico local timezone
            idJugador || null,
            jugador,
            conceptoVenta,
            idFormaPago || 1, // default to EFECTIVO (1)
            referencia || '',
            subtotal,
            iva,
            total,
            idSede,
            formaPago || 'EFECTIVO',
            recibo || ''
        ];

        const [result] = await pool.query(insertQuery, values) as any[];

        return NextResponse.json({
            success: true,
            message: 'Venta registrada con éxito.',
            data: { idVenta: result.insertId }
        });
    } catch (error) {
        console.error('Error inserting sale:', error);
        return NextResponse.json(
            { success: false, message: 'Error al registrar la venta', error: error instanceof Error ? error.message : 'Unknown' },
            { status: 500 }
        );
    }
}
