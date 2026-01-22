import { NextResponse } from 'next/server';
import { pool } from '@/lib/db';

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const leagueId = searchParams.get('leagueId');

    if (!leagueId) {
        return NextResponse.json({ success: false, message: 'League ID is required' }, { status: 400 });
    }

    try {
        const [rows] = await pool.query(
            'SELECT Precio FROM tblProductos WHERE IdLiga = ? LIMIT 1',
            [leagueId]
        );

        // Check if rows matches standard array return from mysql2/promise
        if (Array.isArray(rows) && rows.length > 0) {
            return NextResponse.json({ success: true, price: (rows[0] as any).Precio });
        } else {
            return NextResponse.json({ success: true, price: 0 });
        }
    } catch (error) {
        console.error('Error fetching product price:', error);
        return NextResponse.json(
            { success: false, message: 'Error fetching product price' },
            { status: 500 }
        );
    }
}
