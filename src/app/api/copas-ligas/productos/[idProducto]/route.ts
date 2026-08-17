import { NextResponse } from 'next/server';
import { z } from 'zod';
import { pool } from '@/lib/db';
import { CLAVE_COPAS_LIGAS } from '@/lib/navegacion';
import { requierePagina } from '@/lib/permisos';
import { actualizarProductoSchema } from '@/lib/copas-ligas';

export const dynamic = 'force-dynamic';

/**
 * Cambia el precio, el concepto o el estatus de un cobro de copa o liga.
 *
 * El precio nuevo NO reescribe lo ya cobrado: los pagos guardan su propio importe, así
 * que el histórico se queda como estaba y el precio nuevo aplica de aquí en adelante.
 * Las convocatorias vigentes sí lo toman en la siguiente visita a la pantalla, que es
 * donde `sincronizarPrecios` pone al corriente lo que aún no se ha pagado.
 */
export async function PATCH(request: Request, { params }: { params: Promise<{ idProducto: string }> }) {
    const guardia = await requierePagina(CLAVE_COPAS_LIGAS);
    if (!guardia.ok) {
        return NextResponse.json({ success: false, message: guardia.message }, { status: guardia.status });
    }

    try {
        const idProducto = Number((await params).idProducto);
        if (!Number.isInteger(idProducto) || idProducto <= 0) {
            return NextResponse.json({ success: false, message: 'Concepto no válido' }, { status: 400 });
        }

        const datos = actualizarProductoSchema.parse(await request.json());

        /* Solo conceptos de copa o liga: este catálogo no debe poder tocar el precio de
           una mensualidad, una inscripción o un uniforme. */
        const [existe] = (await pool.query(
            'SELECT IdProducto FROM tblProductos WHERE IdProducto = ? AND IdTipoProducto IN (3, 4) LIMIT 1',
            [idProducto],
        )) as [Array<{ IdProducto: number }>, unknown];
        if (existe.length === 0) {
            return NextResponse.json(
                { success: false, message: 'El concepto no existe o no es de una copa o liga' },
                { status: 404 },
            );
        }

        const campos: string[] = [];
        const valores: unknown[] = [];
        if (datos.concepto !== undefined) {
            campos.push('Producto = ?');
            valores.push(datos.concepto);
        }
        if (datos.precio !== undefined) {
            campos.push('Precio = ?');
            valores.push(datos.precio);
        }
        if (datos.status !== undefined) {
            campos.push('Status = ?');
            valores.push(datos.status);
        }

        if (campos.length === 0) {
            return NextResponse.json({ success: false, message: 'No hay nada que cambiar' }, { status: 400 });
        }

        await pool.query(
            `UPDATE tblProductos SET ${campos.join(', ')}, FechaAct = NOW() WHERE IdProducto = ?`,
            [...valores, idProducto],
        );

        return NextResponse.json({ success: true });
    } catch (error) {
        if (error instanceof z.ZodError) {
            return NextResponse.json({ success: false, message: error.issues[0].message }, { status: 400 });
        }
        console.error('Error al actualizar el concepto:', error);
        return NextResponse.json({ success: false, message: 'Error al actualizar el concepto' }, { status: 500 });
    }
}
