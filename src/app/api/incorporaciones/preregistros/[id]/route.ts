import { NextResponse } from 'next/server';
import { z } from 'zod';
import { pool } from '@/lib/db';
import { CLAVE_INCORPORACIONES } from '@/lib/navegacion';
import { requierePagina } from '@/lib/permisos';
import { VIGENTE, BAJA } from '@/lib/preincorporaciones';

export const dynamic = 'force-dynamic';

const cambiarSchema = z.object({
    status: z.union([z.literal(VIGENTE), z.literal(BAJA)]),
});

/**
 * Descarta o reactiva una preinscripcion.
 *
 * No hay DELETE: un contacto que no cuajo sigue siendo informacion (de que equipo
 * venia, cuando pregunto), y borrarlo solo esconde el embudo.
 */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
    const guardia = await requierePagina(CLAVE_INCORPORACIONES);
    if (!guardia.ok) {
        return NextResponse.json({ success: false, message: guardia.message }, { status: guardia.status });
    }

    try {
        const id = Number((await params).id);
        if (!Number.isInteger(id) || id <= 0) {
            return NextResponse.json({ success: false, message: 'Preinscripcion no valida' }, { status: 400 });
        }

        const { status } = cambiarSchema.parse(await request.json());

        const [res] = (await pool.query(
            'UPDATE tblIncorporacionesPre SET Status = ?, FechaAct = NOW() WHERE IdIncorporacionPre = ?',
            [status, id],
        )) as [{ affectedRows: number }, unknown];

        if (res.affectedRows === 0) {
            return NextResponse.json({ success: false, message: 'La preinscripcion no existe' }, { status: 404 });
        }

        return NextResponse.json({ success: true });
    } catch (error) {
        if (error instanceof z.ZodError) {
            return NextResponse.json({ success: false, message: error.issues[0].message }, { status: 400 });
        }
        console.error('Error al actualizar la preinscripcion:', error);
        return NextResponse.json({ success: false, message: 'Error al actualizar la preinscripcion' }, { status: 500 });
    }
}
