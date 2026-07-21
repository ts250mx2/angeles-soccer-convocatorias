import { NextResponse } from 'next/server';
import { pool } from '@/lib/db';
import {
    JUGADORES_DE_TEMPORADA_SQL,
    MENSUALIDADES_EN_TEMPORADA_SQL,
    MESES_ANTICIPO_SOSPECHOSO,
    TIPO_PRODUCTO_INSCRIPCION,
    TIPO_PRODUCTO_MENSUALIDAD,
} from '@/lib/temporada';

export const dynamic = 'force-dynamic';

const MAX_ROWS = 2000;

/** Expande un rango Anio*100+Mes a la lista de meses que lo componen. */
function expandirMeses(desde: number, hasta: number) {
    const out: { codigo: number; mes: number; anio: number }[] = [];
    let anio = Math.floor(desde / 100);
    let mes = desde % 100;

    // El tope evita un bucle infinito si el rango viniera invertido o corrupto.
    for (let i = 0; i < 36; i++) {
        const codigo = anio * 100 + mes;
        if (codigo > hasta) break;
        out.push({ codigo, mes, anio });
        mes++;
        if (mes > 12) { mes = 1; anio++; }
    }
    return out;
}

/**
 * Lista de jugadores. Todos los filtros son opcionales pero se exige al menos
 * sede o temporada para no devolver la tabla completa.
 *
 * filtro:
 *   inscritos       Status 0 y con pago de inscripción en la temporada
 *   becados         los anteriores, con beca
 *   bajas           Status 2
 *   sin-inscripcion Status 0, con mensualidad de los meses-año de la temporada
 *                   pero SIN pago de inscripción
 *   todos           sin corte adicional
 */
export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const sedeIdParam = searchParams.get('sedeId');
        const categoria = searchParams.get('categoria');
        const temporadaId = searchParams.get('temporadaId');
        const filtro = searchParams.get('filtro') ?? 'todos';

        if (!sedeIdParam && !temporadaId) {
            return NextResponse.json(
                { success: false, message: 'Se requiere al menos sede o temporada' },
                { status: 400 }
            );
        }

        const esSinInscripcion = filtro === 'sin-inscripcion';

        if (esSinInscripcion && !temporadaId) {
            return NextResponse.json(
                { success: false, message: 'Este filtro requiere una temporada' },
                { status: 400 }
            );
        }

        const where: string[] = [];
        const params: any[] = [];

        if (sedeIdParam) {
            where.push('J.IdSede = ?');
            params.push(parseInt(sedeIdParam));
        }
        if (categoria) {
            where.push('J.Categoria = ?');
            params.push(categoria);
        }

        if (esSinInscripcion) {
            /* Pagó mensualidad de los meses-año de la temporada pero nunca la inscripción.
               No se aplica la pertenencia normal a la temporada: precisamente estos
               jugadores no la cumplen. */
            where.push(`J.IdJugador IN (${MENSUALIDADES_EN_TEMPORADA_SQL})`);
            params.push(temporadaId);
            where.push(`J.IdJugador NOT IN (${JUGADORES_DE_TEMPORADA_SQL})`);
            params.push(temporadaId);
            where.push('J.Status = 0');
        } else {
            if (temporadaId) {
                where.push(`J.IdJugador IN (${JUGADORES_DE_TEMPORADA_SQL})`);
                params.push(temporadaId);
            }

            if (filtro === 'inscritos') {
                where.push('J.Status = 0');
            } else if (filtro === 'bajas') {
                where.push('J.Status = 2');
            } else if (filtro === 'becados') {
                where.push("J.Status = 0 AND J.Beca IS NOT NULL AND J.Beca <> '0' AND J.Beca <> ''");
            }
        }

        /* Fecha de inscripción = primer pago de INSCRIPCIÓN (IdTipoProducto = 2)
           del jugador en la temporada consultada. En el corte "sin inscripción" queda
           nula a propósito: esos jugadores no tienen ese pago, y mostrar ahí la fecha
           del primer abono se leía como si el pago fuera de ese mes.

           Se resuelve con LEFT JOIN agregados y no con subconsultas correlacionadas:
           la versión correlacionada reescanea tblPagos por cada jugador y tarda minutos.

           FechaPago ya está en hora LOCAL (sigue el reloj NOW() del servidor, igual que
           tblAperturasCierres), así que NO se le aplica CONVERT_TZ. Además se formatea
           en SQL y viaja como texto: si viajara como DATETIME, mysql2 y el navegador
           volverían a desplazarla. */
        const temporadaClause = temporadaId ? 'AND P.IdTemporada = ?' : '';
        const selectParams: any[] = temporadaId ? [temporadaId] : [];

        /* Mensualidades cubiertas y estatus de inscripción, para los cuadritos.
           Los meses se identifican por Anio*100+Mes: así una temporada que cruce el
           fin de año no mezcla, por ejemplo, el enero de un año con el del otro. */
        let mesesJoin = '';
        let mesesSelect = "'' as MesesPagados, 0 as InscripcionPagada, 0 as PagosAnticipados";
        let meses: { codigo: number; mes: number; anio: number }[] = [];
        let mesActual: number | null = null;

        if (temporadaId) {
            const [rangoRows] = await pool.query(
                `SELECT
                    YEAR(FechaInicio) * 100 + MONTH(FechaInicio) as Desde,
                    YEAR(FechaFin)   * 100 + MONTH(FechaFin)   as Hasta,
                    YEAR(NOW())      * 100 + MONTH(NOW())      as Hoy
                 FROM tblTemporadas WHERE IdTemporada = ?`,
                [temporadaId]
            ) as any[];

            if (rangoRows.length > 0) {
                meses = expandirMeses(Number(rangoRows[0].Desde), Number(rangoRows[0].Hasta));
                mesActual = Number(rangoRows[0].Hoy);
            }

            mesesSelect = `
                COALESCE(MP.MesesPagados, '') as MesesPagados,
                CASE WHEN INS.IdJugador IS NOT NULL THEN 1 ELSE 0 END as InscripcionPagada,
                COALESCE(MP.PagosAnticipados, 0) as PagosAnticipados
            `;
            mesesJoin = `
                LEFT JOIN (
                    SELECT
                        P.IdJugador,
                        GROUP_CONCAT(DISTINCT (P.Anio * 100 + P.Mes)) as MesesPagados,
                        /* Cobrados mucho antes de que arrancara la temporada: casi
                           siempre el año quedó mal capturado. */
                        SUM(
                            TIMESTAMPDIFF(MONTH, P.FechaPago, T.FechaInicio) >= ${MESES_ANTICIPO_SOSPECHOSO}
                        ) as PagosAnticipados
                    FROM tblPagos P
                    INNER JOIN tblProductos PR ON P.IdProducto = PR.IdProducto
                    INNER JOIN tblTemporadas T ON T.IdTemporada = ?
                    WHERE P.Status = 0
                      AND PR.IdTipoProducto = ${TIPO_PRODUCTO_MENSUALIDAD}
                      AND P.Anio IS NOT NULL AND P.Mes BETWEEN 1 AND 12
                      AND (P.Anio * 100 + P.Mes)
                          BETWEEN (YEAR(T.FechaInicio) * 100 + MONTH(T.FechaInicio))
                              AND (YEAR(T.FechaFin) * 100 + MONTH(T.FechaFin))
                    GROUP BY P.IdJugador
                ) MP ON MP.IdJugador = J.IdJugador
                LEFT JOIN (
                    SELECT DISTINCT IdJugador FROM (${JUGADORES_DE_TEMPORADA_SQL}) I
                ) INS ON INS.IdJugador = J.IdJugador
            `;
            selectParams.push(temporadaId, temporadaId);
        }

        const query = `
            SELECT
                J.IdJugador,
                J.Jugador,
                J.Categoria,
                J.Status,
                J.Beca,
                J.IdSede,
                COALESCE(S.Sede, J.Sede) as SedeNombre,
                FI.FechaInscripcion,
                ${mesesSelect}
            FROM tblJugadores J
            LEFT JOIN tblSedes S ON J.IdSede = S.IdSede
            LEFT JOIN (
                SELECT
                    P.IdJugador,
                    DATE_FORMAT(MIN(P.FechaPago), '%d/%m/%Y') as FechaInscripcion
                FROM tblPagos P
                INNER JOIN tblProductos PR ON P.IdProducto = PR.IdProducto
                WHERE P.Status = 0
                  AND PR.IdTipoProducto = ${TIPO_PRODUCTO_INSCRIPCION}
                  ${temporadaClause}
                GROUP BY P.IdJugador
            ) FI ON FI.IdJugador = J.IdJugador
            ${mesesJoin}
            WHERE ${where.join(' AND ')}
            ORDER BY SedeNombre ASC, J.Categoria ASC, J.Jugador ASC
            LIMIT ${MAX_ROWS}
        `;

        const [rows] = await pool.query(query, [...selectParams, ...params]);

        return NextResponse.json({
            success: true,
            data: rows,
            config: { meses, mesActual },
        });
    } catch (error) {
        console.error('Error fetching players for inscripciones:', error);
        return NextResponse.json(
            { success: false, message: 'Error al obtener jugadores' },
            { status: 500 }
        );
    }
}
