import { NextResponse } from 'next/server';
import { pool } from '@/lib/db';

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const sedeIdParam = searchParams.get('sedeId');
        const categoriaParam = searchParams.get('categoria');

        if (!sedeIdParam || !categoriaParam) {
            return NextResponse.json({ success: false, message: 'La sede y categoría son requeridas' }, { status: 400 });
        }

        const sedeId = parseInt(sedeIdParam);
        const categoria = categoriaParam;

        const query = `
            SELECT 
                J.IdJugador, 
                J.Jugador, 
                J.Categoria, 
                J.Status,
                J.Beca,
                J.IdSede,
                COALESCE(S.Sede, J.Sede) as SedeNombre
            FROM tblJugadores J
            LEFT JOIN tblSedes S ON J.IdSede = S.IdSede
            WHERE J.IdSede = ? AND J.Categoria = ?
            ORDER BY J.Jugador ASC
        `;

        const [rows] = await pool.query(query, [sedeId, categoria]);

        return NextResponse.json({ 
            success: true, 
            data: rows
        });
    } catch (error) {
        console.error('Error fetching players for inscripciones:', error);
        return NextResponse.json(
            { success: false, message: 'Error al obtener jugadores' },
            { status: 500 }
        );
    }
}
