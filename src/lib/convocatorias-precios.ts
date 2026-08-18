import type { Pool, PoolConnection } from 'mysql2/promise';

/**
 * Precios de convocatoria fijados a mano.
 *
 * El precio de un convocado sale del producto de la liga con su BecaLigas aplicada, y
 * la pantalla lo pone al corriente en cada visita (ver `sincronizarPrecios`) para que un
 * cambio de tarifa alcance a las convocatorias vigentes. Ese automatismo pisaba los
 * ajustes manuales: el precio especial de un jugador duraba hasta la siguiente carga de
 * la categoría.
 *
 * Aquí vive la memoria de esos ajustes. La regla es una sola y se aplica en todos lados:
 *
 *   - Cambiar el precio de un jugador a algo distinto de lo que dice el sistema deja su
 *     marca; nada automático vuelve a tocarlo (ni el sincronizado, ni convocarlo).
 *   - Ponerle exactamente el precio del sistema borra la marca: así se regresa al
 *     automático sin necesidad de una pantalla aparte.
 *
 * La marca vive en tabla aparte y no como columna de tblDetalleConvocatorias porque esa
 * tabla la comparte el sistema de escritorio.
 */

/** El pool o una conexión dentro de una transacción. */
type Ejecutor = Pool | PoolConnection;

export const TABLA_PRECIOS_MANUALES = 'tblConvocatoriasPreciosManuales';

/** Renglón del detalle de una convocatoria: la llave que identifica un precio. */
export interface ClavePrecio {
    idJugador: number | string;
    seasonId: number | string;
    leagueId: number | string;
    categoria: string;
    color: string;
}

const valoresDeClave = (c: ClavePrecio) => [c.idJugador, c.seasonId, c.leagueId, c.categoria, c.color ?? ''];

const CONDICION_CLAVE =
    'IdJugador = ? AND IdTemporada = ? AND IdLiga = ? AND Categoria = ? AND COALESCE(Color, \'\') = ?';

/**
 * Diferencia por debajo de la cual dos precios se consideran el mismo. `Precio` es un
 * double, así que comparar con `=` haría que un centavo de redondeo se leyera como un
 * ajuste manual.
 */
const TOLERANCIA = 0.005;

/* Si la migración todavía no se aplica, todo esto se comporta como antes en vez de
   tronar. Se recuerda solo el caso bueno: mientras falte la tabla se vuelve a mirar, y
   así aplicarla surte efecto sin reiniciar el servidor. */
let tablaConfirmada = false;

/** ¿Está aplicada migrations/010-precios-manuales-convocatorias.sql? */
export async function preciosManualesDisponibles(db: Ejecutor): Promise<boolean> {
    if (tablaConfirmada) return true;
    const [filas] = (await db.query('SHOW TABLES LIKE ?', [TABLA_PRECIOS_MANUALES])) as [unknown[], unknown];
    tablaConfirmada = filas.length > 0;
    if (!tablaConfirmada) {
        console.warn(
            `[convocatorias] Falta ${TABLA_PRECIOS_MANUALES}: aplica migrations/010-precios-manuales-convocatorias.sql. ` +
            'Mientras tanto, el sincronizado sigue pisando los precios ajustados a mano.',
        );
    }
    return tablaConfirmada;
}

/**
 * LEFT JOIN contra la tabla de marcas. `alias` es el de tblDetalleConvocatorias; el
 * renglón está marcado cuando `<aliasManual>.IdJugador` no es NULL.
 */
export const joinPrecioManual = (alias: string, aliasManual = 'MAN'): string => `
    LEFT JOIN ${TABLA_PRECIOS_MANUALES} ${aliasManual}
           ON ${aliasManual}.IdJugador   = ${alias}.IdJugador
          AND ${aliasManual}.IdTemporada = ${alias}.IdTemporada
          AND ${aliasManual}.IdLiga      = ${alias}.IdLiga
          AND ${aliasManual}.Categoria   = ${alias}.Categoria
          AND ${aliasManual}.Color       = ${alias}.Color`;

/** Marca el precio de un jugador como fijado a mano. */
export async function fijaPrecioManual(db: Ejecutor, clave: ClavePrecio): Promise<void> {
    await db.query(
        `REPLACE INTO ${TABLA_PRECIOS_MANUALES}
            (IdJugador, IdTemporada, IdLiga, Categoria, Color, FechaAct)
         VALUES (?, ?, ?, ?, ?, NOW())`,
        valoresDeClave(clave),
    );
}

/** Devuelve el jugador al precio automático. */
export async function liberaPrecioManual(db: Ejecutor, clave: ClavePrecio): Promise<void> {
    await db.query(`DELETE FROM ${TABLA_PRECIOS_MANUALES} WHERE ${CONDICION_CLAVE}`, valoresDeClave(clave));
}

/** Olvida las marcas de una convocatoria completa (se eliminó, o cambió de color). */
export async function olvidaPreciosDeConvocatoria(
    db: Ejecutor,
    seasonId: number | string,
    leagueId: number | string,
    categoria: string,
    color: string,
): Promise<void> {
    if (!(await preciosManualesDisponibles(db))) return;
    await db.query(
        `DELETE FROM ${TABLA_PRECIOS_MANUALES}
         WHERE IdTemporada = ? AND IdLiga = ? AND Categoria = ? AND COALESCE(Color, '') = ?`,
        [seasonId, leagueId, categoria, color ?? ''],
    );
}

/** Mueve las marcas cuando una convocatoria cambia de color (el color es parte de la llave). */
export async function mueveColorDePreciosManuales(
    db: Ejecutor,
    seasonId: number | string,
    leagueId: number | string,
    categoria: string,
    colorViejo: string,
    colorNuevo: string,
): Promise<void> {
    if (!(await preciosManualesDisponibles(db))) return;
    await db.query(
        `UPDATE ${TABLA_PRECIOS_MANUALES} SET Color = ?
         WHERE IdTemporada = ? AND IdLiga = ? AND Categoria = ? AND COALESCE(Color, '') = ?`,
        [colorNuevo ?? '', seasonId, leagueId, categoria, colorViejo ?? ''],
    );
}

/** ¿Este jugador trae precio fijado a mano? */
export async function tienePrecioManual(db: Ejecutor, clave: ClavePrecio): Promise<boolean> {
    if (!(await preciosManualesDisponibles(db))) return false;
    const [filas] = (await db.query(
        `SELECT 1 FROM ${TABLA_PRECIOS_MANUALES} WHERE ${CONDICION_CLAVE} LIMIT 1`,
        valoresDeClave(clave),
    )) as [unknown[], unknown];
    return filas.length > 0;
}

/**
 * Precio que el sistema le pone a este jugador en esta liga: el del producto con su
 * BecaLigas aplicada. `null` cuando la liga no tiene producto con precio.
 *
 * Es el mismo cálculo que hace `sincronizarPrecios`, en un solo lugar: si los dos
 * difirieran, un precio "igual al del sistema" quedaría marcado como manual para
 * siempre.
 */
export async function precioDelSistema(
    db: Ejecutor,
    leagueId: number | string,
    playerId: number | string,
): Promise<number | null> {
    const [filas] = (await db.query(
        `SELECT ROUND(MAX(PR.Precio) * (1 - LEAST(GREATEST(COALESCE(J.BecaLigas, 0), 0), 100) / 100), 2) AS Precio
         FROM tblProductos PR
         CROSS JOIN tblJugadores J
         WHERE PR.IdLiga = ? AND PR.IdTipoProducto IN (3, 4) AND J.IdJugador = ?`,
        [leagueId, playerId],
    )) as [Array<{ Precio: number | null }>, unknown];
    const precio = filas[0]?.Precio;
    return precio === undefined || precio === null ? null : Number(precio);
}

/** ¿El precio capturado es un ajuste, o es justo el que pondría el sistema? */
export const esAjusteManual = (precio: number, sistema: number | null): boolean =>
    sistema === null || Math.abs(precio - sistema) > TOLERANCIA;
