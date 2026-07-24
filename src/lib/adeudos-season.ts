/**
 * Rango de meses de una temporada y hasta qué mes se exige el pago (adeudo).
 *
 * Regla acordada:
 *  - Temporada pasada (hoy ya pasó su FechaFin): el adeudo cubre TODOS sus meses,
 *    hastaMonth = endMonth.
 *  - Temporada activa o futura: hastaMonth = mes actual del calendario. Así la
 *    temporada activa se comporta exactamente igual que antes (el bucle
 *    startMonth..currentMonth ya daba 0 si aún no arranca).
 *
 * Los meses se derivan con getUTCMonth (igual que el código previo de adeudos) para
 * no cambiar los números de la temporada activa. Se calcula con el reloj del servidor.
 */
export interface SeasonMonths {
    seasonId: number;
    startMonth: number;
    endMonth: number;
    /** Último mes con adeudo exigible (inclusive). */
    hastaMonth: number;
    /** Meses que abarca la temporada completa. */
    numMonthsExpected: number;
    /** Meses ya exigibles a la fecha (start..hasta). 0 si la temporada aún no arranca. */
    mesesExigibles: number;
    /** Año del inicio, para formar los códigos Anio*100+Mes. */
    anioInicio: number;
    /** Código Anio*100+Mes del primer mes de la temporada. */
    desdeCodigo: number;
    /** Código del último mes exigible. Menor que desdeCodigo si aún no arranca. */
    hastaCodigo: number;
    /** FechaInicio en formato 'YYYY-MM-DD' (para comparaciones de fecha en SQL). */
    fechaInicioISO: string;
    temporadaNombre: string;
}

export interface SeasonRow {
    IdTemporada: number;
    Temporada: string;
    FechaInicio: string | Date;
    FechaFin: string | Date;
}

export function resolveSeasonMonths(season: SeasonRow, now: Date = new Date()): SeasonMonths {
    const inicio = new Date(season.FechaInicio);
    const fin = new Date(season.FechaFin);

    const startMonth = inicio.getUTCMonth() + 1;
    const endMonth = fin.getUTCMonth() + 1;
    const currentMonth = now.getUTCMonth() + 1;

    // La temporada está "cerrada" si hoy es posterior a su último día.
    const finCierre = new Date(fin);
    finCierre.setUTCHours(23, 59, 59, 999);
    const esPasada = now.getTime() > finCierre.getTime();

    const hastaMonth = esPasada ? endMonth : currentMonth;
    const anioInicio = inicio.getUTCFullYear();

    /* Códigos Anio*100+Mes: las mensualidades se emparejan por el mes-año que
       amparan y no por su IdTemporada, porque hay pagos capturados bajo una
       temporada que cubren meses de otra (y así no los veía ninguna).
       Nota: asume que la temporada no cruza el año, como todas las actuales. */
    const desdeCodigo = anioInicio * 100 + startMonth;
    const hastaCodigo = anioInicio * 100 + hastaMonth;

    return {
        seasonId: season.IdTemporada,
        startMonth,
        endMonth,
        hastaMonth,
        numMonthsExpected: Math.max(0, endMonth - startMonth + 1),
        // Meses ya vencidos: 0 mientras la temporada no arranca (hastaMonth < startMonth).
        mesesExigibles: Math.max(0, hastaMonth - startMonth + 1),
        anioInicio,
        desdeCodigo,
        hastaCodigo,
        fechaInicioISO: `${inicio.getUTCFullYear()}-${String(startMonth).padStart(2, '0')}-${String(inicio.getUTCDate()).padStart(2, '0')}`,
        temporadaNombre: season.Temporada,
    };
}

/** Lista de meses de la temporada, para pintar los cuadritos. */
export function mesesDeTemporada(startMonth: number, endMonth: number): number[] {
    const out: number[] = [];
    for (let m = startMonth; m <= endMonth; m++) out.push(m);
    return out;
}
