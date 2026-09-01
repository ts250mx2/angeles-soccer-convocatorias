import { NextResponse } from 'next/server';
import { z } from 'zod';
import { pool } from '@/lib/db';
import { CLAVES_CATALOGO } from '@/lib/navegacion';
import { requiereAlgunaPagina } from '@/lib/permisos';
import {
    crearCopaLigaSchema, etiquetaTipo, VIGENTE,
    type CopaLigaRow, type ProductoCopaLiga,
} from '@/lib/copas-ligas';
import { insertaProducto } from '@/lib/copas-ligas-db';

export const dynamic = 'force-dynamic';

/**
 * Catálogo de Copas y Ligas. Ver @/lib/copas-ligas para el reparto entre tblLigas
 * (identidad) y tblProductos (precios).
 */

interface FilaLiga {
    IdLiga: number;
    Liga: string;
    IdTipoLiga: number;
    Status: number;
    TieneFoto: number;
    FotoVersion: string | null;
    Convocatorias: number;
}

export async function GET() {
    const guardia = await requiereAlgunaPagina(CLAVES_CATALOGO);
    if (!guardia.ok) {
        return NextResponse.json({ success: false, message: guardia.message }, { status: guardia.status });
    }

    try {
        /* La foto NO se trae en el listado: son 55 copas y ligas y mandarlas todas en
           base64 haría la respuesta de varios MB. Solo viaja si la hay y cuándo cambió;
           la imagen la pide el navegador por /api/copas-ligas/foto, que sí se cachea. */
        const [ligas] = (await pool.query(
            `SELECT L.IdLiga,
                    L.Liga,
                    COALESCE(L.IdTipoLiga, 1) AS IdTipoLiga,
                    COALESCE(L.Status, 0)     AS Status,
                    CASE WHEN L.Foto IS NOT NULL AND L.Foto <> '' THEN 1 ELSE 0 END AS TieneFoto,
                    DATE_FORMAT(L.FechaAct, '%Y%m%d%H%i%s') AS FotoVersion,
                    COALESCE(C.n, 0) AS Convocatorias
               FROM tblLigas L
               LEFT JOIN (
                   SELECT IdLiga, COUNT(*) AS n
                   FROM tblConvocatorias
                   WHERE Status = 0
                     AND IdTemporada = (SELECT IdTemporada FROM tblTemporadas WHERE EsActiva = 1 LIMIT 1)
                   GROUP BY IdLiga
               ) C ON C.IdLiga = L.IdLiga
              ORDER BY L.Liga ASC`,
        )) as [FilaLiga[], unknown];

        /* Los conceptos cobrables de TODAS las copas y ligas en una sola consulta: una
           por fila convertiría la pantalla en 55 viajes a la base. */
        const [productos] = (await pool.query(
            `SELECT IdProducto, Producto, Precio, COALESCE(Status, 0) AS Status, IdLiga
               FROM tblProductos
              WHERE IdLiga IS NOT NULL AND IdTipoProducto IN (3, 4)
              ORDER BY Producto ASC`,
        )) as [Array<ProductoCopaLiga & { IdLiga: number }>, unknown];

        const porLiga = new Map<number, ProductoCopaLiga[]>();
        for (const p of productos) {
            const lista = porLiga.get(p.IdLiga) ?? [];
            lista.push({
                IdProducto: p.IdProducto,
                Producto: p.Producto,
                Precio: Number(p.Precio) || 0,
                Status: Number(p.Status) || 0,
            });
            porLiga.set(p.IdLiga, lista);
        }

        const data: CopaLigaRow[] = ligas.map((l) => ({
            ...l,
            productos: porLiga.get(l.IdLiga) ?? [],
        }));

        return NextResponse.json({ success: true, data });
    } catch (error) {
        console.error('Error al obtener el catálogo de copas y ligas:', error);
        return NextResponse.json(
            { success: false, message: 'Error al obtener el catálogo de copas y ligas' },
            { status: 500 },
        );
    }
}

/**
 * Alta de una copa o liga, con su primer concepto cobrable si se indicó precio.
 *
 * El alta escribe en dos tablas y NO se puede envolver en una transacción: tblLigas y
 * tblProductos son MyISAM, donde BEGIN/ROLLBACK se aceptan pero no hacen nada. Por eso,
 * si el concepto cobrable falla, la copa recién creada se borra a mano: dejarla a
 * medias la mostraría en el catálogo como si estuviera lista para cobrar.
 */
export async function POST(request: Request) {
    const guardia = await requiereAlgunaPagina(CLAVES_CATALOGO);
    if (!guardia.ok) {
        return NextResponse.json({ success: false, message: guardia.message }, { status: guardia.status });
    }

    try {
        const datos = crearCopaLigaSchema.parse(await request.json());

        const [repetida] = (await pool.query(
            'SELECT IdLiga FROM tblLigas WHERE UPPER(TRIM(Liga)) = UPPER(?) LIMIT 1',
            [datos.nombre],
        )) as [Array<{ IdLiga: number }>, unknown];
        if (repetida.length > 0) {
            return NextResponse.json(
                { success: false, message: 'Ya existe una copa o liga con ese nombre.' },
                { status: 409 },
            );
        }

        const [res] = (await pool.query(
            `INSERT INTO tblLigas (Liga, IdTipoLiga, TipoLiga, Foto, Status, FechaAct)
             VALUES (?, ?, ?, ?, ?, NOW())`,
            [datos.nombre, datos.idTipoLiga, etiquetaTipo(datos.idTipoLiga), datos.foto || null, VIGENTE],
        )) as [{ insertId: number }, unknown];
        const idLiga = res.insertId;

        if (datos.precio !== undefined) {
            try {
                await insertaProducto(pool, {
                    idLiga,
                    idTipoLiga: datos.idTipoLiga,
                    concepto: datos.conceptoPrecio?.trim() || datos.nombre,
                    precio: datos.precio,
                });
            } catch (error) {
                // Deshacer a mano lo que la base no deshace sola (ver el comentario de arriba).
                await pool.query('DELETE FROM tblLigas WHERE IdLiga = ?', [idLiga]);
                throw error;
            }
        }

        return NextResponse.json({ success: true, idLiga });
    } catch (error) {
        if (error instanceof z.ZodError) {
            return NextResponse.json({ success: false, message: error.issues[0].message }, { status: 400 });
        }
        console.error('Error al crear la copa o liga:', error);
        return NextResponse.json({ success: false, message: 'Error al crear la copa o liga' }, { status: 500 });
    }
}
