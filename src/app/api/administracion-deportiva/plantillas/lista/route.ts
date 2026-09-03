import { NextResponse } from 'next/server';
import { pool } from '@/lib/db';
import { CLAVE_PLANTILLAS } from '@/lib/navegacion';
import { MINIMO_JUGADORES_PLANTILLA } from '@/lib/plantilla-equipo';
import { requierePagina } from '@/lib/permisos';

export const dynamic = 'force-dynamic';

/**
 * Los equipos que YA tienen una plantilla armada.
 *
 * Es la portada de la pantalla: se entra a retomar una hoja que ya existe mucho más
 * seguido que a empezar una, y antes eso costaba tres desplegables sin ninguna pista de
 * cuáles estaban hechas. Armar una nueva sigue estando, pero como el otro camino.
 *
 * El corte por número de jugadores es `MINIMO_JUGADORES_PLANTILLA`, el mismo que aplica
 * el selector de "nueva plantilla": si cada uno tuviera el suyo, esta lista podría
 * ofrecer un equipo que allá no se puede elegir.
 *
 * Se cuenta por tblJugadores.IdEquipo, el equipo de HOY, y no por tblEquiposJugadores,
 * que es el histórico de por dónde ha pasado cada quien: por ahí un equipo se vería lleno
 * de gente que ya se movió.
 */

interface FilaLista {
    IdEquipo: number;
    Equipo: string;
    IdSede: number | null;
    Sede: string | null;
    Coach: string | null;
    Jugadores: number;
    Colocados: number;
    Actualizada: string | null;
}

const num = (v: unknown): number => Number(v) || 0;

export async function GET() {
    const guardia = await requierePagina(CLAVE_PLANTILLAS);
    if (!guardia.ok) {
        return NextResponse.json({ success: false, message: guardia.message }, { status: guardia.status });
    }

    try {
        /* NO lleva temporada, y es a propósito: las posiciones son del EQUIPO, no de la
           temporada (tblEquiposPlantilla no la guarda). Una plantilla armada en agosto
           sigue siendo la de ese equipo en diciembre, así que filtrarla por temporada
           escondería hojas que existen. */
        const [filas] = (await pool.query(
            `SELECT E.IdEquipo,
                    E.Equipo,
                    E.IdSede,
                    S.Sede,
                    U.Usuario AS Coach,
                    COALESCE(J.n, 0) AS Jugadores,
                    COUNT(DISTINCT JU.IdJugador) AS Colocados,
                    DATE_FORMAT(MAX(PL.FechaAct), '%d/%m/%Y') AS Actualizada
               FROM tblEquiposPlantilla PL
               INNER JOIN tblEquipos E ON E.IdEquipo = PL.IdEquipo
               /* Los colocados se cuentan contra el equipo de HOY, no contra las filas
                  guardadas: al que se fue del grupo —o se dio de baja— le queda su
                  posición en tblEquiposPlantilla, y contándola la portada diría "20 de 18
                  en la cancha". El editor tampoco lo pinta, así que el número tiene que
                  ser el mismo que se va a ver al abrir. */
               LEFT JOIN tblJugadores JU
                      ON JU.IdJugador = PL.IdJugador
                     AND JU.Status = 0
                     AND JU.IdEquipo = E.IdEquipo
               LEFT JOIN tblSedes S ON S.IdSede = E.IdSede
               LEFT JOIN tblUsuarios U ON U.IdUsuario = E.IdEntrenador
               LEFT JOIN (
                   SELECT IdEquipo, COUNT(*) AS n
                     FROM tblJugadores
                    WHERE Status = 0 AND IdEquipo IS NOT NULL
                    GROUP BY IdEquipo
               ) J ON J.IdEquipo = E.IdEquipo
              WHERE E.Status = 0
                AND COALESCE(E.EsCompetencia, 0) = 0
                AND COALESCE(TRIM(E.Equipo), '') <> ''
                AND COALESCE(J.n, 0) > ${MINIMO_JUGADORES_PLANTILLA}
              GROUP BY E.IdEquipo, E.Equipo, E.IdSede, S.Sede, U.Usuario, J.n
              ORDER BY S.Sede ASC, E.Equipo ASC`,
        )) as [FilaLista[], unknown];

        return NextResponse.json({
            success: true,
            minimoJugadores: MINIMO_JUGADORES_PLANTILLA,
            data: filas.map((f) => ({
                idEquipo: num(f.IdEquipo),
                equipo: String(f.Equipo ?? '').trim(),
                idSede: f.IdSede === null ? null : num(f.IdSede),
                sede: String(f.Sede ?? '').trim(),
                coach: String(f.Coach ?? '').trim() || null,
                jugadores: num(f.Jugadores),
                colocados: num(f.Colocados),
                actualizada: f.Actualizada,
            })),
        });
    } catch (error) {
        console.error('Error al obtener las plantillas armadas:', error);
        return NextResponse.json(
            { success: false, message: 'Error al obtener las plantillas' },
            { status: 500 },
        );
    }
}
