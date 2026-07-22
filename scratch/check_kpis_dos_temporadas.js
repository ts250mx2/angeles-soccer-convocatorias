// node --env-file=.env scratch/check_kpis_dos_temporadas.js
// SOLO LECTURA. Verifica los KPIs nuevos: temporada anterior resuelta correctamente,
// conteos debe/al-corriente por temporada, y que resumen (SQL) == modal (JS).
const mysql = require('mysql2/promise');
const pool = mysql.createPool({
    host: process.env.DB_HOST, user: process.env.DB_USER,
    password: process.env.DB_PASSWORD, database: process.env.DB_NAME, connectionLimit: 4,
});

function resolveMonths(s, now = new Date()) {
    const ini = new Date(s.FechaInicio), fin = new Date(s.FechaFin);
    const startMonth = ini.getUTCMonth()+1, endMonth = fin.getUTCMonth()+1;
    const cur = now.getUTCMonth()+1;
    const cierre = new Date(fin); cierre.setUTCHours(23,59,59,999);
    const hastaMonth = now.getTime() > cierre.getTime() ? endMonth : cur;
    return { seasonId: s.IdTemporada, nombre: s.Temporada, startMonth, endMonth, hastaMonth,
             mesesExigibles: Math.max(0, hastaMonth-startMonth+1) };
}

async function loadAnterior(sel) {
    const [r] = await pool.query(`
        SELECT IdTemporada, Temporada, FechaInicio, FechaFin FROM tblTemporadas
        WHERE (FechaInicio < ?) OR (FechaInicio = ? AND IdTemporada < ?)
        ORDER BY FechaInicio DESC, IdTemporada DESC LIMIT 1`,
        [sel.FechaInicio, sel.FechaInicio, sel.IdTemporada]);
    return r.length ? r[0] : null;
}

async function counts(m) {
    const [[r]] = await pool.query(`
        SELECT
          SUM(CASE WHEN J.Status=0 AND (INS.IdJugador IS NULL OR COALESCE(MEN.PagosCount,0) < ?) THEN 1 ELSE 0 END) as Debe,
          SUM(CASE WHEN J.Status=0 AND INS.IdJugador IS NOT NULL AND COALESCE(MEN.PagosCount,0) >= ? THEN 1 ELSE 0 END) as AlCorriente
        FROM tblJugadores J
        LEFT JOIN (SELECT P.IdJugador FROM tblPagos P INNER JOIN tblProductos PR ON P.IdProducto=PR.IdProducto
                   WHERE P.IdTemporada=? AND PR.IdTipoProducto=2 AND P.Status=0 GROUP BY P.IdJugador) INS ON INS.IdJugador=J.IdJugador
        LEFT JOIN (SELECT P.IdJugador, COUNT(DISTINCT P.Mes) as PagosCount FROM tblPagos P INNER JOIN tblProductos PR ON P.IdProducto=PR.IdProducto
                   WHERE P.IdTemporada=? AND PR.IdTipoProducto=1 AND P.Status=0 AND P.Mes>=? AND P.Mes<=? GROUP BY P.IdJugador) MEN ON MEN.IdJugador=J.IdJugador
    `, [m.mesesExigibles, m.mesesExigibles, m.seasonId, m.seasonId, m.startMonth, m.hastaMonth]);
    return { debe: Number(r.Debe)||0, alCorriente: Number(r.AlCorriente)||0 };
}

// Replica del modal (players route) en JS
async function modalCounts(m) {
    const [rows] = await pool.query(`
        SELECT J.Status, CASE WHEN INS.IdJugador IS NOT NULL THEN 1 ELSE 0 END as Insc,
               COALESCE(MEN.MesesPagados,'') as MesesPagados
        FROM tblJugadores J
        LEFT JOIN (SELECT P.IdJugador FROM tblPagos P INNER JOIN tblProductos PR ON P.IdProducto=PR.IdProducto
                   WHERE P.IdTemporada=? AND PR.IdTipoProducto=2 AND P.Status=0 GROUP BY P.IdJugador) INS ON INS.IdJugador=J.IdJugador
        LEFT JOIN (SELECT P.IdJugador, GROUP_CONCAT(DISTINCT P.Mes) as MesesPagados FROM tblPagos P INNER JOIN tblProductos PR ON P.IdProducto=PR.IdProducto
                   WHERE P.IdTemporada=? AND PR.IdTipoProducto=1 AND P.Status=0 AND P.Mes>=? AND P.Mes<=? GROUP BY P.IdJugador) MEN ON MEN.IdJugador=J.IdJugador
    `, [m.seasonId, m.seasonId, m.startMonth, m.endMonth]);
    let debe=0, alCorriente=0;
    for (const p of rows) {
        if (p.Status !== 0) continue;
        const paid = String(p.MesesPagados||'').split(',').map(x=>parseInt(x.trim())).filter(x=>!isNaN(x));
        let missing=0;
        for (let mm=m.startMonth; mm<=m.hastaMonth; mm++) if (!paid.includes(mm)) missing++;
        if (!p.Insc || missing>0) debe++;
        if (p.Insc && missing===0) alCorriente++;
    }
    return { debe, alCorriente };
}

async function main() {
    const [[sel]] = await pool.query('SELECT IdTemporada, Temporada, FechaInicio, FechaFin FROM tblTemporadas WHERE EsActiva=1');
    const prevRow = await loadAnterior(sel);
    const A = resolveMonths(sel);
    const P = prevRow ? resolveMonths(prevRow) : null;

    console.log(`Seleccionada: ${A.nombre} (id ${A.seasonId}) meses ${A.startMonth}-${A.endMonth}, hasta ${A.hastaMonth}, exigibles ${A.mesesExigibles}`);
    console.log(`Anterior    : ${P ? `${P.nombre} (id ${P.seasonId}) meses ${P.startMonth}-${P.endMonth}, hasta ${P.hastaMonth}, exigibles ${P.mesesExigibles}` : 'NINGUNA'}\n`);

    const [[act]] = await pool.query('SELECT COUNT(*) a FROM tblJugadores WHERE Status=0');
    const [[baj]] = await pool.query('SELECT COUNT(*) b FROM tblJugadores WHERE Status=2');
    console.log(`KPI Activos: ${act.a}   KPI Bajas: ${baj.b}`);

    const cA = await counts(A), mA = await modalCounts(A);
    console.log(`\nESTA TEMPORADA  debe ${cA.debe} / al corriente ${cA.alCorriente}   | modal debe ${mA.debe} / alcorr ${mA.alCorriente}  ${cA.debe===mA.debe && cA.alCorriente===mA.alCorriente ? 'OK' : '*** DIFIERE ***'}`);
    console.log(`  particion: debe+alCorriente = ${cA.debe+cA.alCorriente} vs activos ${act.a}  ${cA.debe+cA.alCorriente===act.a?'OK':'NO'}`);

    if (P) {
        const cP = await counts(P), mP = await modalCounts(P);
        console.log(`TEMP ANTERIOR   debe ${cP.debe} / al corriente ${cP.alCorriente}   | modal debe ${mP.debe} / alcorr ${mP.alCorriente}  ${cP.debe===mP.debe && cP.alCorriente===mP.alCorriente ? 'OK' : '*** DIFIERE ***'}`);
        console.log(`  particion: debe+alCorriente = ${cP.debe+cP.alCorriente} vs activos ${act.a}  ${cP.debe+cP.alCorriente===act.a?'OK':'NO'}`);
        console.log(`  (anterior ya termino -> exigibles ${P.mesesExigibles} = todos sus meses)`);
    }
    console.log('FIN');
    await pool.end();
}
main().catch(e => { console.error(e); process.exit(1); });
