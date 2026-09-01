import { NextResponse } from 'next/server';
import { z } from 'zod';
import { pool } from '@/lib/db';
import { CLAVES_CATALOGO } from '@/lib/navegacion';
import { requiereAlgunaPagina } from '@/lib/permisos';
import {
    actualizarCopaLigaSchema, etiquetaTipo, tipoProductoDe, BAJA,
} from '@/lib/copas-ligas';

export const dynamic = 'force-dynamic';

/** Edita el nombre, el tipo, la foto o el estatus de una copa o liga. */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
    const guardia = await requiereAlgunaPagina(CLAVES_CATALOGO);
    if (!guardia.ok) {
        return NextResponse.json({ success: false, message: guardia.message }, { status: guardia.status });
    }

    try {
        const idLiga = Number((await params).id);
        if (!Number.isInteger(idLiga) || idLiga <= 0) {
            return NextResponse.json({ success: false, message: 'Copa o liga no válida' }, { status: 400 });
        }

        const datos = actualizarCopaLigaSchema.parse(await request.json());

        const [existe] = (await pool.query(
            'SELECT IdLiga, COALESCE(IdTipoLiga, 1) AS IdTipoLiga FROM tblLigas WHERE IdLiga = ? LIMIT 1',
            [idLiga],
        )) as [Array<{ IdLiga: number; IdTipoLiga: number }>, unknown];
        if (existe.length === 0) {
            return NextResponse.json({ success: false, message: 'La copa o liga no existe' }, { status: 404 });
        }

        if (datos.nombre !== undefined) {
            const [repetida] = (await pool.query(
                'SELECT IdLiga FROM tblLigas WHERE UPPER(TRIM(Liga)) = UPPER(?) AND IdLiga <> ? LIMIT 1',
                [datos.nombre, idLiga],
            )) as [Array<{ IdLiga: number }>, unknown];
            if (repetida.length > 0) {
                return NextResponse.json(
                    { success: false, message: 'Ya existe otra copa o liga con ese nombre.' },
                    { status: 409 },
                );
            }
        }

        /* Dar de baja una copa o liga que la temporada activa está usando dejaría esas
           convocatorias apuntando a un catálogo muerto. Se avisa en vez de hacerlo. */
        if (datos.status === BAJA) {
            const [enUso] = (await pool.query(
                `SELECT COUNT(*) AS n FROM tblConvocatorias
                  WHERE IdLiga = ? AND Status = 0
                    AND IdTemporada = (SELECT IdTemporada FROM tblTemporadas WHERE EsActiva = 1 LIMIT 1)`,
                [idLiga],
            )) as [Array<{ n: number }>, unknown];
            if (Number(enUso[0]?.n) > 0) {
                return NextResponse.json(
                    {
                        success: false,
                        message: `Tiene ${enUso[0].n} convocatoria(s) vigente(s) en la temporada activa. Elimínalas antes de darla de baja.`,
                    },
                    { status: 409 },
                );
            }
        }

        const campos: string[] = [];
        const valores: unknown[] = [];

        if (datos.nombre !== undefined) {
            campos.push('Liga = ?');
            valores.push(datos.nombre);
        }
        if (datos.idTipoLiga !== undefined) {
            // Las dos columnas van juntas: el sistema de escritorio lee la de texto.
            campos.push('IdTipoLiga = ?', 'TipoLiga = ?');
            valores.push(datos.idTipoLiga, etiquetaTipo(datos.idTipoLiga));
        }
        if (datos.foto !== undefined) {
            // Cadena vacía = quitar la foto.
            campos.push('Foto = ?');
            valores.push(datos.foto === '' ? null : datos.foto);
        }
        if (datos.status !== undefined) {
            campos.push('Status = ?');
            valores.push(datos.status);
        }

        if (campos.length === 0) {
            return NextResponse.json({ success: false, message: 'No hay nada que cambiar' }, { status: 400 });
        }

        /* FechaAct se toca siempre: además de auditar, es el sello con el que la
           pantalla rompe el caché de la foto (ver /api/copas-ligas/foto). */
        await pool.query(
            `UPDATE tblLigas SET ${campos.join(', ')}, FechaAct = NOW() WHERE IdLiga = ?`,
            [...valores, idLiga],
        );

        /* El tipo vive en dos sitios: la copa o liga y sus conceptos cobrables. Si solo
           se cambiara aquí, el producto seguiría cobrándose como LIGA en los reportes de
           ventas mientras el catálogo la muestra como COPA. */
        if (datos.idTipoLiga !== undefined && datos.idTipoLiga !== existe[0].IdTipoLiga) {
            await pool.query(
                `UPDATE tblProductos
                    SET IdTipoProducto = ?, TipoProducto = ?, FechaAct = NOW()
                  WHERE IdLiga = ? AND IdTipoProducto IN (3, 4)`,
                [tipoProductoDe(datos.idTipoLiga), etiquetaTipo(datos.idTipoLiga), idLiga],
            );
        }

        return NextResponse.json({ success: true });
    } catch (error) {
        if (error instanceof z.ZodError) {
            return NextResponse.json({ success: false, message: error.issues[0].message }, { status: 400 });
        }
        console.error('Error al actualizar la copa o liga:', error);
        return NextResponse.json({ success: false, message: 'Error al actualizar la copa o liga' }, { status: 500 });
    }
}
