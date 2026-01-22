import { NextResponse } from 'next/server';
import { pool } from '@/lib/db';

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');

    if (!userId) {
        return NextResponse.json(
            { success: false, message: 'User ID is required' },
            { status: 400 }
        );
    }

    try {
        const [rows] = await pool.query(
            'SELECT * FROM tblEquipos WHERE IdEntrenador = ? ORDER BY Equipo',
            [userId]
        );

        return NextResponse.json({ success: true, teams: rows });
    } catch (error) {
        console.error('Error fetching teams:', error);
        return NextResponse.json(
            { success: false, message: 'Error fetching teams' },
            { status: 500 }
        );
    }
}
