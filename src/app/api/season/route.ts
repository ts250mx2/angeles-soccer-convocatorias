import { NextResponse } from 'next/server';
import { pool } from '@/lib/db';

export async function GET() {
    try {
        const [rows] = await pool.query(
            'SELECT IdTemporada, Temporada FROM tblTemporadas WHERE EsActiva = 1 LIMIT 1'
        );

        if (Array.isArray(rows) && rows.length > 0) {
            return NextResponse.json({ success: true, season: rows[0] });
        } else {
            return NextResponse.json({ success: false, message: 'No active season found' });
        }
    } catch (error) {
        console.error('Error fetching season:', error);
        return NextResponse.json(
            { success: false, message: 'Error fetching season' },
            { status: 500 }
        );
    }
}
