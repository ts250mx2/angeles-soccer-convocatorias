import { NextResponse } from 'next/server';
import { pool } from '@/lib/db';
import { loadSeasonAndPrevious } from '@/lib/adeudos-db';
import { ES_VENTA_PUBLICO, esKeeperOPortero, esFutsal, esClinicsFutsal } from '@/lib/jugador-filtros';

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
        // Descartar (temporal) los posibles bajas: se excluyen de todos los cortes.
        const descartarPB = searchParams.get('descartarPB') === '1';

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

        /* Las sedes de clinics y los registros de venta al público no manejan
           inscripción/mensualidad como el resto, así que quedan fuera de todo corte de
           adeudo. El futsal SÍ cuenta (se maneja como sede normal). En los cortes de
           plantilla (activos/bajas/todos) se respeta el parámetro clinics. */
        const EXCLUIDO_ADEUDOS =
            `(COALESCE(S.EsClinics, 0) = 1 OR ${ES_VENTA_PUBLICO} OR ${esClinicsFutsal('S')})`;
        const CORTES_DE_ADEUDO = [
            'debe', 'futsal-debe', 'al-corriente', 'keepers', 'futsal-corriente',
            'futsal-sin-pagos', 'futsal-1-mes', 'futsal-2-meses', 'futsal-3-mas',
            'pendiente-inscripcion', 'pendiente-mensualidad', 'debe-mes',
            'becado-sin-inscripcion', 'posible-baja',
        ];
        if (CORTES_DE_ADEUDO.includes(filtro)) {
            where.push(`NOT ${EXCLUIDO_ADEUDOS}`);
            // Los jugadores dados de alta en una temporada POSTERIOR (IdTemporadaActiva
            // mayor) no existían en ésta: quedan fuera de todo corte de adeudo. Alta
            // desconocida (NULL) se trata como antigua (se incluye).
            where.push(`COALESCE(J.IdTemporadaActiva, 0) <= ${seasonId}`);
        } else if (clinicsParam === '0') {
            where.push(`NOT ${EXCLUIDO_ADEUDOS}`);
        } else if (clinicsParam === '1') {
            where.push(EXCLUIDO_ADEUDOS);
        }

        /* Segmento de plantilla (activos/bajas/todos): parte a los activos/bajas en
           grupos mutuamente excluyentes que el resumen calcula igual, para que las
           tarjetas y el modal cuadren. Prioridad: venta pública > excluido (clinics) >
           clinics futsal > keepers > futsal > normal. Con grupo NO se pasa clinics. */
        const grupo = searchParams.get('grupo');
        const ES_KEEPER = esKeeperOPortero('S');
        const ES_FUTSAL = esFutsal('S');
        const ES_EXCLUIDO = `(COALESCE(S.EsClinics, 0) = 1)`;
        const ES_CLINICS_FUTSAL = esClinicsFutsal('S');
        if (grupo === 'ventapublico') {
            where.push(ES_VENTA_PUBLICO);
        } else if (grupo === 'excluido') {
            where.push(`${ES_EXCLUIDO} AND NOT ${ES_VENTA_PUBLICO}`);
        } else if (grupo === 'clinicsfutsal') {
            where.push(`${ES_CLINICS_FUTSAL} AND NOT ${ES_VENTA_PUBLICO}`);
        } else if (grupo === 'keepers') {
            where.push(`${ES_KEEPER} AND NOT ${ES_EXCLUIDO} AND NOT ${ES_CLINICS_FUTSAL} AND NOT ${ES_VENTA_PUBLICO}`);
        } else if (grupo === 'futsal') {
            where.push(`${ES_FUTSAL} AND NOT ${ES_KEEPER} AND NOT ${ES_EXCLUIDO} AND NOT ${ES_CLINICS_FUTSAL} AND NOT ${ES_VENTA_PUBLICO}`);
        } else if (grupo === 'normal') {
            where.push(`NOT ${ES_FUTSAL} AND NOT ${ES_KEEPER} AND NOT ${ES_EXCLUIDO} AND NOT ${ES_CLINICS_FUTSAL} AND NOT ${ES_VENTA_PUBLICO}`);
        }
        if (categorias.length) {
            where.push(`J.Categoria IN (${categorias.map(() => '?').join(',')})`);
            whereParams.push(...categorias);
        }

        /* Inscripción sospechosa: de todos los pagos de inscripción del jugador, se
           toma el de fecha MÁS CERCANA al inicio de la temporada seleccionada (el que
           lógicamente sería la inscripción de esta temporada). Si ese pago está
           archivado bajo OTRA temporada, se avisa: probablemente es la inscripción de
           esta temporada capturada con la temporada equivocada.
           Se acota a una ventana alrededor del inicio (2 meses antes / 1 mes después)
           para no tomar inscripciones de años lejanos como candidatas. El flag final se
           calcula en JS comparando SospIdTemporada con la temporada seleccionada. */
        const sospJoin = `LEFT JOIN (
                   SELECT s.IdJugador, s.IdPago, s.Fecha, s.IdTemporada, s.TempNombre
                   FROM (
                       SELECT P.IdJugador, P.IdPago,
                              DATE_FORMAT(P.FechaPago, '%d/%m/%Y') as Fecha,
                              P.IdTemporada,
                              COALESCE(T.Temporada, 'otra temporada') as TempNombre,
                              ROW_NUMBER() OVER (
                                  PARTITION BY P.IdJugador
                                  ORDER BY ABS(DATEDIFF(P.FechaPago, ?)) ASC, P.FechaPago DESC, P.IdPago DESC
                              ) as rn
                       FROM tblPagos P
                       INNER JOIN tblProductos PR ON P.IdProducto = PR.IdProducto
                       LEFT JOIN tblTemporadas T ON T.IdTemporada = P.IdTemporada
                       WHERE PR.IdTipoProducto = 2 AND P.Status = 0
                         AND P.IdTemporada IS NOT NULL
                         AND P.FechaPago >= DATE_SUB(?, INTERVAL 2 MONTH)
                         AND P.FechaPago <= DATE_ADD(?, INTERVAL 1 MONTH)
                   ) s
                   WHERE s.rn = 1
               ) SOSP ON SOSP.IdJugador = J.IdJugador`;
        const sospSelect = `,
                SOSP.IdPago as SospIdPago,
                SOSP.Fecha as SospFecha,
                SOSP.IdTemporada as SospIdTemporada,
                SOSP.TempNombre as SospTempNombre`;

        /* Promoción de inscripción: sin inscripción de esta temporada, pero con la
           inscripción de la temporada SIGUIENTE pagada durante el último mes de esta
           (PROMO), y con la primera mensualidad de la temporada en ese último mes.
           Cuenta como inscrito y su adeudo arranca en el último mes (que ya pagó). */
        const siguiente = seasons.siguiente;
        const endCode = m.anioInicio * 100 + m.endMonth;
        const esYaInscrito = `(INSCRIPCION.IdJugador IS NOT NULL OR (${esKeeperOPortero('S')} AND KINS.IdJugador IS NOT NULL))`;
        const esPromo = siguiente
            ? `(NOT ${esYaInscrito} AND PROMO.IdJugador IS NOT NULL AND COALESCE(MENSUALIDADES.MinMes, 0) = ${endCode})`
            : '(1 = 0)';
        const promoJoin = siguiente
            ? `LEFT JOIN (
                   SELECT DISTINCT P.IdJugador FROM tblPagos P
                   INNER JOIN tblProductos PR ON P.IdProducto = PR.IdProducto
                   WHERE PR.IdTipoProducto = 2 AND P.Status = 0
                     AND P.IdTemporada = ${siguiente.seasonId}
                     AND (YEAR(P.FechaPago) * 100 + MONTH(P.FechaPago)) = ${endCode}
               ) PROMO ON PROMO.IdJugador = J.IdJugador`
            : '';

        const query = `
            SELECT
                J.IdJugador,
                J.Jugador,
                J.Categoria,
                J.Status,
                J.Beca,
                J.IdSede,
                COALESCE(S.Sede, J.Sede) as SedeNombre,
                -- Inscrito: inscripción de la temporada, regla keeper (KINS) o promoción.
                CASE WHEN ${esYaInscrito} OR ${esPromo}
                     THEN 1 ELSE 0 END as InscripcionPagada,
                CASE WHEN ${esPromo} THEN 1 ELSE 0 END as EsPromoInscripcion,
                CASE WHEN ${esKeeperOPortero('S')}
                     THEN 1 ELSE 0 END as EsKeeperOPortero,
                CASE WHEN ${esFutsal('S')} THEN 1 ELSE 0 END as EsFutsal,
                CASE WHEN ${esClinicsFutsal('S')} THEN 1 ELSE 0 END as EsClinicsFutsal,
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
                SELECT P.IdJugador, GROUP_CONCAT(DISTINCT P.Mes) as MesesPagados,
                       MIN(P.Anio * 100 + P.Mes) as MinMes
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
            ${promoJoin}
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
            m.fechaInicioISO,                   // SOSP: cercanía al inicio (ABS DATEDIFF)
            m.fechaInicioISO,                   // SOSP: piso de la ventana (2 meses antes)
            m.fechaInicioISO,                   // SOSP: techo de la ventana (1 mes después)
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

        /* Tope de meses con cobro por categoría (categorías que terminaron antes de
           fin de temporada). Con la tabla vacía/ausente no se aplica ningún tope. */
        const catFin = new Map<string, number>();
        try {
            const [catFinRows] = await pool.query(
                `SELECT UPPER(TRIM(Categoria)) AS Cat, MesFin FROM tblAdeudosCategoriaFin WHERE IdTemporada = ?`,
                [seasonId],
            ) as any[];
            for (const r of catFinRows as any[]) catFin.set(String(r.Cat), Number(r.MesFin));
        } catch { /* tabla ausente: sin topes */ }
        const capEndFor = (categoria: any): number => {
            const f = catFin.get(String(categoria ?? '').trim().toUpperCase());
            return Number.isInteger(f) ? Math.min(m.hastaMonth, f as number) : m.hastaMonth;
        };

        /* Adeudo = meses faltantes x mensualidad (menos beca) + inscripción pendiente.
           Los meses faltantes se cuentan desde el mes en que el jugador pagó su
           inscripción (no desde el inicio de la temporada): quien se inscribió a
           mitad de temporada no arrastra los meses previos a su inscripción. */
        const computed = (rows as any[]).map((p) => {
            const paid = String(p.MesesPagados || '')
                .split(',').map((x: string) => parseInt(x.trim())).filter((x: number) => !isNaN(x));

            // Mes de inicio del adeudo del jugador: su inscripción, o el inicio de la
            // temporada si no la ha pagado (o si el dato viniera fuera de rango). En la
            // promoción arranca en el último mes (que ya pagó), así que no arrastra los
            // meses previos.
            const mesIns = Number(p.MesInscripcion);
            const mesInicio = p.EsPromoInscripcion
                ? m.endMonth
                : (Number.isInteger(mesIns) && mesIns >= m.startMonth && mesIns <= m.endMonth
                    ? mesIns
                    : m.startMonth);

            // Meses faltantes hasta el tope de cobro de su categoría (capEnd).
            const capEnd = capEndFor(p.Categoria);
            let missing = 0;
            for (let mes = mesInicio; mes <= capEnd; mes++) {
                if (!paid.includes(mes)) missing++;
            }
            // Meses pagados dentro del rango de la temporada (para el corte "pendiente mensualidad")
            const pagosCount = paid.filter((x) => x >= m.startMonth && x <= m.endMonth).length;

            const becaNum = parseFloat(String(p.Beca));
            const becaPct = isNaN(becaNum) ? 0 : Math.max(0, Math.min(100, becaNum));
            const monthly = monthlyBySede[p.IdSede] ?? generalMonthly;

            let adeudo = 0;
            if (p.Status === 0 && becaPct < 100 && !p.EsFutsal) {
                const inscDebt = p.InscripcionPagada ? 0 : inscriptionFee;
                adeudo = missing * monthly * (1 - becaPct / 100) + inscDebt;
            }

            /* Posible inscripción mal capturada: la inscripción de fecha más cercana al
               inicio de la temporada (SOSP) está archivada bajo OTRA temporada, no la
               seleccionada. Se excluye a quien ya cuenta como inscrito en esta temporada
               (inscripción propia o regla portero), porque para ellos no hay nada que
               corregir. */
            const sospTemp = p.SospIdTemporada != null ? Number(p.SospIdTemporada) : null;
            const posibleInsc =
                p.SospIdPago && sospTemp !== null && sospTemp !== seasonId && !p.InscripcionPagada
                    ? 1
                    : 0;

            return {
                ...p,
                Adeudo: Math.round(adeudo * 100) / 100,
                Pagado: Number(p.Pagado) || 0,
                MissingCount: missing,
                MesInicio: mesInicio,
                CapEnd: capEnd,
                PagosCount: pagosCount,
                PosibleInscTempAnterior: posibleInsc,
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
                // El desglose del "Con adeudo" normal excluye futsal (va aparte).
                case 'pendiente-inscripcion': return p.Status === 0 && !becado && !p.EsFutsal && !p.EsKeeperOPortero && !p.InscripcionPagada;
                case 'pendiente-mensualidad': return p.Status === 0 && !becado && !p.EsFutsal && !p.EsKeeperOPortero && p.MissingCount > 0;
                // Al corriente exige estar inscrito; el becado al 100% sin inscripción
                // no debe nada pero se reporta aparte. Keepers/porteros y futsal al
                // corriente se separan en sus propios cortes.
                case 'al-corriente':
                    return p.Status === 0 && !!p.InscripcionPagada
                        && !p.EsKeeperOPortero && !p.EsFutsal
                        && (becado || p.MissingCount === 0);
                case 'keepers':
                    // Todos los porteros/keepers van a su grupo (no manejan mensualidad).
                    return p.Status === 0 && !!p.EsKeeperOPortero;
                case 'futsal-corriente':
                    return p.Status === 0 && !!p.InscripcionPagada
                        && !!p.EsFutsal && !p.EsKeeperOPortero
                        && (becado || p.MissingCount === 0);
                case 'futsal-sin-pagos':
                    return p.Status === 0 && !!p.EsFutsal && !p.EsKeeperOPortero && p.PagosCount === 0;
                case 'futsal-1-mes':
                    return p.Status === 0 && !!p.EsFutsal && !p.EsKeeperOPortero && p.PagosCount === 1;
                case 'futsal-2-meses':
                    return p.Status === 0 && !!p.EsFutsal && !p.EsKeeperOPortero && p.PagosCount === 2;
                case 'futsal-3-mas':
                    return p.Status === 0 && !!p.EsFutsal && !p.EsKeeperOPortero && p.PagosCount >= 3;
                case 'becado-sin-inscripcion':
                    return p.Status === 0 && becado && !p.EsKeeperOPortero && !p.InscripcionPagada;
                // Posible baja: no pagó inscripción ni un solo mes ya vencido (sin futsal ni porteros).
                case 'posible-baja':
                    // No pagó inscripción ni un solo mes (robusto al tope por categoría).
                    return m.mesesExigibles > 0
                        && p.Status === 0 && !becado && !p.EsFutsal && !p.EsKeeperOPortero
                        && !p.InscripcionPagada
                        && p.PagosCount === 0;
                // Con adeudo normal: excluye futsal y porteros (van en su propio corte).
                case 'debe':
                    return p.Status === 0 && !becado && !p.EsFutsal && !p.EsKeeperOPortero
                        && (!p.InscripcionPagada || p.MissingCount > 0);
                // Futsal con adeudo (no keeper).
                case 'futsal-debe':
                    return p.Status === 0 && !becado && !!p.EsFutsal && !p.EsKeeperOPortero
                        && (!p.InscripcionPagada || p.MissingCount > 0);
                case 'debe-mes': {
                    // Deben ese mes concreto: no lo pagaron y ya estaban inscritos para
                    // entonces (el mes es igual o posterior a su mes de inscripción).
                    if (mesFiltro === null || isNaN(mesFiltro)) return false;
                    if (p.Status !== 0 || becado || p.EsFutsal || p.EsKeeperOPortero) return false;
                    if (mesFiltro < p.MesInicio || mesFiltro > p.CapEnd) return false;
                    const pagados = String(p.MesesPagados || '')
                        .split(',').map((x: string) => parseInt(x.trim())).filter((x: number) => !isNaN(x));
                    return !pagados.includes(mesFiltro);
                }
                case 'todos': return true;
                case 'activos':
                default: return p.Status === 0;
            }
        };

        /* Descartar posibles bajas: se quitan del "Con adeudo" y su desglose (y de esos
           modales), PERO NO del propio corte 'posible-baja' (ahí se siguen viendo, para
           que el conteo de posibles bajas no cambie). */
        const esPosibleBaja = (p: any): boolean =>
            m.mesesExigibles > 0 && p.Status === 0 && !p.BecaTotal && !p.EsFutsal && !p.EsKeeperOPortero
            && !p.InscripcionPagada && p.PagosCount === 0;
        const CORTES_QUITAN_PB = ['debe', 'pendiente-inscripcion', 'pendiente-mensualidad', 'debe-mes'];
        const base = (descartarPB && CORTES_QUITAN_PB.includes(filtro))
            ? computed.filter((p) => !esPosibleBaja(p))
            : computed;
        const data = base.filter(pasaFiltro);
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
