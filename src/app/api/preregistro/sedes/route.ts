import { NextResponse } from 'next/server';
import { pool } from '@/lib/db';

export const dynamic = 'force-dynamic';

// Lista de sedes activas con su UUID de preregistro (genera UUID a las que no lo tengan).
export async function GET() {
    try {
        await pool.query(
            "UPDATE tblSedes SET UUID = UUID() WHERE (UUID IS NULL OR UUID = '') AND Status = 0"
        );

        const [rows] = await pool.query(
            `SELECT IdSede, Sede, UUID, Estado
             FROM tblSedes
             WHERE Status = 0 AND UUID IS NOT NULL AND UUID <> ''
             ORDER BY Sede ASC`
        );

        return NextResponse.json({ success: true, data: rows });
    } catch (error) {
        console.error('Error fetching sedes for QR:', error);
        return NextResponse.json(
            { success: false, message: 'Error al obtener las sedes', error: error instanceof Error ? error.message : 'Unknown' },
            { status: 500 }
        );
    }
}
