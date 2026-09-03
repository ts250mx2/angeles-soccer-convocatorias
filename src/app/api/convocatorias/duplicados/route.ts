import { NextResponse } from 'next/server';
import { pool } from '@/lib/db';
import { duplicadosDeTemporada } from '@/lib/convocatorias-duplicados-db';

export const dynamic = 'force-dynamic';

/**
 * Los niños convocados a dos equipos de la misma copa o liga, en la temporada activa.
 *
 * La pantalla de Convocatorias lo pide una sola vez al cargar la portada y reparte el
 * resultado entre las tarjetas: preguntarlo torneo por torneo serían veinte viajes para
 * un aviso que casi siempre viene vacío.
 *
 * La temporada la decide el servidor, igual que en /api/convocatorias/summary: es la
 * misma pregunta y tienen que estar viendo lo mismo.
 */
export async function GET() {
    try {
        const [temporadas] = (await pool.query(
            'SELECT IdTemporada FROM tblTemporadas WHERE EsActiva = 1 LIMIT 1',
        )) as unknown as [Array<{ IdTemporada: number }>, unknown];

        if (temporadas.length === 0) {
            return NextResponse.json(
                { success: false, message: 'No se encontró temporada actual' },
                { status: 404 },
            );
        }

        const data = await duplicadosDeTemporada(pool, Number(temporadas[0].IdTemporada));
        return NextResponse.json({ success: true, seasonId: temporadas[0].IdTemporada, data });
    } catch (error) {
        console.error('Error buscando niños duplicados:', error);
        return NextResponse.json(
            { success: false, message: 'Error al buscar niños en dos equipos' },
            { status: 500 },
        );
    }
}
