import { NextResponse } from 'next/server';
import { pool } from '@/lib/db';
import { CLAVE_PLANTILLAS } from '@/lib/navegacion';
import { requierePagina } from '@/lib/permisos';
import { inscritoEnTemporada } from '@/lib/jugador-filtros';
import { JUGADORES_DE_TEMPORADA_SQL, MENSUALIDADES_EN_TEMPORADA_SQL } from '@/lib/temporada';

export const dynamic = 'force-dynamic';

/**
 * Los equipos que se pueden acomodar, para los dos selectores de la pantalla.
 *
 * El nombre del equipo trae el año y la letra pegados ('2018X', '2012FC', '2009-2010F'),
 * igual que la categoría del jugador; la pantalla los parte con `partirCategoria` para
 * ofrecer primero el año y después la letra. Se manda de una vez —son cien y pico
 * equipos y solo el nombre— y el segundo selector se arma en el navegador: partirlo en
 * dos viajes haría esperar entre elegir el año y ver las letras.
 *
 * Se listan los mismos que ofrece la ficha del jugador: vigentes y que no sean de
 * competencia, porque los de competencia se arman aparte y no son el grupo con el que
 * el entrenador trabaja.
 *
 * Y solo los que tienen gente INSCRITA en la temporada que se pide. La lista completa
 * son cuatrocientos y pico equipos arrastrados de años anteriores, y la mayoría llega
 * vacía a la temporada de hoy: elegir uno de esos solo lleva a una hoja sin nadie que
 * acomodar. Por eso la temporada es obligatoria —sin ella no se puede saber cuáles
 * siguen vivos— y por eso el conteo que se manda es el de INSCRITOS y no el de la
 * plantilla entera: es el mismo número que después enseña la pestaña de Inscritos, y
 * si aquí dijera otra cosa habría que explicar cuál de los dos es el bueno.
 */

interface FilaEquipo {
    IdEquipo: number;
    Equipo: string;
    Sede: string | null;
    Coach: string | null;
    Genero: number | null;
    Jugadores: number;
}

export async function GET(request: Request) {
    const guardia = await requierePagina(CLAVE_PLANTILLAS);
    if (!guardia.ok) {
        return NextResponse.json({ success: false, message: guardia.message }, { status: guardia.status });
    }

    const temporadaId = Number(new URL(request.url).searchParams.get('temporadaId'));
    if (!Number.isInteger(temporadaId) || temporadaId <= 0) {
        return NextResponse.json({ success: false, message: 'Selecciona una temporada.' }, { status: 400 });
    }

    try {
        /* Los jugadores se cuentan por tblJugadores.IdEquipo, que es el equipo de HOY,
           y no por tblEquiposJugadores, que es el histórico de por dónde ha pasado cada
           quien: por ahí un equipo se vería lleno de gente que ya se movió.

           Inscrito se decide con `inscritoEnTemporada`, la MISMA regla de Inscripciones,
           de la Lista de Jugadores y de la propia plantilla: pagó su inscripción o, si es
           portero, arrancó la temporada con una mensualidad. Es lo que hace que el número
           entre paréntesis del selector y el de la pestaña de Inscritos coincidan.

           El JOIN a los inscritos es INNER a propósito: es lo que deja fuera al equipo
           que no tiene a nadie en esta temporada. */
        const [equipos] = (await pool.query(
            `SELECT E.IdEquipo,
                    E.Equipo,
                    S.Sede,
                    U.Usuario AS Coach,
                    E.Genero,
                    P.n AS Jugadores
               FROM tblEquipos E
               LEFT JOIN tblSedes S ON S.IdSede = E.IdSede
               LEFT JOIN tblUsuarios U ON U.IdUsuario = E.IdEntrenador
               INNER JOIN (
                   SELECT J.IdEquipo, COUNT(*) AS n
                     FROM tblJugadores J
                     LEFT JOIN tblSedes SD ON SD.IdSede = J.IdSede
                     LEFT JOIN (
                         SELECT DISTINCT IdJugador FROM (${JUGADORES_DE_TEMPORADA_SQL}) I
                     ) INS ON INS.IdJugador = J.IdJugador
                     LEFT JOIN (
                         SELECT DISTINCT IdJugador FROM (${MENSUALIDADES_EN_TEMPORADA_SQL}) M
                     ) MEN ON MEN.IdJugador = J.IdJugador
                    WHERE J.Status = 0 AND J.IdEquipo IS NOT NULL
                      AND ${inscritoEnTemporada('SD')}
                    GROUP BY J.IdEquipo
               ) P ON P.IdEquipo = E.IdEquipo
              WHERE E.Status = 0
                AND COALESCE(E.EsCompetencia, 0) = 0
                AND COALESCE(TRIM(E.Equipo), '') <> ''
              ORDER BY E.Equipo ASC, S.Sede ASC`,
            // Un parametro por subconsulta, en el orden en que aparecen: INS, MEN.
            [temporadaId, temporadaId],
        )) as [FilaEquipo[], unknown];

        return NextResponse.json({ success: true, data: equipos });
    } catch (error) {
        console.error('Error al obtener los equipos de la plantilla:', error);
        return NextResponse.json(
            { success: false, message: 'Error al obtener los equipos' },
            { status: 500 },
        );
    }
}
