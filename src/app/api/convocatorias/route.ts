import { NextResponse } from 'next/server';
import { pool } from '@/lib/db';

export async function POST(request: Request) {
    try {
        const { seasonId, leagueId, teamId } = await request.json();

        if (!seasonId || !leagueId || !teamId) {
            return NextResponse.json(
                { success: false, message: 'Faltan parámetros requeridos (seasonId, leagueId, teamId)' },
                { status: 400 }
            );
        }

        // 1. Insert Logic
        // Using INSERT IGNORE to avoid duplicate key errors if run multiple times for the same player/season/league
        // Note: The user requested 'WHERE Categoria = @team'. 'teamId' from frontend matches 'Categoria' or 'IdEquipo'? 
        // Based on page.tsx 'value={team.IdEquipo}', I assume teamId is the ID. 
        // However, user SQL said 'WHERE Categoria = @team'. 
        // If 'Categoria' col in tblJugadores is an ID, this is fine. If it's a string, we might have a mismatch.
        // I will assume teamId passes the correct value for the 'Categoria' column.

        const insertQuery = `INSERT INTO tblConvocatorias(IdJugador, IdTemporada, IdLiga, Precio, EsConvocado, EsEliminado, IdEquipo) 
                     SELECT DISTINCT IdJugador, ${seasonId}, ${leagueId}, 0, 0, 0, ${teamId} 
                     FROM tblEquiposJugadores 
                     WHERE IdEquipo = ${teamId}
                     AND IdJugador NOT IN (SELECT IdJugador FROM tblConvocatorias WHERE IdTemporada = ${seasonId} AND IdLiga = ${leagueId})
                     `;

        console.log(insertQuery);

        await pool.query(insertQuery);
        console.log('Convocatorias generadas exitosamente');
        /*await pool.query(
            insertQuery
        );*/

        const selectQuery = `SELECT A.IdJugador, B.Jugador, B.Categoria, A.Precio, A.EsConvocado, A.EsEliminado 
             FROM tblConvocatorias A 
             INNER JOIN tblJugadores B ON A.IdJugador = B.IdJugador 
             WHERE A.IdTemporada = ${seasonId} AND A.IdLiga = ${leagueId} AND A.IdEquipo = ${teamId}
             ORDER BY B.Jugador ASC`;
        console.log(selectQuery);

        const [rows] = await pool.query(
            selectQuery
        );
        // 2. Select Logic
        // Joining tblConvocatorias (A) with tblJugadores (B)
        // const [rows] = await pool.query(
        //     `SELECT A.IdJugador, B.Jugador, B.Categoria, A.Precio, A.EsConvocado, A.EsEliminado 
        //      FROM tblConvocatorias A 
        //      INNER JOIN tblJugadores B ON A.IdJugador = B.IdJugador 
        //      WHERE A.IdTemporada = ? AND A.IdLiga = ?`,
        //     [seasonId, leagueId]
        // );

        // 3. Get total sum
        const [totalRows] = await pool.query(
            `SELECT SUM(Precio) as total FROM tblConvocatorias WHERE EsConvocado = 1 AND IdTemporada = ? AND IdLiga = ?`,
            [seasonId, leagueId]
        );

        const total = Array.isArray(totalRows) && totalRows.length > 0 ? (totalRows[0] as any).total || 0 : 0;

        // 4. Get count of convened players
        const [countRows] = await pool.query(
            `SELECT COUNT(*) as count FROM tblConvocatorias WHERE EsConvocado = 1 AND IdTemporada = ? AND IdLiga = ?`,
            [seasonId, leagueId]
        );

        const count = Array.isArray(countRows) && countRows.length > 0 ? (countRows[0] as any).count || 0 : 0;

        return NextResponse.json({ success: true, data: rows, total, count });
    } catch (error) {
        console.error('Error generating convocatorias:', error);
        return NextResponse.json(
            { success: false, message: 'Error procesando la solicitud' },
            { status: 500 }
        );
    }
}
