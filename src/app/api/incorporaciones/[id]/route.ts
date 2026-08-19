import { NextResponse } from 'next/server';
import { z } from 'zod';
import { pool } from '@/lib/db';
import { CLAVE_INCORPORACIONES } from '@/lib/navegacion';
import { requierePagina } from '@/lib/permisos';
import { actualizarIncorporacionSchema } from '@/lib/incorporaciones';

export const dynamic = 'force-dynamic';

/**
 * Corrige o cancela una incorporación.
 *
 * Se pueden cambiar la fecha, el grupo y la justificación. El jugador, el profesor y la
 * procedencia NO: eso sería otro formato, y la procedencia además es la foto de la
 * categoría que tenía al capturarlo.
 *
 * No hay DELETE a propósito: en este sistema nada se borra, se marca. Cancelar deja el
 * registro para el histórico y lo saca de los totales; reactivarlo deshace el error sin
 * recapturar nada.
 */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
    const guardia = await requierePagina(CLAVE_INCORPORACIONES);
    if (!guardia.ok) {
        return NextResponse.json({ success: false, message: guardia.message }, { status: guardia.status });
    }

    try {
        const id = Number((await params).id);
        if (!Number.isInteger(id) || id <= 0) {
            return NextResponse.json({ success: false, message: 'Incorporación no válida' }, { status: 400 });
        }

        const datos = actualizarIncorporacionSchema.parse(await request.json());

        /* Solo los campos que vienen. Armar el SET así evita que cambiar el grupo borre
           una justificación que el usuario no tocó. */
        const campos: string[] = [];
        const valores: unknown[] = [];
        if (datos.fecha !== undefined) { campos.push('FechaCaptura = ?'); valores.push(datos.fecha); }
        if (datos.grupoIncorporar !== undefined) { campos.push('GrupoIncorporar = ?'); valores.push(datos.grupoIncorporar.toUpperCase()); }
        if (datos.justificacion !== undefined) { campos.push('Justificacion = ?'); valores.push(datos.justificacion || null); }
        if (datos.status !== undefined) { campos.push('Status = ?'); valores.push(datos.status); }

        if (campos.length === 0) {
            return NextResponse.json({ success: false, message: 'No hay nada que cambiar' }, { status: 400 });
        }

        const [res] = (await pool.query(
            `UPDATE tblIncorporaciones SET ${campos.join(', ')}, FechaAct = NOW()
             WHERE IdIncorporacion = ?`,
            [...valores, id],
        )) as [{ affectedRows: number }, unknown];

        if (res.affectedRows === 0) {
            return NextResponse.json({ success: false, message: 'La incorporación no existe' }, { status: 404 });
        }

        return NextResponse.json({ success: true });
    } catch (error) {
        if (error instanceof z.ZodError) {
            return NextResponse.json({ success: false, message: error.issues[0].message }, { status: 400 });
        }
        if ((error as { code?: string })?.code === 'ER_NO_SUCH_TABLE') {
            return NextResponse.json(
                { success: false, message: 'Falta aplicar migrations/011-incorporaciones.sql en la base de datos.' },
                { status: 503 },
            );
        }
        console.error('Error al actualizar la incorporación:', error);
        return NextResponse.json({ success: false, message: 'Error al actualizar la incorporación' }, { status: 500 });
    }
}
