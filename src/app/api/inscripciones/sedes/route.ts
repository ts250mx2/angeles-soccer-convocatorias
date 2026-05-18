import { NextResponse } from 'next/server';
import { pool } from '@/lib/db';

export async function GET() {
    try {
        const query = `
            SELECT 
                S.IdSede,
                S.Sede,
                COUNT(CASE WHEN J.Status = 0 THEN 1 END) as Inscritos
            FROM tblSedes S
            LEFT JOIN tblJugadores J ON S.IdSede = J.IdSede
            GROUP BY S.IdSede, S.Sede
            ORDER BY S.Sede
        `;

        const [rows] = await pool.query(query);

        return NextResponse.json({ 
            success: true, 
            data: rows
        });
    } catch (error) {
        console.error('Error fetching sedes for inscripciones:', error);
        return NextResponse.json(
            { success: false, message: 'Error al obtener sedes' },
            { status: 500 }
        );
    }
}
