import { NextResponse } from 'next/server';
import { pool } from '@/lib/db';

export const dynamic = 'force-dynamic';

// Resuelve una sede a partir de su UUID público (sin login). Solo lectura.
export async function GET(
    _request: Request,
    { params }: { params: Promise<{ uuid: string }> }
) {
    try {
        const { uuid } = await params;
        if (!uuid) {
            return NextResponse.json({ success: false, message: 'UUID requerido' }, { status: 400 });
        }

        const [rows] = await pool.query(
            'SELECT IdSede, Sede, Estado FROM tblSedes WHERE UUID = ? LIMIT 1',
            [uuid]
        ) as any[];

        if (!rows.length) {
            return NextResponse.json({ success: false, message: 'Enlace de preregistro no válido' }, { status: 404 });
        }

        return NextResponse.json({ success: true, data: rows[0] });
    } catch (error) {
        console.error('Error fetching sede by uuid:', error);
        return NextResponse.json(
            { success: false, message: 'Error al validar el enlace', error: error instanceof Error ? error.message : 'Unknown' },
            { status: 500 }
        );
    }
}
