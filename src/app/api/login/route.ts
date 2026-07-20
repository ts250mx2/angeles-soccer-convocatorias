import { NextResponse } from 'next/server';
import { pool } from '@/lib/db';
import { z } from 'zod';
import { createSessionToken, SESSION_COOKIE, sessionCookieOptions } from '@/lib/auth';

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
            const user = rows[0] as any;
            const response = NextResponse.json({ success: true, user });

            // Sesión de servidor: cookie httpOnly firmada. El rol no viaja en la
            // cookie; se revalida contra la base de datos en cada request.
            const token = createSessionToken(Number(user.IdUsuario));
            if (token) {
                response.cookies.set(SESSION_COOKIE, token, sessionCookieOptions);
            } else {
                console.warn('[login] AUTH_SECRET no configurado: no se emitió cookie de sesión.');
            }

            return response;
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
