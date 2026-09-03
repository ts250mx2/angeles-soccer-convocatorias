import { NextResponse } from 'next/server';
import { pool } from '@/lib/db';
import { precioDelSistema } from '@/lib/convocatorias-precios';

/** Acomoda como invitado a un jugador cuyo pago quedo sin convocatoria propia. */
export async function POST(request: Request) {
    const connection = await pool.getConnection();
    try {
        const body = await request.json();
        const seasonId = Number(body.seasonId);
        const leagueId = Number(body.leagueId);
        const playerId = Number(body.playerId);
        const categoria = String(body.categoria ?? '').trim();
        const color = String(body.color ?? '');

        if (!seasonId || !leagueId || !playerId || !categoria) {
            return NextResponse.json(
                { success: false, message: 'Faltan parametros requeridos' },
                { status: 400 },
            );
        }

        await connection.beginTransaction();

        const [temporadas] = (await connection.query(
            'SELECT IdTemporada FROM tblTemporadas WHERE IdTemporada = ? AND EsActiva = 1 LIMIT 1',
            [seasonId],
        )) as unknown as [Array<{ IdTemporada: number }>, unknown];
        if (temporadas.length === 0) {
            await connection.rollback();
            return NextResponse.json({ success: false, message: 'La temporada ya no esta activa' }, { status: 409 });
        }

        const [destino] = (await connection.query(
            `SELECT Categoria
               FROM tblConvocatorias
              WHERE IdTemporada = ? AND IdLiga = ? AND Categoria = ?
                AND COALESCE(Color, '') = ? AND Status = 0 AND Cerrada = 0
              LIMIT 1 FOR UPDATE`,
            [seasonId, leagueId, categoria, color],
        )) as unknown as [Array<{ Categoria: string }>, unknown];
        if (destino.length === 0) {
            await connection.rollback();
            return NextResponse.json(
                { success: false, message: 'La convocatoria elegida ya no esta disponible' },
                { status: 409 },
            );
        }

        const [pagos] = (await connection.query(
            `SELECT J.Categoria
               FROM tblPagos P
               INNER JOIN tblProductos PR ON PR.IdProducto = P.IdProducto
               INNER JOIN tblJugadores J ON J.IdJugador = P.IdJugador
              WHERE P.Status = 0 AND P.IdTemporada = ? AND P.IdJugador = ?
                AND PR.IdLiga = ? AND PR.IdTipoProducto IN (3, 4)
              LIMIT 1`,
            [seasonId, playerId, leagueId],
        )) as unknown as [Array<{ Categoria: string }>, unknown];
        if (pagos.length === 0) {
            await connection.rollback();
            return NextResponse.json({ success: false, message: 'El jugador ya no tiene ese conflicto' }, { status: 409 });
        }

        const [yaAsignado] = (await connection.query(
            `SELECT 1
               FROM tblDetalleConvocatorias D
               INNER JOIN tblConvocatorias C
                 ON C.IdTemporada = D.IdTemporada AND C.IdLiga = D.IdLiga
                AND C.Categoria = D.Categoria
                AND COALESCE(C.Color, '') = COALESCE(D.Color, '')
                AND C.Status = 0
              WHERE D.IdTemporada = ? AND D.IdLiga = ? AND D.IdJugador = ?
                AND D.EsConvocado = 1
              LIMIT 1 FOR UPDATE`,
            [seasonId, leagueId, playerId],
        )) as unknown as [unknown[], unknown];
        if (yaAsignado.length > 0) {
            await connection.rollback();
            return NextResponse.json({ success: false, message: 'El jugador ya fue asignado a una categoria' }, { status: 409 });
        }

        const precio = (await precioDelSistema(connection, {
            idJugador: playerId,
            seasonId,
            leagueId,
            categoria,
            color,
        })) ?? 0;

        await connection.query(
            `INSERT INTO tblDetalleConvocatorias
                (IdJugador, IdTemporada, IdLiga, Precio, EsConvocado, EsEliminado, Categoria, Color)
             SELECT ?, ?, ?, ?, 1, 0, ?, ?
              WHERE NOT EXISTS (
                  SELECT 1 FROM tblDetalleConvocatorias
                   WHERE IdJugador = ? AND IdTemporada = ? AND IdLiga = ?
                     AND Categoria = ? AND COALESCE(Color, '') = ?
              )`,
            [playerId, seasonId, leagueId, precio, categoria, color,
             playerId, seasonId, leagueId, categoria, color],
        );
        await connection.query(
            `UPDATE tblDetalleConvocatorias
                SET EsConvocado = 1, EsEliminado = 0, Precio = ?
              WHERE IdJugador = ? AND IdTemporada = ? AND IdLiga = ?
                AND Categoria = ? AND COALESCE(Color, '') = ?`,
            [precio, playerId, seasonId, leagueId, categoria, color],
        );

        await connection.commit();
        return NextResponse.json({ success: true, message: 'Jugador asignado como invitado' });
    } catch (error) {
        await connection.rollback();
        console.error('Error resolviendo pago sin convocatoria:', error);
        return NextResponse.json(
            { success: false, message: 'Error al asignar al jugador como invitado' },
            { status: 500 },
        );
    } finally {
        connection.release();
    }
}
