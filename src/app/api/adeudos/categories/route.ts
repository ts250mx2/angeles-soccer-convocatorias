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

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const temporadaId = searchParams.get('temporadaId');
        const sedeId = searchParams.get('sedeId');

        const season = await loadSeason(temporadaId);
        if (!season) {
            return NextResponse.json({ success: false, message: 'No se encontró temporada' }, { status: 404 });
        }

        const m = resolveSeasonMonths(season);

        // Filtro opcional por sede (para el drill-down sede -> categorías).
        const sedeClause = sedeId ? 'WHERE J.IdSede = ?' : '';

        const query = `
            SELECT
                J.Categoria,
                COUNT(CASE WHEN J.Status = 0 THEN 1 END) as Activos,
                COUNT(CASE WHEN J.Status = 2 THEN 1 END) as Bajas,
                SUM(CASE WHEN INSCRIPCION.IdJugador IS NULL AND J.Status = 0 THEN 1 ELSE 0 END) as PendientesInscripcion,
                SUM(CASE WHEN COALESCE(MENSUALIDADES.PagosCount, 0) < ? AND J.Status = 0 THEN 1 ELSE 0 END) as PendientesMensualidad,
                SUM(CASE WHEN J.Status = 0
                          AND INSCRIPCION.IdJugador IS NOT NULL
                          AND COALESCE(MENSUALIDADES.PagosCount, 0) >= ?
                    THEN 1 ELSE 0 END) as AlCorriente,
                SUM(CASE WHEN J.Status = 0
                          AND (INSCRIPCION.IdJugador IS NULL OR COALESCE(MENSUALIDADES.PagosCount, 0) < ?)
                    THEN 1 ELSE 0 END) as Debe
            FROM tblJugadores J
            LEFT JOIN (
                SELECT P.IdJugador
                FROM tblPagos P
                INNER JOIN tblProductos PR ON P.IdProducto = PR.IdProducto
                WHERE P.IdTemporada = ? AND PR.IdTipoProducto = 2 AND P.Status = 0
                GROUP BY P.IdJugador
            ) INSCRIPCION ON J.IdJugador = INSCRIPCION.IdJugador
            LEFT JOIN (
                SELECT P.IdJugador, COUNT(DISTINCT P.Mes) as PagosCount
                FROM tblPagos P
                INNER JOIN tblProductos PR ON P.IdProducto = PR.IdProducto
                WHERE P.IdTemporada = ? AND PR.IdTipoProducto = 1 AND P.Status = 0
                  AND P.Mes >= ? AND P.Mes <= ?
                GROUP BY P.IdJugador
            ) MENSUALIDADES ON J.IdJugador = MENSUALIDADES.IdJugador
            ${sedeClause}
            GROUP BY J.Categoria
            ORDER BY J.Categoria
        `;

        const params: any[] = [
            m.mesesExigibles,      // PendientesMensualidad
            m.mesesExigibles,      // AlCorriente
            m.mesesExigibles,      // Debe
            m.seasonId,
            m.seasonId,
            m.startMonth,
            m.hastaMonth,
        ];
        if (sedeId) params.push(parseInt(sedeId));

        const [rawRows] = await pool.query(query, params) as any[];

        // COUNT() llega como número pero SUM(CASE...) como string; se coercionan.
        const rows = rawRows.map((r: any) => ({
            Categoria: r.Categoria,
            Activos: Number(r.Activos) || 0,
            Bajas: Number(r.Bajas) || 0,
            PendientesInscripcion: Number(r.PendientesInscripcion) || 0,
            PendientesMensualidad: Number(r.PendientesMensualidad) || 0,
            AlCorriente: Number(r.AlCorriente) || 0,
            Debe: Number(r.Debe) || 0,
        }));

        // Nombre de la sede, para el encabezado del drill-down.
        let sedeName: string | null = null;
        if (sedeId) {
            const [sedeRows] = await pool.query(
                'SELECT Sede FROM tblSedes WHERE IdSede = ? LIMIT 1',
                [parseInt(sedeId)]
            ) as any[];
            sedeName = sedeRows.length ? sedeRows[0].Sede : null;
        }

        return NextResponse.json({
            success: true,
            data: rows,
            sedeName,
            config: {
                seasonId: m.seasonId,
                temporadaNombre: m.temporadaNombre,
                startMonth: m.startMonth,
                endMonth: m.endMonth,
                hastaMonth: m.hastaMonth,
                numMonthsExpected: m.numMonthsExpected,
            },
        });
    } catch (error) {
        console.error('Error fetching categories for adeudos:', error);
        return NextResponse.json(
            { success: false, message: 'Error al obtener categorías' },
            { status: 500 }
        );
    }
}
