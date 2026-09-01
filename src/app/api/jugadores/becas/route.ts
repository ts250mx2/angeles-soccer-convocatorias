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
 * Se traen los TRES tipos de beca porque son cosas distintas y un becado puede tener
 * una, dos o las tres:
 *   - Beca: descuento del jugador en inscripción y mensualidades. Solo la del 100%
 *     tiene efecto en Adeudos (ES_BECA_TOTAL), que exime de adeudo.
 *   - BecaCopas: descuento sobre el precio de las convocatorias de COPAS.
 *   - BecaLigas: descuento sobre el precio de las convocatorias de LIGAS.
 *
 * Las dos de torneo eran una sola hasta migrations/022-beca-copas.sql, que las partió
 * porque una copa y una liga se cobran distinto y el club las beca por separado. Cuál se
 * aplica lo decide el tipo del torneo, no el jugador; la regla vive en @/lib/beca-torneo
 * y este reporte no la necesita: aquí se muestran las tres tal como están en la ficha.
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
                /* La foto NO viaja en el JSON: son data URIs de hasta 120 KB y una
                   lista de miles de filas los arrastraría todos. Solo va si la hay y
                   cuándo cambió; la imagen la pide el navegador a /api/jugadores/foto,
                   que sí se cachea. */
                CASE WHEN J.Foto IS NOT NULL AND J.Foto <> '' THEN 1 ELSE 0 END AS TieneFoto,
                DATE_FORMAT(J.FechaAct, '%Y%m%d%H%i%s') AS FotoVersion,
                J.Categoria,
                J.Status,
                J.IdSede,
                COALESCE(SD.Sede, J.Sede) AS SedeNombre,
                /* Los porcentajes viajan como número: la columna es DOUBLE y quien la
                   lee (becaPct) tolera texto, nulos y valores fuera de rango. */
                COALESCE(J.Beca, 0) AS Beca,
                COALESCE(J.BecaCopas, 0) AS BecaCopas,
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
               AND (COALESCE(J.Beca, 0) > 0
                    OR COALESCE(J.BecaCopas, 0) > 0
                    OR COALESCE(J.BecaLigas, 0) > 0)
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
