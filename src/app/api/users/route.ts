import { NextResponse } from 'next/server';
import { pool } from '@/lib/db';

export async function GET() {
    try {
        const [rows] = await pool.query(
            'SELECT IdUsuario, Usuario FROM tblUsuarios WHERE Status = 0 ORDER BY Usuario ASC'
        );
        return NextResponse.json({ success: true, data: rows });
    } catch (error) {
        console.error('Error fetching users:', error);
        return NextResponse.json(
            { success: false, message: 'Error al obtener usuarios' },
            { status: 500 }
        );
    }
}
