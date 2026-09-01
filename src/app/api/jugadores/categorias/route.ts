import { NextResponse } from 'next/server';
import { pool } from '@/lib/db';
import { CLAVE_CATEGORIAS } from '@/lib/navegacion';
import { requierePagina } from '@/lib/permisos';
import { loadSeasonAndPrevious } from '@/lib/adeudos-db';
import { jugadoresConAdeudo } from '@/lib/adeudos-jugadores';
import { ES_VENTA_PUBLICO, esKeeperOPortero } from '@/lib/jugador-filtros';
import { JUGADORES_DE_TEMPORADA_SQL, MENSUALIDADES_EN_TEMPORADA_SQL } from '@/lib/temporada';

export const dynamic = 'force-dynamic';

/**
 * Las categorías CON gente inscrita en la temporada, una por sede.
 *
 * Una categoría no vive sola: "2016A" existe en varias sedes y cada una es un grupo
 * distinto, con su entrenador y su gente. Por eso el corte es categoría + sede, que es
 * también con lo que se abre el listado de alumnos.
 *
 * Las tres reglas son las MISMAS que usan las otras pantallas, para que ningún número
 * discrepe:
 *
 *   Inscrito  Pagó la inscripción de la temporada o, si es portero, arrancó con una
 *             mensualidad del ciclo. Igual que /api/inscripciones/players.
 *   Becado    Tiene beca de mensualidades mayor que cero (tblJugadores.Beca).
 *   Adeudo    La función de Adeudos por Sede, sin copiar su regla aquí.
 *
 * El total de inscritos INCLUYE a los becados: es la plantilla del grupo, no el padrón
 * de quien paga. La pantalla lo dice en la etiqueta para que nadie los reste dos veces.
 */

interface FilaJugador {
    IdJugador: number;
    Categoria: string;
    IdSede: number;
    Sede: string;
    Becado: number;
}

export async function GET(request: Request) {
    const guardia = await requierePagina(CLAVE_CATEGORIAS);
    if (!guardia.ok) {
        return NextResponse.json({ success: false, message: guardia.message }, { status: guardia.status });
    }

    try {
        const { searchParams } = new URL(request.url);
        const temporadaId = searchParams.get('temporadaId');

        if (!temporadaId) {
            return NextResponse.json(
                { success: false, message: 'Se requiere la temporada' },
                { status: 400 },
            );
        }

        const ES_KEEPER = esKeeperOPortero('S');

        const [filas] = (await pool.query(
            `SELECT
                J.IdJugador,
                J.Categoria,
                COALESCE(J.IdSede, 0) AS IdSede,
                COALESCE(S.Sede, J.Sede, 'SIN SEDE') AS Sede,
                CASE WHEN COALESCE(J.Beca, 0) > 0 THEN 1 ELSE 0 END AS Becado
             FROM tblJugadores J
             LEFT JOIN tblSedes S ON S.IdSede = J.IdSede
             LEFT JOIN (
                 SELECT DISTINCT IdJugador FROM (${JUGADORES_DE_TEMPORADA_SQL}) X
             ) INS ON INS.IdJugador = J.IdJugador
             LEFT JOIN (
                 SELECT DISTINCT IdJugador FROM (${MENSUALIDADES_EN_TEMPORADA_SQL}) X
             ) MEN ON MEN.IdJugador = J.IdJugador
             WHERE J.Status = 0
               AND COALESCE(TRIM(J.Categoria), '') <> ''
               AND NOT ${ES_VENTA_PUBLICO}
               AND (INS.IdJugador IS NOT NULL OR (${ES_KEEPER} AND MEN.IdJugador IS NOT NULL))
             ORDER BY J.Categoria, Sede`,
            [temporadaId, temporadaId],
        )) as unknown as [FilaJugador[], unknown];

        /* El adeudo con la regla completa de Adeudos por Sede, acotada a los inscritos
           que se van a mostrar: sin acotar, la consulta recorre la plantilla entera. */
        const temporadas = await loadSeasonAndPrevious(temporadaId);
        const deudores = temporadas
            ? await jugadoresConAdeudo(temporadas.actual, filas.map((f) => Number(f.IdJugador)))
            : new Map();

        const grupos = new Map<string, {
            categoria: string; idSede: number; sede: string;
            inscritos: number; becados: number; conAdeudo: number;
        }>();

        for (const f of filas) {
            const clave = `${f.Categoria}|${f.IdSede}`;
            const g = grupos.get(clave) ?? {
                categoria: f.Categoria,
                idSede: Number(f.IdSede) || 0,
                sede: f.Sede,
                inscritos: 0,
                becados: 0,
                conAdeudo: 0,
            };
            g.inscritos += 1;
            if (Number(f.Becado) === 1) g.becados += 1;

            const deudor = deudores.get(Number(f.IdJugador));
            // Solo cuenta el adeudo de quien está inscrito, igual que la Lista de Jugadores.
            if (deudor?.inscrito && deudor.mesesDebe > 0) g.conAdeudo += 1;

            grupos.set(clave, g);
        }

        const data = [...grupos.values()].sort(
            (a, b) => a.categoria.localeCompare(b.categoria) || a.sede.localeCompare(b.sede),
        );

        return NextResponse.json({ success: true, data });
    } catch (error) {
        console.error('Error fetching categorias con inscritos:', error);
        return NextResponse.json(
            { success: false, message: 'Error al obtener las categorías' },
            { status: 500 },
        );
    }
}
