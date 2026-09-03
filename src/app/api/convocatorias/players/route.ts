import { NextResponse } from 'next/server';
import { pool } from '@/lib/db';
import { estadoEnTemporada } from '@/lib/convocatoria-elegibilidad';
import { joinPrecioManual, preciosManualesDisponibles } from '@/lib/convocatorias-precios';
import { becasPorBotonDisponibles, joinBecaAplicada } from '@/lib/convocatorias-becas';
import { sqlBecaDeTorneo } from '@/lib/beca-torneo';

interface FilaJugador {
    IdJugador: number;
    EsConvocado: number;
    EsEliminado: number;
    /** 1 cuando el precio se fijó a mano y ningún automatismo lo mueve. */
    PrecioManual: number;
    /** 1 cuando la beca del jugador ya se aplicó a ESTE renglón (se aplica con botón). */
    BecaAplicada: number;
}

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const seasonId = searchParams.get('seasonId');
        const leagueId = searchParams.get('leagueId');
        const categoria = searchParams.get('categoria');
        const color = searchParams.get('color');

        if (!seasonId || !leagueId || !categoria || color === null) {
            return NextResponse.json(
                { success: false, message: 'Faltan parámetros requeridos (incluyendo color)' },
                { status: 400 }
            );
        }

        /* El indicador de precio fijado a mano solo existe si la migración 010 ya se
           aplicó; sin ella la pantalla se comporta como antes. */
        const respetaManuales = await preciosManualesDisponibles(pool);
        /* Y el de beca aplicada, si está la 027. Sin ella la beca se sigue aplicando
           sola, así que todo becado se reporta como "con beca aplicada". */
        const conBecas = await becasPorBotonDisponibles(pool);

        const selectQuery = `
            SELECT A.IdJugador, B.Jugador, B.Categoria, A.Precio, A.EsConvocado, A.EsEliminado,
                   -- La beca que aplica aquí es la del TORNEO, no la de mensualidades:
                   -- BecaCopas en una copa y BecaLigas en una liga (ver @/lib/beca-torneo).
                   -- De ahí el JOIN contra tblLigas, que es quien dice cuál de las dos es.
                   ${sqlBecaDeTorneo('B', 'L')} AS Beca,
                   CASE WHEN A.Categoria <> B.Categoria THEN 1 ELSE 0 END AS EsInvitado,
                   /* La foto NO viaja en el JSON: son data URIs de hasta 120 KB y una
                      categoría entera los arrastraría todos. Solo va si la hay y cuándo
                      cambió; la imagen la pide el navegador a /api/jugadores/foto, que
                      sí se cachea. */
                   CASE WHEN B.Foto IS NOT NULL AND B.Foto <> '' THEN 1 ELSE 0 END AS TieneFoto,
                   DATE_FORMAT(B.FechaAct, '%Y%m%d%H%i%s') AS FotoVersion,
                   ${respetaManuales ? 'CASE WHEN MAN.IdJugador IS NULL THEN 0 ELSE 1 END' : '0'} AS PrecioManual,
                   -- La beca de la ficha no se cobra sola: vale para ESTE renglón solo si
                   -- alguien la aplicó con el botón (ver @/lib/convocatorias-becas).
                   ${conBecas ? 'CASE WHEN BEC.IdJugador IS NULL THEN 0 ELSE 1 END' : '1'} AS BecaAplicada,
                   CASE WHEN A.EsConvocado = 1 THEN COALESCE(PAGOS.TotalPago, 0) ELSE 0 END AS PagoJugador,
                   CASE WHEN A.EsConvocado = 1 THEN (A.Precio - COALESCE(PAGOS.TotalPago, 0)) ELSE 0 END AS CXC
            FROM tblDetalleConvocatorias A 
            INNER JOIN tblJugadores B ON A.IdJugador = B.IdJugador
            INNER JOIN tblLigas L ON L.IdLiga = A.IdLiga
            LEFT JOIN (
                SELECT P.IdJugador, SUM(P.Pago) as TotalPago
                FROM tblPagos P
                INNER JOIN tblProductos PR ON P.IdProducto = PR.IdProducto
                WHERE P.IdTemporada = ? AND PR.IdLiga = ? AND P.Status = 0
                GROUP BY P.IdJugador
            ) PAGOS ON A.IdJugador = PAGOS.IdJugador
            ${respetaManuales ? joinPrecioManual('A') : ''}
            ${conBecas ? joinBecaAplicada('A') : ''}
            WHERE A.IdTemporada = ? AND A.IdLiga = ? AND A.Categoria = ? AND A.Color = ?
            ORDER BY B.Jugador ASC
        `;

        const [rows] = (await pool.query(
            selectQuery,
            [seasonId, leagueId, seasonId, leagueId, categoria, color],
        )) as [FilaJugador[], unknown];

        /* Inscripción y adeudo de la temporada, para cada jugador de la lista.
           Se listan TODOS los activos de la categoría, con o sin inscripción y con o sin
           adeudo: convocar es decisión del club. El estado se manda para marcarlos en
           pantalla, no para esconderlos; esconder a un jugador solo hace creer que no
           existe. */
        const estados = await estadoEnTemporada(
            Number(seasonId),
            rows.map((r) => Number(r.IdJugador)),
        );

        const conEstado = rows.map((fila) => {
            const estado = estados.get(Number(fila.IdJugador));
            return {
                ...fila,
                Inscrito: estado?.inscrito ? 1 : 0,
                Exento: estado?.exento ? 1 : 0,
                MesesDebe: estado?.mesesDebe ?? 0,
            };
        });

        // Get total sum and count
        const [totalRows] = await pool.query(
            `SELECT COALESCE(SUM(Precio), 0) as total FROM tblDetalleConvocatorias 
             WHERE EsConvocado = 1 AND IdTemporada = ? AND IdLiga = ? AND Categoria = ? AND Color = ?`,
            [seasonId, leagueId, categoria, color]
        );

        const total = Array.isArray(totalRows) && totalRows.length > 0 ? (totalRows[0] as any).total || 0 : 0;

        const [countRows] = await pool.query(
            `SELECT COALESCE(COUNT(*), 0) as count FROM tblDetalleConvocatorias 
             WHERE EsConvocado = 1 AND IdTemporada = ? AND IdLiga = ? AND Categoria = ? AND Color = ?`,
            [seasonId, leagueId, categoria, color]
        );

        const count = Array.isArray(countRows) && countRows.length > 0 ? (countRows[0] as any).count || 0 : 0;

        // Get total payments for the category/color
        const [paymentRows] = await pool.query(
            `SELECT COALESCE(SUM(P.Pago), 0) as totalPagos
             FROM tblPagos P
             INNER JOIN tblProductos PR ON P.IdProducto = PR.IdProducto
             INNER JOIN tblDetalleConvocatorias DC ON P.IdJugador = DC.IdJugador 
                 AND P.IdTemporada = DC.IdTemporada
                 AND PR.IdLiga = DC.IdLiga
             WHERE DC.IdTemporada = ? AND DC.IdLiga = ? AND DC.Categoria = ? AND DC.Color = ?
               AND P.Status = 0 AND DC.EsConvocado = 1`,
            [seasonId, leagueId, categoria, color]
        );
        const totalPagos = Array.isArray(paymentRows) && paymentRows.length > 0 ? (paymentRows[0] as any).totalPagos || 0 : 0;
        const totalCXC = total - totalPagos;

        return NextResponse.json({
            success: true,
            data: conEstado,
            total,
            count,
            totalPagos,
            totalCXC,
        });
    } catch (error) {
        console.error('Error fetching players:', error);
        return NextResponse.json(
            { success: false, message: 'Error al obtener jugadores' },
            { status: 500 }
        );
    }
}
