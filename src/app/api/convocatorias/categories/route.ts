import { NextResponse } from 'next/server';
import { pool } from '@/lib/db';

export async function GET() {
    try {
        const query = `
            SELECT DISTINCT Categoria 
            FROM tblJugadores 
            WHERE Categoria IS NOT NULL AND Categoria != ''
            ORDER BY Categoria ASC
        `;

        const [rows] = await pool.query(query);

        return NextResponse.json({
            success: true,
            data: rows
        });
    } catch (error) {
        console.error('Error fetching categories:', error);
        return NextResponse.json(
            {
                success: false,
                message: 'Error al obtener las categorías',
                error: error instanceof Error ? error.message : 'Unknown error'
            },
            { status: 500 }
        );
    }
}
