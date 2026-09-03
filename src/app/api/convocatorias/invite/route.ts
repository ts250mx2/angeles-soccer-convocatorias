import { NextResponse } from 'next/server';
import { pool } from '@/lib/db';
import { estadoEnTemporada, advertenciaConvocatoria } from '@/lib/convocatoria-elegibilidad';
import { precioDelSistema } from '@/lib/convocatorias-precios';

/**
 * Invita a un jugador a una convocatoria y lo deja YA CONVOCADO.
 *
 * Invitar a alguien y después tener que convocarlo era un paso de más: quien busca a un
 * jugador en el modal de invitados lo está metiendo al torneo, no dejándolo en espera.
 * Por eso la fila nace con EsConvocado = 1 y con el precio de la liga, igual que si se
 * hubiera usado el botón Convocar.
 *
 * Ni la inscripción ni el adeudo lo impiden: el estado viaja de regreso solo para
 * avisar a quien invita.
 */
export async function POST(request: Request) {
    try {
        const { seasonId, leagueId, playerId, categoria, color } = await request.json();

        if (!seasonId || !leagueId || !playerId || !categoria) {
            return NextResponse.json(
                { success: false, message: 'Faltan parámetros requeridos' },
                { status: 400 }
            );
        }

        const estados = await estadoEnTemporada(Number(seasonId), [Number(playerId)]);
        const advertencia = advertenciaConvocatoria(estados.get(Number(playerId)));

        /* El precio del sistema, por la MISMA función que usa el botón Convocar: precio
           de lista, sin beca —la beca se aplica después con su botón—. Antes esto tenía
           su propia consulta y tomaba el primer producto de la liga que apareciera, así
           que un invitado podía entrar con una tarifa distinta a la del resto.

           Si la liga no tiene producto capturado, el jugador entra convocado en cero y el
           precio se ajusta después: bloquear la invitación por un dato del catálogo
           dejaría al entrenador sin poder armar su equipo. */
        const precio = (await precioDelSistema(pool, {
            idJugador: playerId,
            seasonId,
            leagueId,
            categoria,
            color: color ?? '',
        })) ?? 0;

        await pool.query(
            `INSERT INTO tblDetalleConvocatorias
                (IdJugador, IdTemporada, IdLiga, Precio, EsConvocado, EsEliminado, Categoria, Color)
             SELECT IdJugador, ?, ?, ?, 1, 0, ?, ?
             FROM tblJugadores
             WHERE IdJugador = ?`,
            [seasonId, leagueId, precio, categoria, color, playerId]
        );

        return NextResponse.json({
            success: true,
            message: 'Jugador invitado y convocado',
            advertencia,
        });
    } catch (error) {
        console.error('Error inviting player:', error);
        return NextResponse.json(
            {
                success: false,
                message: 'Error al invitar jugador',
                error: error instanceof Error ? error.message : 'Unknown error'
            },
            { status: 500 }
        );
    }
}
