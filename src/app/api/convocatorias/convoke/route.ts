import { NextResponse } from 'next/server';
import { pool } from '@/lib/db';
import { estadoEnTemporada, advertenciaConvocatoria } from '@/lib/convocatoria-elegibilidad';
import { precioDelSistema, tienePrecioManual } from '@/lib/convocatorias-precios';

export async function POST(request: Request) {
    try {
        const { seasonId, leagueId, playerId, categoria, color } = await request.json();

        if (!seasonId || !leagueId || !playerId || !categoria) {
            return NextResponse.json({ success: false, message: 'Missing required parameters' }, { status: 400 });
        }

        /* Se convoca a cualquier jugador activo de la categoría: la decisión es del club.
           El estado de inscripción y adeudo NO impide la alta, se devuelve para que la
           pantalla lo muestre y quien convoca sepa a quién está metiendo. */
        const estados = await estadoEnTemporada(Number(seasonId), [Number(playerId)]);
        const advertencia = advertenciaConvocatoria(estados.get(Number(playerId)));

        /* Precio de la liga con la beca del jugador ya aplicada. La beca que cuenta aquí
           es BecaLigas, no la de mensualidades: son descuentos distintos. Se guarda ya
           rebajado porque es contra este número que la pantalla saca el saldo; dejarlo
           completo cobraría de más a un becado.

           Salvo que el jugador traiga precio fijado a mano: entonces solo se le marca la
           convocatoria y el importe se respeta. Convocar a alguien al que se le puso un
           precio especial no debe deshacer ese ajuste. */
        const clave = { idJugador: playerId, seasonId, leagueId, categoria, color: color ?? '' };
        const manual = await tienePrecioManual(pool, clave);

        if (manual) {
            await pool.query(
                `UPDATE tblDetalleConvocatorias SET EsConvocado = 1, EsEliminado = 0
                 WHERE IdJugador = ? AND IdTemporada = ? AND IdLiga = ? AND Categoria = ? AND Color = ?`,
                [playerId, seasonId, leagueId, categoria, color]
            );
            return NextResponse.json({ success: true, advertencia });
        }

        const price = await precioDelSistema(pool, leagueId, playerId);
        if (price === null) {
            return NextResponse.json(
                { success: false, message: 'No se encontró precio para esta liga' },
                { status: 404 }
            );
        }

        await pool.query(
            'UPDATE tblDetalleConvocatorias SET Precio = ?, EsConvocado = 1, EsEliminado = 0 WHERE IdJugador = ? AND IdTemporada = ? AND IdLiga = ? AND Categoria = ? AND Color = ?',
            [price, playerId, seasonId, leagueId, categoria, color]
        );

        return NextResponse.json({ success: true, advertencia });
    } catch (error) {
        console.error('Error updating convocatorias:', error);
        return NextResponse.json(
            { success: false, message: 'Error updating convocatorias' },
            { status: 500 }
        );
    }
}
