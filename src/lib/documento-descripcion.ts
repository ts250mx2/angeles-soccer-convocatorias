import Anthropic from '@anthropic-ai/sdk';
import { anthropic } from '@/lib/anthropic';
import { familiaDeMime } from '@/lib/jugador-documentos';
import { textoParaDescribir } from '@/lib/documento-texto';

/**
 * Qué es este documento, dicho en un renglón, leyendo el archivo.
 *
 * La carpeta de documentos de un jugador se llena de archivos con nombres como
 * `IMG_20260904_113052.jpg` o `escaneo (3).pdf`. Con veinte así, encontrar el acta de
 * nacimiento es abrirlos de uno en uno. Esto los abre una sola vez, al subirlos, y deja
 * escrito qué son.
 *
 * La descripción es una PROPUESTA, no un dato duro: se guarda en el mismo campo que se
 * escribe a mano y se puede corregir o borrar. Por eso el modelo tiene instrucciones de
 * decir "no se distingue" en vez de adivinar: una descripción inventada es peor que
 * ninguna, porque nadie vuelve a abrir el archivo para comprobarla.
 *
 * ── Cómo lee cada tipo ──
 *
 *   Imagen y PDF van tal cual a la API, que los lee de forma nativa (bloques `image` y
 *   `document`). Es lo que hace que funcione con un acta escaneada.
 *
 *   Word y Excel no: hay que sacarles el texto aquí antes (ver @/lib/documento-texto).
 *
 *   El .heic queda fuera aunque se pueda subir: la API no lo acepta como imagen. Y los
 *   Office viejos (.doc, .xls binario) tampoco se leen. En ambos casos se devuelve null
 *   y la descripción se escribe a mano, que es como estaba antes de todo esto.
 */

/** El mismo modelo que ya usa el análisis de adeudos, y por la misma variable. */
const MODELO = process.env.ANTHROPIC_MODEL_OPUS || 'claude-opus-5';

/** Un renglón: no hay espacio para más en la lista, y de más largo nadie lo lee. */
const MAX_LARGO = 160;

/** Los tipos de imagen que la API acepta. El heic se sube, pero no se describe. */
const IMAGENES_QUE_LEE = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];

const SYSTEM = `Eres el asistente de un club de futbol infantil (Ángeles Soccer) en México.
Te dan un documento del expediente de un jugador y dices QUÉ ES, en una sola línea.

Reglas:
- Máximo 120 caracteres, en español, sin punto final.
- Empieza por el tipo de documento en mayúsculas y luego el dato que lo identifica.
  Ejemplos: "ACTA DE NACIMIENTO de Juan Pérez López, registrada en Monterrey 2015",
  "CURP de María Fernanda Ruiz", "INE de la madre, Ana Gómez",
  "CERTIFICADO MÉDICO expedido en agosto 2026", "COMPROBANTE DE DOMICILIO, recibo de luz".
- Si no logras distinguir qué es, responde exactamente: No se distingue el contenido
- NUNCA inventes nombres, fechas ni folios: si no se leen, descríbelo sin ellos.
- No agregues comillas, comentarios ni explicaciones. Solo la línea.`;

const PREGUNTA = '¿Qué documento es este? Responde en una sola línea, según las reglas.';

/** ¿Se puede intentar leer este tipo de archivo? */
export function sePuedeDescribir(mime: string): boolean {
    const familia = familiaDeMime(mime);
    if (familia === 'imagen') return IMAGENES_QUE_LEE.includes(String(mime).toLowerCase());
    if (familia === 'pdf') return true;
    // Word y Excel: solo los modernos, que son ZIP. Se confirma al sacarles el texto.
    return String(mime).includes('openxmlformats') || String(mime).includes('ms-excel');
}

/** ¿Está configurada la llave? Sin ella la función no sirve y conviene decirlo distinto. */
export const hayLlaveDeIa = (): boolean => !!process.env.ANTHROPIC_API_KEY;

/**
 * Describe el documento, o devuelve null si no hay nada legible dentro.
 *
 * Lanza si la API falla: quien llama decide si eso es un error que se enseña o un
 * silencio (al subir en lote, un fallo no debe tumbar la subida).
 */
export async function describeDocumento(
    archivo: Buffer,
    mime: string,
    nombre: string,
): Promise<string | null> {
    const familia = familiaDeMime(mime);
    const contenido: Anthropic.ContentBlockParam[] = [];

    if (familia === 'imagen') {
        if (!IMAGENES_QUE_LEE.includes(String(mime).toLowerCase())) return null;
        contenido.push({
            type: 'image',
            source: {
                type: 'base64',
                media_type: mime as 'image/png' | 'image/jpeg' | 'image/webp' | 'image/gif',
                data: archivo.toString('base64'),
            },
        });
    } else if (familia === 'pdf') {
        /* El bloque de documento va ANTES del texto: es lo que recomienda la API para
           que la pregunta se lea sobre el documento y no al revés. */
        contenido.push({
            type: 'document',
            source: { type: 'base64', media_type: 'application/pdf', data: archivo.toString('base64') },
        });
    } else {
        const { texto, recortado } = textoParaDescribir(archivo, mime);
        if (!texto) return null;
        contenido.push({
            type: 'text',
            text:
                `Archivo: ${nombre}\n` +
                (recortado ? 'Esto es SOLO EL PRINCIPIO del documento:\n' : 'Contenido del documento:\n') +
                `\n${texto}`,
        });
    }

    contenido.push({ type: 'text', text: PREGUNTA });

    const respuesta = await anthropic.messages.create({
        model: MODELO,
        max_tokens: 512,
        system: SYSTEM,
        messages: [{ role: 'user', content: contenido }],
        /* Tarea corta y acotada: no hace falta que piense de más, y esto se dispara una
           vez por cada archivo que alguien sube. */
        output_config: { effort: 'low' },
    } as Anthropic.MessageCreateParamsNonStreaming);

    /* El modelo puede negarse (documento de identidad de un menor, por ejemplo). No es
       un error: se deja sin descripción y se escribe a mano. */
    if (respuesta.stop_reason === 'refusal') return null;

    const texto = respuesta.content
        .filter((b): b is Anthropic.TextBlock => b.type === 'text')
        .map((b) => b.text)
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim();

    if (!texto || /^no se distingue/i.test(texto)) return null;
    return texto.slice(0, MAX_LARGO);
}
