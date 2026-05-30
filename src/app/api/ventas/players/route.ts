import { NextResponse } from 'next/server';
import { pool } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const queryTerm = searchParams.get('q') || '';

        let query = 'SELECT IdJugador, Jugador, Categoria, IdSede FROM tblJugadores WHERE Status = 0';
        const params: any[] = [];

        if (queryTerm.trim()) {
            query += ' AND Jugador LIKE ?';
            params.push(`%${queryTerm.trim()}%`);
        }

        query += ' ORDER BY Jugador ASC LIMIT 50';

        const [rows] = await pool.query(query, params);
        return NextResponse.json({ success: true, data: rows });
    } catch (error) {
        console.error('Error searching players for sales:', error);
        return NextResponse.json({ success: false, message: 'Error al buscar jugadores' }, { status: 500 });
    }
}
