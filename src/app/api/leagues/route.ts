import { NextResponse } from 'next/server';
import { pool } from '@/lib/db';

export async function GET() {
    try {
        const [rows] = await pool.query(
            'SELECT * FROM tblLigas WHERE Status = 0 ORDER BY Liga'
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
