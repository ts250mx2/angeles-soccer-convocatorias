import { NextResponse } from 'next/server';
import { pool } from '@/lib/db';

export const dynamic = 'force-dynamic';

// Catálogo de escuelas (tblEscuelas) filtrado por estado, con búsqueda incremental.
export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const estado = (searchParams.get('estado') || '').trim();
        const q = (searchParams.get('q') || '').trim();

        if (!estado) {
            return NextResponse.json({ success: true, data: [] });
        }

        const where: string[] = ['Estado = ?'];
        const args: any[] = [estado];

        if (q) {
            where.push('(Escuela LIKE ? OR Municipio LIKE ? OR Colonia LIKE ?)');
            const like = `%${q}%`;
            args.push(like, like, like);
        }

        const [rows] = await pool.query(
            `SELECT IdEscuela, Escuela, Municipio, Colonia, CodigoPostal, NivelEducativo
             FROM tblEscuelas
             WHERE ${where.join(' AND ')}
             ORDER BY Escuela
             LIMIT 50`,
            args
        ) as any[];

        return NextResponse.json({ success: true, data: rows });
    } catch (error) {
        console.error('Error fetching escuelas:', error);
        return NextResponse.json(
            { success: false, message: 'Error al obtener escuelas', error: error instanceof Error ? error.message : 'Unknown' },
            { status: 500 }
        );
    }
}
