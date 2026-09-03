import { NextResponse } from 'next/server';
import { pool } from '@/lib/db';
import { CLAVE_ASISTENCIA } from '@/lib/navegacion';
import { requierePagina } from '@/lib/permisos';
import { DIAS_SEMANA } from '@/lib/plantilla-equipo';
import { diasDelMes } from '@/lib/asistencia';

export const dynamic = 'force-dynamic';

/**
 * Los equipos a los que YA se les pasó lista en un mes.
 *
 * Es la portada de la pantalla, el mismo trato que la Plantilla: se entra a retomar una
 * hoja empezada mucho más seguido que a abrir una en blanco, y antes eso costaba acertarle
 * a tres desplegables sin ninguna pista de en qué equipos había algo capturado. Pasar
 * lista a uno nuevo sigue estando: es el otro camino, no el único.
 *
 * ── El mes manda ──
 *
 * A diferencia de la Plantilla —cuyas hojas no son de ninguna temporada—, aquí la lista
 * ES de un mes: la misma pregunta ("¿a quién le falta?") tiene otra respuesta en agosto
 * que en septiembre. Por eso el mes es un parámetro obligatorio y no un filtro que se
 * aplique después: lo que se lista son los equipos con marcas DENTRO de ese mes, y
 * cambiar de mes cambia la lista entera.
 *
 * ── Qué se cuenta ──
 *
 * De cada equipo se dicen dos cosas, y hacen falta las dos:
 *
 *   · Cuántos días del mes tienen lista, de los que ese equipo entrena. Es lo que
 *     distingue un mes terminado de uno que alguien empezó y dejó. Los días que entrena
 *     salen de su horario con `diasDelMes`, la MISMA función que arma las columnas de la
 *     hoja, así que el "3 de 9" de la tarjeta es el mismo 9 que se ve al abrirla.
 *
 *   · El porcentaje de asistencia de lo capturado, con la MISMA regla del pie de la hoja:
 *     asistencias entre lo registrado, sin contar las celdas vacías. Meter las vacías
 *     como faltas castigaría al equipo por los días que nadie alcanzó a capturar.
 *
 * No lleva temporada. Los alumnos que se cuentan son los que tienen marca, no el padrón
 * inscrito: es lo que de verdad se capturó, y no depende de contra qué temporada se mida
 * la inscripción de cada quien.
 */

interface FilaLista {
    IdEquipo: number;
    Equipo: string | null;
    IdSede: number | null;
    Sede: string | null;
    Profesor: string | null;
    Alumnos: number;
    DiasConLista: number;
    Asistencias: number;
    Faltas: number;
    Actualizada: string | null;
    [dia: string]: unknown;
}

const num = (v: unknown): number => Number(v) || 0;

export async function GET(request: Request) {
    const guardia = await requierePagina(CLAVE_ASISTENCIA);
    if (!guardia.ok) {
        return NextResponse.json({ success: false, message: guardia.message }, { status: guardia.status });
    }

    const params = new URL(request.url).searchParams;
    const anio = Number(params.get('anio'));
    const mes = Number(params.get('mes'));
    if (!Number.isInteger(anio) || anio < 2000 || anio > 2100) {
        return NextResponse.json({ success: false, message: 'El año no es válido.' }, { status: 400 });
    }
    if (!Number.isInteger(mes) || mes < 1 || mes > 12) {
        return NextResponse.json({ success: false, message: 'El mes no es válido.' }, { status: 400 });
    }

    const primero = `${anio}-${String(mes).padStart(2, '0')}-01`;

    try {
        /* Las columnas del horario viajan para poder calcular aquí mismo cuántos días
           entrena el equipo en el mes. Es la misma información que usa la hoja al
           abrirse; traerla de una vez evita que la tarjeta y la hoja cuenten distinto. */
        const columnasDias = DIAS_SEMANA.map(([col]) => `E.${col}`).join(', ');

        /* El rango se acota con `>= primero` y `< primero + 1 mes` en vez de con YEAR() y
           MONTH(): así el índice por fecha de tblAsistenciaClases sirve para algo. Con las
           funciones alrededor de la columna, MySQL recorre la tabla entera. */
        const [filas] = (await pool.query(
            `SELECT E.IdEquipo, E.Equipo, E.IdSede, S.Sede,
                    PROF.Usuario AS Profesor,
                    ${columnasDias},
                    COUNT(DISTINCT AC.IdJugador) AS Alumnos,
                    COUNT(DISTINCT AC.Fecha)     AS DiasConLista,
                    SUM(AC.Marca = 'A')          AS Asistencias,
                    SUM(AC.Marca = 'F')          AS Faltas,
                    DATE_FORMAT(MAX(AC.FechaAct), '%d/%m/%Y') AS Actualizada
               FROM tblAsistenciaClases AC
               INNER JOIN tblEquipos E ON E.IdEquipo = AC.IdEquipo
               LEFT JOIN tblSedes S       ON S.IdSede       = E.IdSede
               LEFT JOIN tblUsuarios PROF ON PROF.IdUsuario = E.IdEntrenador
              WHERE AC.Fecha >= ?
                AND AC.Fecha < DATE_ADD(?, INTERVAL 1 MONTH)
                AND E.Status = 0
                AND COALESCE(E.EsCompetencia, 0) = 0
                AND COALESCE(TRIM(E.Equipo), '') <> ''
              GROUP BY E.IdEquipo, E.Equipo, E.IdSede, S.Sede, PROF.Usuario, ${columnasDias}
              ORDER BY S.Sede ASC, E.Equipo ASC`,
            [primero, primero],
        )) as [FilaLista[], unknown];

        return NextResponse.json({
            success: true,
            data: filas.map((f) => {
                const asistencias = num(f.Asistencias);
                const faltas = num(f.Faltas);
                const registradas = asistencias + faltas;
                return {
                    idEquipo: num(f.IdEquipo),
                    equipo: String(f.Equipo ?? '').trim(),
                    idSede: f.IdSede === null ? null : num(f.IdSede),
                    sede: String(f.Sede ?? '').trim(),
                    profesor: String(f.Profesor ?? '').trim() || null,
                    alumnos: num(f.Alumnos),
                    diasConLista: num(f.DiasConLista),
                    /* Los días que el equipo entrena ese mes, según su horario. 0 cuando
                       no tiene horario capturado: ahí la tarjeta enseña solo los días con
                       lista, porque no hay contra qué compararlos. */
                    diasDelMes: diasDelMes(f, anio, mes).length,
                    asistencias,
                    faltas,
                    /* null cuando no hay nada registrado. Un 0% ahí diría que faltaron
                       todos, y lo que pasa es que la marca existe pero sin A ni F. */
                    pctAsistencia: registradas === 0 ? null : Math.round((asistencias / registradas) * 100),
                    actualizada: f.Actualizada,
                };
            }),
        });
    } catch (error) {
        console.error('Error al obtener las listas de asistencia:', error);
        return NextResponse.json(
            { success: false, message: 'Error al obtener las listas de asistencia' },
            { status: 500 },
        );
    }
}
