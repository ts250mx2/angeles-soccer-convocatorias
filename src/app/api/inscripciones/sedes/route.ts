import { NextResponse } from 'next/server';
import { pool } from '@/lib/db';
import { JUGADORES_DE_TEMPORADA_SQL } from '@/lib/temporada';

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const temporadaId = searchParams.get('temporadaId');

        // El filtro va en el JOIN (no en el WHERE) para que las sedes sin jugadores
        // en esa temporada sigan apareciendo en cero en vez de desaparecer.
        const params: any[] = [];
        let temporadaJoin = '';
        if (temporadaId) {
            temporadaJoin = ` AND J.IdJugador IN (${JUGADORES_DE_TEMPORADA_SQL})`;
            params.push(temporadaId);
        }

        const query = `
            SELECT
                S.IdSede,
                S.Sede,
                COUNT(CASE WHEN J.Status = 0 THEN 1 END) as Inscritos,
                COUNT(CASE WHEN J.Status = 2 THEN 1 END) as Bajas,
                GROUP_CONCAT(CASE WHEN J.Status = 0 AND J.Beca IS NOT NULL AND J.Beca != '0' AND J.Beca != '' THEN J.Beca END) as BecasDetail
            FROM tblSedes S
            LEFT JOIN tblJugadores J ON S.IdSede = J.IdSede${temporadaJoin}
            GROUP BY S.IdSede, S.Sede
            ORDER BY Inscritos DESC, S.Sede ASC
        `;

        const [rows] = await pool.query(query, params);

        return NextResponse.json({ 
            success: true, 
            data: rows
        });
    } catch (error) {
        console.error('Error fetching sedes for inscripciones:', error);
        return NextResponse.json(
            { success: false, message: 'Error al obtener sedes' },
            { status: 500 }
        );
    }
}
