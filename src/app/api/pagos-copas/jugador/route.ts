import { NextResponse } from 'next/server';
import { pool } from '@/lib/db';

export const dynamic = 'force-dynamic';

/**
 * Pagos de copas y ligas de UN jugador en una temporada.
 *
 * Lo consume la alerta de cobranza: desde la lista de deudores se abre el detalle de
 * lo que esa persona pagó, para tener el recibo a la mano al momento de cobrarle.
 */
export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const idJugadorParam = searchParams.get('idJugador');
        const temporadaParam = searchParams.get('temporada');

        const idJugador = Number(idJugadorParam);
        if (!idJugadorParam || !Number.isInteger(idJugador)) {
            return NextResponse.json({ success: false, message: 'Jugador no válido' }, { status: 400 });
        }

        const [seasonRows] = await pool.query(
            temporadaParam
                ? 'SELECT IdTemporada FROM tblTemporadas WHERE IdTemporada = ? LIMIT 1'
                : 'SELECT IdTemporada FROM tblTemporadas WHERE EsActiva = 1 LIMIT 1',
            temporadaParam ? [temporadaParam] : [],
        ) as unknown as [Array<{ IdTemporada: number }>, unknown];

        if (seasonRows.length === 0) {
            return NextResponse.json({ success: false, message: 'No se encontró la temporada' }, { status: 404 });
        }
        const seasonId = seasonRows[0].IdTemporada;

        const [rows] = await pool.query(
            `SELECT
                P.IdPago,
                PR.Producto,
                CASE
                    WHEN PR.IdTipoProducto = 3 THEN 'Liga'
                    WHEN PR.IdTipoProducto = 4 THEN 'Copa'
                    ELSE 'Torneo'
                END                                              AS TipoProducto,
                DATE_FORMAT(P.FechaPago, '%d/%m/%Y %H:%i')       AS Fecha,
                COALESCE(NULLIF(TRIM(P.Recibo), ''), '—')        AS Recibo,
                COALESCE(F.FormaPago, P.FormaPago, '—')          AS FormaPago,
                COALESCE(S.Sede, '—')                            AS Sede,
                COALESCE(P.Pago, 0)                              AS Pago
             FROM tblPagos P
             INNER JOIN tblProductos PR ON PR.IdProducto = P.IdProducto
             LEFT JOIN tblFormasPago F ON F.IdFormaPago = P.IdFormaPago
             LEFT JOIN tblSedes S ON S.IdSede = P.IdSede
             WHERE P.IdJugador = ?
               AND P.IdTemporada = ?
               AND P.Status = 0
               AND PR.IdTipoProducto IN (3, 4)
             ORDER BY P.FechaPago DESC, P.IdPago DESC`,
            [idJugador, seasonId],
        ) as unknown as [Array<Record<string, unknown>>, unknown];

        const data = rows.map((r) => ({
            IdPago: Number(r.IdPago),
            Producto: String(r.Producto ?? '—'),
            TipoProducto: String(r.TipoProducto ?? 'Torneo'),
            Fecha: String(r.Fecha ?? ''),
            Recibo: String(r.Recibo ?? '—'),
            FormaPago: String(r.FormaPago ?? '—'),
            Sede: String(r.Sede ?? '—'),
            Pago: Number(r.Pago) || 0,
        }));

        return NextResponse.json({
            success: true,
            data,
            total: data.reduce((s, r) => s + r.Pago, 0),
        }, { headers: { 'Cache-Control': 'no-store' } });
    } catch (error) {
        console.error('Error in pagos-copas jugador:', error);
        return NextResponse.json({ success: false, message: 'Error interno del servidor' }, { status: 500 });
    }
}
