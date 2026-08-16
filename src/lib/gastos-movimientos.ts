import { pool } from '@/lib/db';
import {
    EGRESO_VIGENTE,
    JOIN_FORMA,
    ETIQUETA_FORMA,
    TIPO_EGRESO_CLAVE,
    DESTINATARIO_CLAVE,
    etiquetaTipoEgreso,
    filtroFechasEgreso,
} from '@/lib/gastos-reportes';

/**
 * Último nivel de los dos reportes de gastos: los movimientos uno por uno.
 *
 * Lo comparten Gastos por Forma de Pago y Gastos por Tipo porque la fila devuelta es
 * la misma en ambos; solo cambia por dónde se filtró para llegar hasta aquí.
 */

/** Mismo tope que el detalle de Egresos por Sede: un rango amplio son miles de filas. */
export const MAX_MOVIMIENTOS = 1000;

export interface MovimientoEgreso {
    IdEgreso: number;
    /** Sin offset de zona (YYYY-MM-DDTHH:mm:ss): FechaEgreso ya es hora local. */
    Fecha: string;
    Concepto: string;
    PagarA: string;
    Factura: string;
    Recibo: string;
    FormaPago: string;
    TipoEgreso: string;
    Sede: string;
    Total: number;
}

export interface FiltrosMovimientos {
    dateFrom: string | null;
    dateTo: string | null;
    idSede: number | null;
    /** Forma de pago (COALESCE(IdFormaPago, 1)); null = todas. */
    idFormaPago: number | null;
    /** Tipo de gasto ya normalizado a 0/1; null = todos. */
    tipoEgreso: number | null;
    /** Destinatario NORMALIZADO (UPPER+TRIM de PagarA); null = todos. */
    destinatario: string | null;
}

/** Movimientos de egreso que cumplen los filtros, del más reciente al más antiguo. */
export async function movimientosEgreso(f: FiltrosMovimientos): Promise<{ data: MovimientoEgreso[]; truncado: boolean }> {
    const df = filtroFechasEgreso(f.dateFrom, f.dateTo);
    const filtros = [EGRESO_VIGENTE, df.clause];
    const params: Array<string | number> = [...df.params];

    if (f.idSede !== null) {
        filtros.push('COALESCE(E.IdSede, 0) = ?');
        params.push(f.idSede);
    }
    if (f.idFormaPago !== null) {
        filtros.push('COALESCE(E.IdFormaPago, 1) = ?');
        params.push(f.idFormaPago);
    }
    if (f.tipoEgreso !== null) {
        filtros.push(`${TIPO_EGRESO_CLAVE} = ?`);
        params.push(f.tipoEgreso);
    }
    /* El destinatario puede ser cadena vacía (gastos sin PagarA capturado): es un
       grupo legítimo del desglose, así que se compara contra '' y no se descarta. */
    if (f.destinatario !== null) {
        filtros.push(`${DESTINATARIO_CLAVE} = ?`);
        params.push(f.destinatario);
    }

    const [rows] = await pool.query(
        `SELECT
            E.IdEgreso,
            DATE_FORMAT(E.FechaEgreso, '%Y-%m-%dT%H:%i:%s')     AS Fecha,
            COALESCE(NULLIF(TRIM(E.ConceptoEgreso), ''), '—')   AS Concepto,
            COALESCE(NULLIF(TRIM(E.PagarA), ''), '—')           AS PagarA,
            COALESCE(NULLIF(TRIM(E.NumeroFactura), ''), '—')    AS Factura,
            COALESCE(NULLIF(TRIM(E.Recibo), ''), '—')           AS Recibo,
            ${ETIQUETA_FORMA}                                   AS FormaPago,
            ${TIPO_EGRESO_CLAVE}                                AS TipoClave,
            COALESCE(S.Sede, 'SIN SEDE')                        AS Sede,
            COALESCE(E.Total, 0)                                AS Total
         FROM tblEgresos E
         ${JOIN_FORMA}
         LEFT JOIN tblSedes S ON S.IdSede = E.IdSede
         WHERE ${filtros.join(' AND ')}
         ORDER BY E.FechaEgreso DESC, E.IdEgreso DESC
         LIMIT ${MAX_MOVIMIENTOS}`,
        params,
    ) as unknown as [Array<Record<string, unknown>>, unknown];

    const data = rows.map((r) => ({
        IdEgreso: Number(r.IdEgreso) || 0,
        Fecha: String(r.Fecha ?? ''),
        Concepto: String(r.Concepto ?? '—'),
        PagarA: String(r.PagarA ?? '—'),
        Factura: String(r.Factura ?? '—'),
        Recibo: String(r.Recibo ?? '—'),
        FormaPago: String(r.FormaPago ?? '—'),
        TipoEgreso: etiquetaTipoEgreso(Number(r.TipoClave) || 0),
        Sede: String(r.Sede ?? 'SIN SEDE'),
        Total: Number(r.Total) || 0,
    }));

    return { data, truncado: data.length === MAX_MOVIMIENTOS };
}

/** Lee un entero opcional del query string. `undefined` = ausente, `null` = inválido. */
export function enteroOpcional(valor: string | null): number | null | undefined {
    if (valor === null || valor === '') return undefined;
    const n = Number(valor);
    return Number.isInteger(n) ? n : null;
}
