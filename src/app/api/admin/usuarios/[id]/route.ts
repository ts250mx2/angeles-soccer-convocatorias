import { NextResponse } from 'next/server';
import { z } from 'zod';
import { pool } from '@/lib/db';
import { CLAVE_USUARIOS } from '@/lib/navegacion';
import { requierePagina } from '@/lib/permisos';
import { camposUsuario, existePerfil, loginOcupado, validaCredenciales } from '@/lib/usuarios';

export const dynamic = 'force-dynamic';

/**
 * `passwd` ausente = "no la toques". Se distingue de la cadena vacía, que sí significa
 * quitarle el acceso a la cuenta.
 */
const actualizarSchema = z.object({
    ...camposUsuario,
    passwd: z.string().trim().max(45).optional(),
});

async function passwdActual(idUsuario: number): Promise<string> {
    const [rows] = (await pool.query('SELECT Passwd FROM tblUsuarios WHERE IdUsuario = ? LIMIT 1', [
        idUsuario,
    ])) as [{ Passwd: string | null }[], unknown];
    return rows[0]?.Passwd ?? '';
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
    const guardia = await requierePagina(CLAVE_USUARIOS);
    if (!guardia.ok) {
        return NextResponse.json({ success: false, message: guardia.message }, { status: guardia.status });
    }

    try {
        const idUsuario = Number((await params).id);
        if (!Number.isInteger(idUsuario) || idUsuario <= 0) {
            return NextResponse.json({ success: false, message: 'Usuario no válido' }, { status: 400 });
        }

        const datos = actualizarSchema.parse(await request.json());
        // Quitarle el usuario de acceso a una cuenta le quita también la contraseña:
        // dejarla ahí sería guardar una credencial huérfana.
        const passwd = datos.login === '' ? '' : datos.passwd ?? (await passwdActual(idUsuario));

        const problema = validaCredenciales(datos.login, passwd);
        if (problema) return NextResponse.json({ success: false, message: problema }, { status: 400 });

        if (await loginOcupado(datos.login, idUsuario)) {
            return NextResponse.json(
                { success: false, message: `El usuario de acceso "${datos.login}" ya está en uso.` },
                { status: 409 },
            );
        }

        // Darse de baja a uno mismo cierra la sesión en el siguiente request: se avisa
        // antes de que ocurra en vez de dejar al usuario fuera sin explicación.
        if (idUsuario === guardia.user.IdUsuario && datos.status !== 0) {
            return NextResponse.json(
                { success: false, message: 'No puedes darte de baja a ti mismo.' },
                { status: 409 },
            );
        }

        const [existe] = (await pool.query('SELECT IdUsuario FROM tblUsuarios WHERE IdUsuario = ? LIMIT 1', [
            idUsuario,
        ])) as [{ IdUsuario: number }[], unknown];
        if (existe.length === 0) {
            return NextResponse.json({ success: false, message: 'El usuario no existe' }, { status: 404 });
        }

        if (!(await existePerfil(datos.idPuesto))) {
            return NextResponse.json({ success: false, message: 'El perfil seleccionado no existe' }, { status: 400 });
        }

        await pool.query(
            `UPDATE tblUsuarios
                SET Usuario = ?, Login = ?, Passwd = ?, IdPuesto = ?, IdSede = ?,
                    CorreoElectronico = ?, Telefonos = ?, Status = ?, FechaAct = NOW()
              WHERE IdUsuario = ?`,
            [
                datos.usuario,
                datos.login,
                passwd,
                datos.idPuesto,
                datos.idSede,
                datos.correo,
                datos.telefonos,
                datos.status,
                idUsuario,
            ],
        );

        return NextResponse.json({ success: true });
    } catch (error) {
        if (error instanceof z.ZodError) {
            return NextResponse.json({ success: false, message: error.issues[0].message }, { status: 400 });
        }
        console.error('Error al actualizar el usuario:', error);
        return NextResponse.json({ success: false, message: 'Error al actualizar el usuario' }, { status: 500 });
    }
}

/** Baja lógica (Status = 2): la fila se conserva porque de ella cuelgan convocatorias. */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
    const guardia = await requierePagina(CLAVE_USUARIOS);
    if (!guardia.ok) {
        return NextResponse.json({ success: false, message: guardia.message }, { status: guardia.status });
    }

    try {
        const idUsuario = Number((await params).id);
        if (!Number.isInteger(idUsuario) || idUsuario <= 0) {
            return NextResponse.json({ success: false, message: 'Usuario no válido' }, { status: 400 });
        }
        if (idUsuario === guardia.user.IdUsuario) {
            return NextResponse.json(
                { success: false, message: 'No puedes darte de baja a ti mismo.' },
                { status: 409 },
            );
        }

        await pool.query('UPDATE tblUsuarios SET Status = 2, FechaAct = NOW() WHERE IdUsuario = ?', [idUsuario]);
        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Error al dar de baja el usuario:', error);
        return NextResponse.json({ success: false, message: 'Error al dar de baja el usuario' }, { status: 500 });
    }
}
