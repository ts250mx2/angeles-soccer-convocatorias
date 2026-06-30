import { NextResponse } from 'next/server';
import { pool } from '@/lib/db';

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const categoriaParam = searchParams.get('categoria');
        const sedeIdParam = searchParams.get('sedeId');

        if (!categoriaParam && !sedeIdParam) {
            return NextResponse.json({ success: false, message: 'La categoría o sede es requerida' }, { status: 400 });
        }

        const categorias = categoriaParam ? categoriaParam.split(',').map(c => c.trim()) : [];
        const sedeId = sedeIdParam ? parseInt(sedeIdParam) : null;

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
        const whereClause = sedeId 
            ? 'WHERE J.IdSede = ?' 
            : `WHERE J.Categoria IN (${categorias.map(() => '?').join(',')})`;

        const query = `
            SELECT 
                J.IdJugador, 
                J.Jugador, 
                J.Categoria, 
                J.Status,
                J.Beca,
                J.IdSede,
                COALESCE(S.Sede, J.Sede) as SedeNombre,
                CASE WHEN INSCRIPCION.IdJugador IS NOT NULL THEN 1 ELSE 0 END as InscripcionPagada,
                COALESCE(MENSUALIDADES.MesesPagados, '') as MesesPagados,
                COALESCE(PAGOS.Pagado, 0) as Pagado
            FROM tblJugadores J
            LEFT JOIN tblSedes S ON J.IdSede = S.IdSede
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
            LEFT JOIN (
                SELECT P.IdJugador, COALESCE(SUM(P.Pago), 0) as Pagado
                FROM tblPagos P
                INNER JOIN tblProductos PR ON P.IdProducto = PR.IdProducto
                WHERE P.IdTemporada = ? AND PR.IdTipoProducto IN (1, 2) AND P.Status = 0
                GROUP BY P.IdJugador
            ) PAGOS ON J.IdJugador = PAGOS.IdJugador
            ${whereClause}
            ORDER BY J.Categoria ASC, J.Jugador ASC
        `;

        const queryParams = [
            seasonId,   // INSCRIPCION
            seasonId,   // MENSUALIDADES
            startMonth,
            endMonth,
            seasonId,   // PAGOS (recaudado)
            ...(sedeId ? [sedeId] : categorias)
        ];

        const [rows] = await pool.query(query, queryParams);

        // ── Tarifas de la temporada activa para calcular el monto del adeudo ──
        const [feeRows] = await pool.query(
            `SELECT IdSede, Precio FROM tblProductos
             WHERE IdTipoProducto = 1 AND IdTemporada = ? AND Status = 0 AND Producto LIKE 'MENSUALIDAD%'`,
            [seasonId]
        ) as any[];
        const monthlyBySede: Record<number, number> = {};
        let generalMonthly = 0;
        for (const f of feeRows) {
            const price = Number(f.Precio) || 0;
            if (f.IdSede === 0) generalMonthly = price;
            else monthlyBySede[f.IdSede] = price;
        }
        if (!generalMonthly && feeRows.length) generalMonthly = Number(feeRows[0].Precio) || 0;

        const [inscRows] = await pool.query(
            `SELECT Precio FROM tblProductos
             WHERE IdTipoProducto = 2 AND IdTemporada = ? AND Status = 0 AND Producto LIKE 'INSCRIPCION%'
             ORDER BY IdSede ASC LIMIT 1`,
            [seasonId]
        ) as any[];
        const inscriptionFee = inscRows.length ? (Number(inscRows[0].Precio) || 0) : 0;

        // Adeudo = meses faltantes (inicio..mes actual) x mensualidad (menos beca) + inscripción pendiente
        const data = (rows as any[]).map((p) => {
            const paid = String(p.MesesPagados || '')
                .split(',').map((x: string) => parseInt(x.trim())).filter((x: number) => !isNaN(x));
            let missing = 0;
            for (let m = startMonth; m <= currentMonth; m++) {
                if (!paid.includes(m)) missing++;
            }
            const becaNum = parseFloat(String(p.Beca));
            const becaPct = isNaN(becaNum) ? 0 : Math.max(0, Math.min(100, becaNum));
            const monthly = monthlyBySede[p.IdSede] ?? generalMonthly;
            let adeudo = 0;
            if (p.Status === 0 && becaPct < 100) {
                const inscDebt = p.InscripcionPagada ? 0 : inscriptionFee;
                adeudo = missing * monthly * (1 - becaPct / 100) + inscDebt;
            }
            return { ...p, Adeudo: Math.round(adeudo * 100) / 100, Pagado: Number(p.Pagado) || 0 };
        });

        return NextResponse.json({
            success: true,
            data,
            config: {
                startMonth,
                endMonth,
                currentMonth,
                seasonId,
                mensualidad: generalMonthly,
                inscripcion: inscriptionFee,
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
