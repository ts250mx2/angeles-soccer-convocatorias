import { NextResponse } from 'next/server';
import { pool } from '@/lib/db';
import { resolveSeasonMonths, type SeasonRow } from '@/lib/adeudos-season';

export const dynamic = 'force-dynamic';

/** Temporada seleccionada, o la activa si no viene ninguna. */
async function loadSeason(temporadaId: string | null): Promise<SeasonRow | null> {
    if (temporadaId) {
        const [rows] = await pool.query(
            'SELECT IdTemporada, Temporada, FechaInicio, FechaFin FROM tblTemporadas WHERE IdTemporada = ? LIMIT 1',
            [temporadaId]
        ) as any[];
        if (rows.length) return rows[0];
    }
    const [act] = await pool.query(
        'SELECT IdTemporada, Temporada, FechaInicio, FechaFin FROM tblTemporadas WHERE EsActiva = 1 LIMIT 1'
    ) as any[];
    return act[0] ?? null;
}

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const temporadaId = searchParams.get('temporadaId');

        const season = await loadSeason(temporadaId);
        if (!season) {
            return NextResponse.json({ success: false, message: 'No se encontró temporada' }, { status: 404 });
        }

        const m = resolveSeasonMonths(season);

        const query = `
            SELECT
                S.IdSede,
                S.Sede,
                COUNT(CASE WHEN J.Status = 0 THEN 1 END) as Activos,
                COUNT(CASE WHEN J.Status = 2 THEN 1 END) as Bajas,
                -- Sin inscripción: activo sin pago de inscripción
                SUM(CASE WHEN INSCRIPCION.IdJugador IS NULL AND J.Status = 0 THEN 1 ELSE 0 END) as PendientesInscripcion,
                -- Debe mensualidad: le falta al menos un mes YA VENCIDO (hasta hoy)
                SUM(CASE WHEN COALESCE(MENSUALIDADES.PagosCount, 0) < ? AND J.Status = 0 THEN 1 ELSE 0 END) as PendientesMensualidad,
                -- Al corriente: con inscripción y sin meses vencidos por pagar
                SUM(CASE WHEN J.Status = 0
                          AND INSCRIPCION.IdJugador IS NOT NULL
                          AND COALESCE(MENSUALIDADES.PagosCount, 0) >= ?
                    THEN 1 ELSE 0 END) as AlCorriente,
                -- Debe: activo que debe algo (inscripción o un mes vencido). Partición de Activos con AlCorriente.
                SUM(CASE WHEN J.Status = 0
                          AND (INSCRIPCION.IdJugador IS NULL OR COALESCE(MENSUALIDADES.PagosCount, 0) < ?)
                    THEN 1 ELSE 0 END) as Debe
            FROM tblSedes S
            LEFT JOIN tblJugadores J ON S.IdSede = J.IdSede
            LEFT JOIN (
                SELECT P.IdJugador
                FROM tblPagos P
                INNER JOIN tblProductos PR ON P.IdProducto = PR.IdProducto
                WHERE P.IdTemporada = ? AND PR.IdTipoProducto = 2 AND P.Status = 0
                GROUP BY P.IdJugador
            ) INSCRIPCION ON J.IdJugador = INSCRIPCION.IdJugador
            LEFT JOIN (
                SELECT P.IdJugador, COUNT(DISTINCT P.Mes) as PagosCount
                FROM tblPagos P
                INNER JOIN tblProductos PR ON P.IdProducto = PR.IdProducto
                WHERE P.IdTemporada = ? AND PR.IdTipoProducto = 1 AND P.Status = 0
                  AND P.Mes >= ? AND P.Mes <= ?
                GROUP BY P.IdJugador
            ) MENSUALIDADES ON J.IdJugador = MENSUALIDADES.IdJugador
            GROUP BY S.IdSede, S.Sede
            ORDER BY S.Sede
        `;

        // El rango de mensualidades va hasta el mes exigible (hastaMonth), no al fin de
        // temporada, para que "vencido" signifique "ya debía estar pagado a la fecha".
        const [rows] = await pool.query(query, [
            m.mesesExigibles,      // PendientesMensualidad
            m.mesesExigibles,      // AlCorriente
            m.mesesExigibles,      // Debe
            m.seasonId,
            m.seasonId,
            m.startMonth,
            m.hastaMonth,
        ]) as any[];

        // COUNT() llega como número pero SUM(CASE...) como string; se coercionan
        // para que el cliente pueda sumarlos (0 + "501" concatenaría en vez de sumar).
        const data = rows.map((r: any) => ({
            IdSede: r.IdSede,
            Sede: r.Sede,
            Activos: Number(r.Activos) || 0,
            Bajas: Number(r.Bajas) || 0,
            PendientesInscripcion: Number(r.PendientesInscripcion) || 0,
            PendientesMensualidad: Number(r.PendientesMensualidad) || 0,
            AlCorriente: Number(r.AlCorriente) || 0,
            Debe: Number(r.Debe) || 0,
        }));

        return NextResponse.json({
            success: true,
            data,
            config: {
                seasonId: m.seasonId,
                temporadaNombre: m.temporadaNombre,
                startMonth: m.startMonth,
                endMonth: m.endMonth,
                hastaMonth: m.hastaMonth,
                numMonthsExpected: m.numMonthsExpected,
            },
        });
    } catch (error) {
        console.error('Error fetching sedes for adeudos:', error);
        return NextResponse.json(
            { success: false, message: 'Error al obtener sedes' },
            { status: 500 }
        );
    }
}
