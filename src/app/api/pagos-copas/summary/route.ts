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
    IdLiga: number | null;
    TieneFoto: number;
    FotoVersion: string | null;
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

/** Torneo que parece pertenecer a la temporada anterior, con sus motivos. */
interface SugerenciaProducto {
    IdProducto: number;
    Producto: string;
    IdTipoProducto: number;
    TipoProducto: string;
    CantidadPagos: number;
    TotalRecaudado: number;
    Razones: string[];
}

/** Años calendario que toca una temporada (FechaInicio..FechaFin). */
const aniosDeTemporada = (anioInicio: number, anioFin: number): Set<number> => {
    const out = new Set<number>();
    for (let a = anioInicio; a <= Math.max(anioInicio, anioFin); a++) out.add(a);
    return out;
};

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const temporadaParam = searchParams.get('temporada');
        /* Clinics sí o no, nunca las dos juntas: son negocios distintos y mezclarlos
           deja un total que no le sirve a ninguno.
           Es clinics si el producto está marcado (EsClinics) O si su nombre lo dice.
           Hacen falta las dos condiciones: hay seis productos que se llaman CLINICS y
           no están marcados —"CLINICS FUTSAL SEMANA 1..5" y un "AS CLINICS ... S7" al
           que se le olvidó la marca— y otros ocho marcados cuyo nombre no lo menciona. */
        const ES_CLINICS = `(COALESCE(PR.EsClinics, 0) = 1 OR UPPER(PR.Producto) LIKE '%CLINIC%')`;
        const soloClinics = searchParams.get('clinics') === '1';
        const filtroClinics = soloClinics ? ES_CLINICS : `NOT ${ES_CLINICS}`;

        // Temporada del reporte: la que pida el filtro, o la activa. Las fechas y los
        // años se usan para las sugerencias de torneos de la temporada anterior.
        const COLS_TEMPORADA =
            'IdTemporada, Temporada, EsActiva, FechaInicio, YEAR(FechaInicio) AS AnioInicio, YEAR(FechaFin) AS AnioFin';
        const [seasonRows] = await pool.query(
            temporadaParam
                ? `SELECT ${COLS_TEMPORADA} FROM tblTemporadas WHERE IdTemporada = ? LIMIT 1`
                : `SELECT ${COLS_TEMPORADA} FROM tblTemporadas WHERE EsActiva = 1 LIMIT 1`,
            temporadaParam ? [temporadaParam] : [],
        ) as unknown as [Array<{
            IdTemporada: number; Temporada: string; EsActiva: number;
            FechaInicio: Date | string; AnioInicio: number; AnioFin: number;
        }>, unknown];

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
                COUNT(DISTINCT P.IdJugador) AS CantidadJugadores,
                /* Escudo del torneo, del catálogo de Copas y Ligas. La foto vive en la
                   liga, no en el producto, así que varios conceptos de la misma copa
                   comparten imagen. Solo viaja si la hay y cuándo cambió: la imagen la
                   pide el navegador a /api/copas-ligas/foto. */
                PR.IdLiga,
                CASE WHEN L.Foto IS NOT NULL AND L.Foto <> '' THEN 1 ELSE 0 END AS TieneFoto,
                DATE_FORMAT(L.FechaAct, '%Y%m%d%H%i%s') AS FotoVersion
            FROM tblProductos PR
            LEFT JOIN tblTiposProductos TP ON PR.IdTipoProducto = TP.IdTipoProducto
            LEFT JOIN tblLigas L ON L.IdLiga = PR.IdLiga
            LEFT JOIN tblPagos P ON PR.IdProducto = P.IdProducto AND P.IdTemporada = ? AND P.Status = 0
            WHERE PR.IdTipoProducto IN (3, 4) AND ${filtroClinics}
            GROUP BY PR.IdProducto, PR.Producto, PR.IdTipoProducto, TP.TipoProducto,
                     PR.IdLiga, TieneFoto, FotoVersion
            -- Sin un solo pago en la temporada, el torneo no se muestra: el catálogo
            -- arrastra productos de años anteriores y llenaban la pantalla de tarjetas
            -- en cero. Se filtra por número de pagos y no por importe, porque un pago
            -- de cero pesos sigue siendo un movimiento de esta temporada.
            HAVING CantidadPagos > 0
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
                AND ${filtroClinics}
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

        /* 3. Sugerencias: torneos de la lista que parecen pertenecer a la temporada
           INMEDIATA ANTERIOR (misma regla de "anterior" que loadSeasonAndPrevious:
           por FechaInicio, con IdTemporada de desempate). Tres señales, todas
           explicables al usuario; basta una para sugerir, y cada tarjeta lista las
           suyas para que quien decide vea el porqué:
             a) el nombre menciona un año que solo toca la temporada anterior;
             b) tiene pagos con fecha ANTERIOR al inicio de la temporada del filtro
                (no se compara contra el fin de la anterior porque los rangos de
                tblTemporadas se traslapan en algunos meses);
             c) el mismo torneo recaudó más pagos en la anterior que aquí (los de
                aquí parecen arrastre de captura). */
        const [prevRows] = await pool.query(
            `SELECT IdTemporada, Temporada,
                    YEAR(FechaInicio) AS AnioInicio, YEAR(FechaFin) AS AnioFin
             FROM tblTemporadas
             WHERE (FechaInicio < ?) OR (FechaInicio = ? AND IdTemporada < ?)
             ORDER BY FechaInicio DESC, IdTemporada DESC
             LIMIT 1`,
            [season.FechaInicio, season.FechaInicio, seasonId],
        ) as unknown as [Array<{ IdTemporada: number; Temporada: string; AnioInicio: number; AnioFin: number }>, unknown];
        const anterior = prevRows[0] ?? null;

        const sugeridos: SugerenciaProducto[] = [];
        if (anterior && rows.length > 0) {
            const ids = rows.map((p) => Number(p.IdProducto));

            // Pagos del mismo torneo en la temporada anterior (señal c).
            const [enAnterior] = await pool.query(
                `SELECT IdProducto, COUNT(*) AS Pagos
                 FROM tblPagos
                 WHERE IdTemporada = ? AND Status = 0 AND IdProducto IN (?)
                 GROUP BY IdProducto`,
                [anterior.IdTemporada, ids],
            ) as unknown as [Array<{ IdProducto: number; Pagos: number }>, unknown];
            const pagosEnAnterior = new Map(enAnterior.map((r) => [Number(r.IdProducto), Number(r.Pagos)]));

            // Pagos de ESTA temporada fechados antes de que arrancara (señal b).
            const [fechadosAntes] = await pool.query(
                `SELECT IdProducto, COUNT(*) AS Pagos
                 FROM tblPagos
                 WHERE IdTemporada = ? AND Status = 0 AND IdProducto IN (?)
                   AND FechaPago IS NOT NULL AND DATE(FechaPago) < DATE(?)
                 GROUP BY IdProducto`,
                [seasonId, ids, season.FechaInicio],
            ) as unknown as [Array<{ IdProducto: number; Pagos: number }>, unknown];
            const pagosFechadosAntes = new Map(fechadosAntes.map((r) => [Number(r.IdProducto), Number(r.Pagos)]));

            const aniosActual = aniosDeTemporada(Number(season.AnioInicio), Number(season.AnioFin));
            const aniosAnterior = aniosDeTemporada(Number(anterior.AnioInicio), Number(anterior.AnioFin));

            for (const p of rows) {
                const id = Number(p.IdProducto);
                const cantidadPagos = Number(p.CantidadPagos) || 0;
                const razones: string[] = [];

                const anioEnNombre = [...String(p.Producto).matchAll(/\b(20\d{2})\b/g)]
                    .map((m) => Number(m[1]))
                    .find((a) => aniosAnterior.has(a) && !aniosActual.has(a));
                if (anioEnNombre) {
                    razones.push(`El nombre menciona ${anioEnNombre}, año que solo abarca la temporada anterior`);
                }

                const antesDeIniciar = pagosFechadosAntes.get(id) ?? 0;
                if (antesDeIniciar > 0) {
                    razones.push(antesDeIniciar === cantidadPagos
                        ? `Sus ${cantidadPagos} pago(s) tienen fecha anterior al inicio de esta temporada`
                        : `${antesDeIniciar} de ${cantidadPagos} pagos tienen fecha anterior al inicio de esta temporada`);
                }

                const enLaAnterior = pagosEnAnterior.get(id) ?? 0;
                if (enLaAnterior > cantidadPagos) {
                    razones.push(`En la temporada anterior recaudó ${enLaAnterior} pagos y aquí solo ${cantidadPagos}`);
                }

                if (razones.length > 0) {
                    sugeridos.push({
                        IdProducto: id,
                        Producto: String(p.Producto),
                        IdTipoProducto: Number(p.IdTipoProducto),
                        TipoProducto: String(p.TipoProducto),
                        CantidadPagos: cantidadPagos,
                        TotalRecaudado: Number(p.TotalRecaudado) || 0,
                        Razones: razones,
                    });
                }
            }
            // Primero los casos con más señales; a igualdad, alfabético.
            sugeridos.sort((a, b) =>
                b.Razones.length - a.Razones.length || a.Producto.localeCompare(b.Producto, 'es'));
        }

        return NextResponse.json({
            success: true,
            season: { IdTemporada: season.IdTemporada, Temporada: season.Temporada },
            soloClinics,
            // Contra qué temporada se midió el adeudo (puede no ser la del filtro).
            temporadaAdeudos: temporadas
                ? { IdTemporada: temporadas.actual.seasonId, Temporada: temporadas.actual.temporadaNombre }
                : null,
            alerta: {
                jugadores: globales.size,
                deudores: [...globales.values()].sort(ordenar),
            },
            // Torneos que parecen de la temporada anterior; null si no hay anterior.
            sugerencias: anterior
                ? {
                    temporadaAnterior: { IdTemporada: anterior.IdTemporada, Temporada: anterior.Temporada },
                    productos: sugeridos,
                }
                : null,
            data,
        }, { headers: { 'Cache-Control': 'no-store' } });
    } catch (error) {
        console.error('Error in pagos-copas summary:', error);
        return NextResponse.json({ success: false, message: 'Error interno del servidor' }, { status: 500 });
    }
}
