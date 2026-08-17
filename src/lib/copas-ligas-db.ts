import type { Pool, PoolConnection } from 'mysql2/promise';
import { etiquetaTipo, tipoProductoDe, VIGENTE } from '@/lib/copas-ligas';

/**
 * Escrituras del catálogo de Copas y Ligas que comparten más de una ruta.
 *
 * Vive aparte de @/lib/copas-ligas porque aquélla la importa también la pantalla, y
 * arrastrar el pool de MySQL al navegador rompería el build.
 */

/** El pool o una conexión dentro de una transacción. */
type Ejecutor = Pool | PoolConnection;

/**
 * Inserta un concepto cobrable de una copa o liga.
 *
 * Copia las MISMAS columnas que traen los productos de liga y copa ya capturados: sin
 * IVA, sin temporada (IdTemporada = 0) y sin sede. Si esto se apartara de esa forma, el
 * concepto nuevo se comportaría distinto al resto en el cobro y en los reportes de
 * ventas, que agrupan por esas columnas.
 */
export async function insertaProducto(
    db: Ejecutor,
    p: { idLiga: number; idTipoLiga: number; concepto: string; precio: number },
): Promise<number> {
    const [res] = (await db.query(
        `INSERT INTO tblProductos
            (Producto, Precio, Iva, IdTipoProducto, TipoProducto, IdTemporada, IdLiga,
             IdSede, AceptaDolares, Costo, EsClinics, Status, FechaAct)
         VALUES (?, ?, 0, ?, ?, 0, ?, 0, 0, 0, 0, ?, NOW())`,
        [
            p.concepto, p.precio, tipoProductoDe(p.idTipoLiga), etiquetaTipo(p.idTipoLiga),
            p.idLiga, VIGENTE,
        ],
    )) as [{ insertId: number }, unknown];
    return res.insertId;
}
