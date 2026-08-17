/**
 * Qué queda FUERA del módulo de Convocatorias.
 *
 * Hay ligas y categorías que existen en el catálogo pero que no se convocan desde aquí:
 *   - CLINICS, que no juega liga ni copa;
 *   - INTERASE, que se administra por fuera del sistema.
 * Sus convocatorias no se listan, no se pueden crear a mano y la creación automática
 * por pagos las salta.
 *
 * La lista vive en un solo archivo y no repartida por cada consulta porque son cinco
 * los sitios que tienen que coincidir: el resumen, el alta manual, el alta automática,
 * el catálogo de ligas y el de categorías. En cuanto uno se queda atrás, la pantalla
 * ofrece crear algo que el servidor rechaza, o esconde algo que se sigue creando solo.
 *
 * Esto NO borra nada: los pagos y el historial de esas ligas siguen intactos y se
 * siguen viendo en Pagos de Copas y Ligas. Solo desaparecen de Convocatorias.
 */

/** Textos que, dentro del nombre de una liga o de una categoría, la dejan fuera. */
export const FUERA_DE_CONVOCATORIAS = ['CLINIC', 'INTERASE'] as const;

/** ¿Este nombre —de liga o de categoría— queda fuera de convocatorias? */
export function fueraDeConvocatorias(nombre: string | null | undefined): boolean {
    const texto = String(nombre ?? '').toUpperCase();
    return FUERA_DE_CONVOCATORIAS.some((patron) => texto.includes(patron));
}

/**
 * La misma regla, como condición SQL sobre una columna de texto. Devuelve una
 * expresión ya entre paréntesis, para poder encadenarla con AND sin sorpresas.
 *
 * `columna` se interpola tal cual: solo debe recibir nombres de columna escritos en el
 * código (`C.Liga`, `J.Categoria`), nunca algo que venga del usuario.
 */
export const sqlFueraDeConvocatorias = (columna: string): string =>
    `(${FUERA_DE_CONVOCATORIAS.map((p) => `UPPER(${columna}) LIKE '%${p}%'`).join(' OR ')})`;
