import { NextResponse } from 'next/server';
import { pool } from '@/lib/db';
import { CLAVE_LISTA_JUGADORES } from '@/lib/navegacion';
import { requierePagina } from '@/lib/permisos';
import { ESTA_INSCRITO, SIN_CLINICS, loadSeasonAndPrevious } from '@/lib/adeudos-db';
import { jugadoresConAdeudo } from '@/lib/adeudos-jugadores';

export const dynamic = 'force-dynamic';

/**
 * Lista de Jugadores: la plantilla completa (activos y bajas), jugador por jugador,
 * con su situación en la temporada seleccionada.
 *
 * La inscripción usa la MISMA regla que Convocatorias y Adeudos (`ESTA_INSCRITO`, con
 * herencia de inscripción para porteros/keepers) y el adeudo la MISMA función que
 * Adeudos por Sede (`jugadoresConAdeudo`), para que ninguna pantalla diga del jugador
 * algo distinto que las demás. Los filtros viven en el navegador: son unas cuatro mil
 * filas y así responden sin volver al servidor.
 */

interface FilaJugador {
    IdJugador: number;
    Inscrito: number;
    Exento: number;
}

export async function GET(request: Request) {
    const guardia = await requierePagina(CLAVE_LISTA_JUGADORES);
    if (!guardia.ok) {
        return NextResponse.json({ success: false, message: guardia.message }, { status: guardia.status });
    }

    try {
        const { searchParams } = new URL(request.url);
        const temporadaId = searchParams.get('temporadaId');

        if (!temporadaId) {
            return NextResponse.json(
                { success: false, message: 'Se requiere la temporada' },
                { status: 400 }
            );
        }

        const [rows] = (await pool.query(
            `SELECT
                J.IdJugador,
                J.Jugador,
                J.Categoria,
                J.Status,
                COALESCE(NULLIF(TRIM(J.Beca), ''), '0') AS Beca,
                J.IdSede,
                COALESCE(SD.Sede, J.Sede) AS SedeNombre,
                DATE_FORMAT(J.FechaNacimiento, '%d/%m/%Y') AS FechaNacimiento,
                TIMESTAMPDIFF(YEAR, J.FechaNacimiento, CURDATE()) AS Edad,
                DATE_FORMAT(J.FechaAlta, '%d/%m/%Y') AS FechaAlta,
                J.TelPadre,
                J.TelMadre,
                J.CorreoElectronicoPadre,
                J.CorreoElectronicoMadre,
                FI.FechaInscripcion,
                CASE WHEN ${ESTA_INSCRITO} THEN 1 ELSE 0 END AS Inscrito,
                CASE WHEN ${SIN_CLINICS} THEN 0 ELSE 1 END AS Exento
             FROM tblJugadores J
             LEFT JOIN tblSedes SD ON SD.IdSede = J.IdSede
             LEFT JOIN (
                 SELECT DISTINCT P.IdJugador
                 FROM tblPagos P
                 INNER JOIN tblProductos PR ON P.IdProducto = PR.IdProducto
                 WHERE P.IdTemporada = ? AND PR.IdTipoProducto = 2 AND P.Status = 0
             ) INS ON INS.IdJugador = J.IdJugador
             LEFT JOIN (
                 -- Cualquier inscripción, de cualquier temporada (regla portero/keeper).
                 SELECT DISTINCT P.IdJugador
                 FROM tblPagos P
                 INNER JOIN tblProductos PR ON P.IdProducto = PR.IdProducto
                 WHERE PR.IdTipoProducto = 2 AND P.Status = 0
             ) KINS ON KINS.IdJugador = J.IdJugador
             LEFT JOIN (
                 SELECT P.IdJugador, DATE_FORMAT(MIN(P.FechaPago), '%d/%m/%Y') AS FechaInscripcion
                 FROM tblPagos P
                 INNER JOIN tblProductos PR ON P.IdProducto = PR.IdProducto
                 WHERE P.IdTemporada = ? AND PR.IdTipoProducto = 2 AND P.Status = 0
                 GROUP BY P.IdJugador
             ) FI ON FI.IdJugador = J.IdJugador
             WHERE J.Status IN (0, 2)
             ORDER BY SedeNombre ASC, J.Categoria ASC, J.Jugador ASC`,
            [temporadaId, temporadaId],
        )) as [Array<FilaJugador & Record<string, unknown>>, unknown];

        /* Adeudo de la temporada con la regla completa de Adeudos por Sede. A quien no
           está inscrito no se le cuentan meses: su pendiente es la inscripción, y eso
           se informa aparte con el campo Inscrito. */
        const temporadas = await loadSeasonAndPrevious(temporadaId);
        const deudores = temporadas ? await jugadoresConAdeudo(temporadas.actual) : new Map();

        const data = rows.map((fila) => {
            const deudor = deudores.get(Number(fila.IdJugador));
            return {
                ...fila,
                MesesDebe: deudor?.inscrito ? deudor.mesesDebe : 0,
            };
        });

        return NextResponse.json({ success: true, data });
    } catch (error) {
        console.error('Error fetching lista de jugadores:', error);
        return NextResponse.json(
            { success: false, message: 'Error al obtener la lista de jugadores' },
            { status: 500 }
        );
    }
}
