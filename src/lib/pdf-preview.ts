import type jsPDF from 'jspdf';

/**
 * La presentación preliminar de cualquier PDF de la aplicación.
 *
 * Antes, cada exportación terminaba en `doc.save(...)`: el archivo caía en Descargas sin
 * que nadie lo hubiera visto. Para revisar si el corte traía el mes correcto había que
 * abrirlo aparte, y cada intento dejaba otra copia en el disco. Ahora todas terminan
 * aquí, el documento se muestra, y desde ahí se decide si se imprime o se guarda.
 *
 * ── Por qué un almacén y no un componente ──
 *
 * Las veinticinco exportaciones viven en archivos `.ts` sueltos (`adeudos-export`,
 * `ventas-export`, …) que NO son componentes de React y que llaman las pantallas desde
 * un `onClick`. No pueden abrir un modal por sí mismas. Esto es el puente: la
 * exportación deja aquí el documento, y el visor —montado una sola vez en el layout
 * raíz— lo recoge. Así ninguna pantalla tiene que enterarse ni montar nada.
 *
 * El URL del blob se revoca al reemplazarlo o al cerrar: sin eso, cada PDF generado se
 * quedaría en memoria del navegador hasta recargar la página, y son documentos de
 * varios MB.
 */

export interface DocumentoPdf {
    /** URL de blob, para el visor y para el botón de guardar. */
    url: string;
    /** Nombre con el que se guarda, con su extensión. */
    nombre: string;
}

let actual: DocumentoPdf | null = null;
const oyentes = new Set<() => void>();

const avisa = (): void => {
    for (const oyente of oyentes) oyente();
};

const suelta = (): void => {
    if (actual) URL.revokeObjectURL(actual.url);
    actual = null;
};

/**
 * Muestra el documento en la presentación preliminar. Sustituye a `doc.save(...)`.
 *
 * El nombre es el mismo con el que se guardaría, y se usa tal cual si el usuario decide
 * guardarlo: el archivo acaba llamándose igual que antes de este cambio.
 */
export function presentarPdf(doc: jsPDF, nombre: string): void {
    suelta();
    actual = {
        url: URL.createObjectURL(doc.output('blob')),
        nombre: nombre.toLowerCase().endsWith('.pdf') ? nombre : `${nombre}.pdf`,
    };
    avisa();
}

/** Cierra la presentación y libera el documento. */
export function cerrarPdf(): void {
    if (!actual) return;
    suelta();
    avisa();
}

/* Las dos funciones que pide `useSyncExternalStore`. La instantánea es el propio objeto,
   que solo cambia cuando se presenta o se cierra un documento; devolver uno nuevo en
   cada lectura metería al componente en un ciclo de renders. */

export function suscribePdf(oyente: () => void): () => void {
    oyentes.add(oyente);
    return () => oyentes.delete(oyente);
}

export const leePdf = (): DocumentoPdf | null => actual;

/** En el servidor no hay documento: el visor solo existe en el navegador. */
export const leePdfServidor = (): DocumentoPdf | null => null;
