/**
 * Los períodos con los que se consultan los gastos.
 *
 * Viven aquí y no en cada pantalla porque Gastos por Sede y la Lista de Gastos tienen que
 * ofrecer LOS MISMOS: son dos vistas del mismo dinero, y que una tuviera "Esta Semana" y
 * la otra no obligaría a recordar cuál pregunta se puede hacer dónde. El servidor los
 * traduce a fechas en `filtroFechas` (@/app/api/gastos/egresos/route), así que las claves
 * de aquí son las que él entiende: cambiar una sin tocar aquélla rompe el filtro.
 */

export type Periodo = 'today' | 'yesterday' | 'week' | 'month' | 'year' | 'custom';

export const PERIODOS: { key: Periodo; label: string }[] = [
    { key: 'today', label: 'Hoy' },
    { key: 'yesterday', label: 'Ayer' },
    { key: 'week', label: 'Esta Semana' },
    { key: 'month', label: 'Este Mes' },
    { key: 'year', label: 'Este Año' },
    { key: 'custom', label: 'Fechas...' },
];

/** El que se ofrece al entrar: el mes en curso es la pregunta que se hace a diario. */
export const PERIODO_POR_OMISION: Periodo = 'month';

/**
 * Cómo se llama el período elegido, para los títulos y para el pie de las exportaciones.
 * En rango personalizado se escriben las dos fechas: "Fechas..." no dice nada en un PDF.
 */
export const etiquetaPeriodo = (periodo: Periodo, desde: string, hasta: string): string =>
    periodo === 'custom' && desde && hasta
        ? `${desde} a ${hasta}`
        : PERIODOS.find((p) => p.key === periodo)?.label ?? '';

/**
 * Los parámetros de la consulta. En rango personalizado sin las dos fechas se devuelve
 * null: preguntar con media fecha traería un rango que nadie pidió.
 */
export function paramsPeriodo(periodo: Periodo, desde: string, hasta: string): URLSearchParams | null {
    if (periodo === 'custom' && (!desde || !hasta)) return null;
    const p = new URLSearchParams({ periodo });
    if (periodo === 'custom') {
        p.set('desde', desde);
        p.set('hasta', hasta);
    }
    return p;
}
