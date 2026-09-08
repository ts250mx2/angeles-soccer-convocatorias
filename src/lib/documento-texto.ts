import zlib from 'node:zlib';
import * as XLSX from 'xlsx';

/**
 * Saca el TEXTO de un Word o de un Excel, para poder describir de qué trata.
 *
 * La API de Claude lee imágenes y PDF por su cuenta —se le mandan tal cual—, pero un
 * .docx o un .xlsx no: son archivos ZIP con XML dentro y hay que abrirlos aquí. Eso es
 * todo lo que hace este archivo; quien decide qué hacer con el texto es
 * @/lib/documento-descripcion.
 *
 * NO es un convertidor fiel: no respeta tablas, ni estilos, ni el orden de las cajas de
 * texto. Lo que devuelve es suficiente para saber que un documento es un acta de
 * nacimiento y no una lista de asistencia, que es para lo único que se usa.
 *
 * Los formatos VIEJOS de Office (.doc y .xls binario de los noventa) no se leen: .doc no
 * es ZIP sino un formato binario compuesto, y traer una librería para desenterrarlo no se
 * justifica por un renglón de descripción. Esos documentos se suben igual, solo que su
 * descripción se escribe a mano.
 */

/** Nada de tomar un archivo entero: con el principio alcanza para saber qué es. */
const MAX_CARACTERES = 12000;

/* ── ZIP, lo mínimo para sacar UNA entrada ──
 *
 * Un .docx es un ZIP y todo el texto vive en `word/document.xml`. Se lee por el
 * DIRECTORIO CENTRAL del final del archivo y no buscando cabeceras locales por el
 * camino, porque cuando Word escribe con "descriptor de datos" los tamaños de la
 * cabecera local vienen en cero y ahí no hay forma de saber dónde termina la entrada.
 * El directorio central siempre los trae bien.
 *
 * Se hace a mano y sin dependencia nueva: son treinta líneas para una sola entrada, y la
 * única librería de ZIP que hay en node_modules llegó como dependencia de exceljs, así
 * que apoyarse en ella es apoyarse en algo que nadie prometió que seguiría estando.
 */

const FIRMA_FIN_DIRECTORIO = 0x06054b50;
const FIRMA_ENTRADA_DIRECTORIO = 0x02014b50;

/** Dónde empieza el directorio central, o -1 si esto no parece un ZIP. */
function buscaFinDeDirectorio(zip: Buffer): number {
    /* El registro final mide 22 bytes y puede llevar hasta 64 KB de comentario detrás,
       así que se busca hacia atrás desde el final. */
    const desde = Math.max(0, zip.length - 22 - 0xffff);
    for (let i = zip.length - 22; i >= desde; i--) {
        if (zip.readUInt32LE(i) === FIRMA_FIN_DIRECTORIO) return i;
    }
    return -1;
}

/** El contenido de una entrada del ZIP por su nombre exacto, o null si no está. */
function entradaDeZip(zip: Buffer, nombre: string): Buffer | null {
    const fin = buscaFinDeDirectorio(zip);
    if (fin < 0) return null;

    const cuantas = zip.readUInt16LE(fin + 10);
    let p = zip.readUInt32LE(fin + 16);

    for (let i = 0; i < cuantas && p + 46 <= zip.length; i++) {
        if (zip.readUInt32LE(p) !== FIRMA_ENTRADA_DIRECTORIO) return null;

        const metodo = zip.readUInt16LE(p + 10);
        const comprimido = zip.readUInt32LE(p + 20);
        const largoNombre = zip.readUInt16LE(p + 28);
        const largoExtra = zip.readUInt16LE(p + 30);
        const largoComentario = zip.readUInt16LE(p + 32);
        const inicioLocal = zip.readUInt32LE(p + 42);
        const nombreEntrada = zip.toString('utf8', p + 46, p + 46 + largoNombre);

        if (nombreEntrada === nombre) {
            /* La cabecera local mide 30 bytes y trae SUS propios largos de nombre y
               extra, que no tienen por qué coincidir con los del directorio. */
            const nomLocal = zip.readUInt16LE(inicioLocal + 26);
            const extraLocal = zip.readUInt16LE(inicioLocal + 28);
            const datos = inicioLocal + 30 + nomLocal + extraLocal;
            const trozo = zip.subarray(datos, datos + comprimido);
            // 0 = guardado tal cual, 8 = deflate. Word usa deflate; el resto no se maneja.
            if (metodo === 0) return Buffer.from(trozo);
            if (metodo === 8) return zlib.inflateRawSync(trozo);
            return null;
        }

        p += 46 + largoNombre + largoExtra + largoComentario;
    }
    return null;
}

/**
 * Quita las etiquetas XML y deja el texto, con un salto por párrafo.
 *
 * Las entidades se deshacen en un orden que importa: primero las numéricas y las con
 * nombre, y `&amp;` AL FINAL. Al revés, un `&amp;#233;` del documento se convertiría en
 * `&#233;` y la siguiente pasada lo leería como una 'é' que nadie escribió.
 */
function textoDeDocumentXml(xml: string): string {
    return xml
        // Cada párrafo y cada salto de línea de Word se vuelven un salto de verdad.
        .replace(/<\/w:p>/g, '\n')
        .replace(/<w:br\b[^>]*\/?>/g, '\n')
        .replace(/<w:tab\b[^>]*\/?>/g, '\t')
        .replace(/<[^>]+>/g, '')
        // '&#233;' y '&#xE9;'. Word las escribe cuando el documento no viene en UTF-8.
        .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
        .replace(/&#[xX]([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'")
        .replace(/&amp;/g, '&')
        .replace(/[ \t]+/g, ' ')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}

/** El texto de un .docx. Cadena vacía si no se pudo abrir o si no tiene texto. */
export function textoDeWord(archivo: Buffer): string {
    try {
        const xml = entradaDeZip(archivo, 'word/document.xml');
        return xml ? textoDeDocumentXml(xml.toString('utf8')) : '';
    } catch {
        return '';
    }
}

/** Hasta dónde se lee un libro: con esto se sabe de qué trata, y no cuesta una fortuna. */
const MAX_HOJAS = 5;
const MAX_RENGLONES = 60;

/**
 * El texto de un Excel: cada hoja con su nombre y sus renglones separados por comas.
 *
 * Sale por SheetJS, que ya es dependencia del proyecto y lee tanto .xlsx como el .xls
 * viejo. Se acota a las primeras hojas y renglones porque una descripción no necesita el
 * archivo entero, y un libro de veinte mil renglones no cabe en una petición razonable.
 *
 * Devuelve TAMBIÉN si se quedó a medias, y no solo el texto: lo que se recortó hay que
 * decírselo al modelo, o describirá como si hubiera visto el libro completo.
 */
export function textoDeExcel(archivo: Buffer): { texto: string; recortado: boolean } {
    try {
        const libro = XLSX.read(archivo, { type: 'buffer' });
        const partes: string[] = [];
        let recortado = libro.SheetNames.length > MAX_HOJAS;

        for (const nombre of libro.SheetNames.slice(0, MAX_HOJAS)) {
            const hoja = libro.Sheets[nombre];
            if (!hoja) continue;
            const todos = XLSX.utils.sheet_to_csv(hoja, { blankrows: false }).split('\n');
            if (todos.length > MAX_RENGLONES) recortado = true;
            const renglones = todos.slice(0, MAX_RENGLONES).join('\n').trim();
            if (renglones) partes.push(`--- Hoja: ${nombre} ---\n${renglones}`);
        }
        return { texto: partes.join('\n\n').trim(), recortado };
    } catch {
        return { texto: '', recortado: false };
    }
}

/**
 * El texto del documento acotado a lo que se le va a mandar al modelo, y si se recortó.
 *
 * Se devuelve `recortado` en vez de cortar en silencio: la descripción que se genere
 * habla del principio del archivo, y el modelo tiene que saberlo para no afirmar cosas
 * del resto. Ver cómo se usa en @/lib/documento-descripcion.
 */
export function textoParaDescribir(archivo: Buffer, mime: string): { texto: string; recortado: boolean } {
    const m = String(mime ?? '').toLowerCase();
    const { texto: crudo, recortado } = m.includes('word')
        ? { texto: textoDeWord(archivo), recortado: false }
        : m.includes('sheet') || m.includes('excel')
            ? textoDeExcel(archivo)
            : { texto: '', recortado: false };

    return crudo.length > MAX_CARACTERES
        ? { texto: crudo.slice(0, MAX_CARACTERES), recortado: true }
        : { texto: crudo, recortado };
}
