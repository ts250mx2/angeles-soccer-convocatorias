import { NextResponse } from 'next/server';
import { pool } from '@/lib/db';
import { loadSeasonAndPrevious } from '@/lib/adeudos-db';

export const dynamic = 'force-dynamic';

// Tope de seguridad: el alcance global (KPIs) puede abarcar toda la tabla.
const MAX_ROWS = 6000;

/**
 * Jugadores con su estatus de adeudo en la temporada seleccionada.
 *
 * filtro (empata con los conteos de las tarjetas de sede/categoría):
 *   activos                Status 0
 *   bajas                  Status 2
 *   pendiente-inscripcion  Status 0 y sin pago de inscripción
 *   pendiente-mensualidad  Status 0 y le falta al menos un mes ya vencido
 *   al-corriente           Status 0, con inscripción y sin meses vencidos por pagar
 *   becado-sin-inscripcion Status 0, beca 100% y sin pago de inscripción
 *   posible-baja           Status 0, sin inscripción y sin ningún mes vencido pagado
 *   debe                   Status 0 y debe algo (inscripción o un mes vencido)
 *   debe-mes               Status 0 y sin pagar el mes indicado en ?mes=
 *   todos                  sin corte
 */
export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const categoriaParam = searchParams.get('categoria');
        const sedeIdParam = searchParams.get('sedeId');
        const temporadaId = searchParams.get('temporadaId');
        // Default 'todos' para no alterar a los consumidores que no mandan filtro
        // (páginas [categoria] y multi, que filtran del lado del cliente).
        const filtro = searchParams.get('filtro') ?? 'todos';
        // Mes específico para el corte "debe-mes" (desglose del adeudo).
        const mesParam = searchParams.get('mes');
        const mesFiltro = mesParam !== null ? parseInt(mesParam, 10) : null;
        // '0' = solo sedes normales, '1' = solo clinics, ausente = ambas.
        const clinicsParam = searchParams.get('clinics');

        /* Los KPIs globales consultan sin sede ni categoría, acotando solo por
           temporada. Se exige al menos uno de los tres para no devolver la tabla
           entera por accidente. */
        if (!categoriaParam && !sedeIdParam && !temporadaId) {
            return NextResponse.json(
                { success: false, message: 'Se requiere sede, categoría o temporada' },
                { status: 400 }
            );
        }

        const seasons = await loadSeasonAndPrevious(temporadaId);
        if (!seasons) {
            return NextResponse.json({ success: false, message: 'No se encontró temporada' }, { status: 404 });
        }
        const m = seasons.actual;
        const seasonId = m.seasonId;

        const categorias = categoriaParam ? categoriaParam.split(',').map((c) => c.trim()) : [];
        const sedeId = sedeIdParam ? parseInt(sedeIdParam) : null;

        // Base 1=1 para que el WHERE nunca quede vacío en el alcance global.
        const where: string[] = ['1 = 1'];
        const whereParams: any[] = [];
        if (sedeId) { where.push('J.IdSede = ?'); whereParams.push(sedeId); }

        /* Las sedes de clinics no manejan inscripción/mensualidad como el resto, así
           que quedan fuera de todo corte de adeudo. En los cortes de plantilla
           (activos/bajas/todos) se respeta el parámetro para poder verlas aparte. */
        const CORTES_DE_ADEUDO = [
            'debe', 'al-corriente', 'pendiente-inscripcion', 'pendiente-mensualidad', 'debe-mes',
            'becado-sin-inscripcion', 'posible-baja',
        ];
        if (CORTES_DE_ADEUDO.includes(filtro)) {
            where.push('COALESCE(S.EsClinics, 0) = 0');
        } else if (clinicsParam === '0' || clinicsParam === '1') {
            where.push('COALESCE(S.EsClinics, 0) = ?');
            whereParams.push(Number(clinicsParam));
        }
        if (categorias.length) {
            where.push(`J.Categoria IN (${categorias.map(() => '?').join(',')})`);
            whereParams.push(...categorias);
        }

        /* Inscripción sospechosa: pago de inscripción registrado en OTRA temporada
           (no la seleccionada) pero cobrado a menos de 2 meses del inicio de esta;
           probablemente es la inscripción de esta temporada capturada con la temporada
           equivocada. Toma la más reciente que cumpla y guarda bajo qué temporada está.
           No se restringe a la temporada inmediata anterior: hay pagos archivados dos o
           más temporadas atrás (p.ej. inscripción de ENE-JUL 2026 archivada en ENE-JUL
           2025 por elegir el año equivocado). */
        const sospJoin = `LEFT JOIN (
                   SELECT s.IdJugador, s.IdPago, s.Fecha, s.IdTemporada, s.TempNombre
                   FROM (
                       SELECT P.IdJugador, P.IdPago,
                              DATE_FORMAT(P.FechaPago, '%d/%m/%Y') as Fecha,
                              P.IdTemporada,
                              COALESCE(T.Temporada, 'otra temporada') as TempNombre,
                              ROW_NUMBER() OVER (PARTITION BY P.IdJugador ORDER BY P.FechaPago DESC, P.IdPago DESC) as rn
                       FROM tblPagos P
                       INNER JOIN tblProductos PR ON P.IdProducto = PR.IdProducto
                       LEFT JOIN tblTemporadas T ON T.IdTemporada = P.IdTemporada
                       WHERE PR.IdTipoProducto = 2 AND P.Status = 0
                         AND P.IdTemporada IS NOT NULL AND P.IdTemporada <> ?
                         AND P.FechaPago >= DATE_SUB(?, INTERVAL 2 MONTH)
                   ) s
                   WHERE s.rn = 1
               ) SOSP ON SOSP.IdJugador = J.IdJugador`;
        const sospSelect = `,
                CASE WHEN SOSP.IdJugador IS NOT NULL
                       AND INSCRIPCION.IdJugador IS NULL
                       AND NOT ((COALESCE(S.EsKeeper, 0) = 1 OR UPPER(J.Categoria) LIKE '%PORTERO%') AND KINS.IdJugador IS NOT NULL)
                     THEN 1 ELSE 0 END as PosibleInscTempAnterior,
                SOSP.IdPago as SospIdPago,
                SOSP.Fecha as SospFecha,
                SOSP.TempNombre as SospTempNombre`;

        const query = `
            SELECT
                J.IdJugador,
                J.Jugador,
                J.Categoria,
                J.Status,
                J.Beca,
                J.IdSede,
                COALESCE(S.Sede, J.Sede) as SedeNombre,
                -- Portero (sede keeper o categoría PORTERO): cualquier inscripción (KINS) cuenta.
                CASE WHEN INSCRIPCION.IdJugador IS NOT NULL
                       OR ((COALESCE(S.EsKeeper, 0) = 1 OR UPPER(J.Categoria) LIKE '%PORTERO%') AND KINS.IdJugador IS NOT NULL)
                     THEN 1 ELSE 0 END as InscripcionPagada,
                INSCRIPCION.MesInscripcion,
                COALESCE(MENSUALIDADES.MesesPagados, '') as MesesPagados,
                COALESCE(PAGOS.Pagado, 0) as Pagado
                ${sospSelect}
            FROM tblJugadores J
            LEFT JOIN tblSedes S ON J.IdSede = S.IdSede
            LEFT JOIN (
                SELECT P.IdJugador,
                       -- Mes del pago de inscripción, acotado al rango de la temporada.
                       GREATEST(?, LEAST(?, MIN(YEAR(P.FechaPago) * 100 + MONTH(P.FechaPago)))) % 100 as MesInscripcion
                FROM tblPagos P
                INNER JOIN tblProductos PR ON P.IdProducto = PR.IdProducto
                WHERE P.IdTemporada = ? AND PR.IdTipoProducto = 2 AND P.Status = 0
                GROUP BY P.IdJugador
            ) INSCRIPCION ON J.IdJugador = INSCRIPCION.IdJugador
            LEFT JOIN (
                -- Cualquier inscripción, de cualquier temporada (regla keeper).
                SELECT DISTINCT P.IdJugador
                FROM tblPagos P
                INNER JOIN tblProductos PR ON P.IdProducto = PR.IdProducto
                WHERE PR.IdTipoProducto = 2 AND P.Status = 0
            ) KINS ON KINS.IdJugador = J.IdJugador
            LEFT JOIN (
                SELECT P.IdJugador, GROUP_CONCAT(DISTINCT P.Mes) as MesesPagados
                FROM tblPagos P
                INNER JOIN tblProductos PR ON P.IdProducto = PR.IdProducto
                WHERE PR.IdTipoProducto = 1 AND P.Status = 0
                  AND P.Anio IS NOT NULL AND P.Mes BETWEEN 1 AND 12
                  AND (P.Anio * 100 + P.Mes) BETWEEN ? AND ?
                GROUP BY P.IdJugador
            ) MENSUALIDADES ON J.IdJugador = MENSUALIDADES.IdJugador
            LEFT JOIN (
                SELECT P.IdJugador, COALESCE(SUM(P.Pago), 0) as Pagado
                FROM tblPagos P
                INNER JOIN tblProductos PR ON P.IdProducto = PR.IdProducto
                WHERE P.IdTemporada = ? AND PR.IdTipoProducto IN (1, 2) AND P.Status = 0
                GROUP BY P.IdJugador
            ) PAGOS ON J.IdJugador = PAGOS.IdJugador
            ${sospJoin}
            WHERE ${where.join(' AND ')}
            ORDER BY J.Categoria ASC, J.Jugador ASC
            LIMIT ${MAX_ROWS}
        `;

        const finCodigo = m.anioInicio * 100 + m.endMonth;
        const queryParams = [
            m.desdeCodigo,                      // INSCRIPCION: GREATEST (piso del rango)
            finCodigo,                          // INSCRIPCION: LEAST (techo del rango)
            seasonId,                           // INSCRIPCION (va por temporada: no tiene mes)
            m.desdeCodigo,                      // MENSUALIDADES: desde el primer mes-año
            finCodigo,                          // hasta el fin de temporada (los cuadritos
                                                // muestran también los meses por vencer)
            seasonId,                           // PAGOS
            seasonId,                           // SOSP: distinta de la seleccionada
            m.fechaInicioISO,                   // SOSP: 2 meses antes del inicio
            ...whereParams,
        ];

        const [rows] = await pool.query(query, queryParams);

        // ── Tarifas de la temporada para calcular el monto del adeudo ──
        const [feeRows] = await pool.query(
            `SELECT IdSede, Precio FROM tblProductos
             WHERE IdTipoProducto = 1 AND IdTemporada = ? AND Status = 0 AND Producto LIKE 'MENSUALIDAD%'`,
            [seasonId]
        ) as any[];
        const monthlyBySede: Record<number, number> = {};
        let generalMonthly = 0;
        for (const f of feeRows) {
            const price = Number(f.Precio) || 0;
            if (f.IdSede === 0) generalMonthly = price;
            else monthlyBySede[f.IdSede] = price;
        }
        if (!generalMonthly && feeRows.length) generalMonthly = Number(feeRows[0].Precio) || 0;

        const [inscRows] = await pool.query(
            `SELECT Precio FROM tblProductos
             WHERE IdTipoProducto = 2 AND IdTemporada = ? AND Status = 0 AND Producto LIKE 'INSCRIPCION%'
             ORDER BY IdSede ASC LIMIT 1`,
            [seasonId]
        ) as any[];
        const inscriptionFee = inscRows.length ? (Number(inscRows[0].Precio) || 0) : 0;

        /* Adeudo = meses faltantes x mensualidad (menos beca) + inscripción pendiente.
           Los meses faltantes se cuentan desde el mes en que el jugador pagó su
           inscripción (no desde el inicio de la temporada): quien se inscribió a
           mitad de temporada no arrastra los meses previos a su inscripción. */
        const computed = (rows as any[]).map((p) => {
            const paid = String(p.MesesPagados || '')
                .split(',').map((x: string) => parseInt(x.trim())).filter((x: number) => !isNaN(x));

            // Mes de inicio del adeudo del jugador: su inscripción, o el inicio de la
            // temporada si no la ha pagado (o si el dato viniera fuera de rango).
            const mesIns = Number(p.MesInscripcion);
            const mesInicio = Number.isInteger(mesIns) && mesIns >= m.startMonth && mesIns <= m.endMonth
                ? mesIns
                : m.startMonth;

            let missing = 0;
            for (let mes = mesInicio; mes <= m.hastaMonth; mes++) {
                if (!paid.includes(mes)) missing++;
            }
            // Meses pagados dentro del rango de la temporada (para el corte "pendiente mensualidad")
            const pagosCount = paid.filter((x) => x >= m.startMonth && x <= m.endMonth).length;

            const becaNum = parseFloat(String(p.Beca));
            const becaPct = isNaN(becaNum) ? 0 : Math.max(0, Math.min(100, becaNum));
            const monthly = monthlyBySede[p.IdSede] ?? generalMonthly;

            let adeudo = 0;
            if (p.Status === 0 && becaPct < 100) {
                const inscDebt = p.InscripcionPagada ? 0 : inscriptionFee;
                adeudo = missing * monthly * (1 - becaPct / 100) + inscDebt;
            }

            return {
                ...p,
                Adeudo: Math.round(adeudo * 100) / 100,
                Pagado: Number(p.Pagado) || 0,
                MissingCount: missing,
                MesInicio: mesInicio,
                PagosCount: pagosCount,
                // Beca total: no paga nada, así que nunca tiene adeudo aunque no
                // existan registros de mensualidad (suelen capturarse en $0 o no
                // capturarse). Se marca para que el modal lo muestre como becado.
                BecaTotal: becaPct >= 100 ? 1 : 0,
            };
        });

        // Corte según el filtro (mismas definiciones que las tarjetas). Todo se mide
        // por lo VENCIDO a la fecha (MissingCount = meses exigibles sin pagar), no por
        // la temporada completa: así "al corriente" no exige pagar meses aún no vencidos.
        const pasaFiltro = (p: any): boolean => {
            // Beca total nunca debe: se le trata como al corriente en todos los cortes.
            const becado = !!p.BecaTotal;
            switch (filtro) {
                case 'bajas': return p.Status === 2;
                case 'pendiente-inscripcion': return p.Status === 0 && !becado && !p.InscripcionPagada;
                case 'pendiente-mensualidad': return p.Status === 0 && !becado && p.MissingCount > 0;
                // Al corriente exige estar inscrito; el becado al 100% sin inscripción
                // no debe nada pero se reporta aparte.
                case 'al-corriente':
                    return p.Status === 0 && !!p.InscripcionPagada && (becado || p.MissingCount === 0);
                case 'becado-sin-inscripcion':
                    return p.Status === 0 && becado && !p.InscripcionPagada;
                // Posible baja: no pagó inscripción ni un solo mes ya vencido.
                case 'posible-baja':
                    return m.mesesExigibles > 0
                        && p.Status === 0 && !becado
                        && !p.InscripcionPagada
                        && p.MissingCount === m.mesesExigibles;
                case 'debe':
                    return p.Status === 0 && !becado && (!p.InscripcionPagada || p.MissingCount > 0);
                case 'debe-mes': {
                    // Deben ese mes concreto: no lo pagaron y ya estaban inscritos para
                    // entonces (el mes es igual o posterior a su mes de inscripción).
                    if (mesFiltro === null || isNaN(mesFiltro)) return false;
                    if (p.Status !== 0 || becado) return false;
                    if (mesFiltro < p.MesInicio) return false;
                    const pagados = String(p.MesesPagados || '')
                        .split(',').map((x: string) => parseInt(x.trim())).filter((x: number) => !isNaN(x));
                    return !pagados.includes(mesFiltro);
                }
                case 'todos': return true;
                case 'activos':
                default: return p.Status === 0;
            }
        };

        const data = computed.filter(pasaFiltro);
        const totalAdeudo = data.reduce((s, p) => s + (Number(p.Adeudo) || 0), 0);
        const totalPagado = data.reduce((s, p) => s + (Number(p.Pagado) || 0), 0);

        return NextResponse.json({
            success: true,
            data,
            config: {
                seasonId,
                temporadaNombre: m.temporadaNombre,
                // Destino para reasignar una inscripción sospechosa (la temporada consultada).
                temporadaDestinoId: seasonId,
                temporadaDestinoNombre: m.temporadaNombre,
                startMonth: m.startMonth,
                endMonth: m.endMonth,
                hastaMonth: m.hastaMonth,
                // Los reportes previos ([categoria], multi) calculan el adeudo con
                // startMonth..currentMonth; se les entrega hastaMonth como currentMonth
                // para conservar su comportamiento (idéntico en la temporada activa).
                currentMonth: m.hastaMonth,
                numMonthsExpected: m.numMonthsExpected,
                mensualidad: generalMonthly,
                inscripcion: inscriptionFee,
                totalAdeudo: Math.round(totalAdeudo * 100) / 100,
                totalPagado: Math.round(totalPagado * 100) / 100,
            },
        });
    } catch (error) {
        console.error('Error fetching players for adeudos:', error);
        return NextResponse.json(
            { success: false, message: 'Error al obtener jugadores' },
            { status: 500 }
        );
    }
}
