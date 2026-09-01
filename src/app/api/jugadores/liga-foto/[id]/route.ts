import { NextResponse } from 'next/server';
import { pool } from '@/lib/db';
import { CLAVES_VEN_FOTO_JUGADOR } from '@/lib/navegacion';
import { requiereAlgunaPagina } from '@/lib/permisos';
import { crearTokenFoto, DIAS_VIGENCIA_FOTO } from '@/lib/foto-token';
import { BAJA } from '@/lib/jugador-form';

export const dynamic = 'force-dynamic';

/**
 * Genera la liga con la que los papás suben la foto del jugador (ver
 * @/lib/foto-token y /api/foto-jugador).
 *
 * Pide los mismos módulos que ver y capturar la foto (CLAVES_VEN_FOTO_JUGADOR), no
 * solo el de la Lista de Jugadores: el botón vive también en el modal de pagos y
 * datos —el que abren Plantilla y Asistencia—, y quien puede tomarle la foto al niño
 * en la cancha puede igualmente pedírsela al papá cuando el niño no está.
 *
 * Devuelve el token pelón, no la URL completa: el dominio con el que se comparte lo
 * conoce el navegador (window.location.origin), igual que hacen los QR de preregistro.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
    const guardia = await requiereAlgunaPagina(CLAVES_VEN_FOTO_JUGADOR);
    if (!guardia.ok) {
        return NextResponse.json({ success: false, message: guardia.message }, { status: guardia.status });
    }

    try {
        const idJugador = Number((await params).id);
        if (!Number.isInteger(idJugador) || idJugador <= 0) {
            return NextResponse.json({ success: false, message: 'Jugador no válido' }, { status: 400 });
        }

        const [rows] = (await pool.query(
            'SELECT Status FROM tblJugadores WHERE IdJugador = ? LIMIT 1',
            [idJugador],
        )) as [Array<{ Status: number }>, unknown];

        if (!rows.length) {
            return NextResponse.json({ success: false, message: 'Jugador no encontrado' }, { status: 404 });
        }
        if (rows[0].Status === BAJA) {
            return NextResponse.json(
                { success: false, message: 'El jugador está dado de baja; no se le puede pedir foto.' },
                { status: 409 },
            );
        }

        const liga = crearTokenFoto(idJugador);
        if (!liga) {
            return NextResponse.json(
                { success: false, message: 'Falta configurar AUTH_SECRET en el servidor.' },
                { status: 500 },
            );
        }

        return NextResponse.json({
            success: true,
            data: { token: liga.token, vence: liga.vence, dias: DIAS_VIGENCIA_FOTO },
        });
    } catch (error) {
        console.error('Error al generar la liga de foto:', error);
        return NextResponse.json({ success: false, message: 'No se pudo generar la liga' }, { status: 500 });
    }
}
