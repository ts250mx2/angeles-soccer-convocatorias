import { NextResponse } from 'next/server';
import { pool } from '@/lib/db';
import { CLAVE_LISTA_JUGADORES } from '@/lib/navegacion';
import { requierePagina } from '@/lib/permisos';

export const dynamic = 'force-dynamic';

/**
 * Los equipos a los que puede entrar un jugador: el frmSelEquipo del escritorio.
 *
 * La categoría del jugador NO se escribe a mano, se elige de aquí: es el nombre del
 * equipo (tblEquipos.Equipo) y arrastra consigo el IdEquipo y el entrenador. Capturarla
 * suelta es como se llenó la base de categorías que no existen en ningún equipo.
 *
 * El filtro es el mismo de allá, y los tres cortes tienen su razón:
 *
 *   Sede            Un equipo pertenece a una sede; el "2016A" de una no es el de otra.
 *   Año de nacimiento  Cada equipo cubre un rango (AnioInicio..AnioFin) y el jugador
 *                   solo cabe en los de su año.
 *   Género          El del jugador, o los equipos mixtos (Genero = 3).
 *
 * Y solo equipos vigentes que no sean de competencia (EsCompetencia = 0): los de
 * competencia se arman aparte, no son la categoría en la que el niño entrena.
 *
 * Se manda además cuánta gente tiene y su cupo, que es el dato con el que se decide
 * entre dos equipos que igual le quedan.
 */

interface FilaEquipo {
    IdEquipo: number;
    Equipo: string;
    Sede: string | null;
    Coach: string | null;
    Genero: number | null;
    AnioInicio: number | null;
    AnioFin: number | null;
    Cupo: number | null;
    Inscritos: number;
    Dias: string | null;
}

export async function GET(request: Request) {
    const guardia = await requierePagina(CLAVE_LISTA_JUGADORES);
    if (!guardia.ok) {
        return NextResponse.json({ success: false, message: guardia.message }, { status: guardia.status });
    }

    try {
        const { searchParams } = new URL(request.url);
        const idSede = Number(searchParams.get('idSede'));
        const anio = Number(searchParams.get('anioNacimiento'));
        const genero = Number(searchParams.get('genero'));

        if (!Number.isInteger(idSede) || idSede <= 0) {
            return NextResponse.json({ success: false, message: 'Selecciona primero la sede.' }, { status: 400 });
        }
        if (!Number.isInteger(anio) || anio < 1900 || anio > 2200) {
            return NextResponse.json(
                { success: false, message: 'Captura primero la fecha de nacimiento.' },
                { status: 400 },
            );
        }
        if (genero !== 1 && genero !== 2) {
            return NextResponse.json({ success: false, message: 'Selecciona primero el género.' }, { status: 400 });
        }

        /* Los inscritos se cuentan sobre tblJugadores y no sobre tblEquiposJugadores:
           esa tabla es el histórico de a qué equipos ha pertenecido cada quien, así que
           contando ahí un equipo se ve lleno de gente que ya se movió. IdEquipo en la
           ficha es el equipo de HOY, que es lo que se quiere comparar contra el cupo. */
        const [equipos] = (await pool.query(
            `SELECT E.IdEquipo,
                    E.Equipo,
                    S.Sede,
                    U.Usuario AS Coach,
                    E.Genero,
                    E.AnioInicio,
                    E.AnioFin,
                    E.Cupo,
                    COALESCE(P.n, 0) AS Inscritos,
                    CONCAT_WS(' · ',
                        NULLIF(E.LunesStr, ''), NULLIF(E.MartesStr, ''), NULLIF(E.MiercolesStr, ''),
                        NULLIF(E.JuevesStr, ''), NULLIF(E.ViernesStr, ''), NULLIF(E.SabadoStr, ''),
                        NULLIF(E.DomingoStr, '')) AS Dias
               FROM tblEquipos E
               LEFT JOIN tblSedes S ON S.IdSede = E.IdSede
               LEFT JOIN tblUsuarios U ON U.IdUsuario = E.IdEntrenador
               LEFT JOIN (
                   SELECT IdEquipo, COUNT(*) AS n
                   FROM tblJugadores
                   WHERE Status = 0 AND IdEquipo IS NOT NULL
                   GROUP BY IdEquipo
               ) P ON P.IdEquipo = E.IdEquipo
              WHERE E.Status = 0
                AND COALESCE(E.EsCompetencia, 0) = 0
                AND E.IdSede = ?
                AND (E.Genero = ? OR E.Genero = 3)
                AND E.AnioInicio <= ? AND E.AnioFin >= ?
              ORDER BY E.Equipo ASC`,
            [idSede, genero, anio, anio],
        )) as [FilaEquipo[], unknown];

        return NextResponse.json({ success: true, data: equipos });
    } catch (error) {
        console.error('Error al obtener los equipos del jugador:', error);
        return NextResponse.json(
            { success: false, message: 'Error al obtener los equipos' },
            { status: 500 },
        );
    }
}
