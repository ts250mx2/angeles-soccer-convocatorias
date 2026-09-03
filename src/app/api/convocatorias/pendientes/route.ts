import { NextResponse } from 'next/server';
import { pool } from '@/lib/db';
import { sincronizarPrecios } from '@/lib/convocatorias-crear';
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
 * Un pago nunca convoca por sí solo. Si el niño pagó pero todavía no está convocado,
 * esta ruta lo devuelve como conflicto para que una persona elija su categoría. Lo
 * único que se sincroniza automáticamente son los precios de quienes YA están dentro.
 *
 * La llave del pago es (Temporada, Liga, Jugador). Para dar salida al aviso se ofrecen
 * las convocatorias abiertas de esa liga: primero su categoría natural, si existe, y
 * después las cercanas para poder acomodarlo como invitado.
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
        const exactaA = a.Categoria === origen ? 0 : 1;
        const exactaB = b.Categoria === origen ? 0 : 1;
        if (exactaA !== exactaB) return exactaA - exactaB;
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

        let preciosActualizados = 0;
        for (const l of ligas) {
            preciosActualizados += await sincronizarPrecios(pool, temporada.IdTemporada, l.IdLiga);
        }

        /* Todo niño que pagó una copa o liga y todavía no está convocado. Puede existir
           su categoría y estar simplemente pendiente de convocar, o puede no existir y
           requerir que se le acomode como invitado en otra. */
        const [conflictos] = (await pool.query(
            `SELECT PAG.IdLiga, L.Liga, L.IdTipoLiga, J.Categoria,
                    J.IdJugador, J.Jugador
             FROM (
                 SELECT DISTINCT PR.IdLiga, P.IdJugador
                   FROM tblPagos P
                   INNER JOIN tblProductos PR ON PR.IdProducto = P.IdProducto
                  WHERE P.Status = 0
                    AND P.IdTemporada = ?
                    AND PR.IdTipoProducto IN (${TIPO_PRODUCTO_LIGA}, ${TIPO_PRODUCTO_COPA})
                    AND PR.IdLiga IS NOT NULL
             ) PAG
             INNER JOIN tblJugadores J ON J.IdJugador = PAG.IdJugador
             INNER JOIN tblLigas L ON L.IdLiga = PAG.IdLiga
             LEFT JOIN (
                 SELECT DISTINCT D.IdLiga, D.IdJugador
                   FROM tblDetalleConvocatorias D
                   INNER JOIN tblConvocatorias C2
                     ON C2.IdTemporada = D.IdTemporada
                    AND C2.IdLiga = D.IdLiga
                    AND C2.Categoria = D.Categoria
                    AND COALESCE(C2.Color, '') = COALESCE(D.Color, '')
                    AND C2.Status = 0
                  WHERE D.IdTemporada = ? AND D.EsConvocado = 1
             ) CONV ON CONV.IdLiga = PAG.IdLiga AND CONV.IdJugador = PAG.IdJugador
             WHERE CONV.IdJugador IS NULL
               AND COALESCE(TRIM(J.Categoria), '') <> ''
               AND NOT ${sqlFueraDeConvocatorias('J.Categoria')}
               AND NOT ${sqlFueraDeConvocatorias('L.Liga')}
             ORDER BY L.Liga, J.Categoria, J.Jugador`,
            [temporada.IdTemporada, temporada.IdTemporada],
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
