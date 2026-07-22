import { NextResponse } from 'next/server';
import { pool } from '@/lib/db';
import { loadSeasonAndPrevious, countsByGroup, SIN_ADEUDOS } from '@/lib/adeudos-db';

export const dynamic = 'force-dynamic';

/**
 * Resumen de adeudos por sede para la temporada seleccionada y la anterior.
 *
 * Por sede devuelve: activos, bajas, y para cada temporada (actual / anterior)
 * cuántos deben algo y cuántos van al corriente. La temporada anterior ya terminó,
 * así que ahí cuentan todos sus meses; en la actual solo los meses ya vencidos.
 */
export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const temporadaId = searchParams.get('temporadaId');

        const seasons = await loadSeasonAndPrevious(temporadaId);
        if (!seasons) {
            return NextResponse.json({ success: false, message: 'No se encontró temporada' }, { status: 404 });
        }
        const { actual, anterior } = seasons;

        // Activos / bajas no dependen de la temporada.
        const [baseRows] = await pool.query(
            `SELECT
                S.IdSede,
                S.Sede,
                COALESCE(S.EsClinics, 0) as EsClinics,
                COUNT(CASE WHEN J.Status = 0 THEN 1 END) as Activos,
                COUNT(CASE WHEN J.Status = 2 THEN 1 END) as Bajas
             FROM tblSedes S
             LEFT JOIN tblJugadores J ON S.IdSede = J.IdSede
             GROUP BY S.IdSede, S.Sede, S.EsClinics
             ORDER BY S.Sede`
        ) as any[];

        const actualCounts = await countsByGroup(actual, 'sede');
        const anteriorCounts = anterior ? await countsByGroup(anterior, 'sede') : null;

        const data = (baseRows as any[]).map((r: any) => {
            const a = actualCounts.get(r.IdSede) ?? SIN_ADEUDOS;
            const p = anteriorCounts?.get(r.IdSede) ?? SIN_ADEUDOS;
            return {
                IdSede: r.IdSede,
                Sede: r.Sede,
                EsClinics: Number(r.EsClinics) || 0,
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

        // no-store para que el navegador no reutilice una respuesta previa cuando
        // se agregan campos nuevos al resumen.
        return NextResponse.json({
            success: true,
            data,
            config: {
                actual: {
                    seasonId: actual.seasonId,
                    temporadaNombre: actual.temporadaNombre,
                    startMonth: actual.startMonth,
                    endMonth: actual.endMonth,
                    hastaMonth: actual.hastaMonth,
                    mesesExigibles: actual.mesesExigibles,
                },
                anterior: anterior
                    ? {
                          seasonId: anterior.seasonId,
                          temporadaNombre: anterior.temporadaNombre,
                          startMonth: anterior.startMonth,
                          endMonth: anterior.endMonth,
                          hastaMonth: anterior.hastaMonth,
                          mesesExigibles: anterior.mesesExigibles,
                      }
                    : null,
            },
        }, { headers: { 'Cache-Control': 'no-store' } });
    } catch (error) {
        console.error('Error fetching sedes for adeudos:', error);
        return NextResponse.json(
            { success: false, message: 'Error al obtener sedes' },
            { status: 500 }
        );
    }
}
