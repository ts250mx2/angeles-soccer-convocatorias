import { NextResponse } from 'next/server';
import { pool } from '@/lib/db';
import { sincronizarPagados, sincronizarPrecios } from '@/lib/convocatorias-crear';
import { sqlFueraDeConvocatorias } from '@/lib/convocatorias-excluidas';

export const dynamic = 'force-dynamic';

/**
 * Pone al corriente las convocatorias existentes y AVISA de las que faltarían.
 *
 * Antes esta ruta (`autogenerar`) creaba sola las convocatorias de las ligas y copas ya
 * pagadas. Ya no: aparecían renglones en la base que nadie había capturado, y una vez
 * creados había que ir a borrarlos. Ahora solo se informa, y darlas de alta es una
 * decisión de quien captura, desde la pantalla de alta con los renglones precargados.
 *
 * Lo que SÍ sigue haciendo sola, porque no crea nada y sin ello el resumen mentiría:
 *
 *   sincronizarPagados   Quien pagó su liga o copa queda marcado como convocado en la
 *                        convocatoria que YA existe. Los pagos entran después del alta.
 *   sincronizarPrecios   El precio del sistema manda: un cambio de tarifa o de beca se
 *                        refleja en los ya convocados.
 *
 * La llave del negocio es (Temporada, Liga, Categoría): el producto pagado dice la liga
 * y el jugador dice la categoría. El color no entra —es un desempate del alta manual, no
 * parte de la identidad del torneo—, así que una categoría ya convocada en cualquier
 * color no se reporta como faltante.
 */

/** Tipos de producto que representan una liga o una copa. */
const TIPO_PRODUCTO_LIGA = 3;
const TIPO_PRODUCTO_COPA = 4;

interface Temporada {
    IdTemporada: number;
    FechaInicio: string;
    FechaFin: string;
}

interface FaltanteRow {
    IdLiga: number;
    Liga: string;
    /** 1 liga, 2 copa: la pantalla acotada a un tipo solo avisa de los suyos. */
    IdTipoLiga: number | null;
    Categoria: string;
    Jugadores: number;
}

interface ConflictoRow {
    IdLiga: number;
    Liga: string;
    IdTipoLiga: number | null;
    Categoria: string;
    IdJugador: number;
    Jugador: string;
}

interface DestinoRow {
    IdLiga: number;
    Categoria: string;
    Color: string | null;
}

const anioCategoria = (categoria: string): number | null => {
    const match = categoria.match(/(?:19|20)\d{2}/);
    return match ? Number(match[0]) : null;
};

/**
 * Propone la categoria mas cercana. En empate favorece la categoria mayor (un grupo
 * de ninos mas grandes), que es el movimiento habitual para un invitado.
 */
const sugerirDestino = (origen: string, destinos: DestinoRow[]): DestinoRow | null => {
    if (destinos.length === 0) return null;
    const anioOrigen = anioCategoria(origen);
    return [...destinos].sort((a, b) => {
        const anioA = anioCategoria(a.Categoria);
        const anioB = anioCategoria(b.Categoria);
        if (anioOrigen !== null && anioA !== null && anioB !== null) {
            const distancia = Math.abs(anioA - anioOrigen) - Math.abs(anioB - anioOrigen);
            if (distancia !== 0) return distancia;
            const aEsMayor = anioA <= anioOrigen ? 0 : 1;
            const bEsMayor = anioB <= anioOrigen ? 0 : 1;
            if (aEsMayor !== bEsMayor) return aEsMayor - bEsMayor;
        }
        return a.Categoria.localeCompare(b.Categoria) || String(a.Color ?? '').localeCompare(String(b.Color ?? ''));
    })[0];
};

export async function POST() {
    try {
        const [temporadas] = (await pool.query(
            `SELECT IdTemporada, DATE_FORMAT(FechaInicio, '%Y-%m-%d') AS FechaInicio,
                    DATE_FORMAT(FechaFin, '%Y-%m-%d') AS FechaFin
             FROM tblTemporadas WHERE EsActiva = 1 LIMIT 1`,
        )) as unknown as [Temporada[], unknown];

        if (temporadas.length === 0) {
            return NextResponse.json(
                { success: false, message: 'No hay temporada activa' },
                { status: 404 },
            );
        }
        const temporada = temporadas[0];

        const [ligas] = (await pool.query(
            'SELECT DISTINCT IdLiga FROM tblConvocatorias WHERE IdTemporada = ? AND Status = 0',
            [temporada.IdTemporada],
        )) as unknown as [Array<{ IdLiga: number }>, unknown];

        let convocadosPorPago = 0;
        let preciosActualizados = 0;
        for (const l of ligas) {
            convocadosPorPago += await sincronizarPagados(pool, temporada.IdTemporada, l.IdLiga);
            preciosActualizados += await sincronizarPrecios(pool, temporada.IdTemporada, l.IdLiga);
        }

        /* Ligas y copas pagadas de la temporada que todavía no tienen convocatoria. Se
           informan con cuánta gente pagó, que es lo que decide si vale la pena darlas de
           alta o si fue un cobro suelto mal capturado. */
        const [conflictos] = (await pool.query(
            `SELECT DISTINCT PR.IdLiga, L.Liga, L.IdTipoLiga, J.Categoria,
                    J.IdJugador, J.Jugador
             FROM tblPagos P
             INNER JOIN tblProductos PR ON PR.IdProducto = P.IdProducto
             INNER JOIN tblJugadores J ON J.IdJugador = P.IdJugador
             INNER JOIN tblLigas L ON L.IdLiga = PR.IdLiga
             WHERE P.Status = 0
               AND P.IdTemporada = ?
               AND PR.IdTipoProducto IN (${TIPO_PRODUCTO_LIGA}, ${TIPO_PRODUCTO_COPA})
               AND PR.IdLiga IS NOT NULL
               AND COALESCE(TRIM(J.Categoria), '') <> ''
               AND NOT ${sqlFueraDeConvocatorias('J.Categoria')}
               AND NOT ${sqlFueraDeConvocatorias('L.Liga')}
               AND NOT EXISTS (
                   SELECT 1 FROM tblConvocatorias C
                   WHERE C.IdTemporada = P.IdTemporada
                     AND C.IdLiga = PR.IdLiga
                     AND C.Categoria = J.Categoria
                     AND C.Status = 0
               )
               -- Si ya se acomodo como invitado en otra categoria, el conflicto quedo
               -- resuelto aunque su categoria natural siga sin convocatoria.
               AND NOT EXISTS (
                   SELECT 1
                     FROM tblDetalleConvocatorias D
                     INNER JOIN tblConvocatorias C2
                       ON C2.IdTemporada = D.IdTemporada
                      AND C2.IdLiga = D.IdLiga
                      AND C2.Categoria = D.Categoria
                      AND COALESCE(C2.Color, '') = COALESCE(D.Color, '')
                      AND C2.Status = 0
                    WHERE D.IdTemporada = P.IdTemporada
                      AND D.IdLiga = PR.IdLiga
                      AND D.IdJugador = P.IdJugador
                      AND D.EsConvocado = 1
               )
             ORDER BY L.Liga, J.Categoria, J.Jugador`,
            [temporada.IdTemporada],
        )) as unknown as [ConflictoRow[], unknown];

        const idsLiga = [...new Set(conflictos.map((f) => Number(f.IdLiga)))];
        let destinos: DestinoRow[] = [];
        if (idsLiga.length > 0) {
            const [rows] = (await pool.query(
                `SELECT IdLiga, Categoria, Color
                   FROM tblConvocatorias
                  WHERE IdTemporada = ? AND Status = 0 AND Cerrada = 0
                    AND IdLiga IN (?)
                    AND NOT ${sqlFueraDeConvocatorias('Categoria')}
                  ORDER BY Categoria, Color`,
                [temporada.IdTemporada, idsLiga],
            )) as unknown as [DestinoRow[], unknown];
            destinos = rows;
        }

        const faltantesMap = new Map<string, FaltanteRow>();
        for (const f of conflictos) {
            const key = `${f.IdLiga}\u0000${f.Categoria}`;
            const actual = faltantesMap.get(key);
            if (actual) actual.Jugadores += 1;
            else faltantesMap.set(key, {
                IdLiga: f.IdLiga,
                Liga: f.Liga,
                IdTipoLiga: f.IdTipoLiga,
                Categoria: f.Categoria,
                Jugadores: 1,
            });
        }
        const faltantes = [...faltantesMap.values()];

        return NextResponse.json({
            success: true,
            seasonId: Number(temporada.IdTemporada),
            convocadosPorPago,
            preciosActualizados,
            faltantes: faltantes.map((f) => ({
                idLiga: Number(f.IdLiga),
                liga: String(f.Liga ?? ''),
                idTipoLiga: Number(f.IdTipoLiga) || 1,
                categoria: String(f.Categoria ?? ''),
                jugadores: Number(f.Jugadores) || 0,
            })),
            conflictos: conflictos.map((f) => {
                const opciones = destinos.filter((d) => Number(d.IdLiga) === Number(f.IdLiga));
                const sugerida = sugerirDestino(String(f.Categoria ?? ''), opciones);
                return {
                    idLiga: Number(f.IdLiga),
                    liga: String(f.Liga ?? ''),
                    idTipoLiga: Number(f.IdTipoLiga) || 1,
                    idJugador: Number(f.IdJugador),
                    jugador: String(f.Jugador ?? ''),
                    categoriaOrigen: String(f.Categoria ?? ''),
                    destinos: opciones.map((d) => ({
                        categoria: String(d.Categoria ?? ''),
                        color: String(d.Color ?? ''),
                    })),
                    sugerida: sugerida ? {
                        categoria: String(sugerida.Categoria ?? ''),
                        color: String(sugerida.Color ?? ''),
                    } : null,
                };
            }),
        });
    } catch (error) {
        console.error('Error revisando convocatorias pendientes:', error);
        return NextResponse.json(
            {
                success: false,
                message: 'Error al revisar las convocatorias pendientes',
                error: error instanceof Error ? error.message : 'Unknown error',
            },
            { status: 500 },
        );
    }
}
