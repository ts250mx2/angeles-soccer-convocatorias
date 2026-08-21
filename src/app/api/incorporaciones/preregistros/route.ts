import { NextResponse } from 'next/server';
import { pool } from '@/lib/db';
import { CLAVE_INCORPORACIONES } from '@/lib/navegacion';
import { requierePagina } from '@/lib/permisos';
import type { PreincorporacionRow } from '@/lib/preincorporaciones';

export const dynamic = 'force-dynamic';

/**
 * Lo que ha llegado por el QR público de preinscripción.
 *
 * Se listan todas, vigentes y descartadas: la pantalla decide qué mostrar. Son pocas y
 * el filtro instantáneo vale más que ahorrarse unas filas.
 */
export async function GET() {
    const guardia = await requierePagina(CLAVE_INCORPORACIONES);
    if (!guardia.ok) {
        return NextResponse.json({ success: false, message: guardia.message }, { status: guardia.status });
    }

    try {
        const [data] = (await pool.query(
            `SELECT P.IdIncorporacionPre, P.Jugador, P.AnioNacimiento,
                    CASE WHEN P.AnioNacimiento IS NULL THEN NULL
                         ELSE YEAR(CURDATE()) - P.AnioNacimiento END AS Edad,
                    P.Telefono, P.Equipo, P.Comentarios,
                    P.IdIncorporacion, P.Status,
                    DATE_FORMAT(P.FechaAlta, '%Y-%m-%d %H:%i') AS FechaAlta
             FROM tblIncorporacionesPre P
             ORDER BY P.FechaAlta DESC, P.IdIncorporacionPre DESC`,
        )) as [PreincorporacionRow[], unknown];

        return NextResponse.json({ success: true, data }, { headers: { 'Cache-Control': 'no-store' } });
    } catch (error) {
        if ((error as { code?: string })?.code === 'ER_NO_SUCH_TABLE') {
            return NextResponse.json(
                { success: false, message: 'Falta aplicar migrations/014-preincorporaciones.sql en la base de datos.' },
                { status: 503 },
            );
        }
        console.error('Error al obtener las preinscripciones:', error);
        return NextResponse.json({ success: false, message: 'Error al obtener las preinscripciones' }, { status: 500 });
    }
}
