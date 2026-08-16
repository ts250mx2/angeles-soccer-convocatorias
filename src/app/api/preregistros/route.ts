import { NextResponse } from 'next/server';
import { pool } from '@/lib/db';
import { CLAVE_PREREGISTROS } from '@/lib/navegacion';
import { requierePagina } from '@/lib/permisos';
import { cruzaPreregistros, type JugadorRaw, type PreregistroRaw } from '@/lib/preregistros';

export const dynamic = 'force-dynamic';

/**
 * Reporte de preregistros y su relación con la plantilla de jugadores.
 *
 * Las fechas se formatean en SQL y viajan como texto: una fecha de nacimiento es un
 * día del calendario, no un instante, y mandarla como fecha-hora la corre un día en
 * cuanto el navegador la interpreta en otro huso.
 *
 * La plantilla se trae completa (unas cuatro mil filas, solo columnas de cruce) porque
 * el emparejamiento vive en @/lib/preregistros: ver ahí por qué no se hace en SQL.
 */

const PREREGISTROS_SQL = `
    SELECT P.IdJugadorPre,
           P.JugadorPre,
           DATE_FORMAT(P.FechaNacimiento, '%Y-%m-%d')     AS FechaNacimiento,
           TIMESTAMPDIFF(YEAR, P.FechaNacimiento, CURDATE()) AS Edad,
           P.Genero, P.GeneroDesc, P.CURP, P.ContactoEmergencia,
           P.Padre, P.TelPadre, P.CorreoElectronicoPadre,
           P.Madre, P.TelMadre, P.CorreoElectronicoMadre,
           P.Calle, P.NumExterior, P.NumInterior, P.Colonia,
           P.CodigoPostal, P.Municipio, P.Estado,
           P.Escuela, P.Observaciones,
           DATE_FORMAT(P.FechaAlta, '%Y-%m-%d %H:%i')     AS FechaAlta,
           P.IdSede,
           S.Sede,
           COALESCE(P.IdJugador, 0)                       AS IdJugadorVinculado
    FROM tblJugadoresPre P
    LEFT JOIN tblSedes S ON S.IdSede = P.IdSede
    ORDER BY P.FechaAlta DESC, P.IdJugadorPre DESC
`;

const JUGADORES_SQL = `
    SELECT J.IdJugador, J.Jugador, COALESCE(J.Status, 0) AS Status, J.Sede, J.Categoria,
           DATE_FORMAT(J.FechaNacimiento, '%Y-%m-%d') AS FechaNacimiento,
           DATE_FORMAT(J.FechaAlta, '%Y-%m-%d')       AS FechaAlta,
           J.TelPadre, J.TelMadre,
           J.CorreoElectronicoPadre, J.CorreoElectronicoMadre
    FROM tblJugadores J
`;

export async function GET() {
    const guardia = await requierePagina(CLAVE_PREREGISTROS);
    if (!guardia.ok) {
        return NextResponse.json({ success: false, message: guardia.message }, { status: guardia.status });
    }

    try {
        const [[preregistros], [jugadores]] = (await Promise.all([
            pool.query(PREREGISTROS_SQL),
            pool.query(JUGADORES_SQL),
        ])) as [[PreregistroRaw[], unknown], [JugadorRaw[], unknown]];

        return NextResponse.json(
            { success: true, data: cruzaPreregistros(preregistros, jugadores) },
            { headers: { 'Cache-Control': 'no-store' } },
        );
    } catch (error) {
        console.error('Error al obtener los preregistros:', error);
        return NextResponse.json(
            { success: false, message: 'Error al obtener los preregistros' },
            { status: 500 },
        );
    }
}
