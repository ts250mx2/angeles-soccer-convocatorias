import { NextResponse } from 'next/server';
import { z } from 'zod';
import { pool } from '@/lib/db';
import { CLAVES_VALIDAS, CLAVE_PERFILES } from '@/lib/navegacion';
import { guardarPaginasDePuesto, requierePagina } from '@/lib/permisos';

export const dynamic = 'force-dynamic';

const actualizarSchema = z.object({
    puesto: z.string().trim().min(3, 'El nombre del perfil debe tener al menos 3 caracteres').max(145).optional(),
    status: z.number().int().min(0).max(2).optional(),
    paginas: z.array(z.string()).optional(),
});

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
    const guardia = await requierePagina(CLAVE_PERFILES);
    if (!guardia.ok) {
        return NextResponse.json({ success: false, message: guardia.message }, { status: guardia.status });
    }

    try {
        const idPuesto = Number((await params).id);
        if (!Number.isInteger(idPuesto) || idPuesto <= 0) {
            return NextResponse.json({ success: false, message: 'Perfil no válido' }, { status: 400 });
        }

        const { puesto, status, paginas } = actualizarSchema.parse(await request.json());

        const [existe] = (await pool.query('SELECT IdPuesto FROM tblPuestos WHERE IdPuesto = ? LIMIT 1', [
            idPuesto,
        ])) as [{ IdPuesto: number }[], unknown];
        if (existe.length === 0) {
            return NextResponse.json({ success: false, message: 'El perfil no existe' }, { status: 404 });
        }

        if (paginas) {
            const desconocidas = paginas.filter((p) => !CLAVES_VALIDAS.has(p));
            if (desconocidas.length > 0) {
                return NextResponse.json(
                    { success: false, message: `Módulos desconocidos: ${desconocidas.join(', ')}` },
                    { status: 400 },
                );
            }
            // Candado antibloqueo: si te quitas a ti mismo el acceso a Perfiles, ya no
            // hay pantalla desde donde devolvértelo.
            if (idPuesto === guardia.user.IdPuesto && !paginas.includes(CLAVE_PERFILES)) {
                return NextResponse.json(
                    {
                        success: false,
                        message: 'No puedes quitarle "Perfiles y Permisos" a tu propio perfil: perderías el acceso a esta pantalla.',
                    },
                    { status: 409 },
                );
            }
        }

        if (puesto !== undefined) {
            const [repetido] = (await pool.query(
                'SELECT IdPuesto FROM tblPuestos WHERE Puesto = ? AND IdPuesto <> ? LIMIT 1',
                [puesto, idPuesto],
            )) as [{ IdPuesto: number }[], unknown];
            if (repetido.length > 0) {
                return NextResponse.json({ success: false, message: 'Ya existe un perfil con ese nombre' }, { status: 409 });
            }
        }

        const campos: string[] = [];
        const valores: unknown[] = [];
        if (puesto !== undefined) {
            campos.push('Puesto = ?');
            valores.push(puesto);
        }
        if (status !== undefined) {
            campos.push('Status = ?');
            valores.push(status);
        }
        if (campos.length > 0) {
            await pool.query(`UPDATE tblPuestos SET ${campos.join(', ')}, FechaAct = NOW() WHERE IdPuesto = ?`, [
                ...valores,
                idPuesto,
            ]);
        }

        if (paginas) await guardarPaginasDePuesto(idPuesto, paginas);

        return NextResponse.json({ success: true });
    } catch (error) {
        if (error instanceof z.ZodError) {
            return NextResponse.json({ success: false, message: error.issues[0].message }, { status: 400 });
        }
        console.error('Error al actualizar el perfil:', error);
        return NextResponse.json({ success: false, message: 'Error al actualizar el perfil' }, { status: 500 });
    }
}

/**
 * Baja de un perfil. No se borra la fila: los usuarios históricos apuntan a ella y el
 * sistema de escritorio también la lee. Se marca Status = 2 y se le quitan los módulos.
 */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
    const guardia = await requierePagina(CLAVE_PERFILES);
    if (!guardia.ok) {
        return NextResponse.json({ success: false, message: guardia.message }, { status: guardia.status });
    }

    try {
        const idPuesto = Number((await params).id);
        if (!Number.isInteger(idPuesto) || idPuesto <= 0) {
            return NextResponse.json({ success: false, message: 'Perfil no válido' }, { status: 400 });
        }
        if (idPuesto === guardia.user.IdPuesto) {
            return NextResponse.json(
                { success: false, message: 'No puedes dar de baja tu propio perfil.' },
                { status: 409 },
            );
        }

        const [conUsuarios] = (await pool.query(
            'SELECT COUNT(*) AS n FROM tblUsuarios WHERE IdPuesto = ? AND COALESCE(Status, 0) = 0',
            [idPuesto],
        )) as [{ n: number }[], unknown];
        if (Number(conUsuarios[0]?.n) > 0) {
            return NextResponse.json(
                {
                    success: false,
                    message: `El perfil tiene ${conUsuarios[0].n} usuario(s) activo(s). Muévelos a otro perfil antes de darlo de baja.`,
                },
                { status: 409 },
            );
        }

        await pool.query('UPDATE tblPuestos SET Status = 2, FechaAct = NOW() WHERE IdPuesto = ?', [idPuesto]);
        await guardarPaginasDePuesto(idPuesto, []);

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Error al dar de baja el perfil:', error);
        return NextResponse.json({ success: false, message: 'Error al dar de baja el perfil' }, { status: 500 });
    }
}
