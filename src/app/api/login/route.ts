import { NextResponse } from 'next/server';
import { pool } from '@/lib/db';
import { z } from 'zod';
import { createSessionToken, SESSION_COOKIE, sessionCookieOptions } from '@/lib/auth';
import { paginasDePuesto } from '@/lib/permisos';

const loginSchema = z.object({
    login: z.string().min(1, 'Usuario requerido'),
    password: z.string().min(1, 'Contraseña requerida'),
});

interface FilaUsuario {
    IdUsuario: number;
    Usuario: string;
    Login: string;
    IdPuesto: number | null;
    IdSede: number | null;
    Puesto: string | null;
    AdminConvocatorias: number | null;
}

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { login, password } = loginSchema.parse(body);

        // Status = 0 es "activo": un usuario dado de baja no entra, que es lo que
        // significa el interruptor de la pantalla de Usuarios.
        const [rows] = (await pool.query(
            `SELECT A.IdUsuario, A.Usuario, A.Login, A.IdPuesto, A.IdSede,
                    B.Puesto, B.M8 AS AdminConvocatorias
             FROM tblUsuarios A
             INNER JOIN tblPuestos B ON A.IdPuesto = B.IdPuesto
             WHERE A.Login = ? AND A.Passwd = ? AND COALESCE(A.Status, 0) = 0
             LIMIT 1`,
            [login, password]
        )) as [FilaUsuario[], unknown];

        if (rows.length === 0) {
            return NextResponse.json(
                { success: false, message: 'Credenciales inválidas' },
                { status: 401 }
            );
        }

        const fila = rows[0];
        const paginas = [...(await paginasDePuesto(fila.IdPuesto, Number(fila.AdminConvocatorias) || 0))];

        if (paginas.length === 0) {
            return NextResponse.json(
                {
                    success: false,
                    message: `Tu perfil (${fila.Puesto ?? 'sin perfil'}) no tiene módulos asignados. Pide a un administrador que te dé acceso.`,
                },
                { status: 403 }
            );
        }

        // Nunca se devuelve la fila completa: ahí viaja la contraseña, y el cliente
        // guarda este objeto en localStorage.
        const user = {
            IdUsuario: fila.IdUsuario,
            Usuario: fila.Usuario,
            login: fila.Login,
            IdPuesto: fila.IdPuesto,
            Puesto: fila.Puesto,
            IdSede: fila.IdSede,
            AdminConvocatorias: Number(fila.AdminConvocatorias) || 0,
        };

        const response = NextResponse.json({ success: true, user, paginas });

        // Sesión de servidor: cookie httpOnly firmada. Ni el rol ni los permisos viajan
        // en la cookie; se revalidan contra la base de datos en cada request.
        const token = createSessionToken(fila.IdUsuario);
        if (token) {
            response.cookies.set(SESSION_COOKIE, token, sessionCookieOptions);
        } else {
            console.warn('[login] AUTH_SECRET no configurado: no se emitió cookie de sesión.');
        }

        return response;
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
