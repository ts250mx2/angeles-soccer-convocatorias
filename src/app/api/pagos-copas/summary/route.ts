import { NextResponse } from 'next/server';
import { pool } from '@/lib/db';
import { loadSeasonAndPrevious } from '@/lib/adeudos-db';
import { jugadoresConAdeudo, type JugadorConAdeudo } from '@/lib/adeudos-jugadores';

export const dynamic = 'force-dynamic';

interface FilaProducto {
    IdProducto: number;
    Producto: string;
    IdTipoProducto: number;
    TipoProducto: string;
    TotalRecaudado: number;
    CantidadPagos: number;
    CantidadJugadores: number;
}

/** Un deudor tal como lo consume la pantalla. */
interface DeudorSalida {
    IdJugador: number;
    Jugador: string;
    Categoria: string;
    Sede: string;
    MesesDebe: number;
    Inscrito: boolean;
    /** Torneos que este jugador pagó en la temporada del filtro. */
    Torneos: string[];
}

const aSalida = (j: JugadorConAdeudo): DeudorSalida => ({
    IdJugador: j.idJugador,
    Jugador: j.jugador,
    Categoria: j.categoria,
    Sede: j.sede,
    MesesDebe: j.mesesDebe,
    Inscrito: j.inscrito,
    Torneos: [],
});

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const temporadaParam = searchParams.get('temporada');

        // Temporada del reporte: la que pida el filtro, o la activa.
        const [seasonRows] = await pool.query(
            temporadaParam
                ? 'SELECT IdTemporada, Temporada, EsActiva FROM tblTemporadas WHERE IdTemporada = ? LIMIT 1'
                : 'SELECT IdTemporada, Temporada, EsActiva FROM tblTemporadas WHERE EsActiva = 1 LIMIT 1',
            temporadaParam ? [temporadaParam] : [],
        ) as unknown as [Array<{ IdTemporada: number; Temporada: string; EsActiva: number }>, unknown];

        if (seasonRows.length === 0) {
            return NextResponse.json({ success: false, message: 'No se encontró la temporada' }, { status: 404 });
        }
        const season = seasonRows[0];
        const seasonId = season.IdTemporada;

        // 1. Recaudación por copa/liga en la temporada del filtro.
        const [rows] = await pool.query(
            `SELECT
                PR.IdProducto,
                PR.Producto,
                PR.IdTipoProducto,
                CASE
                    WHEN PR.IdTipoProducto = 3 THEN 'Liga'
                    WHEN PR.IdTipoProducto = 4 THEN 'Copa'
                    ELSE COALESCE(TP.TipoProducto, 'Torneo')
                END AS TipoProducto,
                COALESCE(SUM(P.Pago), 0) AS TotalRecaudado,
                COUNT(DISTINCT P.IdPago) AS CantidadPagos,
                COUNT(DISTINCT P.IdJugador) AS CantidadJugadores
            FROM tblProductos PR
            LEFT JOIN tblTiposProductos TP ON PR.IdTipoProducto = TP.IdTipoProducto
            LEFT JOIN tblPagos P ON PR.IdProducto = P.IdProducto AND P.IdTemporada = ? AND P.Status = 0
            WHERE PR.IdTipoProducto IN (3, 4)
            GROUP BY PR.IdProducto, PR.Producto, PR.IdTipoProducto, TP.TipoProducto
            ORDER BY TotalRecaudado DESC, PR.Producto ASC`,
            [seasonId],
        ) as unknown as [FilaProducto[], unknown];

        /* 2. La alerta de cobranza.
           Los adeudos se miden SIEMPRE contra la temporada ACTIVA, no contra la del
           filtro: la pregunta es "de los que pagaron este torneo, ¿a quién le debo
           cobrar hoy?". Por eso al revisar una temporada pasada la alerta sigue
           refiriéndose al ciclo en curso. */
        const temporadas = await loadSeasonAndPrevious(null);
        const deudores = temporadas ? await jugadoresConAdeudo(temporadas.actual) : new Map();

        // Quién pagó cada torneo en la temporada del filtro.
        const [pagadores] = await pool.query(
            `SELECT DISTINCT P.IdProducto, PR.Producto, P.IdJugador
               FROM tblPagos P
              INNER JOIN tblProductos PR ON PR.IdProducto = P.IdProducto
              WHERE P.IdTemporada = ? AND P.Status = 0 AND PR.IdTipoProducto IN (3, 4)
              ORDER BY PR.Producto ASC`,
            [seasonId],
        ) as unknown as [Array<{ IdProducto: number; Producto: string; IdJugador: number }>, unknown];

        const deudoresPorProducto = new Map<number, DeudorSalida[]>();
        // En la lista global un jugador aparece una sola vez, acumulando los torneos
        // que pagó: es justo el dato que hace accionable la alerta.
        const globales = new Map<number, DeudorSalida>();
        for (const { IdProducto, Producto, IdJugador } of pagadores) {
            const deudor = deudores.get(Number(IdJugador));
            if (!deudor) continue;
            const torneo = String(Producto ?? '').trim() || 'Torneo sin nombre';

            // En la lista de un torneo concreto, el torneo es ese y solo ese.
            const fila: DeudorSalida = { ...aSalida(deudor), Torneos: [torneo] };
            const lista = deudoresPorProducto.get(Number(IdProducto));
            if (lista) lista.push(fila);
            else deudoresPorProducto.set(Number(IdProducto), [fila]);

            const global = globales.get(fila.IdJugador);
            if (global) {
                if (!global.Torneos.includes(torneo)) global.Torneos.push(torneo);
            } else {
                globales.set(fila.IdJugador, { ...aSalida(deudor), Torneos: [torneo] });
            }
        }

        const ordenar = (a: DeudorSalida, b: DeudorSalida) =>
            b.MesesDebe - a.MesesDebe || a.Jugador.localeCompare(b.Jugador, 'es');

        const data = rows.map((p) => {
            const lista = (deudoresPorProducto.get(Number(p.IdProducto)) ?? []).sort(ordenar);
            return {
                ...p,
                JugadoresConAdeudo: lista.length,
                Deudores: lista,
            };
        });

        return NextResponse.json({
            success: true,
            season: { IdTemporada: season.IdTemporada, Temporada: season.Temporada },
            // Contra qué temporada se midió el adeudo (puede no ser la del filtro).
            temporadaAdeudos: temporadas
                ? { IdTemporada: temporadas.actual.seasonId, Temporada: temporadas.actual.temporadaNombre }
                : null,
            alerta: {
                jugadores: globales.size,
                deudores: [...globales.values()].sort(ordenar),
            },
            data,
        }, { headers: { 'Cache-Control': 'no-store' } });
    } catch (error) {
        console.error('Error in pagos-copas summary:', error);
        return NextResponse.json({ success: false, message: 'Error interno del servidor' }, { status: 500 });
    }
}
