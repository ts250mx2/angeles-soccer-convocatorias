import { NextResponse } from 'next/server';
import { pool } from '@/lib/db';
import {
    aplicaBeca,
    becasPorBotonDisponibles,
    quitaBeca,
    tieneBecaAplicada,
} from '@/lib/convocatorias-becas';
import { precioDelSistema, tienePrecioManual } from '@/lib/convocatorias-precios';

/**
 * Aplica o quita la beca del jugador en UNA convocatoria.
 *
 * La beca de la ficha (BecaCopas / BecaLigas) dejó de rebajar el precio sola: es una
 * condición general del club y en cada torneo se decide si se respeta. Este es el botón
 * que toma esa decisión, y hace las dos cosas que tiene que hacer juntas:
 *
 *   1. Deja la marca (o la quita), que es lo que consultan el sincronizado y el precio
 *      al convocar para no volver a pelearse con la decisión en la siguiente visita.
 *   2. Vuelve a calcular el precio del renglón, para que el cambio se vea en el acto y
 *      no hasta la próxima carga.
 *
 * Dos casos en los que el importe NO se toca, y se avisa de regreso para que la pantalla
 * lo diga:
 *
 *   - Precio fijado a mano: un precio especial es una decisión más específica que la
 *     beca, así que la marca cambia y el importe se queda.
 *   - Jugador todavía no convocado: su precio va en 0 por convención y se le pone al
 *     convocarlo, ya con esta decisión tomada.
 */
export async function POST(request: Request) {
    try {
        const { seasonId, leagueId, playerId, categoria, color, aplicar } = await request.json();

        // El color es OPCIONAL: hay convocatorias sin color. Ver /api/convocatorias/remove.
        if (!seasonId || !leagueId || !playerId || !categoria || typeof aplicar !== 'boolean') {
            return NextResponse.json({ success: false, message: 'Faltan parámetros requeridos' }, { status: 400 });
        }

        if (!(await becasPorBotonDisponibles(pool))) {
            return NextResponse.json(
                {
                    success: false,
                    message:
                        'Falta aplicar la migración 027: mientras tanto la beca se sigue aplicando sola y no se puede quitar.',
                },
                { status: 503 },
            );
        }

        const clave = {
            idJugador: Number(playerId),
            seasonId: Number(seasonId),
            leagueId: Number(leagueId),
            categoria: String(categoria),
            color: color ?? '',
        };

        if (await tieneBecaAplicada(pool, clave) === aplicar) {
            // Ya estaba así: no es un error, y la pantalla se refresca igual.
            return NextResponse.json({ success: true, aplicada: aplicar, precio: null, manual: false });
        }

        await (aplicar ? aplicaBeca(pool, clave) : quitaBeca(pool, clave));

        const manual = await tienePrecioManual(pool, clave);
        if (manual) {
            return NextResponse.json({ success: true, aplicada: aplicar, precio: null, manual: true });
        }

        /* El precio del sistema ya sale con la decisión recién tomada. Solo se escribe a
           quien está convocado: el resto va en 0 hasta que se le convoque. */
        const precio = await precioDelSistema(pool, clave);
        if (precio !== null) {
            await pool.query(
                `UPDATE tblDetalleConvocatorias SET Precio = ?
                 WHERE IdJugador = ? AND IdTemporada = ? AND IdLiga = ? AND Categoria = ?
                   AND COALESCE(Color, '') = ? AND EsConvocado = 1`,
                [precio, clave.idJugador, clave.seasonId, clave.leagueId, clave.categoria, clave.color],
            );
        }

        return NextResponse.json({ success: true, aplicada: aplicar, precio, manual: false });
    } catch (error) {
        console.error('Error aplicando beca:', error);
        return NextResponse.json(
            { success: false, message: 'Error al cambiar la beca de la convocatoria' },
            { status: 500 },
        );
    }
}
