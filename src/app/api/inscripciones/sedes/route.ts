import { NextResponse } from 'next/server';
import { pool } from '@/lib/db';
import { JUGADORES_DE_TEMPORADA_SQL, MENSUALIDADES_EN_TEMPORADA_SQL } from '@/lib/temporada';

export const dynamic = 'force-dynamic';

/**
 * Resumen por sede de la temporada seleccionada.
 *
 * Las dos pertenencias (inscritos y "con pagos sin inscripción") se resuelven con
 * LEFT JOIN a subconsultas agregadas en vez de `IN (...)` por fila: así cada conjunto
 * se materializa una sola vez.
 *
 * Las sedes sin jugadores en la temporada siguen apareciendo en cero porque el filtro
 * vive en los JOIN, no en el WHERE.
 */
export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const temporadaId = searchParams.get('temporadaId');

        if (!temporadaId) {
            // Sin temporada: resumen global, sin el corte de "sin inscripción".
            const [allRows] = await pool.query(`
                SELECT
                    S.IdSede,
                    S.Sede,
                    COUNT(CASE WHEN J.Status = 0 THEN 1 END) as Inscritos,
                    COUNT(CASE WHEN J.Status = 2 THEN 1 END) as Bajas,
                    0 as SinInscripcion,
                    GROUP_CONCAT(CASE WHEN J.Status = 0 AND J.Beca IS NOT NULL AND J.Beca != '0' AND J.Beca != '' THEN J.Beca END) as BecasDetail
                FROM tblSedes S
                LEFT JOIN tblJugadores J ON S.IdSede = J.IdSede
                GROUP BY S.IdSede, S.Sede
                ORDER BY Inscritos DESC, S.Sede ASC
            `);
            return NextResponse.json({ success: true, data: allRows });
        }

        const query = `
            SELECT
                S.IdSede,
                S.Sede,
                COUNT(CASE WHEN J.Status = 0 AND INS.IdJugador IS NOT NULL THEN 1 END) as Inscritos,
                COUNT(CASE WHEN J.Status = 2 AND INS.IdJugador IS NOT NULL THEN 1 END) as Bajas,
                COUNT(CASE WHEN J.Status = 0 AND MEN.IdJugador IS NOT NULL AND INS.IdJugador IS NULL THEN 1 END) as SinInscripcion,
                GROUP_CONCAT(
                    CASE WHEN J.Status = 0 AND INS.IdJugador IS NOT NULL
                          AND J.Beca IS NOT NULL AND J.Beca != '0' AND J.Beca != ''
                    THEN J.Beca END
                ) as BecasDetail
            FROM tblSedes S
            LEFT JOIN tblJugadores J ON S.IdSede = J.IdSede
            LEFT JOIN (
                SELECT DISTINCT IdJugador FROM (${JUGADORES_DE_TEMPORADA_SQL}) I
            ) INS ON INS.IdJugador = J.IdJugador
            LEFT JOIN (
                SELECT DISTINCT IdJugador FROM (${MENSUALIDADES_EN_TEMPORADA_SQL}) M
            ) MEN ON MEN.IdJugador = J.IdJugador
            GROUP BY S.IdSede, S.Sede
            ORDER BY Inscritos DESC, S.Sede ASC
        `;

        const [rows] = await pool.query(query, [temporadaId, temporadaId]);

        return NextResponse.json({ success: true, data: rows });
    } catch (error) {
        console.error('Error fetching sedes for inscripciones:', error);
        return NextResponse.json(
            { success: false, message: 'Error al obtener sedes' },
            { status: 500 }
        );
    }
}
