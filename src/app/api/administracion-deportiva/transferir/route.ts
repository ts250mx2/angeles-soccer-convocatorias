import { NextResponse } from 'next/server';
import { z } from 'zod';
import { pool } from '@/lib/db';
import { CLAVE_PLANTILLAS } from '@/lib/navegacion';
import { requierePagina } from '@/lib/permisos';
import { advertenciasTransferencia, type Candidato, type DestinoTransferencia } from '@/lib/plantilla-equipo';

export const dynamic = 'force-dynamic';

/**
 * Traer a un jugador de otro equipo al que se está armando.
 *
 * Esto NO es mover una ficha de un lado a otro de la pantalla: cambia el equipo del
 * jugador en su ficha, que es el dato del que cuelgan Convocatorias, Adeudos, la Lista
 * y los listados por categoría. Por eso se escriben las MISMAS columnas que escribe la
 * ficha del jugador al elegirle equipo (ver `crearJugador` en @/lib/jugador-guardar):
 *
 *   IdEquipo    el equipo nuevo
 *   Categoria   el NOMBRE del equipo, que es como la guarda el sistema de escritorio
 *   Coach       el entrenador del equipo nuevo
 *
 * Dejar `Categoria` sin actualizar sería lo peor que se puede hacer aquí: el jugador
 * aparecería en la plantilla del equipo nuevo y en la categoría del viejo al mismo
 * tiempo, y las dos pantallas se contradirían sin que nada estuviera "mal" en la base.
 */

interface FilaDestino {
    IdEquipo: number;
    Equipo: string | null;
    AnioInicio: number | null;
    AnioFin: number | null;
    Genero: number | null;
    Coach: string | null;
}

interface FilaCandidato {
    IdJugador: number;
    Jugador: string | null;
    AnioNacimiento: number | null;
    Genero: number | null;
    EquipoActual: string | null;
    CategoriaActual: string | null;
    SedeActual: string | null;
}

/** El equipo destino, con lo que hace falta para avisar y para escribir la ficha. */
async function leeDestino(idEquipo: number): Promise<FilaDestino | null> {
    const [filas] = (await pool.query(
        `SELECT E.IdEquipo, E.Equipo, E.AnioInicio, E.AnioFin, E.Genero, U.Usuario AS Coach
           FROM tblEquipos E
           LEFT JOIN tblUsuarios U ON U.IdUsuario = E.IdEntrenador
          WHERE E.IdEquipo = ? AND E.Status = 0`,
        [idEquipo],
    )) as [FilaDestino[], unknown];
    return filas[0] ?? null;
}

const destinoDe = (d: FilaDestino): DestinoTransferencia => ({
    equipo: String(d.Equipo ?? '').trim(),
    anioInicio: d.AnioInicio,
    anioFin: d.AnioFin,
    genero: d.Genero,
});

/**
 * Busca a quién traer. Se pide texto a propósito —no se lista la plantilla entera del
 * club— porque son casi dos mil jugadores activos y quien transfiere ya sabe el nombre.
 */
export async function GET(request: Request) {
    const guardia = await requierePagina(CLAVE_PLANTILLAS);
    if (!guardia.ok) {
        return NextResponse.json({ success: false, message: guardia.message }, { status: guardia.status });
    }

    try {
        const params = new URL(request.url).searchParams;
        const idEquipo = Number(params.get('idEquipo'));
        const q = (params.get('q') ?? '').trim();

        if (!Number.isInteger(idEquipo) || idEquipo <= 0) {
            return NextResponse.json({ success: false, message: 'Selecciona un equipo.' }, { status: 400 });
        }
        if (q.length < 2) {
            return NextResponse.json({ success: true, data: [] });
        }

        const destino = await leeDestino(idEquipo);
        if (!destino) {
            return NextResponse.json({ success: false, message: 'El equipo no existe' }, { status: 404 });
        }

        const like = `%${q}%`;
        const [filas] = (await pool.query(
            `SELECT J.IdJugador, J.Jugador, J.AnioNacimiento, J.Genero,
                    E.Equipo   AS EquipoActual,
                    J.Categoria AS CategoriaActual,
                    COALESCE(S.Sede, J.Sede) AS SedeActual
               FROM tblJugadores J
               LEFT JOIN tblEquipos E ON E.IdEquipo = J.IdEquipo
               LEFT JOIN tblSedes S   ON S.IdSede   = J.IdSede
              WHERE J.Status = 0
                AND COALESCE(J.IdEquipo, 0) <> ?
                AND (J.Jugador LIKE ? OR J.IdJugador = ?)
              ORDER BY J.Jugador ASC
              LIMIT 30`,
            [idEquipo, like, Number(q) || 0],
        )) as [FilaCandidato[], unknown];

        const data = filas.map((f) => {
            const candidato: Candidato = {
                idJugador: Number(f.IdJugador),
                jugador: String(f.Jugador ?? '').trim(),
                anioNacimiento: f.AnioNacimiento === null ? null : Number(f.AnioNacimiento),
                genero: f.Genero === null ? null : Number(f.Genero),
                equipoActual: String(f.EquipoActual ?? '').trim() || null,
                categoriaActual: String(f.CategoriaActual ?? '').trim() || null,
                sedeActual: String(f.SedeActual ?? '').trim() || null,
            };
            return { ...candidato, advertencias: advertenciasTransferencia(candidato, destinoDe(destino)) };
        });

        return NextResponse.json({ success: true, data });
    } catch (error) {
        console.error('Error al buscar jugadores para transferir:', error);
        return NextResponse.json(
            { success: false, message: 'Error al buscar jugadores' },
            { status: 500 },
        );
    }
}

const transferirSchema = z.object({
    idEquipo: z.coerce.number().int().positive(),
    idJugador: z.coerce.number().int().positive(),
});

/**
 * Hace la transferencia.
 *
 * Las advertencias NO bloquean: se calculan y se devuelven, pero el movimiento se hace.
 * Subir a un niño de categoría es una decisión del club, y el sistema no está para
 * impedirla sino para que nadie la tome sin darse cuenta. La pantalla ya la puso
 * enfrente antes de llegar aquí; esto la deja también en la respuesta para que quede en
 * el mensaje de confirmación.
 *
 * Son dos escrituras y tblJugadores es MyISAM, así que no hay transacción posible. Va
 * primero la ficha —que es de donde lee todo el sistema— y al final el histórico de
 * equipos, que solo dice por dónde ha pasado el jugador: si falla lo segundo, la
 * transferencia quedó hecha y lo único incompleto es el rastro.
 */
export async function POST(request: Request) {
    const guardia = await requierePagina(CLAVE_PLANTILLAS);
    if (!guardia.ok) {
        return NextResponse.json({ success: false, message: guardia.message }, { status: guardia.status });
    }

    try {
        const { idEquipo, idJugador } = transferirSchema.parse(await request.json());

        const destino = await leeDestino(idEquipo);
        if (!destino) {
            return NextResponse.json({ success: false, message: 'El equipo no existe' }, { status: 404 });
        }

        const [jugadores] = (await pool.query(
            `SELECT J.IdJugador, J.Jugador, J.AnioNacimiento, J.Genero, J.IdEquipo,
                    E.Equipo AS EquipoActual
               FROM tblJugadores J
               LEFT JOIN tblEquipos E ON E.IdEquipo = J.IdEquipo
              WHERE J.IdJugador = ? AND J.Status = 0`,
            [idJugador],
        )) as [Array<FilaCandidato & { IdEquipo: number | null }>, unknown];

        const j = jugadores[0];
        if (!j) {
            return NextResponse.json(
                { success: false, message: 'El jugador no existe o está dado de baja.' },
                { status: 404 },
            );
        }
        if (Number(j.IdEquipo) === idEquipo) {
            return NextResponse.json(
                { success: false, message: 'Ese jugador ya está en este equipo.' },
                { status: 409 },
            );
        }

        const equipoNuevo = String(destino.Equipo ?? '').trim();
        await pool.query(
            `UPDATE tblJugadores
                SET IdEquipo = ?, Categoria = ?, Coach = ?,
                    IdUsuarioActualizacion = ?, FechaAct = NOW()
              WHERE IdJugador = ?`,
            [idEquipo, equipoNuevo, String(destino.Coach ?? '').trim() || null, guardia.user.IdUsuario, idJugador],
        );

        await pool.query(
            `REPLACE INTO tblEquiposJugadores (IdJugador, IdEquipo, IdLiga, FechaAct)
             VALUES (?, ?, 0, NOW())`,
            [idJugador, idEquipo],
        );

        /* El lugar que tuviera en la cancha de su equipo ANTERIOR se suelta: ese acomodo
           era de aquel equipo, y si el jugador regresara reaparecería en un punto que ya
           nadie eligió. En el equipo nuevo entra sin colocar, que es lo correcto. */
        await pool.query('DELETE FROM tblEquiposPlantilla WHERE IdJugador = ? AND IdEquipo <> ?', [
            idJugador,
            idEquipo,
        ]);

        return NextResponse.json({
            success: true,
            jugador: String(j.Jugador ?? '').trim(),
            equipoAnterior: String(j.EquipoActual ?? '').trim() || null,
            equipoNuevo,
            advertencias: advertenciasTransferencia(
                { anioNacimiento: j.AnioNacimiento, genero: j.Genero },
                destinoDe(destino),
            ),
        });
    } catch (error) {
        if (error instanceof z.ZodError) {
            return NextResponse.json({ success: false, message: error.issues[0].message }, { status: 400 });
        }
        console.error('Error al transferir al jugador:', error);
        return NextResponse.json(
            { success: false, message: 'Error al transferir al jugador' },
            { status: 500 },
        );
    }
}
