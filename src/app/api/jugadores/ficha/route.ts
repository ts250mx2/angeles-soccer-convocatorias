import { NextResponse } from 'next/server';
import { z } from 'zod';
import { pool } from '@/lib/db';
import { CLAVE_LISTA_JUGADORES } from '@/lib/navegacion';
import { requierePagina } from '@/lib/permisos';
import { jugadorSchema } from '@/lib/jugador-form';
import { crearJugador } from '@/lib/jugador-guardar';

export const dynamic = 'force-dynamic';

/**
 * Alta de un jugador desde la Lista de Jugadores.
 *
 * Va en /ficha y no en la raíz de /api/jugadores porque ahí vive el GET del listado
 * completo —cuatro mil filas con su inscripción y su adeudo— y colgar de esa misma ruta
 * un POST que no tiene nada que ver haría creer que uno es la escritura del otro.
 *
 * Quien tiene el módulo puede dar de alta: es el mismo criterio del escritorio, donde
 * el botón Guardar se habilita con el permiso de la pantalla.
 */
export async function POST(request: Request) {
    const guardia = await requierePagina(CLAVE_LISTA_JUGADORES);
    if (!guardia.ok) {
        return NextResponse.json({ success: false, message: guardia.message }, { status: guardia.status });
    }

    try {
        const datos = jugadorSchema.parse(await request.json());

        /* Un mismo nombre en la misma sede casi siempre es alguien a quien ya se dio de
           alta y se está capturando otra vez. No se bloquea —hay hermanos tocayos y
           homónimos de verdad— pero el aviso viaja de regreso para que quien captura lo
           confirme antes de duplicar la ficha. */
        const [repetidos] = (await pool.query(
            `SELECT IdJugador, Categoria, Status
               FROM tblJugadores
              WHERE UPPER(TRIM(Jugador)) = UPPER(?) AND IdSede = ?
              LIMIT 3`,
            [datos.jugador, datos.idSede],
        )) as [Array<{ IdJugador: number; Categoria: string; Status: number }>, unknown];

        const temporadaActiva = await idTemporadaActiva();
        const idJugador = await crearJugador(pool, datos, guardia.user.IdUsuario, temporadaActiva);

        return NextResponse.json({
            success: true,
            idJugador,
            homonimos: repetidos.map((r) => ({
                idJugador: r.IdJugador,
                categoria: r.Categoria,
                baja: Number(r.Status) === 2,
            })),
        });
    } catch (error) {
        if (error instanceof z.ZodError) {
            return NextResponse.json({ success: false, message: error.issues[0].message }, { status: 400 });
        }
        console.error('Error al dar de alta al jugador:', error);
        return NextResponse.json(
            { success: false, message: 'Error al dar de alta al jugador' },
            { status: 500 },
        );
    }
}

/** La temporada vigente, que se sella en la ficha igual que en el escritorio. */
async function idTemporadaActiva(): Promise<number | null> {
    const [filas] = (await pool.query(
        'SELECT IdTemporada FROM tblTemporadas WHERE EsActiva = 1 LIMIT 1',
    )) as [Array<{ IdTemporada: number }>, unknown];
    return filas.length > 0 ? Number(filas[0].IdTemporada) : null;
}
