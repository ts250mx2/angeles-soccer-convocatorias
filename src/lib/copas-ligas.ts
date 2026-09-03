import { z } from 'zod';

/**
 * Catálogo de Copas y Ligas: reglas compartidas entre el servidor y la pantalla.
 *
 * Una copa o liga vive en dos tablas y hay que entender el reparto para no romper nada:
 *
 *   tblLigas     La identidad: nombre, si es COPA o LIGA, y la foto. Es a lo que
 *                apuntan las convocatorias (tblConvocatorias.IdLiga).
 *   tblProductos El dinero: cada concepto cobrable de esa copa o liga, con su precio.
 *                Una misma liga puede tener varios (DESTACA cobra distinto el FUT 3 que
 *                el FUT 7; COPA DALLAS cobra aparte el transporte).
 *
 * Por eso el catálogo edita el nombre, el tipo y la foto en la ficha, y los precios
 * concepto por concepto: meter "el precio de la liga" en un solo campo obligaría a
 * inventar cuál de los cinco es el bueno.
 *
 * Los precios NO se sellan por temporada, y es a propósito: así están capturados hoy
 * (IdTemporada = 0 en 95 de 97 productos) y así los lee el cobro de convocatorias, que
 * no filtra por temporada. Sellarlos aquí dejaría dos precios vigentes para la misma
 * liga y el cobro tomaría cualquiera de los dos.
 */

/** tblLigas.IdTipoLiga */
export const TIPO_LIGA = 1;
export const TIPO_COPA = 2;

/** tblProductos.IdTipoProducto */
export const TIPO_PRODUCTO_LIGA = 3;
export const TIPO_PRODUCTO_COPA = 4;

/** Status que usa el sistema de escritorio: 0 = vigente, 2 = baja. */
export const VIGENTE = 0;
export const BAJA = 2;

export type TipoCopaLiga = 'LIGA' | 'COPA';

export const esCopa = (idTipoLiga: number | null | undefined): boolean =>
    Number(idTipoLiga) === TIPO_COPA;

export const etiquetaTipo = (idTipoLiga: number | null | undefined): TipoCopaLiga =>
    esCopa(idTipoLiga) ? 'COPA' : 'LIGA';

/** El tipo de producto que le corresponde a una copa o liga. */
export const tipoProductoDe = (idTipoLiga: number | null | undefined): number =>
    esCopa(idTipoLiga) ? TIPO_PRODUCTO_COPA : TIPO_PRODUCTO_LIGA;

/**
 * Tope del tamaño de la foto ya en base64. La pantalla la reduce antes de mandarla
 * (ver `imagenADataUrl`), así que llegar aquí arriba del tope significa que algo se
 * saltó ese paso. 1.5 MB de texto son ~1.1 MB de imagen: de sobra para un escudo, y
 * lejos del max_allowed_packet del servidor.
 */
export const MAX_FOTO_BASE64 = 1_500_000;

/** Formatos que el navegador sabe pintar y que aceptamos guardar. */
export const FORMATOS_FOTO = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'] as const;

const RE_DATA_URL = /^data:(image\/(?:png|jpeg|webp|gif));base64,([A-Za-z0-9+/]+={0,2})$/;

/** Parte una foto en data URI. Devuelve null si no lo es o si el formato no se acepta. */
export function parseFoto(dataUrl: string): { mime: string; base64: string } | null {
    const m = RE_DATA_URL.exec(dataUrl.trim());
    if (!m) return null;
    return { mime: m[1], base64: m[2] };
}

/**
 * Foto como data URI. Se valida el formato de verdad (no solo el prefijo) porque este
 * texto termina sirviéndose como imagen desde /api/copas-ligas/foto.
 * Cadena vacía = quitar la foto.
 */
const fotoSchema = z
    .string()
    .max(MAX_FOTO_BASE64, 'La imagen es demasiado grande. Usa una más pequeña.')
    .refine((v) => v === '' || parseFoto(v) !== null, 'Formato de imagen no válido. Usa PNG, JPG, WEBP o GIF.');

/** El nombre es varchar(45) en la base; recortarlo aquí evita un truncado silencioso. */
const nombreSchema = z
    .string()
    .trim()
    .min(3, 'El nombre debe tener al menos 3 caracteres')
    .max(45, 'El nombre no puede pasar de 45 caracteres');

const precioSchema = z
    .number({ message: 'El precio debe ser un número' })
    .min(0, 'El precio no puede ser negativo')
    .max(9_999_999, 'El precio es demasiado alto');

const tipoSchema = z.union([z.literal(TIPO_LIGA), z.literal(TIPO_COPA)], {
    message: 'Indica si es COPA o LIGA',
});

export const crearCopaLigaSchema = z.object({
    nombre: nombreSchema,
    idTipoLiga: tipoSchema,
    foto: fotoSchema.optional(),
    /** Primer concepto cobrable. Sin él la copa o liga existe pero no se puede cobrar. */
    precio: precioSchema.optional(),
    conceptoPrecio: z.string().trim().max(45).optional(),
});

export const actualizarCopaLigaSchema = z.object({
    nombre: nombreSchema.optional(),
    idTipoLiga: tipoSchema.optional(),
    foto: fotoSchema.optional(),
    status: z.union([z.literal(VIGENTE), z.literal(BAJA)]).optional(),
});

export const crearProductoSchema = z.object({
    concepto: z.string().trim().min(3, 'El concepto debe tener al menos 3 caracteres').max(45),
    precio: precioSchema,
});

export const actualizarProductoSchema = z.object({
    concepto: z.string().trim().min(3, 'El concepto debe tener al menos 3 caracteres').max(45).optional(),
    precio: precioSchema.optional(),
    status: z.union([z.literal(VIGENTE), z.literal(BAJA)]).optional(),
});

/** Un concepto cobrable de la copa o liga. */
export interface ProductoCopaLiga {
    IdProducto: number;
    Producto: string;
    Precio: number;
    Status: number;
}

/**
 * URL del escudo de una copa o liga, o null si no tiene.
 *
 * El sello `?v=` es la FechaAct de la liga: la respuesta se cachea como inmutable, así
 * que sin el sello un escudo cambiado no se vería hasta que el navegador soltara el
 * viejo por su cuenta. Vive aquí porque lo pintan el catálogo, Convocatorias y los
 * adeudos de convocatorias, y tres copias de la misma cadena acaban divergiendo.
 */
export const urlEscudo = (
    liga: { IdLiga: number; TieneFoto?: number | null; FotoVersion?: string | null },
): string | null =>
    Number(liga.TieneFoto) === 1
        ? `/api/copas-ligas/foto/${liga.IdLiga}?v=${liga.FotoVersion ?? '0'}`
        : null;

/** Fila del catálogo. La foto NO viaja aquí: se pide aparte por /api/copas-ligas/foto. */
export interface CopaLigaRow {
    IdLiga: number;
    Liga: string;
    IdTipoLiga: number;
    Status: number;
    TieneFoto: number;
    /** Sello para romper el caché del navegador cuando la foto cambia. */
    FotoVersion: string | null;
    /** Convocatorias de la temporada activa que usan esta copa o liga. */
    Convocatorias: number;
    productos: ProductoCopaLiga[];
}

export const money = (n: number): string =>
    `$${Number(n ?? 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
