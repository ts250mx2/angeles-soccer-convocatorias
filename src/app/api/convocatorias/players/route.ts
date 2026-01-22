import { NextResponse } from 'next/server';
import { pool } from '@/lib/db';

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const seasonId = searchParams.get('seasonId');
        const leagueId = searchParams.get('leagueId');
        const categoria = searchParams.get('categoria');

        if (!seasonId || !leagueId || !categoria) {
            return NextResponse.json(
                { success: false, message: 'Faltan parámetros requeridos' },
                { status: 400 }
            );
        }

        const selectQuery = `
            SELECT A.IdJugador, B.Jugador, B.Categoria, A.Precio, A.EsConvocado, A.EsEliminado,
                   CASE WHEN A.Categoria <> B.Categoria THEN 1 ELSE 0 END AS EsInvitado
            FROM tblDetalleConvocatorias A 
            INNER JOIN tblJugadores B ON A.IdJugador = B.IdJugador 
            WHERE A.IdTemporada = ? AND A.IdLiga = ? AND A.Categoria = ?
            ORDER BY B.Jugador ASC
        `;

        const [rows] = await pool.query(selectQuery, [seasonId, leagueId, categoria]);

        // Get total sum and count
        const [totalRows] = await pool.query(
            `SELECT SUM(Precio) as total FROM tblDetalleConvocatorias 
             WHERE EsConvocado = 1 AND IdTemporada = ? AND IdLiga = ? AND Categoria = ?`,
            [seasonId, leagueId, categoria]
        );

        const total = Array.isArray(totalRows) && totalRows.length > 0 ? (totalRows[0] as any).total || 0 : 0;

        const [countRows] = await pool.query(
            `SELECT COUNT(*) as count FROM tblDetalleConvocatorias 
             WHERE EsConvocado = 1 AND IdTemporada = ? AND IdLiga = ? AND Categoria = ?`,
            [seasonId, leagueId, categoria]
        );

        const count = Array.isArray(countRows) && countRows.length > 0 ? (countRows[0] as any).count || 0 : 0;

        return NextResponse.json({ success: true, data: rows, total, count });
    } catch (error) {
        console.error('Error fetching players:', error);
        return NextResponse.json(
            { success: false, message: 'Error al obtener jugadores' },
            { status: 500 }
        );
    }
}
