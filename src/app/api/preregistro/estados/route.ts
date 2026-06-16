import { NextResponse } from 'next/server';
import { pool } from '@/lib/db';

export const dynamic = 'force-dynamic';

// Catálogo de estados (incluye EXTRANJERO) — usado para EntidadNacimiento.
export async function GET() {
    try {
        const [rows] = await pool.query(
            'SELECT IdEstado, Estado FROM tblEstados ORDER BY Estado'
        ) as any[];
        return NextResponse.json({ success: true, data: rows });
    } catch (error) {
        console.error('Error fetching estados:', error);
        return NextResponse.json(
            { success: false, message: 'Error al obtener estados', error: error instanceof Error ? error.message : 'Unknown' },
            { status: 500 }
        );
    }
}
