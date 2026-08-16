import { NextResponse } from 'next/server';
import { z } from 'zod';
import { pool } from '@/lib/db';
import { CLAVES_VALIDAS, CLAVE_PERFILES } from '@/lib/navegacion';
import { guardarPaginasDePuesto, paginasPorPuesto, requierePagina } from '@/lib/permisos';

export const dynamic = 'force-dynamic';

/** Perfiles (puestos) con los módulos que tienen concedidos. */

const perfilSchema = z.object({
    puesto: z.string().trim().min(3, 'El nombre del perfil debe tener al menos 3 caracteres').max(145),
    paginas: z.array(z.string()).default([]),
});

interface FilaPerfil {
    IdPuesto: number;
    Puesto: string | null;
    Status: number | null;
    Usuarios: number;
    UsuariosActivos: number;
}

export async function GET() {
    const guardia = await requierePagina(CLAVE_PERFILES);
    if (!guardia.ok) {
        return NextResponse.json({ success: false, message: guardia.message }, { status: guardia.status });
    }

    try {
        const [rows] = (await pool.query(
            `SELECT P.IdPuesto, P.Puesto, P.Status,
                    COUNT(U.IdUsuario) AS Usuarios,
                    SUM(CASE WHEN COALESCE(U.Status, 0) = 0 THEN 1 ELSE 0 END) AS UsuariosActivos
             FROM tblPuestos P
             LEFT JOIN tblUsuarios U ON U.IdPuesto = P.IdPuesto
             GROUP BY P.IdPuesto, P.Puesto, P.Status
             ORDER BY P.Puesto ASC`,
        )) as [FilaPerfil[], unknown];

        const permisos = await paginasPorPuesto();

        const data = rows.map((fila) => ({
            IdPuesto: fila.IdPuesto,
            Puesto: fila.Puesto ?? '',
            Status: Number(fila.Status) || 0,
            Usuarios: Number(fila.Usuarios) || 0,
            UsuariosActivos: Number(fila.UsuariosActivos) || 0,
            paginas: permisos[fila.IdPuesto] ?? [],
        }));

        return NextResponse.json({ success: true, data, idPuestoActual: guardia.user.IdPuesto });
    } catch (error) {
        console.error('Error al obtener perfiles:', error);
        return NextResponse.json({ success: false, message: 'Error al obtener los perfiles' }, { status: 500 });
    }
}

export async function POST(request: Request) {
    const guardia = await requierePagina(CLAVE_PERFILES);
    if (!guardia.ok) {
        return NextResponse.json({ success: false, message: guardia.message }, { status: guardia.status });
    }

    try {
        const { puesto, paginas } = perfilSchema.parse(await request.json());

        const desconocidas = paginas.filter((p) => !CLAVES_VALIDAS.has(p));
        if (desconocidas.length > 0) {
            return NextResponse.json(
                { success: false, message: `Módulos desconocidos: ${desconocidas.join(', ')}` },
                { status: 400 },
            );
        }

        const [repetido] = (await pool.query(
            'SELECT IdPuesto FROM tblPuestos WHERE Puesto = ? LIMIT 1',
            [puesto],
        )) as [{ IdPuesto: number }[], unknown];
        if (repetido.length > 0) {
            return NextResponse.json({ success: false, message: 'Ya existe un perfil con ese nombre' }, { status: 409 });
        }

        // M1..M20 quedan en su valor por omisión (0): son del sistema de escritorio y
        // esta aplicación ya no decide accesos con ellas.
        const [resultado] = (await pool.query(
            'INSERT INTO tblPuestos (Puesto, Status, FechaAct) VALUES (?, 0, NOW())',
            [puesto],
        )) as [{ insertId: number }, unknown];

        await guardarPaginasDePuesto(resultado.insertId, paginas);

        return NextResponse.json({ success: true, IdPuesto: resultado.insertId });
    } catch (error) {
        if (error instanceof z.ZodError) {
            return NextResponse.json({ success: false, message: error.issues[0].message }, { status: 400 });
        }
        console.error('Error al crear el perfil:', error);
        return NextResponse.json({ success: false, message: 'Error al crear el perfil' }, { status: 500 });
    }
}
