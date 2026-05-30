import { NextResponse } from 'next/server';
import { pool } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const [rows] = await pool.query('SELECT IdSede, Sede FROM tblSedes WHERE Status = 0 ORDER BY Sede ASC');
        return NextResponse.json({ success: true, data: rows });
    } catch (error) {
        console.error('Error fetching sedes for sales:', error);
        return NextResponse.json({ success: false, message: 'Error al obtener sedes' }, { status: 500 });
    }
}
