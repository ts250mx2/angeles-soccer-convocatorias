import { NextResponse } from 'next/server';
import { pool } from '@/lib/db';

/**
 * Deja al niño en UN solo equipo del torneo y lo saca de los demás.
 *
 * Recibe el equipo que se queda —categoría y color— y quita al jugador de todas las
 * demás convocatorias de esa misma copa o liga en la temporada. Es la salida del aviso
 * de duplicados: la decisión de en cuál se queda es de quien convoca, aquí solo se
 * ejecuta.
 *
 * Se sale igual que con el botón Quitar de la pantalla (EsConvocado = 0, EsEliminado = 1)
 * y por la misma razón: el renglón NO se borra. Marcarlo como eliminado deja ver que a
 * ese niño se le sacó a propósito, y evita que el sincronizado de pagados —que corre en
 * cada visita— lo vuelva a meter solo por el pago que ya tiene de este torneo.
 *
 * El precio del renglón que se queda no se toca: es el que estaba cobrado y el que la
 * pantalla compara contra lo pagado.
 */
export async function POST(request: Request) {
    const connection = await pool.getConnection();
    try {
        const { seasonId, leagueId, playerId, categoria, color } = await request.json();

        // El color es OPCIONAL: hay convocatorias sin color. Ver /api/convocatorias/remove.
        if (!seasonId || !leagueId || !playerId || !categoria) {
            return NextResponse.json({ success: false, message: 'Faltan parámetros requeridos' }, { status: 400 });
        }
        const colorParam = color ?? '';

        await connection.beginTransaction();
        const [equipos] = (await connection.query(
            `SELECT D.Categoria, D.Color
               FROM tblDetalleConvocatorias D
               INNER JOIN tblConvocatorias C
                 ON C.IdTemporada = D.IdTemporada AND C.IdLiga = D.IdLiga
                AND C.Categoria = D.Categoria
                AND COALESCE(C.Color, '') = COALESCE(D.Color, '')
                AND C.Status = 0
              WHERE D.IdJugador = ? AND D.IdTemporada = ? AND D.IdLiga = ?
                AND D.EsConvocado = 1
              FOR UPDATE`,
            [playerId, seasonId, leagueId],
        )) as unknown as [Array<{ Categoria: string; Color: string | null }>, unknown];

        const elegidoExiste = equipos.some(
            (e) => e.Categoria === categoria && String(e.Color ?? '') === String(colorParam),
        );
        if (equipos.length < 2 || !elegidoExiste) {
            await connection.rollback();
            return NextResponse.json(
                { success: false, message: 'El duplicado ya cambio; vuelve a abrir el aviso' },
                { status: 409 },
            );
        }

        const [res] = await connection.query(
            `UPDATE tblDetalleConvocatorias SET EsConvocado = 0, EsEliminado = 1
             WHERE IdJugador = ? AND IdTemporada = ? AND IdLiga = ? AND EsConvocado = 1
               AND NOT (Categoria = ? AND COALESCE(Color, '') = ?)`,
            [playerId, seasonId, leagueId, categoria, colorParam],
        );

        const quitados = (res as { affectedRows?: number }).affectedRows ?? 0;
        await connection.commit();
        return NextResponse.json({ success: true, quitados });
    } catch (error) {
        await connection.rollback();
        console.error('Error resolviendo duplicado:', error);
        return NextResponse.json(
            { success: false, message: 'Error al dejar al jugador en un solo equipo' },
            { status: 500 },
        );
    } finally {
        connection.release();
    }
}
