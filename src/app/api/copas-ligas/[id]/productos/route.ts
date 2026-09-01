import { NextResponse } from 'next/server';
import { z } from 'zod';
import { pool } from '@/lib/db';
import { CLAVES_CATALOGO } from '@/lib/navegacion';
import { requiereAlgunaPagina } from '@/lib/permisos';
import { crearProductoSchema } from '@/lib/copas-ligas';
import { insertaProducto } from '@/lib/copas-ligas-db';

export const dynamic = 'force-dynamic';

/**
 * Agrega un concepto cobrable a una copa o liga que ya existe.
 *
 * Una misma copa cobra cosas distintas (la inscripción al torneo, el transporte, o un
 * precio por categoría), y cada una es un renglón propio en tblProductos.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
    const guardia = await requiereAlgunaPagina(CLAVES_CATALOGO);
    if (!guardia.ok) {
        return NextResponse.json({ success: false, message: guardia.message }, { status: guardia.status });
    }

    try {
        const idLiga = Number((await params).id);
        if (!Number.isInteger(idLiga) || idLiga <= 0) {
            return NextResponse.json({ success: false, message: 'Copa o liga no válida' }, { status: 400 });
        }

        const { concepto, precio } = crearProductoSchema.parse(await request.json());

        const [liga] = (await pool.query(
            'SELECT COALESCE(IdTipoLiga, 1) AS IdTipoLiga FROM tblLigas WHERE IdLiga = ? LIMIT 1',
            [idLiga],
        )) as [Array<{ IdTipoLiga: number }>, unknown];
        if (liga.length === 0) {
            return NextResponse.json({ success: false, message: 'La copa o liga no existe' }, { status: 404 });
        }

        const idProducto = await insertaProducto(pool, {
            idLiga,
            idTipoLiga: liga[0].IdTipoLiga,
            concepto,
            precio,
        });

        return NextResponse.json({ success: true, idProducto });
    } catch (error) {
        if (error instanceof z.ZodError) {
            return NextResponse.json({ success: false, message: error.issues[0].message }, { status: 400 });
        }
        console.error('Error al agregar el concepto:', error);
        return NextResponse.json({ success: false, message: 'Error al agregar el concepto' }, { status: 500 });
    }
}
