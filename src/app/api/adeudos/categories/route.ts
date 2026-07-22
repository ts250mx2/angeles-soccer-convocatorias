import { NextResponse } from 'next/server';
import { pool } from '@/lib/db';
import { loadSeasonAndPrevious, countsByGroup, SIN_ADEUDOS } from '@/lib/adeudos-db';

export const dynamic = 'force-dynamic';

/**
 * Mismo resumen que /api/adeudos/sedes pero agrupado por categoría.
 * Con sedeId acota al drill-down de una sede.
 */
export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const temporadaId = searchParams.get('temporadaId');
        const sedeIdParam = searchParams.get('sedeId');
        const sedeId = sedeIdParam ? parseInt(sedeIdParam) : null;

        const seasons = await loadSeasonAndPrevious(temporadaId);
        if (!seasons) {
            return NextResponse.json({ success: false, message: 'No se encontró temporada' }, { status: 404 });
        }
        const { actual, anterior } = seasons;

        const baseParams: any[] = [];
        let sedeClause = '';
        if (sedeId) {
            sedeClause = 'WHERE J.IdSede = ?';
            baseParams.push(sedeId);
        }

        const [baseRows] = await pool.query(
            `SELECT
                J.Categoria,
                COUNT(CASE WHEN J.Status = 0 THEN 1 END) as Activos,
                COUNT(CASE WHEN J.Status = 2 THEN 1 END) as Bajas
             FROM tblJugadores J
             ${sedeClause}
             GROUP BY J.Categoria
             ORDER BY J.Categoria`,
            baseParams
        ) as any[];

        const actualCounts = await countsByGroup(actual, 'categoria', sedeId);
        const anteriorCounts = anterior ? await countsByGroup(anterior, 'categoria', sedeId) : null;

        const data = (baseRows as any[]).map((r: any) => {
            const a = actualCounts.get(r.Categoria) ?? SIN_ADEUDOS;
            const p = anteriorCounts?.get(r.Categoria) ?? SIN_ADEUDOS;
            return {
                Categoria: r.Categoria,
                Activos: Number(r.Activos) || 0,
                Bajas: Number(r.Bajas) || 0,
                ActualDebe: a.debe,
                ActualAlCorriente: a.alCorriente,
                ActualBecadosSinInscripcion: a.becadosSinInscripcion,
                ActualDebeInscripcion: a.debeInscripcion,
                ActualDebeMeses: a.debeMeses,
                AnteriorDebe: p.debe,
                AnteriorAlCorriente: p.alCorriente,
                AnteriorBecadosSinInscripcion: p.becadosSinInscripcion,
                AnteriorPosiblesBajas: p.posiblesBajas,
                AnteriorDebeInscripcion: p.debeInscripcion,
                AnteriorDebeMeses: p.debeMeses,
            };
        });

        let sedeName: string | null = null;
        if (sedeId) {
            const [sedeRows] = await pool.query(
                'SELECT Sede FROM tblSedes WHERE IdSede = ? LIMIT 1',
                [sedeId]
            ) as any[];
            sedeName = sedeRows.length ? sedeRows[0].Sede : null;
        }

        return NextResponse.json({
            success: true,
            data,
            sedeName,
            config: {
                actual: {
                    seasonId: actual.seasonId,
                    temporadaNombre: actual.temporadaNombre,
                    hastaMonth: actual.hastaMonth,
                    mesesExigibles: actual.mesesExigibles,
                },
                anterior: anterior
                    ? {
                          seasonId: anterior.seasonId,
                          temporadaNombre: anterior.temporadaNombre,
                          hastaMonth: anterior.hastaMonth,
                          mesesExigibles: anterior.mesesExigibles,
                      }
                    : null,
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
