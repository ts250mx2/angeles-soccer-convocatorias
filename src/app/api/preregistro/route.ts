import { NextResponse } from 'next/server';
import { pool } from '@/lib/db';
import { insertaPreregistro } from '@/lib/preregistro-alta';
import { validaPreregistro } from '@/lib/preregistro';

export const dynamic = 'force-dynamic';

/**
 * Guarda un preregistro público en tblJugadoresPre.
 *
 * Es la puerta SIN LOGIN: la abre quien escanea el QR de una sede. Por eso el IdSede se
 * resuelve del UUID y no se toma del cuerpo —si se tomara, cualquiera podría meter gente
 * en la sede que quisiera—, y por eso la categoría va en null: quien llega por el QR
 * todavía no está asignado a ningún equipo. La otra puerta, la captura de la recepción
 * desde Plantilla de Equipos, sí trae equipo; ver `@/lib/preregistro-alta`.
 *
 * Qué se acepta lo decide `@/lib/preregistro`, el mismo módulo que usa esa otra puerta.
 */
export async function POST(request: Request) {
    try {
        const body = await request.json();

        // 1) Resolver sede por UUID
        const uuid = String(body?.uuid ?? '').trim().slice(0, 45);
        if (!uuid) {
            return NextResponse.json({ success: false, message: 'Enlace inválido' }, { status: 400 });
        }
        const [sedes] = (await pool.query(
            'SELECT IdSede, Sede FROM tblSedes WHERE UUID = ? LIMIT 1',
            [uuid],
        )) as [{ IdSede: number; Sede: string }[], unknown];
        if (sedes.length === 0) {
            return NextResponse.json({ success: false, message: 'Enlace de preregistro no válido' }, { status: 404 });
        }

        // 2) Validaciones
        const validacion = validaPreregistro(body);
        if (!validacion.ok) {
            return NextResponse.json({ success: false, message: validacion.message }, { status: 400 });
        }

        // 3) Insert
        const idJugadorPre = await insertaPreregistro(validacion.valores, {
            idSede: sedes[0].IdSede,
            categoria: null,
        });

        return NextResponse.json({
            success: true,
            message: 'Preregistro guardado correctamente',
            data: { idJugadorPre, sede: sedes[0].Sede },
        });
    } catch (error) {
        console.error('Error saving preregistro:', error);
        return NextResponse.json(
            { success: false, message: 'Error al guardar el preregistro', error: error instanceof Error ? error.message : 'Unknown' },
            { status: 500 }
        );
    }
}
