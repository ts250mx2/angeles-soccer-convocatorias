import { NextResponse } from 'next/server';
import { pool } from '@/lib/db';
import { z } from 'zod';

const loginSchema = z.object({
    login: z.string().min(1, 'Usuario requerido'),
    password: z.string().min(1, 'Contraseña requerida'),
});

export async function POST(request: Request) {
    try {
        console.log(request.body);
        const body = await request.json();
        const { login, password } = loginSchema.parse(body);

        const [rows] = await pool.query(
            `SELECT A.*, B.M8 AS AdminConvocatorias 
             FROM tblUsuarios A
             INNER JOIN tblPuestos B ON A.IdPuesto = B.IdPuesto
             WHERE A.login = ? AND A.passwd = ?`,
            [login, password]
        );

        if (Array.isArray(rows) && rows.length > 0) {
            // Login successful
            // In a real app, we would set a session/token here.
            // For now, we return success.
            return NextResponse.json({ success: true, user: rows[0] });
        } else {
            return NextResponse.json(
                { success: false, message: 'Credenciales inválidas' },
                { status: 401 }
            );
        }
    } catch (error) {
        console.error('Login error:', error);
        if (error instanceof z.ZodError) {
            return NextResponse.json(
                { success: false, message: error.issues[0].message },
                { status: 400 }
            );
        }
        return NextResponse.json(
            { success: false, message: 'Error en el servidor' },
            { status: 500 }
        );
    }
}
