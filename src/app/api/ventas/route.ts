import { NextResponse } from 'next/server';
import { pool } from '@/lib/db';

export const dynamic = 'force-dynamic';

// El historial de ventas se lee de tblPagos (tabla viva: los pagos/ventas reales).
// La antigua tblVentas quedó sin datos nuevos desde finales de 2023, por eso el
// historial se veía vacío. FechaPago ya está en hora LOCAL (sigue el reloj NOW()
// del servidor); no se convierte de zona horaria.
function buildVentasDateFilter(period: string, dateFrom: string | null, dateTo: string | null): { clause: string; params: any[] } {
    const fecha = `DATE(P.FechaPago)`;
    const now = `NOW()`;
    if (dateFrom && dateTo) {
        return { clause: `${fecha} BETWEEN ? AND ?`, params: [dateFrom, dateTo] };
    }
    switch (period) {
        case 'today':
            return { clause: `${fecha} = DATE(${now})`, params: [] };
        case 'yesterday':
            return { clause: `${fecha} = DATE(${now} - INTERVAL 1 DAY)`, params: [] };
        case 'week':
            return { clause: `YEARWEEK(P.FechaPago, 1) = YEARWEEK(${now}, 1)`, params: [] };
        case 'month':
            return {
                clause: `YEAR(P.FechaPago) = YEAR(${now}) AND MONTH(P.FechaPago) = MONTH(${now})`,
                params: [],
            };
        case 'all':
            return { clause: `1=1`, params: [] };
        default:
            // Default to last 30 days
            return { clause: `P.FechaPago >= DATE_SUB(${now}, INTERVAL 30 DAY)`, params: [] };
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
        /* Tope de filas. La pantalla pide las 200 más recientes (lo de siempre); la
           exportación pide muchas más, porque un documento truncado en silencio se
           lee como si fuera el historial completo. Se acota a un máximo duro para
           que un parámetro manipulado no pueda pedir la tabla entera. */
        const TOPE_MAX = 20000;
        const limitParam = Number(searchParams.get('limit'));
        const limit = Number.isFinite(limitParam) && limitParam > 0
            ? Math.min(Math.floor(limitParam), TOPE_MAX)
            : 200;

        /* El WHERE se arma una sola vez y lo usan las dos consultas: el listado (que va
           topado) y el resumen (que NO lo está). Así los KPIs de la pantalla cuentan el
           período completo aunque la tabla muestre solo las más recientes; si el resumen
           se sacara de las filas topadas, la pantalla mentiría en cuanto el período
           pasara del tope. */
        const filtros: string[] = ['P.Status = 0'];
        const filtroParams: (string | number)[] = [];

        if (idSede) {
            filtros.push('P.IdSedePago = ?');
            filtroParams.push(idSede);
        }
        if (buyerName.trim()) {
            filtros.push('P.Jugador LIKE ?');
            filtroParams.push(`%${buyerName.trim()}%`);
        }
        const dateFilter = buildVentasDateFilter(period, dateFrom, dateTo);
        filtros.push(dateFilter.clause);
        filtroParams.push(...dateFilter.params);

        const where = filtros.join(' AND ');

        let query = `
            SELECT
                P.IdPago AS IdVenta,
                -- FechaPago ya está en hora LOCAL; no se convierte (se devuelve sin
                -- offset para que el navegador la interprete como local, no UTC).
                DATE_FORMAT(P.FechaPago, '%Y-%m-%dT%H:%i:%s') AS FechaVenta,
                P.IdJugador,
                P.Jugador,
                CASE WHEN P.Mes > 0 THEN CONCAT(PR.Producto, ' · mes ', P.Mes) ELSE PR.Producto END AS ConceptoVenta,
                0 AS IdFormaPago,
                '' AS Referencia,
                P.Pago AS Subtotal,
                0 AS Iva,
                P.Pago AS Total,
                P.Status,
                P.IdSedePago AS IdSede,
                S.Sede,
                P.FormaPago,
                P.Recibo
            FROM tblPagos P
            INNER JOIN tblProductos PR ON P.IdProducto = PR.IdProducto
            LEFT JOIN tblSedes S ON P.IdSedePago = S.IdSede
            WHERE ${where}
        `;

        // `limit` es un entero ya acotado arriba, no el texto de la petición.
        query += ` ORDER BY P.FechaPago DESC, P.IdPago DESC LIMIT ${limit}`;

        const [rows] = await pool.query(query, filtroParams);

        /* Resumen del período COMPLETO (sin LIMIT): de aquí salen los KPIs y el conteo
           real, para que la pantalla no reporte solo lo que alcanzó a listar. */
        const [resumenRows] = (await pool.query(
            `SELECT
                COALESCE(NULLIF(TRIM(P.FormaPago), ''), 'SIN FORMA') AS FormaPago,
                COUNT(*) AS Ventas,
                COALESCE(SUM(P.Pago), 0) AS Total
             FROM tblPagos P
             INNER JOIN tblProductos PR ON P.IdProducto = PR.IdProducto
             WHERE ${where}
             GROUP BY COALESCE(NULLIF(TRIM(P.FormaPago), ''), 'SIN FORMA')
             ORDER BY Total DESC`,
            filtroParams,
        )) as unknown as [{ FormaPago: string; Ventas: number; Total: number }[], unknown];

        const resumen = resumenRows.map((r) => ({
            FormaPago: String(r.FormaPago),
            Ventas: Number(r.Ventas) || 0,
            Total: Number(r.Total) || 0,
        }));
        const totalVentas = resumen.reduce((s, r) => s + r.Ventas, 0);
        const totalImporte = resumen.reduce((s, r) => s + r.Total, 0);

        return NextResponse.json({
            success: true,
            data: rows,
            // Con qué tope se sirvió el listado y cuánto hay en realidad: quien consume
            // puede decir "mostrando N de M" en vez de callar el recorte.
            limite: limit,
            resumen,
            totalVentas,
            totalImporte,
        });
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
