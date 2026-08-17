import { NextResponse } from 'next/server';
import { pool } from '@/lib/db';
import { sqlFueraDeConvocatorias } from '@/lib/convocatorias-excluidas';

/**
 * Catálogo de ligas para el alta de convocatorias (su único consumidor). Las ligas que
 * no se convocan desde aquí no se ofrecen: ver @/lib/convocatorias-excluidas.
 */
export async function GET() {
    try {
        const [rows] = await pool.query(
            `SELECT * FROM tblLigas
             WHERE Status = 0 AND NOT ${sqlFueraDeConvocatorias('Liga')}
             ORDER BY Liga`
        );

        return NextResponse.json({ success: true, leagues: rows });
    } catch (error) {
        console.error('Error fetching leagues:', error);
        return NextResponse.json(
            { success: false, message: 'Error fetching leagues' },
            { status: 500 }
        );
    }
}
