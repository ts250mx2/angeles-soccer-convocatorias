import { NextResponse } from 'next/server';
import { pool } from '@/lib/db';
import {
    JUGADORES_DE_TEMPORADA_SQL,
    MENSUALIDADES_EN_TEMPORADA_SQL,
    INSCRIPCION_PREVIA_SQL,
    MESES_ANTICIPO_SOSPECHOSO,
    TIPO_PRODUCTO_INSCRIPCION,
    TIPO_PRODUCTO_MENSUALIDAD,
} from '@/lib/temporada';
import { ES_VENTA_PUBLICO, esKeeperOPortero, esFutsal, esClinicsFutsal, esFueraDeLugarKeeper } from '@/lib/jugador-filtros';

/** Jugadores con al menos un pago de inscripción de CUALQUIER temporada (regla keeper). */
const CUALQUIER_INSCRIPCION_SQL = `
    SELECT A.IdJugador FROM tblPagos A
    INNER JOIN tblProductos B ON A.IdProducto = B.IdProducto
    WHERE B.IdTipoProducto = ${TIPO_PRODUCTO_INSCRIPCION} AND A.Status = 0
`;

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

/** Lo que la consulta de pagos aporta a cada jugador de la lista. */
interface DatosDePago {
    FechaInscripcion: string | null;
    MesesPagados: string;
    PagosAnticipados: number;
}

/**
 * Fecha de inscripción y meses pagados, SOLO de los jugadores que se van a mostrar.
 *
 * Antes esto viajaba como dos LEFT JOIN a subconsultas agregadas sobre toda la tabla de
 * pagos: se agregaban los 85 mil pagos para quedarse con los de unos cientos de
 * jugadores, y costaba ~1.4 s en cada apertura del detalle. Acotado por los ids que ya
 * se van a listar, el índice por jugador hace el trabajo y baja a decenas de ms.
 *
 * Las dos cifras salen en una sola pasada con agregación condicional, porque cada una
 * mira pagos distintos del mismo jugador:
 *
 *   FechaInscripcion  El primer pago de INSCRIPCIÓN de la temporada consultada. En el
 *                     corte "sin inscripción" queda nula a propósito: esos jugadores no
 *                     tienen ese pago, y mostrar ahí la fecha del primer abono se leía
 *                     como si el pago fuera de ese mes.
 *
 *   MesesPagados      Los meses-año amparados por MENSUALIDADES dentro del rango de la
 *                     temporada. Se identifican por Anio*100+Mes para que una temporada
 *                     a caballo del fin de año no mezcle los eneros de dos años.
 *
 * FechaPago ya está en hora LOCAL (sigue el reloj NOW() del servidor, igual que
 * tblAperturasCierres), así que NO se le aplica CONVERT_TZ. Además se formatea en SQL y
 * viaja como texto: si viajara como DATETIME, mysql2 y el navegador la desplazarían.
 */
async function datosDePago(
    idJugadores: number[],
    temporadaId: string | null,
): Promise<Map<number, DatosDePago>> {
    if (idJugadores.length === 0) return new Map();

    /* Con temporada, el rango de meses sale de tblTemporadas dentro del propio SQL, para
       no depender de cómo interprete JavaScript las fechas. Sin temporada no hay meses
       que pintar y la fecha de inscripción es la del primer pago de inscripción. */
    const enRango = temporadaId
        ? `(P.Anio * 100 + P.Mes) BETWEEN (YEAR(T.FechaInicio) * 100 + MONTH(T.FechaInicio))
                                      AND (YEAR(T.FechaFin) * 100 + MONTH(T.FechaFin))`
        : '0';
    const joinTemporada = temporadaId ? 'INNER JOIN tblTemporadas T ON T.IdTemporada = ?' : '';
    const filtroInscripcion = temporadaId
        ? `PR.IdTipoProducto = ${TIPO_PRODUCTO_INSCRIPCION} AND P.IdTemporada = ?`
        : `PR.IdTipoProducto = ${TIPO_PRODUCTO_INSCRIPCION}`;
    const anticipado = temporadaId
        ? `TIMESTAMPDIFF(MONTH, P.FechaPago, T.FechaInicio) >= ${MESES_ANTICIPO_SOSPECHOSO}`
        : '0';

    const params: unknown[] = [];
    if (temporadaId) params.push(temporadaId, temporadaId);
    params.push(idJugadores);

    const [filas] = (await pool.query(
        `SELECT P.IdJugador,
                DATE_FORMAT(
                    MIN(CASE WHEN ${filtroInscripcion} THEN P.FechaPago END), '%d/%m/%Y'
                ) AS FechaInscripcion,
                GROUP_CONCAT(DISTINCT CASE
                    WHEN PR.IdTipoProducto = ${TIPO_PRODUCTO_MENSUALIDAD}
                     AND P.Anio IS NOT NULL AND P.Mes BETWEEN 1 AND 12 AND ${enRango}
                    THEN P.Anio * 100 + P.Mes END
                ) AS MesesPagados,
                SUM(CASE
                    WHEN PR.IdTipoProducto = ${TIPO_PRODUCTO_MENSUALIDAD}
                     AND P.Anio IS NOT NULL AND P.Mes BETWEEN 1 AND 12 AND ${enRango}
                     AND ${anticipado}
                    THEN 1 ELSE 0 END
                ) AS PagosAnticipados
         FROM tblPagos P
         INNER JOIN tblProductos PR ON PR.IdProducto = P.IdProducto
         ${joinTemporada}
         WHERE P.Status = 0 AND P.IdJugador IN (?)
         GROUP BY P.IdJugador`,
        params,
    )) as [Array<{ IdJugador: number; FechaInscripcion: string | null; MesesPagados: string | null; PagosAnticipados: number | null }>, unknown];

    return new Map(filas.map((f) => [
        Number(f.IdJugador),
        {
            FechaInscripcion: f.FechaInscripcion,
            MesesPagados: f.MesesPagados ?? '',
            PagosAnticipados: Number(f.PagosAnticipados ?? 0),
        },
    ]));
}

/**
 * Lista de jugadores. Todos los filtros son opcionales pero se exige al menos
 * sede o temporada para no devolver la tabla completa.
 *
 * filtro:
 *   activos         Status 0, plantilla completa (sin exigir pertenencia a la temporada)
 *   inscritos       Status 0 y con pago de inscripción en la temporada
 *   becados         los anteriores, con beca
 *   bajas           Status 2
 *   sin-inscripcion Status 0, con mensualidad de los meses-año de la temporada
 *                   pero SIN pago de inscripción
 *   todos           sin corte adicional
 *
 * Las pertenencias (inscrito en la temporada, con mensualidades, con inscripción previa)
 * se resuelven con LEFT JOIN a subconsultas y NO con `IN (subconsulta)`. La diferencia
 * no es de estilo: MySQL convertía cada `IN` en una subconsulta DEPENDIENTE que se
 * ejecutaba una vez POR JUGADOR, y el detalle de reinscripciones —que combina ese `IN`
 * con los agregados— tardaba 99 segundos. Materializado cada conjunto una sola vez, la
 * misma lista sale en un par de segundos. Es el mismo patrón que usa
 * /api/inscripciones/sedes.
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
        /* Plantilla completa: todos los Status 0 de la sede, sin exigir pertenencia a
           la temporada. Sirve para contrastar el total de activos contra los inscritos. */
        const esActivos = filtro === 'activos';

        if (esSinInscripcion && !temporadaId) {
            return NextResponse.json(
                { success: false, message: 'Este filtro requiere una temporada' },
                { status: 400 }
            );
        }

        /* Conjuntos de pertenencia, cada uno materializado una vez. Los JOIN van ANTES
           del WHERE, así que sus parámetros también: por eso viajan en su propia lista. */
        const joins: string[] = [];
        const joinParams: unknown[] = [];

        if (temporadaId) {
            joins.push(`
                LEFT JOIN (
                    SELECT DISTINCT IdJugador FROM (${JUGADORES_DE_TEMPORADA_SQL}) X
                ) INS ON INS.IdJugador = J.IdJugador`);
            joinParams.push(temporadaId);

            joins.push(`
                LEFT JOIN (
                    SELECT DISTINCT IdJugador FROM (${MENSUALIDADES_EN_TEMPORADA_SQL}) X
                ) MEN ON MEN.IdJugador = J.IdJugador`);
            joinParams.push(temporadaId);
        }

        // Inscripción de cualquier temporada: la regla keeper la necesita siempre.
        joins.push(`
            LEFT JOIN (
                SELECT DISTINCT IdJugador FROM (${CUALQUIER_INSCRIPCION_SQL}) X
            ) KINS ON KINS.IdJugador = J.IdJugador`);

        /* Corte por primera inscripción del jugador (requiere temporada):
             nueva         = es su primera inscripción histórica (sin previa)
             reinscripcion = ya tenía inscripción en una temporada anterior */
        const tipoInscripcion = searchParams.get('tipoInscripcion');
        const cortaPorTipo = Boolean(temporadaId)
            && (tipoInscripcion === 'nueva' || tipoInscripcion === 'reinscripcion')
            && (filtro === 'inscritos' || filtro === 'becados');

        if (cortaPorTipo) {
            joins.push(`
                LEFT JOIN (
                    SELECT DISTINCT IdJugador FROM (${INSCRIPCION_PREVIA_SQL}) X
                ) PREV ON PREV.IdJugador = J.IdJugador`);
            joinParams.push(temporadaId);
        }

        const where: string[] = [];
        const params: unknown[] = [];

        if (sedeIdParam) {
            where.push('J.IdSede = ?');
            params.push(parseInt(sedeIdParam));
        }
        if (categoria) {
            where.push('J.Categoria = ?');
            params.push(categoria);
        }
        /* Corte por sexo: '1' hombres, '2' mujeres, 'sin' lo que no tiene el dato.
           Va por J.Genero y no por GeneroDesc, que se captura de dos formas
           ('MASCULINO' y 'HOMBRE', 'FEMENINO' y 'MUJER'); es el mismo criterio con el
           que el resumen por sede cuenta a unos y a otras, para que el listado y la
           cifra de la tarjeta no puedan discrepar. */
        const genero = searchParams.get('genero');
        if (genero === '1' || genero === '2') {
            where.push('J.Genero = ?');
            params.push(Number(genero));
        } else if (genero === 'sin') {
            where.push('(J.Genero IS NULL OR J.Genero NOT IN (1, 2))');
        }

        // '0' = solo sedes normales, '1' = solo clinics, ausente = ambas.
        const clinicsParam = searchParams.get('clinics');
        if (clinicsParam === '0' || clinicsParam === '1') {
            where.push('COALESCE(S.EsClinics, 0) = ?');
            params.push(Number(clinicsParam));
        }

        /* "Inscrito" en la temporada: pagó su inscripción, o es keeper/portero y pagó
           inscripción o alguna mensualidad de los meses de la temporada.
           MISMA regla que el resumen por sede: si el modal usara la regla histórica de
           keeper (cualquier inscripción de cualquier temporada) listaría a 72 keepers
           mientras la tarjeta cuenta los de la temporada. */
        const ES_KEEPER = esKeeperOPortero('S');
        const inscritoSql = temporadaId
            ? `(INS.IdJugador IS NOT NULL OR (${ES_KEEPER} AND MEN.IdJugador IS NOT NULL))`
            : `(${ES_KEEPER} AND KINS.IdJugador IS NOT NULL)`;
        // Segmento de plantilla / inscritos.
        const grupo = searchParams.get('grupo');

        if (esSinInscripcion) {
            /* Pagó mensualidad de los meses-año de la temporada pero NO está inscrito
               (ni de esta temporada ni por la regla keeper). */
            where.push('MEN.IdJugador IS NOT NULL');
            where.push(`NOT ${inscritoSql}`);
            where.push('J.Status = 0');
            where.push(`NOT ${ES_VENTA_PUBLICO}`);
        } else if (esActivos) {
            where.push('J.Status = 0');
        } else if (filtro === 'inscritos' || filtro === 'becados') {
            // Inscritos con regla keeper; se excluye venta al público.
            where.push('J.Status = 0');
            where.push(inscritoSql);
            where.push(`NOT ${ES_VENTA_PUBLICO}`);
            if (filtro === 'becados') {
                where.push("J.Beca IS NOT NULL AND J.Beca <> '0' AND J.Beca <> ''");
            }
            if (cortaPorTipo) {
                where.push(
                    tipoInscripcion === 'reinscripcion'
                        ? 'PREV.IdJugador IS NOT NULL'
                        : 'PREV.IdJugador IS NULL'
                );
            }
        } else if (filtro === 'fuera-de-lugar') {
            /* Activos dados de alta en una sede de keepers cuya categoría no es de
               portero. No salen en ningún otro conteo: es la lista de la advertencia. */
            where.push('J.Status = 0');
            where.push(esFueraDeLugarKeeper('S'));
        } else if (filtro === 'bajas') {
            where.push('J.Status = 2');
            if (temporadaId) where.push('INS.IdJugador IS NOT NULL');
            where.push(`NOT ${ES_VENTA_PUBLICO}`);
        } else {
            // 'todos'
            if (temporadaId) where.push('INS.IdJugador IS NOT NULL');
        }

        /* Segmento: separa keepers/porteros, futsal y venta al público del resto.
           Compone con el filtro base. Prioridad: venta pública > keepers > futsal >
           normal. El futsal cuenta como sede normal, solo se separa en el KPI. */
        const ES_FUTSAL = esFutsal('S');
        const ES_CLINICS_FUTSAL = esClinicsFutsal('S');
        if (grupo === 'keepers') {
            where.push(`${ES_KEEPER} AND NOT ${ES_VENTA_PUBLICO} AND NOT ${ES_CLINICS_FUTSAL}`);
        } else if (grupo === 'futsal') {
            where.push(`${ES_FUTSAL} AND NOT ${ES_KEEPER} AND NOT ${ES_VENTA_PUBLICO}`);
        } else if (grupo === 'clinicsfutsal') {
            where.push(`${ES_CLINICS_FUTSAL} AND NOT ${ES_VENTA_PUBLICO}`);
        } else if (grupo === 'ventapublico') {
            where.push(ES_VENTA_PUBLICO);
        } else if (grupo === 'normal') {
            where.push(`NOT ${ES_FUTSAL} AND NOT ${ES_KEEPER} AND NOT ${ES_CLINICS_FUTSAL} AND NOT ${ES_VENTA_PUBLICO}`);
        }

        /* Meses de la temporada para los cuadritos de la pantalla. */
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
            ) as [Array<{ Desde: number; Hasta: number; Hoy: number }>, unknown];

            if (rangoRows.length > 0) {
                meses = expandirMeses(Number(rangoRows[0].Desde), Number(rangoRows[0].Hasta));
                mesActual = Number(rangoRows[0].Hoy);
            }
        }

        /* La inscripción pagada se decide con los mismos conjuntos del WHERE: un
           keeper/portero con inscripción de cualquier temporada (KINS) cuenta como
           inscrito aunque no la tenga de esta. */
        const inscripcionPagadaSql = temporadaId
            ? `CASE WHEN INS.IdJugador IS NOT NULL OR (${ES_KEEPER} AND KINS.IdJugador IS NOT NULL)
                    THEN 1 ELSE 0 END`
            : '0';

        const query = `
            SELECT
                J.IdJugador,
                J.Jugador,
                J.Categoria,
                J.Status,
                J.Beca,
                J.Genero,
                /* La fecha de nacimiento se formatea en SQL y viaja como texto: es un
                   dia del calendario, no un instante, y como DATETIME se corre un dia
                   en cuanto el navegador la interpreta en otro huso. */
                DATE_FORMAT(J.FechaNacimiento, '%d/%m/%Y') as FechaNacimiento,
                J.IdSede,
                COALESCE(S.Sede, J.Sede) as SedeNombre,
                ${inscripcionPagadaSql} as InscripcionPagada
            FROM tblJugadores J
            LEFT JOIN tblSedes S ON J.IdSede = S.IdSede
            ${joins.join('\n')}
            WHERE ${where.join(' AND ')}
            ORDER BY SedeNombre ASC, J.Categoria ASC, J.Jugador ASC
            LIMIT ${MAX_ROWS}
        `;

        const [rows] = (await pool.query(query, [...joinParams, ...params])) as [
            Array<{ IdJugador: number }>, unknown,
        ];

        /* La fecha de inscripción no se pide en el corte "sin inscripción": esos
           jugadores no tienen ese pago y la columna debe quedar vacía. */
        const pagos = await datosDePago(rows.map((r) => Number(r.IdJugador)), temporadaId);
        const data = rows.map((fila) => {
            const extra = pagos.get(Number(fila.IdJugador));
            return {
                ...fila,
                FechaInscripcion: esSinInscripcion ? null : extra?.FechaInscripcion ?? null,
                MesesPagados: extra?.MesesPagados ?? '',
                PagosAnticipados: extra?.PagosAnticipados ?? 0,
            };
        });

        return NextResponse.json({
            success: true,
            data,
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
