import { NextResponse } from 'next/server';
import { z } from 'zod';
import { pool } from '@/lib/db';
import { crearPreincorporacionSchema, VIGENTE } from '@/lib/preincorporaciones';

export const dynamic = 'force-dynamic';

/**
 * Alta pública de una preinscripción de incorporación (sin sesión: la llena el
 * interesado desde el QR).
 *
 * El QR es único para toda la academia, así que no hay enlace por sede que validar ni
 * sede que guardar. Ver @/lib/preincorporaciones.
 */
export async function POST(request: Request) {
    try {
        const datos = crearPreincorporacionSchema.parse(await request.json());

        const [res] = (await pool.query(
            `INSERT INTO tblIncorporacionesPre
                (Jugador, AnioNacimiento, Telefono, Equipo, Comentarios,
                 IdIncorporacion, Status, FechaAlta, FechaAct)
             VALUES (?, ?, ?, ?, ?, 0, ${VIGENTE}, NOW(), NOW())`,
            [
                datos.jugador,
                datos.anioNacimiento,
                datos.telefono,
                datos.equipo || null,
                datos.comentarios || null,
            ],
        )) as [{ insertId: number }, unknown];

        return NextResponse.json({ success: true, id: res.insertId });
    } catch (error) {
        if (error instanceof z.ZodError) {
            return NextResponse.json({ success: false, message: error.issues[0].message }, { status: 400 });
        }
        if ((error as { code?: string })?.code === 'ER_NO_SUCH_TABLE') {
            return NextResponse.json(
                { success: false, message: 'Falta aplicar migrations/014-preincorporaciones.sql en la base de datos.' },
                { status: 503 },
            );
        }
        console.error('Error al guardar la preinscripción de incorporación:', error);
        return NextResponse.json(
            { success: false, message: 'No se pudo guardar. Inténtalo de nuevo.' },
            { status: 500 },
        );
    }
}
