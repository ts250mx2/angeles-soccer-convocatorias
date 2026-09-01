/**
 * Reducir una imagen en el navegador ANTES de mandarla al servidor.
 *
 * Lo que sale de un celular o de una cámara pesa varios MB, y estas imágenes se guardan
 * dentro de la base (tblLigas.Foto, tblJugadores.Foto), así que sin este paso cada
 * consulta las arrastraría. Se reduce y se recomprime aquí, que es donde está el
 * canvas, y viaja ya como data URI.
 *
 * Vive en su propio archivo porque lo comparten el escudo de las copas y ligas y la
 * foto del jugador, que necesitan tamaños distintos pero exactamente el mismo trabajo.
 */

/** Formatos que el navegador sabe pintar y que aceptamos guardar. */
export const FORMATOS_IMAGEN = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'] as const;

/**
 * Reduce la imagen a `maxLado` por su lado mayor y la devuelve como data URI.
 *
 * Se pide WEBP porque conserva la transparencia y pesa bastante menos que PNG. Si el
 * navegador no sabe escribirlo, `toDataURL` devuelve PNG por su cuenta: los dos están
 * entre los formatos aceptados, así que no hay que detectar nada.
 *
 * Con `recorte` la imagen se recorta a un cuadrado centrado antes de reducirse. Es lo
 * que quiere una foto de credencial: encuadra la cara en vez de dejar una panorámica
 * con el niño en una esquina.
 */
export async function imagenADataUrl(
    archivo: Blob,
    { maxLado = 512, calidad = 0.9, recorte = 'ninguno' as 'ninguno' | 'cuadrado' } = {},
): Promise<string> {
    const url = URL.createObjectURL(archivo);
    try {
        const img = await new Promise<HTMLImageElement>((resolve, reject) => {
            const el = new Image();
            el.onload = () => resolve(el);
            el.onerror = () => reject(new Error('No se pudo leer la imagen'));
            el.src = url;
        });
        return dibujaADataUrl(img, img.width, img.height, { maxLado, calidad, recorte });
    } finally {
        URL.revokeObjectURL(url);
    }
}

/**
 * El mismo trabajo, pero a partir de algo que ya está pintado: un `<video>` de la
 * cámara o un `<canvas>`. Se separa porque de un video no hay Blob que revocar y el
 * tamaño real no está en `width` sino en `videoWidth`.
 */
export function dibujaADataUrl(
    fuente: CanvasImageSource,
    anchoReal: number,
    altoReal: number,
    { maxLado = 512, calidad = 0.9, recorte = 'ninguno' as 'ninguno' | 'cuadrado' } = {},
): string {
    /* El recuadro de la fuente que se va a copiar. Para el cuadrado se toma el lado
       menor, centrado: recortar por los lados sobra imagen, no la deforma. */
    const lado = Math.min(anchoReal, altoReal);
    const origen =
        recorte === 'cuadrado'
            ? { x: (anchoReal - lado) / 2, y: (altoReal - lado) / 2, w: lado, h: lado }
            : { x: 0, y: 0, w: anchoReal, h: altoReal };

    const escala = Math.min(1, maxLado / Math.max(origen.w, origen.h));
    const ancho = Math.max(1, Math.round(origen.w * escala));
    const alto = Math.max(1, Math.round(origen.h * escala));

    const canvas = document.createElement('canvas');
    canvas.width = ancho;
    canvas.height = alto;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('No se pudo procesar la imagen');
    ctx.drawImage(fuente, origen.x, origen.y, origen.w, origen.h, 0, 0, ancho, alto);

    return canvas.toDataURL('image/webp', calidad);
}

/** ¿Este archivo es una imagen de las que aceptamos? */
export const esImagenAceptada = (tipo: string): boolean =>
    (FORMATOS_IMAGEN as readonly string[]).includes(tipo);
