import { NextResponse } from 'next/server';
import { z } from 'zod';
import { pool } from '@/lib/db';
import { CLAVE_USUARIOS } from '@/lib/navegacion';
import { requierePagina } from '@/lib/permisos';
import { camposUsuario, existePerfil, loginOcupado, validaCredenciales } from '@/lib/usuarios';

export const dynamic = 'force-dynamic';

/** Alta y consulta de usuarios. Las reglas de negocio viven en @/lib/usuarios. */

const crearSchema = z.object({
    ...camposUsuario,
    login: camposUsuario.login.optional().default(''),
    passwd: z.string().trim().max(45).optional().default(''),
    idSede: camposUsuario.idSede.optional().default(null),
    correo: camposUsuario.correo.optional().default(''),
    telefonos: camposUsuario.telefonos.optional().default(''),
    status: camposUsuario.status.optional().default(0),
});

export async function GET() {
    const guardia = await requierePagina(CLAVE_USUARIOS);
    if (!guardia.ok) {
        return NextResponse.json({ success: false, message: guardia.message }, { status: guardia.status });
    }

    try {
        // La contraseña nunca sale del servidor; solo se informa si la cuenta tiene acceso.
        const [usuarios] = await pool.query(
            `SELECT A.IdUsuario, A.Usuario, A.Login, A.IdPuesto, B.Puesto, A.IdSede, C.Sede,
                    A.CorreoElectronico, A.Telefonos, COALESCE(A.Status, 0) AS Status,
                    CASE WHEN A.Login IS NOT NULL AND A.Login <> '' THEN 1 ELSE 0 END AS TieneAcceso
             FROM tblUsuarios A
             LEFT JOIN tblPuestos B ON A.IdPuesto = B.IdPuesto
             LEFT JOIN tblSedes   C ON A.IdSede   = C.IdSede
             ORDER BY A.Usuario ASC`,
        );

        const [perfiles] = await pool.query(
            'SELECT IdPuesto, Puesto FROM tblPuestos WHERE COALESCE(Status, 0) = 0 ORDER BY Puesto ASC',
        );
        const [sedes] = await pool.query(
            'SELECT IdSede, Sede FROM tblSedes WHERE COALESCE(Status, 0) = 0 ORDER BY Sede ASC',
        );

        return NextResponse.json({
            success: true,
            data: usuarios,
            perfiles,
            sedes,
            idUsuarioActual: guardia.user.IdUsuario,
        });
    } catch (error) {
        console.error('Error al obtener usuarios:', error);
        return NextResponse.json({ success: false, message: 'Error al obtener los usuarios' }, { status: 500 });
    }
}

export async function POST(request: Request) {
    const guardia = await requierePagina(CLAVE_USUARIOS);
    if (!guardia.ok) {
        return NextResponse.json({ success: false, message: guardia.message }, { status: guardia.status });
    }

    try {
        const datos = crearSchema.parse(await request.json());

        const problema = validaCredenciales(datos.login, datos.passwd);
        if (problema) return NextResponse.json({ success: false, message: problema }, { status: 400 });

        if (await loginOcupado(datos.login)) {
            return NextResponse.json(
                { success: false, message: `El usuario de acceso "${datos.login}" ya está en uso.` },
                { status: 409 },
            );
        }

        if (!(await existePerfil(datos.idPuesto))) {
            return NextResponse.json({ success: false, message: 'El perfil seleccionado no existe' }, { status: 400 });
        }

        const [resultado] = (await pool.query(
            `INSERT INTO tblUsuarios
                (Usuario, Login, Passwd, IdPuesto, IdSede, CorreoElectronico, Telefonos, Status, FechaAct)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
            [
                datos.usuario,
                datos.login,
                datos.passwd,
                datos.idPuesto,
                datos.idSede,
                datos.correo,
                datos.telefonos,
                datos.status,
            ],
        )) as [{ insertId: number }, unknown];

        return NextResponse.json({ success: true, IdUsuario: resultado.insertId });
    } catch (error) {
        if (error instanceof z.ZodError) {
            return NextResponse.json({ success: false, message: error.issues[0].message }, { status: 400 });
        }
        console.error('Error al crear el usuario:', error);
        return NextResponse.json({ success: false, message: 'Error al crear el usuario' }, { status: 500 });
    }
}
