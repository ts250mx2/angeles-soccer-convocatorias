import { NextResponse } from 'next/server';
import { pool } from '@/lib/db';
import { sqlFueraDeConvocatorias } from '@/lib/convocatorias-excluidas';

/**
 * Categorías que se pueden convocar.
 *
 * Las categorías que no se convocan desde aquí (clinics, INTERASE) quedan fuera:
 * ofrecerlas en el alta solo permite crear convocatorias que nadie va a usar. Es el
 * mismo criterio con el que la creación automática por ligas y copas pagadas las
 * descarta. Ver @/lib/convocatorias-excluidas.
 */
export async function GET() {
    try {
        const query = `
            SELECT DISTINCT Categoria AS Categoria
            FROM tblJugadores J
            WHERE J.Categoria IS NOT NULL AND J.Categoria != ''
              AND NOT ${sqlFueraDeConvocatorias('J.Categoria')}
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
