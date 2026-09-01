import { NextResponse } from 'next/server';
import { pool } from '@/lib/db';
import { CLAVE_LEALTAD } from '@/lib/navegacion';
import { requierePagina } from '@/lib/permisos';
import { SIN_CLINICS } from '@/lib/adeudos-db';
import { ES_VENTA_PUBLICO, inscritoEnTemporada } from '@/lib/jugador-filtros';
import { MENSUALIDADES_EN_TEMPORADA_SQL } from '@/lib/temporada';
import { CICLOS_INSCRIPCION_SQL } from '@/lib/lealtad';

export const dynamic = 'force-dynamic';

/**
 * Lealtad: cuántos años lleva cada alumno en la escuela, contados por sus inscripciones.
 *
 * La regla —de dónde sale un ciclo y por qué del nombre del producto y no de
 * tblPagos.IdTemporada— vive en @/lib/lealtad. Aquí solo se pega a la ficha del jugador.
 *
 * Se traen TODOS los jugadores, con y sin historial, y también las bajas:
 *
 *   - Los que no tienen ninguna inscripción registrada (Ciclos = 0) son un dato del
 *     reporte, no un estorbo: hoy son casi ochocientos activos, y saber que la escuela
 *     no tiene constancia de su reinscripción es justo lo que este reporte debe delatar.
 *     La pantalla arranca escondiéndolos, pero los cuenta a la vista.
 *   - Las bajas son la otra mitad de la pregunta: la permanencia solo se entiende junto
 *     a cuánto duraban los que se fueron. El corte por estatus se hace en el navegador,
 *     igual que en el reporte de Becas.
 *
 * Los renglones de venta al público no son niños y se van desde el SQL.
 *
 * Además del historial completo, cada renglón trae su presente: `Inscrito` dice si el
 * alumno ya pagó su inscripción de la TEMPORADA ACTIVA, con la MISMA regla que la
 * pantalla de Inscripciones (`inscritoEnTemporada`). La pantalla no tiene selector de
 * temporada —el reporte es la historia completa— así que la temporada la resuelve el
 * servidor y la devuelve junto a los datos, para que la columna diga de cuál habla.
 */
export async function GET() {
    const guardia = await requierePagina(CLAVE_LEALTAD);
    if (!guardia.ok) {
        return NextResponse.json({ success: false, message: guardia.message }, { status: guardia.status });
    }

    try {
        /* La activa, o la más reciente si ninguna está marcada: el mismo criterio del
           catálogo de temporadas (/api/inscripciones/temporadas). */
        const [temporadas] = (await pool.query(
            `SELECT IdTemporada, Temporada FROM tblTemporadas
             ORDER BY EsActiva DESC, IdTemporada DESC LIMIT 1`,
        )) as [Array<{ IdTemporada: number; Temporada: string }>, unknown];
        const temporada = temporadas[0] ?? null;
        const idTemporada = temporada?.IdTemporada ?? 0;

        const [rows] = (await pool.query(
            `SELECT
                J.IdJugador,
                J.Jugador,
                J.Categoria,
                J.Status,
                J.IdSede,
                COALESCE(SD.Sede, J.Sede) AS SedeNombre,
                DATE_FORMAT(J.FechaNacimiento, '%d/%m/%Y') AS FechaNacimiento,
                TIMESTAMPDIFF(YEAR, J.FechaNacimiento, CURDATE()) AS Edad,
                DATE_FORMAT(J.FechaAlta, '%d/%m/%Y') AS FechaAlta,
                J.TelPadre,
                J.TelMadre,
                /* La foto no viaja en el JSON: solo si la hay y cuándo cambió. La imagen
                   la pide el navegador a /api/jugadores/foto, que sí se cachea. */
                CASE WHEN J.Foto IS NOT NULL AND J.Foto <> '' THEN 1 ELSE 0 END AS TieneFoto,
                DATE_FORMAT(J.FechaAct, '%Y%m%d%H%i%s') AS FotoVersion,
                /* Inscrito HOY, con la regla de la pantalla de Inscripciones: pagó la
                   inscripción de la temporada activa o, si es portero, arrancó en ella. */
                CASE WHEN ${inscritoEnTemporada('SD')} THEN 1 ELSE 0 END AS Inscrito,
                /* Clinics y clinics futsal no manejan inscripción: su columna dice N/A
                   en vez de un NO que parecería deuda. */
                CASE WHEN ${SIN_CLINICS} THEN 0 ELSE 1 END AS Exento,
                /* Ciclos es lo que de verdad pagó; Desde y Hasta son las puntas. Los
                   tres juntos delatan al que se fue y volvió: con un hueco, Ciclos es
                   menor que los semestres que hay entre Desde y Hasta. */
                COALESCE(C.Ciclos, 0) AS Ciclos,
                COALESCE(C.Desde, 0)  AS Desde,
                COALESCE(C.Hasta, 0)  AS Hasta
             FROM tblJugadores J
             LEFT JOIN tblSedes SD ON SD.IdSede = J.IdSede
             LEFT JOIN (
                 SELECT DISTINCT P.IdJugador
                 FROM tblPagos P
                 INNER JOIN tblProductos PR ON P.IdProducto = PR.IdProducto
                 WHERE P.IdTemporada = ? AND PR.IdTipoProducto = 2 AND P.Status = 0
             ) INS ON INS.IdJugador = J.IdJugador
             LEFT JOIN (
                 -- Mensualidades de los meses de la temporada: para el portero, haber
                 -- pagado una ya cuenta como haber arrancado la temporada.
                 SELECT DISTINCT IdJugador FROM (${MENSUALIDADES_EN_TEMPORADA_SQL}) M
             ) MEN ON MEN.IdJugador = J.IdJugador
             LEFT JOIN (
                 SELECT X.IdJugador,
                        COUNT(DISTINCT X.Ciclo) AS Ciclos,
                        MIN(X.Ciclo) AS Desde,
                        MAX(X.Ciclo) AS Hasta
                 FROM (${CICLOS_INSCRIPCION_SQL}) X
                 GROUP BY X.IdJugador
             ) C ON C.IdJugador = J.IdJugador
             WHERE J.Status IN (0, 2)
               AND NOT ${ES_VENTA_PUBLICO}
             ORDER BY Ciclos DESC, SedeNombre ASC, J.Jugador ASC`,
            // Un parámetro por subconsulta, en el orden en que aparecen: INS y MEN.
            [idTemporada, idTemporada],
        )) as [Array<Record<string, unknown>>, unknown];

        return NextResponse.json({
            success: true,
            data: rows,
            temporada: temporada
                ? { id: temporada.IdTemporada, nombre: temporada.Temporada }
                : null,
        });
    } catch (error) {
        console.error('Error fetching reporte de lealtad:', error);
        return NextResponse.json(
            { success: false, message: 'Error al obtener el reporte de lealtad' },
            { status: 500 },
        );
    }
}
