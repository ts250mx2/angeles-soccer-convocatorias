import { pool } from '@/lib/db';

/**
 * Piezas compartidas de los reportes de gastos (Gastos por Forma de Pago y Gastos
 * por Tipo). Los dos agrupan tblEgresos con los mismos filtros y solo cambia la
 * dimensión, así que el SQL común vive aquí y no repetido en cada endpoint.
 *
 * Igual que Egresos por Sede:
 *  - solo cuentan los egresos vigentes (Status 2 = cancelado),
 *  - la sede es tblEgresos.IdSede (a la que pertenece el gasto), no IdSedePago,
 *  - FechaEgreso se guarda en hora local del servidor; se compara sin convertir husos.
 */

export const EGRESO_VIGENTE = 'COALESCE(E.Status, 0) = 0';

/**
 * Tipo de gasto. En el sistema de escritorio 0 abre "Pago a Personal" y cualquier
 * otro valor "Pago a Proveedor" (frmProcEgresos: If IdTipoEgreso = 0 Then personal
 * Else proveedor); no existe tabla de catálogo, así que la regla vive aquí.
 */
export const TIPO_EGRESO_CLAVE = 'CASE WHEN COALESCE(E.IdTipoEgreso, 0) = 0 THEN 0 ELSE 1 END';

export const etiquetaTipoEgreso = (clave: number): string =>
    clave === 0 ? 'Pago a personal' : 'Pago a proveedor';

/** Etiqueta de la forma de pago: el catálogo, el texto libre del egreso, o SIN FORMA. */
export const ETIQUETA_FORMA = `COALESCE(F.FormaPago, E.FormaPago, 'SIN FORMA')`;
export const JOIN_FORMA = 'LEFT JOIN tblFormasPago F ON F.IdFormaPago = COALESCE(E.IdFormaPago, 1)';

/**
 * Destinatario del gasto (tblEgresos.PagarA, texto libre). Se agrupa NORMALIZADO
 * (mayúsculas y sin espacios de sobra) porque la captura histórica mezcla variantes
 * del mismo nombre; la clave normalizada es también la que usan los drill-downs.
 */
export const DESTINATARIO_CLAVE = `UPPER(TRIM(COALESCE(E.PagarA, '')))`;
export const SIN_DESTINATARIO = 'SIN DESTINATARIO';

/** Filtro de fechas sobre E.FechaEgreso; sin rango completo, el mes en curso. */
export function filtroFechasEgreso(
    dateFrom: string | null,
    dateTo: string | null,
): { clause: string; params: string[] } {
    if (dateFrom && dateTo) {
        return { clause: 'DATE(E.FechaEgreso) BETWEEN ? AND ?', params: [dateFrom, dateTo] };
    }
    return {
        clause: 'YEAR(E.FechaEgreso) = YEAR(NOW()) AND MONTH(E.FechaEgreso) = MONTH(NOW())',
        params: [],
    };
}

export interface SedeConGasto {
    IdSede: number;
    Sede: string;
    Total: number;
}

/**
 * Sedes con gasto en el período (para las tarjetas de filtro). Se calcula sin el
 * filtro de sede seleccionado, para que las tarjetas no desaparezcan al elegir una.
 */
export async function sedesConGasto(df: { clause: string; params: string[] }): Promise<SedeConGasto[]> {
    const [rows] = await pool.query(
        `SELECT
            COALESCE(E.IdSede, 0) AS IdSede,
            COALESCE(S.Sede, 'SIN SEDE') AS Sede,
            COALESCE(SUM(E.Total), 0) AS Total
         FROM tblEgresos E
         LEFT JOIN tblSedes S ON S.IdSede = E.IdSede
         WHERE ${EGRESO_VIGENTE} AND ${df.clause}
         GROUP BY COALESCE(E.IdSede, 0), COALESCE(S.Sede, 'SIN SEDE')
         HAVING Total <> 0
         ORDER BY Sede ASC`,
        df.params,
    ) as unknown as [Array<Record<string, unknown>>, unknown];

    return rows.map((r) => ({
        IdSede: Number(r.IdSede) || 0,
        Sede: String(r.Sede ?? 'SIN SEDE'),
        Total: Number(r.Total) || 0,
    }));
}

export interface DesgloseDestinatario {
    /** Clave normalizada del destinatario ('' si no se capturó); para drill-down. */
    Clave: string;
    Destinatario: string;
    Cantidad: number;
    Total: number;
}

/**
 * Desglose por destinatario (PagarA) de un subconjunto de egresos. `filtroExtra`
 * acota al grupo del nivel superior (una forma de pago o un tipo de gasto).
 */
export async function desglosePorDestinatario(
    df: { clause: string; params: string[] },
    filtroExtra: { clause: string; params: Array<string | number> },
    idSede: number | null,
): Promise<DesgloseDestinatario[]> {
    const filtros = [EGRESO_VIGENTE, df.clause, filtroExtra.clause];
    const params: Array<string | number> = [...df.params, ...filtroExtra.params];
    if (idSede !== null) {
        filtros.push('COALESCE(E.IdSede, 0) = ?');
        params.push(idSede);
    }

    const [rows] = await pool.query(
        `SELECT
            ${DESTINATARIO_CLAVE} AS Clave,
            COALESCE(NULLIF(TRIM(MAX(E.PagarA)), ''), '${SIN_DESTINATARIO}') AS Destinatario,
            COUNT(*) AS Cantidad,
            COALESCE(SUM(E.Total), 0) AS Total
         FROM tblEgresos E
         ${JOIN_FORMA}
         WHERE ${filtros.join(' AND ')}
         GROUP BY ${DESTINATARIO_CLAVE}
         ORDER BY Total DESC, Destinatario ASC`,
        params,
    ) as unknown as [Array<Record<string, unknown>>, unknown];

    return rows.map((r) => ({
        Clave: String(r.Clave ?? ''),
        Destinatario: String(r.Destinatario ?? SIN_DESTINATARIO),
        Cantidad: Number(r.Cantidad) || 0,
        Total: Number(r.Total) || 0,
    }));
}
