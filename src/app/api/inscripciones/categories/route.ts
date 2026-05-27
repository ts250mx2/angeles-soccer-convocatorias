import { NextResponse } from 'next/server';
import { pool } from '@/lib/db';

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const sedeIdParam = searchParams.get('sedeId');

        if (!sedeIdParam) {
            return NextResponse.json({ success: false, message: 'El ID de la sede es requerido' }, { status: 400 });
        }

        const sedeId = parseInt(sedeIdParam);

        const query = `
            SELECT 
                J.Categoria,
                COUNT(CASE WHEN J.Status = 0 THEN 1 END) as Inscritos,
                COUNT(CASE WHEN J.Status = 2 THEN 1 END) as Bajas,
                GROUP_CONCAT(CASE WHEN J.Status = 0 AND J.Beca IS NOT NULL AND J.Beca != '0' AND J.Beca != '' THEN J.Beca END) as BecasDetail
            FROM tblJugadores J
            WHERE J.IdSede = ?
            GROUP BY J.Categoria
            ORDER BY Inscritos DESC, J.Categoria ASC
        `;

        const [rows] = await pool.query(query, [sedeId]);

        // Also get sede name
        const [sedeRows] = await pool.query(`SELECT Sede FROM tblSedes WHERE IdSede = ?`, [sedeId]);
        const sedeName = Array.isArray(sedeRows) && sedeRows.length > 0 ? (sedeRows[0] as any).Sede : `Sede ${sedeId}`;

        return NextResponse.json({ 
            success: true, 
            data: rows,
            sedeName
        });
    } catch (error) {
        console.error('Error fetching categories for inscripciones:', error);
        return NextResponse.json(
            { success: false, message: 'Error al obtener categorías' },
            { status: 500 }
        );
    }
}
