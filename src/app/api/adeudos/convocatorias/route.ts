import { NextResponse } from 'next/server';
import { pool } from '@/lib/db';
import { CLAVE_ADEUDOS_SEDE } from '@/lib/navegacion';
import { requierePagina } from '@/lib/permisos';
import { TIPO_COPA } from '@/lib/copas-ligas';

export const dynamic = 'force-dynamic';

/**
 * Lo que se debe por haber sido CONVOCADO a una copa o a una liga.
 *
 * Es un adeudo distinto al de mensualidades y no se mezcla con él: la mensualidad se
 * debe por estar inscrito y la convocatoria por haber jugado un torneo concreto. Por eso
 * va en su propio apartado de la pantalla de Adeudos, y partido en dos —copas y ligas—,
 * que es como el club los cobra y los reporta.
 *
 * ── Cómo se calcula, y por qué se agrupa antes de restar ──
 *
 * La deuda es por (JUGADOR, LIGA): lo que suman sus convocatorias de ese torneo menos lo
 * que ha pagado de ese torneo. Agrupar primero NO es un detalle de estilo: los pagos se
 * registran contra la liga (tblProductos.IdLiga), no contra la convocatoria, así que un
 * jugador metido en dos convocatorias de la MISMA liga —hoy hay 7 casos— vería su pago
 * restado dos veces y saldría debiendo de menos, o incluso a favor.
 *
 * ── Qué entra ──
 *
 * TODAS las ligas, incluidas las que el módulo de Convocatorias no administra (INTERASE,
 * clinics). Ahí se excluyen porque no se arman desde el sistema; aquí no, porque esto es
 * dinero que alguien debe: son $13,500 en INTERASE que, filtrados, no aparecerían en
 * ninguna pantalla. Es una divergencia deliberada con `convocatorias-excluidas`.
 *
 * Solo cuenta quien está CONVOCADO (EsConvocado = 1) en una convocatoria vigente: a quien
 * está en la lista sin convocar no se le ha cobrado nada.
 */

/** El adeudo por jugador y liga. Es la base de los dos modos de esta ruta. */
const DEUDA_POR_JUGADOR_LIGA = `
    SELECT DC.IdJugador,
           DC.IdLiga,
           SUM(DC.Precio) AS Precio,
           /* El pago va contra la LIGA y la temporada, no contra la convocatoria: es
              como lo registra el cobro de copas y ligas. */
           COALESCE((
               SELECT SUM(P.Pago)
                 FROM tblPagos P
                 INNER JOIN tblProductos PR ON PR.IdProducto = P.IdProducto
                WHERE P.IdJugador = DC.IdJugador
                  AND P.IdTemporada = DC.IdTemporada
                  AND PR.IdLiga = DC.IdLiga
                  AND P.Status = 0
           ), 0) AS Pagado,
           /* Cuándo se juega lo más próximo de ese torneo. LEAST/GREATEST porque hay
              convocatorias con las fechas capturadas al revés. */
           MIN(LEAST(C.FechaInicio, C.FechaFin)) AS Desde,
           MAX(GREATEST(C.FechaInicio, C.FechaFin)) AS Hasta,
           MIN(C.Categoria) AS Categoria
      FROM tblDetalleConvocatorias DC
      INNER JOIN tblConvocatorias C
              ON C.IdTemporada = DC.IdTemporada AND C.IdLiga = DC.IdLiga
             AND C.Categoria = DC.Categoria
             AND COALESCE(C.Color, '') = COALESCE(DC.Color, '')
             AND C.Status = 0
     WHERE DC.IdTemporada = ? AND DC.EsConvocado = 1
     GROUP BY DC.IdJugador, DC.IdLiga
`;

/** Solo los que quedan debiendo. El centavo de margen evita la basura del punto flotante. */
const DEBE = 'D.Precio - D.Pagado > 0.009';

interface FilaResumen {
    IdLiga: number;
    Liga: string;
    EsCopa: number;
    TieneFoto: number;
    FotoVersion: string | null;
    Jugadores: number;
    Deuda: string | number;
    Desde: string | null;
}

interface FilaDetalle {
    IdJugador: number;
    Jugador: string | null;
    IdSede: number;
    Sede: string | null;
    Categoria: string | null;
    Liga: string | null;
    Desde: string | null;
    Hasta: string | null;
    Precio: string | number;
    Pagado: string | number;
}

const num = (v: unknown): number => Number(v) || 0;

export async function GET(request: Request) {
    const guardia = await requierePagina(CLAVE_ADEUDOS_SEDE);
    if (!guardia.ok) {
        return NextResponse.json({ success: false, message: guardia.message }, { status: guardia.status });
    }

    try {
        const params = new URL(request.url).searchParams;
        const temporadaId = Number(params.get('temporadaId'));
        if (!Number.isInteger(temporadaId) || temporadaId <= 0) {
            return NextResponse.json({ success: false, message: 'Selecciona una temporada.' }, { status: 400 });
        }

        /* Dos modos: el resumen que llena los dos paneles, y el detalle que se abre al
           pedir "ver los niños". El detalle acota por tipo de torneo y, si se pide, por
           sede; el resumen no acota nada porque la pantalla reparte por sede. */
        const detalle = params.get('detalle') === '1';
        if (!detalle) {
            /* Se agrupa por TORNEO y no por sede: quien cobra esto lo cobra por copa
               —"los que deben la GOLD"—, no por campus, y así cada renglón puede llevar
               su escudo, que es como se reconocen de un vistazo. La sede no se pierde:
               sale por jugador en el detalle. El escudo NO viaja aquí (son data URIs de
               hasta 120 KB); solo si lo hay y cuándo cambió. */
            const [filas] = (await pool.query(
                `SELECT L.IdLiga,
                        L.Liga,
                        CASE WHEN L.IdTipoLiga = ${TIPO_COPA} THEN 1 ELSE 0 END AS EsCopa,
                        CASE WHEN L.Foto IS NOT NULL AND L.Foto <> '' THEN 1 ELSE 0 END AS TieneFoto,
                        DATE_FORMAT(L.FechaAct, '%Y%m%d%H%i%s') AS FotoVersion,
                        COUNT(DISTINCT D.IdJugador) AS Jugadores,
                        SUM(D.Precio - D.Pagado) AS Deuda,
                        DATE_FORMAT(MIN(D.Desde), '%d/%m/%Y') AS Desde
                   FROM (${DEUDA_POR_JUGADOR_LIGA}) D
                   INNER JOIN tblLigas L ON L.IdLiga = D.IdLiga
                  WHERE ${DEBE}
                  GROUP BY L.IdLiga, L.Liga, EsCopa, TieneFoto, FotoVersion
                  ORDER BY Deuda DESC`,
                [temporadaId],
            )) as [FilaResumen[], unknown];

            return NextResponse.json({
                success: true,
                data: filas.map((f) => ({
                    idLiga: num(f.IdLiga),
                    liga: String(f.Liga ?? '').trim(),
                    esCopa: num(f.EsCopa) === 1,
                    tieneFoto: num(f.TieneFoto),
                    fotoVersion: f.FotoVersion,
                    jugadores: num(f.Jugadores),
                    deuda: num(f.Deuda),
                    desde: f.Desde,
                })),
            });
        }

        const esCopa = params.get('tipo') === 'copa';
        /** 0 = todos los torneos de ese tipo; si no, solo ese. */
        const idLiga = Number(params.get('idLiga')) || 0;

        /* El detalle trae a TODOS los convocados, deban o no.
        
           No es un capricho: la pantalla dibuja por categoría el reparto entre quien pagó
           y quien debe, y ese porcentaje no se puede calcular con solo los deudores —con
           ellos siempre daría 100%—. Quién se muestra lo decide el navegador; el servidor
           manda el cuadro completo una vez y no dos veces según el filtro.
        
           El RESUMEN de arriba sigue contando solo deuda: es lo que anuncian los paneles
           y lo que se cobra. */

        const [filas] = (await pool.query(
            `SELECT D.IdJugador,
                    J.Jugador,
                    COALESCE(J.IdSede, 0) AS IdSede,
                    COALESCE(S.Sede, J.Sede, 'SIN SEDE') AS Sede,
                    D.Categoria,
                    L.Liga,
                    DATE_FORMAT(D.Desde, '%d/%m/%Y') AS Desde,
                    DATE_FORMAT(D.Hasta, '%d/%m/%Y') AS Hasta,
                    D.Precio,
                    D.Pagado
               FROM (${DEUDA_POR_JUGADOR_LIGA}) D
               INNER JOIN tblLigas L ON L.IdLiga = D.IdLiga
               INNER JOIN tblJugadores J ON J.IdJugador = D.IdJugador
               LEFT JOIN tblSedes S ON S.IdSede = J.IdSede
              WHERE (L.IdTipoLiga = ${TIPO_COPA}) = ?
                AND (? = 0 OR D.IdLiga = ?)
              ORDER BY D.Categoria ASC, J.Jugador ASC`,
            [temporadaId, esCopa ? 1 : 0, idLiga, idLiga],
        )) as [FilaDetalle[], unknown];

        return NextResponse.json({
            success: true,
            data: filas.map((f) => ({
                idJugador: num(f.IdJugador),
                jugador: String(f.Jugador ?? '').trim(),
                idSede: num(f.IdSede),
                sede: String(f.Sede ?? '').trim(),
                categoria: String(f.Categoria ?? '').trim(),
                liga: String(f.Liga ?? '').trim(),
                desde: f.Desde,
                hasta: f.Hasta,
                precio: num(f.Precio),
                pagado: num(f.Pagado),
                debe: num(f.Precio) - num(f.Pagado),
            })),
        });
    } catch (error) {
        console.error('Error al obtener los adeudos de convocatorias:', error);
        return NextResponse.json(
            { success: false, message: 'Error al obtener los adeudos de copas y ligas' },
            { status: 500 },
        );
    }
}
