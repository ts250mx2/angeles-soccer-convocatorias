import { NextResponse } from 'next/server';
import { pool } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const [rows] = await pool.query('SELECT IdProducto, Producto, Precio FROM tblProductos WHERE Status = 0 ORDER BY Producto ASC');
        return NextResponse.json({ success: true, data: rows });
    } catch (error) {
        console.error('Error fetching products for sales:', error);
        return NextResponse.json({ success: false, message: 'Error al obtener productos' }, { status: 500 });
    }
}
