import { NextResponse } from 'next/server';
import { pool } from '@/lib/db';
import { JUGADORES_DE_TEMPORADA_SQL, MENSUALIDADES_EN_TEMPORADA_SQL, INSCRIPCION_PREVIA_SQL, TIPO_PRODUCTO_INSCRIPCION } from '@/lib/temporada';
import { ES_VENTA_PUBLICO, esKeeperOPortero, esFutsal, esClinicsFutsal } from '@/lib/jugador-filtros';

/** Jugadores con inscripción de CUALQUIER temporada (regla keeper). */
const CUALQUIER_INSCRIPCION_SQL = `
    SELECT DISTINCT A.IdJugador FROM tblPagos A
    INNER JOIN tblProductos B ON A.IdProducto = B.IdProducto
    WHERE B.IdTipoProducto = ${TIPO_PRODUCTO_INSCRIPCION} AND A.Status = 0
`;

export const dynamic = 'force-dynamic';

/**
 * Resumen por sede de la temporada seleccionada.
 *
 * Las dos pertenencias (inscritos y "con pagos sin inscripción") se resuelven con
 * LEFT JOIN a subconsultas agregadas en vez de `IN (...)` por fila: así cada conjunto
 * se materializa una sola vez.
 *
 * Las sedes sin jugadores en la temporada siguen apareciendo en cero porque el filtro
 * vive en los JOIN, no en el WHERE.
 */
export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const temporadaId = searchParams.get('temporadaId');

        if (!temporadaId) {
            // Sin temporada: resumen global, sin el corte de "sin inscripción".
            const ES_KEEPER = esKeeperOPortero('S');
            const ES_FUTSAL = esFutsal('S');
            const ES_CLINICS_FUTSAL = esClinicsFutsal('S');
            const FUTSAL_NETO = `${ES_FUTSAL} AND NOT ${ES_KEEPER} AND NOT ${ES_VENTA_PUBLICO}`;
            const [allRows] = await pool.query(`
                SELECT
                    S.IdSede,
                    S.Sede,
                    COALESCE(S.EsClinics, 0) as EsClinics,
                    COUNT(CASE WHEN J.Status = 0 THEN 1 END) as Activos,
                    COUNT(CASE WHEN J.Status = 0 AND ${ES_KEEPER} AND NOT ${ES_VENTA_PUBLICO} AND NOT ${ES_CLINICS_FUTSAL} THEN 1 END) as ActivosKeepers,
                    COUNT(CASE WHEN J.Status = 0 AND ${FUTSAL_NETO} THEN 1 END) as ActivosFutsal,
                    COUNT(CASE WHEN J.Status = 0 AND ${ES_CLINICS_FUTSAL} THEN 1 END) as ActivosClinicsFutsal,
                    COUNT(CASE WHEN J.Status = 0 AND ${ES_VENTA_PUBLICO} THEN 1 END) as ActivosVentaPublico,
                    COUNT(CASE WHEN J.Status = 0 AND NOT ${ES_VENTA_PUBLICO} THEN 1 END) as Inscritos,
                    COUNT(CASE WHEN J.Status = 0 AND ${ES_KEEPER} AND NOT ${ES_VENTA_PUBLICO} AND NOT ${ES_CLINICS_FUTSAL} THEN 1 END) as InscritosKeepers,
                    COUNT(CASE WHEN J.Status = 0 AND ${FUTSAL_NETO} THEN 1 END) as InscritosFutsal,
                    COUNT(CASE WHEN J.Status = 0 AND ${ES_CLINICS_FUTSAL} THEN 1 END) as InscritosClinicsFutsal,
                    -- Sin temporada seleccionada no hay concepto de "temporada anterior".
                    0 as Reinscritos,
                    0 as ReinscritosKeepers,
                    0 as ReinscritosFutsal,
                    0 as ReinscritosClinicsFutsal,
                    COUNT(CASE WHEN J.Status = 2 THEN 1 END) as Bajas,
                    COUNT(CASE WHEN J.Status = 2 AND ${ES_KEEPER} AND NOT ${ES_VENTA_PUBLICO} AND NOT ${ES_CLINICS_FUTSAL} THEN 1 END) as BajasKeepers,
                    COUNT(CASE WHEN J.Status = 2 AND ${FUTSAL_NETO} THEN 1 END) as BajasFutsal,
                    COUNT(CASE WHEN J.Status = 2 AND ${ES_CLINICS_FUTSAL} THEN 1 END) as BajasClinicsFutsal,
                    0 as SinInscripcion,
                    GROUP_CONCAT(CASE WHEN J.Status = 0 AND NOT ${ES_VENTA_PUBLICO} AND J.Beca IS NOT NULL AND J.Beca != '0' AND J.Beca != '' THEN J.Beca END) as BecasDetail,
                    -- Sin temporada no existe el corte nueva/reinscripción.
                    NULL as BecasNuevasDetail,
                    NULL as BecasReinscDetail,
                    0 as BecadosNuevasKeepers,
                    0 as BecadosNuevasFutsal,
                    0 as BecadosNuevasClinicsFutsal,
                    0 as BecadosReinscKeepers,
                    0 as BecadosReinscFutsal,
                    0 as BecadosReinscClinicsFutsal
                FROM tblSedes S
                LEFT JOIN tblJugadores J ON S.IdSede = J.IdSede
                GROUP BY S.IdSede, S.Sede, S.EsClinics
                ORDER BY Inscritos DESC, S.Sede ASC
            `);
            return NextResponse.json({ success: true, data: allRows });
        }

        /* "Inscrito" con regla keeper (igual que en adeudos): inscripción de esta
           temporada (INS), o keeper/portero con inscripción de cualquier temporada
           (KINS). Los registros de venta al público se separan de todo conteo real. */
        const ES_KEEPER = esKeeperOPortero('S');
        const ES_FUTSAL = esFutsal('S');
        const ES_CLINICS_FUTSAL = esClinicsFutsal('S');
        const INSCRITO = `(INS.IdJugador IS NOT NULL OR (${ES_KEEPER} AND KINS.IdJugador IS NOT NULL))`;
        /** Tiene beca: mismo criterio que el GROUP_CONCAT de becas, en un solo lugar. */
        const BECADO = `(J.Beca IS NOT NULL AND J.Beca != '0' AND J.Beca != '')`;
        // Futsal, excluyendo keeper, clinics futsal y venta pública (grupos disjuntos).
        const FUTSAL_NETO = `${ES_FUTSAL} AND NOT ${ES_KEEPER} AND NOT ${ES_VENTA_PUBLICO}`;
        const query = `
            SELECT
                S.IdSede,
                S.Sede,
                COALESCE(S.EsClinics, 0) as EsClinics,
                -- Plantilla completa de la sede, sin acotar a la temporada.
                COUNT(CASE WHEN J.Status = 0 THEN 1 END) as Activos,
                COUNT(CASE WHEN J.Status = 0 AND ${ES_KEEPER} AND NOT ${ES_VENTA_PUBLICO} AND NOT ${ES_CLINICS_FUTSAL} THEN 1 END) as ActivosKeepers,
                COUNT(CASE WHEN J.Status = 0 AND ${FUTSAL_NETO} THEN 1 END) as ActivosFutsal,
                COUNT(CASE WHEN J.Status = 0 AND ${ES_CLINICS_FUTSAL} THEN 1 END) as ActivosClinicsFutsal,
                COUNT(CASE WHEN J.Status = 0 AND ${ES_VENTA_PUBLICO} THEN 1 END) as ActivosVentaPublico,
                -- Inscritos con regla keeper (excluye venta al público).
                COUNT(CASE WHEN J.Status = 0 AND ${INSCRITO} AND NOT ${ES_VENTA_PUBLICO} THEN 1 END) as Inscritos,
                COUNT(CASE WHEN J.Status = 0 AND ${ES_KEEPER} AND KINS.IdJugador IS NOT NULL AND NOT ${ES_VENTA_PUBLICO} AND NOT ${ES_CLINICS_FUTSAL} THEN 1 END) as InscritosKeepers,
                COUNT(CASE WHEN J.Status = 0 AND ${INSCRITO} AND ${FUTSAL_NETO} THEN 1 END) as InscritosFutsal,
                COUNT(CASE WHEN J.Status = 0 AND ${INSCRITO} AND ${ES_CLINICS_FUTSAL} THEN 1 END) as InscritosClinicsFutsal,
                -- Reinscritos: de los inscritos, los que YA tenían inscripción en una
                -- temporada anterior (REINS). "Nuevas" = Inscritos - Reinscritos.
                COUNT(CASE WHEN J.Status = 0 AND ${INSCRITO} AND REINS.IdJugador IS NOT NULL AND NOT ${ES_VENTA_PUBLICO} THEN 1 END) as Reinscritos,
                COUNT(CASE WHEN J.Status = 0 AND ${ES_KEEPER} AND KINS.IdJugador IS NOT NULL AND REINS.IdJugador IS NOT NULL AND NOT ${ES_VENTA_PUBLICO} AND NOT ${ES_CLINICS_FUTSAL} THEN 1 END) as ReinscritosKeepers,
                COUNT(CASE WHEN J.Status = 0 AND ${INSCRITO} AND REINS.IdJugador IS NOT NULL AND ${FUTSAL_NETO} THEN 1 END) as ReinscritosFutsal,
                COUNT(CASE WHEN J.Status = 0 AND ${INSCRITO} AND REINS.IdJugador IS NOT NULL AND ${ES_CLINICS_FUTSAL} THEN 1 END) as ReinscritosClinicsFutsal,
                COUNT(CASE WHEN J.Status = 2 AND INS.IdJugador IS NOT NULL AND NOT ${ES_VENTA_PUBLICO} THEN 1 END) as Bajas,
                COUNT(CASE WHEN J.Status = 2 AND INS.IdJugador IS NOT NULL AND ${ES_KEEPER} AND NOT ${ES_VENTA_PUBLICO} AND NOT ${ES_CLINICS_FUTSAL} THEN 1 END) as BajasKeepers,
                COUNT(CASE WHEN J.Status = 2 AND INS.IdJugador IS NOT NULL AND ${FUTSAL_NETO} THEN 1 END) as BajasFutsal,
                COUNT(CASE WHEN J.Status = 2 AND INS.IdJugador IS NOT NULL AND ${ES_CLINICS_FUTSAL} THEN 1 END) as BajasClinicsFutsal,
                COUNT(CASE WHEN J.Status = 0 AND MEN.IdJugador IS NOT NULL AND NOT ${INSCRITO} AND NOT ${ES_VENTA_PUBLICO} THEN 1 END) as SinInscripcion,
                GROUP_CONCAT(
                    CASE WHEN J.Status = 0 AND ${INSCRITO} AND NOT ${ES_VENTA_PUBLICO}
                          AND J.Beca IS NOT NULL AND J.Beca != '0' AND J.Beca != ''
                    THEN J.Beca END
                ) as BecasDetail,
                -- Las mismas becas, partidas por tipo de inscripción. "Nueva" es la
                -- ausencia de inscripción previa (REINS), igual que el conteo de arriba,
                -- para que becados nuevas + becados reinsc. den siempre el total.
                GROUP_CONCAT(
                    CASE WHEN J.Status = 0 AND ${INSCRITO} AND NOT ${ES_VENTA_PUBLICO}
                          AND REINS.IdJugador IS NULL
                          AND J.Beca IS NOT NULL AND J.Beca != '0' AND J.Beca != ''
                    THEN J.Beca END
                ) as BecasNuevasDetail,
                GROUP_CONCAT(
                    CASE WHEN J.Status = 0 AND ${INSCRITO} AND NOT ${ES_VENTA_PUBLICO}
                          AND REINS.IdJugador IS NOT NULL
                          AND J.Beca IS NOT NULL AND J.Beca != '0' AND J.Beca != ''
                    THEN J.Beca END
                ) as BecasReinscDetail,
                -- Becados de cada tipo de inscripción partidos por grupo. Van como
                -- conteo y no como GROUP_CONCAT porque aquí solo se necesita el número:
                -- así no cuentan de menos si un día una sede pasa el tope del concat.
                -- "Sedes" no se consulta: se deduce restando, igual que Inscritos.
                COUNT(CASE WHEN J.Status = 0 AND ${BECADO} AND REINS.IdJugador IS NULL
                            AND ${ES_KEEPER} AND KINS.IdJugador IS NOT NULL
                            AND NOT ${ES_VENTA_PUBLICO} AND NOT ${ES_CLINICS_FUTSAL}
                      THEN 1 END) as BecadosNuevasKeepers,
                COUNT(CASE WHEN J.Status = 0 AND ${BECADO} AND REINS.IdJugador IS NULL
                            AND ${INSCRITO} AND ${FUTSAL_NETO}
                      THEN 1 END) as BecadosNuevasFutsal,
                COUNT(CASE WHEN J.Status = 0 AND ${BECADO} AND REINS.IdJugador IS NULL
                            AND ${INSCRITO} AND ${ES_CLINICS_FUTSAL}
                      THEN 1 END) as BecadosNuevasClinicsFutsal,
                COUNT(CASE WHEN J.Status = 0 AND ${BECADO} AND REINS.IdJugador IS NOT NULL
                            AND ${ES_KEEPER} AND KINS.IdJugador IS NOT NULL
                            AND NOT ${ES_VENTA_PUBLICO} AND NOT ${ES_CLINICS_FUTSAL}
                      THEN 1 END) as BecadosReinscKeepers,
                COUNT(CASE WHEN J.Status = 0 AND ${BECADO} AND REINS.IdJugador IS NOT NULL
                            AND ${INSCRITO} AND ${FUTSAL_NETO}
                      THEN 1 END) as BecadosReinscFutsal,
                COUNT(CASE WHEN J.Status = 0 AND ${BECADO} AND REINS.IdJugador IS NOT NULL
                            AND ${INSCRITO} AND ${ES_CLINICS_FUTSAL}
                      THEN 1 END) as BecadosReinscClinicsFutsal
            FROM tblSedes S
            LEFT JOIN tblJugadores J ON S.IdSede = J.IdSede
            LEFT JOIN (
                SELECT DISTINCT IdJugador FROM (${JUGADORES_DE_TEMPORADA_SQL}) I
            ) INS ON INS.IdJugador = J.IdJugador
            LEFT JOIN (
                ${CUALQUIER_INSCRIPCION_SQL}
            ) KINS ON KINS.IdJugador = J.IdJugador
            LEFT JOIN (
                SELECT DISTINCT IdJugador FROM (${MENSUALIDADES_EN_TEMPORADA_SQL}) M
            ) MEN ON MEN.IdJugador = J.IdJugador
            LEFT JOIN (
                ${INSCRIPCION_PREVIA_SQL}
            ) REINS ON REINS.IdJugador = J.IdJugador
            GROUP BY S.IdSede, S.Sede, S.EsClinics
            ORDER BY Inscritos DESC, S.Sede ASC
        `;

        const [rows] = await pool.query(query, [temporadaId, temporadaId, temporadaId]);

        return NextResponse.json(
            { success: true, data: rows },
            { headers: { 'Cache-Control': 'no-store' } }
        );
    } catch (error) {
        console.error('Error fetching sedes for inscripciones:', error);
        return NextResponse.json(
            { success: false, message: 'Error al obtener sedes' },
            { status: 500 }
        );
    }
}
