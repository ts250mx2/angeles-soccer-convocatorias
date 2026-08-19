import { NextResponse } from 'next/server';
import { pool } from '@/lib/db';
import { CLAVE_INCORPORACIONES } from '@/lib/navegacion';
import { requierePagina } from '@/lib/permisos';
import type { JugadorBuscado } from '@/lib/incorporaciones';

export const dynamic = 'force-dynamic';

/** Cuántos nombres se ofrecen a la vez. El buscador acota; esto no es un catálogo. */
const TOPE = 40;

/**
 * Buscador de jugadores del formato.
 *
 * Trae la categoría porque es la PROCEDENCIA: al elegir al jugador, la pantalla la
 * muestra sola y ya no se captura a mano.
 *
 * Solo jugadores activos. A diferencia de otras pantallas no se excluye a nadie por
 * tener ya una incorporación: un jugador puede cambiar de grupo más de una vez en el
 * mismo ciclo, y cada cambio es su propio formato.
 */
export async function GET(request: Request) {
    const guardia = await requierePagina(CLAVE_INCORPORACIONES);
    if (!guardia.ok) {
        return NextResponse.json({ success: false, message: guardia.message }, { status: guardia.status });
    }

    try {
        const q = (new URL(request.url).searchParams.get('q') ?? '').trim();

        const filtros = ['J.Status = 0'];
        const valores: unknown[] = [];
        if (q) {
            filtros.push('(J.Jugador LIKE ? OR J.Categoria LIKE ?)');
            valores.push(`%${q}%`, `%${q}%`);
        }

        const [rows] = (await pool.query(
            `SELECT J.IdJugador, J.Jugador, J.Categoria, J.Sede
             FROM tblJugadores J
             WHERE ${filtros.join(' AND ')}
             ORDER BY J.Jugador ASC
             LIMIT ${TOPE}`,
            valores,
        )) as [JugadorBuscado[], unknown];

        return NextResponse.json({ success: true, data: rows, tope: TOPE });
    } catch (error) {
        console.error('Error al buscar jugadores para incorporar:', error);
        return NextResponse.json({ success: false, message: 'Error al buscar jugadores' }, { status: 500 });
    }
}
