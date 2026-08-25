import { NextResponse } from 'next/server';
import { pool } from '@/lib/db';
import { CLAVE_BECAS } from '@/lib/navegacion';
import { requierePagina } from '@/lib/permisos';

export const dynamic = 'force-dynamic';

/**
 * Reporte de Becas: todos los jugadores con algún descuento registrado en su ficha.
 *
 * La beca NO depende de la temporada: es un dato del jugador (tblJugadores.Beca y
 * tblJugadores.BecaLigas, porcentajes de 0 a 100), así que esta consulta no lleva
 * temporada y el corte que sí importa es el estatus (activo o baja), que se aplica en
 * el navegador junto con el resto de los filtros. Son unos cientos de filas.
 *
 * Se traen los dos tipos de beca porque son cosas distintas y un becado puede tener
 * una, la otra o las dos:
 *   - Beca: descuento del jugador en inscripción y mensualidades. Solo la del 100%
 *     tiene efecto en Adeudos (ES_BECA_TOTAL), que exime de adeudo.
 *   - BecaLigas: descuento sobre el precio de las convocatorias de copas y ligas.
 *     Es la que aplica `precioDeLiga` en convocatorias-precios.
 */
export async function GET() {
    const guardia = await requierePagina(CLAVE_BECAS);
    if (!guardia.ok) {
        return NextResponse.json({ success: false, message: guardia.message }, { status: guardia.status });
    }

    try {
        const [rows] = (await pool.query(
            `SELECT
                J.IdJugador,
                J.Jugador,
                J.Categoria,
                J.Status,
                J.IdSede,
                COALESCE(SD.Sede, J.Sede) AS SedeNombre,
                /* Los porcentajes viajan como número: la columna es DOUBLE y quien la
                   lee (becaPct) tolera texto, nulos y valores fuera de rango. */
                COALESCE(J.Beca, 0) AS Beca,
                COALESCE(J.BecaLigas, 0) AS BecaLigas,
                DATE_FORMAT(J.FechaNacimiento, '%d/%m/%Y') AS FechaNacimiento,
                TIMESTAMPDIFF(YEAR, J.FechaNacimiento, CURDATE()) AS Edad,
                DATE_FORMAT(J.FechaAlta, '%d/%m/%Y') AS FechaAlta,
                J.TelPadre,
                J.TelMadre,
                J.CorreoElectronicoPadre,
                J.CorreoElectronicoMadre
             FROM tblJugadores J
             LEFT JOIN tblSedes SD ON SD.IdSede = J.IdSede
             WHERE J.Status IN (0, 2)
               AND (COALESCE(J.Beca, 0) > 0 OR COALESCE(J.BecaLigas, 0) > 0)
             ORDER BY SedeNombre ASC, J.Categoria ASC, J.Jugador ASC`,
        )) as [Array<Record<string, unknown>>, unknown];

        return NextResponse.json({ success: true, data: rows });
    } catch (error) {
        console.error('Error fetching reporte de becas:', error);
        return NextResponse.json(
            { success: false, message: 'Error al obtener el reporte de becas' },
            { status: 500 }
        );
    }
}
