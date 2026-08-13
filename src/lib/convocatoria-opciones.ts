/**
 * Opciones de la convocatoria que el formulario ofrece y la base guarda.
 *
 * Vive aquí y no en la pantalla porque lo usan las tres partes: el selector del modal,
 * las rutas que escriben en la base y el card que lo muestra. Si mañana se agrega una
 * fase, se agrega en esta lista y no hay que alterar la tabla: Eliminatoria es VARCHAR.
 */

/** De la fase más temprana a la más avanzada; ese es el orden en que se ofrecen. */
export const ELIMINATORIAS = [
    'Dieciseisavos',
    'Octavos',
    'Cuartos',
    'Semifinales',
    'Finales',
] as const;

export type Eliminatoria = (typeof ELIMINATORIAS)[number];

/**
 * Lo que venga del formulario se acepta solo si es una de las fases conocidas.
 * Vacío, nulo o cualquier otra cosa se guarda como NULL: la convocatoria simplemente
 * no llega a eliminatorias, o todavía no se sabe.
 */
export function normalizarEliminatoria(valor: unknown): Eliminatoria | null {
    const texto = typeof valor === 'string' ? valor.trim() : '';
    return (ELIMINATORIAS as readonly string[]).includes(texto) ? (texto as Eliminatoria) : null;
}

/** Tope defensivo: un torneo con más jornadas que esto es un dedazo, no un dato. */
export const MAX_JORNADAS = 200;

/**
 * Las jornadas son un entero positivo. Vacío, cero, negativo o no numérico => NULL,
 * que es como quedan las convocatorias viejas que nunca capturaron el dato.
 */
export function normalizarJornadas(valor: unknown): number | null {
    if (valor === null || valor === undefined || valor === '') return null;
    const n = Number(valor);
    if (!Number.isFinite(n)) return null;
    const entero = Math.trunc(n);
    if (entero <= 0) return null;
    return Math.min(entero, MAX_JORNADAS);
}

/** Etiqueta para pantalla; las convocatorias viejas no traen el dato. */
export function etiquetaJornadas(n: number | null | undefined): string | null {
    if (n === null || n === undefined || n <= 0) return null;
    return `${n} ${n === 1 ? 'jornada' : 'jornadas'}`;
}
