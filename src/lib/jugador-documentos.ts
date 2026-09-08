/**
 * Qué se puede guardar en la carpeta de documentos de un jugador, y cómo se nombra.
 *
 * Lo comparten el servidor y la pantalla para que digan lo mismo: si el navegador
 * aceptara un tipo que la API rechaza, el usuario elegiría el archivo, esperaría la
 * subida y hasta entonces se enteraría. Ver migrations/028-documentos-jugador.sql.
 *
 * ── Por qué manda la EXTENSIÓN y no el tipo que declara el navegador ──
 *
 * El `type` de un File no es de fiar: Windows sin Office instalado manda un .docx como
 * `application/octet-stream`, y algunos navegadores mandan cadena vacía. Si la reja
 * fuera el MIME, media oficina no podría subir un Word. Así que decide la extensión, que
 * es lo que el usuario ve, y el MIME solo se usa para corroborar cuando viene y es de
 * los conocidos.
 *
 * Esto NO es una comprobación de seguridad —nadie está garantizando que un .pdf tenga
 * dentro un PDF—, es una reja de formato. La seguridad al servir está en la ruta de
 * descarga: `nosniff` siempre, y solo imagen y PDF se abren dentro del navegador.
 */

/** Las cuatro familias que se pidieron. La familia decide el ícono y cómo se sirve. */
export type FamiliaDocumento = 'imagen' | 'pdf' | 'word' | 'excel';

interface Formato {
    familia: FamiliaDocumento;
    /** El MIME con el que se guarda y se sirve, sin importar lo que dijera el navegador. */
    mime: string;
}

/** Extensión (sin punto) → cómo se trata. Es la lista blanca completa. */
export const FORMATOS: Readonly<Record<string, Formato>> = {
    png: { familia: 'imagen', mime: 'image/png' },
    jpg: { familia: 'imagen', mime: 'image/jpeg' },
    jpeg: { familia: 'imagen', mime: 'image/jpeg' },
    webp: { familia: 'imagen', mime: 'image/webp' },
    gif: { familia: 'imagen', mime: 'image/gif' },
    heic: { familia: 'imagen', mime: 'image/heic' },
    pdf: { familia: 'pdf', mime: 'application/pdf' },
    doc: { familia: 'word', mime: 'application/msword' },
    docx: {
        familia: 'word',
        mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    },
    xls: { familia: 'excel', mime: 'application/vnd.ms-excel' },
    xlsx: {
        familia: 'excel',
        mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    },
};

/**
 * Tope por archivo. 10 MB es de sobra para un acta escaneada o una foto de credencial, y
 * queda lejos del `max_allowed_packet` del servidor (64 MB), que es el techo duro: un
 * archivo por encima de eso no se puede ni mandar a MySQL, y el error que sale no dice
 * nada útil.
 *
 * Se cuenta sobre los bytes del archivo, no sobre el cuerpo de la petición: el multipart
 * agrega algo de envoltura y no tiene por qué gastarse del presupuesto del usuario.
 */
export const MAX_DOCUMENTO_BYTES = 10 * 1024 * 1024;

/** Cuántos documentos puede tener un jugador. Es una carpeta, no un archivero. */
export const MAX_DOCUMENTOS_POR_JUGADOR = 50;

/** Para el `accept` del input: '.png,.jpg,...'. */
export const ACEPTA_ARCHIVOS = Object.keys(FORMATOS)
    .map((ext) => `.${ext}`)
    .join(',');

/** 'ACTA.PDF' → 'pdf'. Cadena vacía si el nombre no trae extensión. */
export function extensionDe(nombre: string): string {
    const limpio = String(nombre ?? '').trim().toLowerCase();
    const punto = limpio.lastIndexOf('.');
    return punto > 0 && punto < limpio.length - 1 ? limpio.slice(punto + 1) : '';
}

/**
 * Cómo se va a tratar este archivo, o null si no es de los aceptados.
 *
 * Decide SOLO la extensión, y el MIME que mandó el navegador ni se consulta: es el que
 * miente (un .docx llega como `application/octet-stream` en un Windows sin Office). El
 * tipo con el que se guarda sale de esta tabla, así que un archivo subido desde dos
 * equipos distintos queda igual en la base.
 */
export function formatoDeArchivo(nombre: string): Formato | null {
    return FORMATOS[extensionDe(nombre)] ?? null;
}

/** Familia del archivo por su MIME ya guardado, para pintar la lista. */
export function familiaDeMime(mime: string): FamiliaDocumento {
    const m = String(mime ?? '').toLowerCase();
    if (m.startsWith('image/')) return 'imagen';
    if (m === 'application/pdf') return 'pdf';
    if (m.includes('word') || m === 'application/msword') return 'word';
    return 'excel';
}

/**
 * Los que el navegador sabe pintar y que es seguro abrir DENTRO de la página.
 *
 * Word y Excel nunca: no se pueden mostrar y forzarlos a `inline` solo consigue que el
 * navegador ofrezca guardarlos con un nombre peor. Un formato que el navegador
 * interpretara como HTML tampoco entraría aquí —no está en la lista blanca— porque
 * abrirlo en el mismo origen sería ejecutar lo que subió alguien más.
 */
export const seVeEnElNavegador = (mime: string): boolean => {
    const familia = familiaDeMime(mime);
    return familia === 'imagen' || familia === 'pdf';
};

/** '1.2 MB', '340 KB', '860 B'. */
export function pesoCorto(bytes: number): string {
    const n = Number(bytes) || 0;
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
    return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

/** El tope, dicho como lo diría una persona: '10 MB'. */
export const MAX_DOCUMENTO_TEXTO = pesoCorto(MAX_DOCUMENTO_BYTES);

/**
 * Por qué NO se puede subir este archivo, o null si sí se puede.
 *
 * La misma función la corre la pantalla antes de mandar nada y la API antes de guardar.
 * En la pantalla evita el viaje; en la API es la que de verdad manda, porque a una API
 * se le puede hablar sin pasar por la pantalla.
 */
export function motivoRechazo(nombre: string, bytes: number): string | null {
    if (!String(nombre ?? '').trim()) return 'El archivo no tiene nombre.';
    if (formatoDeArchivo(nombre) === null) {
        return `"${nombre}" no es de los tipos que se aceptan: imagen, PDF, Word o Excel.`;
    }
    if (bytes <= 0) return `"${nombre}" está vacío.`;
    if (bytes > MAX_DOCUMENTO_BYTES) {
        return `"${nombre}" pesa ${pesoCorto(bytes)} y el tope es ${MAX_DOCUMENTO_TEXTO}.`;
    }
    return null;
}

/** Un documento de la carpeta, como viaja a la pantalla (sin el contenido). */
export interface DocumentoJugador {
    idDocumento: number;
    idJugador: number;
    nombre: string;
    descripcion: string;
    tipoMime: string;
    bytes: number;
    /** 'dd/mm/aaaa'. */
    fecha: string;
    /** Quién lo subió, o null si no se pudo saber. */
    usuario: string | null;
}
