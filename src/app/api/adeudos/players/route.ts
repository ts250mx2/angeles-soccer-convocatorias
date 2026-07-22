import { NextResponse } from 'next/server';
import { pool } from '@/lib/db';
import { resolveSeasonMonths, type SeasonRow } from '@/lib/adeudos-season';

export const dynamic = 'force-dynamic';

async function loadSeason(temporadaId: string | null): Promise<SeasonRow | null> {
    if (temporadaId) {
        const [rows] = await pool.query(
            'SELECT IdTemporada, Temporada, FechaInicio, FechaFin FROM tblTemporadas WHERE IdTemporada = ? LIMIT 1',
            [temporadaId]
        ) as any[];
        if (rows.length) return rows[0];
    }
    const [act] = await pool.query(
        'SELECT IdTemporada, Temporada, FechaInicio, FechaFin FROM tblTemporadas WHERE EsActiva = 1 LIMIT 1'
    ) as any[];
    return act[0] ?? null;
}

/**
 * Jugadores con su estatus de adeudo en la temporada seleccionada.
 *
 * filtro (empata con los conteos de las tarjetas de sede/categoría):
 *   activos                Status 0
 *   bajas                  Status 2
 *   pendiente-inscripcion  Status 0 y sin pago de inscripción
 *   pendiente-mensualidad  Status 0 y le falta al menos un mes ya vencido
 *   al-corriente           Status 0, con inscripción y sin meses vencidos por pagar
 *   debe                   Status 0 y debe algo (inscripción o un mes vencido)
 *   todos                  sin corte
 */
export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const categoriaParam = searchParams.get('categoria');
        const sedeIdParam = searchParams.get('sedeId');
        const temporadaId = searchParams.get('temporadaId');
        // Default 'todos' para no alterar a los consumidores que no mandan filtro
        // (páginas [categoria] y multi, que filtran del lado del cliente).
        const filtro = searchParams.get('filtro') ?? 'todos';

        if (!categoriaParam && !sedeIdParam) {
            return NextResponse.json({ success: false, message: 'La categoría o sede es requerida' }, { status: 400 });
        }

        const season = await loadSeason(temporadaId);
        if (!season) {
            return NextResponse.json({ success: false, message: 'No se encontró temporada' }, { status: 404 });
        }

        const m = resolveSeasonMonths(season);
        const seasonId = m.seasonId;

        const categorias = categoriaParam ? categoriaParam.split(',').map((c) => c.trim()) : [];
        const sedeId = sedeIdParam ? parseInt(sedeIdParam) : null;

        const where: string[] = [];
        const whereParams: any[] = [];
        if (sedeId) { where.push('J.IdSede = ?'); whereParams.push(sedeId); }
        if (categorias.length) {
            where.push(`J.Categoria IN (${categorias.map(() => '?').join(',')})`);
            whereParams.push(...categorias);
        }

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
                SELECT P.IdJugador, GROUP_CONCAT(DISTINCT P.Mes) as MesesPagados
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
            WHERE ${where.join(' AND ')}
            ORDER BY J.Categoria ASC, J.Jugador ASC
        `;

        const queryParams = [
            seasonId,          // INSCRIPCION
            seasonId,          // MENSUALIDADES
            m.startMonth,
            m.endMonth,
            seasonId,          // PAGOS
            ...whereParams,
        ];

        const [rows] = await pool.query(query, queryParams);

        // ── Tarifas de la temporada para calcular el monto del adeudo ──
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

        // Adeudo = meses faltantes (inicio..hastaMonth) x mensualidad (menos beca) + inscripción pendiente
        const computed = (rows as any[]).map((p) => {
            const paid = String(p.MesesPagados || '')
                .split(',').map((x: string) => parseInt(x.trim())).filter((x: number) => !isNaN(x));

            let missing = 0;
            for (let mes = m.startMonth; mes <= m.hastaMonth; mes++) {
                if (!paid.includes(mes)) missing++;
            }
            // Meses pagados dentro del rango de la temporada (para el corte "pendiente mensualidad")
            const pagosCount = paid.filter((x) => x >= m.startMonth && x <= m.endMonth).length;

            const becaNum = parseFloat(String(p.Beca));
            const becaPct = isNaN(becaNum) ? 0 : Math.max(0, Math.min(100, becaNum));
            const monthly = monthlyBySede[p.IdSede] ?? generalMonthly;

            let adeudo = 0;
            if (p.Status === 0 && becaPct < 100) {
                const inscDebt = p.InscripcionPagada ? 0 : inscriptionFee;
                adeudo = missing * monthly * (1 - becaPct / 100) + inscDebt;
            }

            return {
                ...p,
                Adeudo: Math.round(adeudo * 100) / 100,
                Pagado: Number(p.Pagado) || 0,
                MissingCount: missing,
                PagosCount: pagosCount,
            };
        });

        // Corte según el filtro (mismas definiciones que las tarjetas). Todo se mide
        // por lo VENCIDO a la fecha (MissingCount = meses exigibles sin pagar), no por
        // la temporada completa: así "al corriente" no exige pagar meses aún no vencidos.
        const pasaFiltro = (p: any): boolean => {
            switch (filtro) {
                case 'bajas': return p.Status === 2;
                case 'pendiente-inscripcion': return p.Status === 0 && !p.InscripcionPagada;
                case 'pendiente-mensualidad': return p.Status === 0 && p.MissingCount > 0;
                case 'al-corriente':
                    return p.Status === 0 && !!p.InscripcionPagada && p.MissingCount === 0;
                case 'debe':
                    return p.Status === 0 && (!p.InscripcionPagada || p.MissingCount > 0);
                case 'todos': return true;
                case 'activos':
                default: return p.Status === 0;
            }
        };

        const data = computed.filter(pasaFiltro);
        const totalAdeudo = data.reduce((s, p) => s + (Number(p.Adeudo) || 0), 0);
        const totalPagado = data.reduce((s, p) => s + (Number(p.Pagado) || 0), 0);

        return NextResponse.json({
            success: true,
            data,
            config: {
                seasonId,
                temporadaNombre: m.temporadaNombre,
                startMonth: m.startMonth,
                endMonth: m.endMonth,
                hastaMonth: m.hastaMonth,
                // Los reportes previos ([categoria], multi) calculan el adeudo con
                // startMonth..currentMonth; se les entrega hastaMonth como currentMonth
                // para conservar su comportamiento (idéntico en la temporada activa).
                currentMonth: m.hastaMonth,
                numMonthsExpected: m.numMonthsExpected,
                mensualidad: generalMonthly,
                inscripcion: inscriptionFee,
                totalAdeudo: Math.round(totalAdeudo * 100) / 100,
                totalPagado: Math.round(totalPagado * 100) / 100,
            },
        });
    } catch (error) {
        console.error('Error fetching players for adeudos:', error);
        return NextResponse.json(
            { success: false, message: 'Error al obtener jugadores' },
            { status: 500 }
        );
    }
}
