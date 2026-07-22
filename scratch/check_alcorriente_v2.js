// node --env-file=.env scratch/check_alcorriente_v2.js
// SOLO LECTURA. Verifica la nueva lógica basada en meses VENCIDOS (hastaMonth):
//  - al corriente activa ~= 201 (inscritos, temporada sin arrancar)
//  - Activos = AlCorriente + Debe (partición)
//  - resumen (SQL) == modal (JS)
const mysql = require('mysql2/promise');
const pool = mysql.createPool({
    host: process.env.DB_HOST, user: process.env.DB_USER,
    password: process.env.DB_PASSWORD, database: process.env.DB_NAME, connectionLimit: 4,
});

function resolveMonths(season, now = new Date()) {
    const inicio = new Date(season.FechaInicio), fin = new Date(season.FechaFin);
    const startMonth = inicio.getUTCMonth() + 1, endMonth = fin.getUTCMonth() + 1;
    const currentMonth = now.getUTCMonth() + 1;
    const finCierre = new Date(fin); finCierre.setUTCHours(23,59,59,999);
    const esPasada = now.getTime() > finCierre.getTime();
    const hastaMonth = esPasada ? endMonth : currentMonth;
    return { seasonId: season.IdTemporada, startMonth, endMonth, hastaMonth,
        numMonthsExpected: Math.max(0, endMonth-startMonth+1),
        mesesExigibles: Math.max(0, hastaMonth-startMonth+1) };
}

// Resumen SQL (replica sedes/categories)
async function summary(m, sedeId) {
    const [[r]] = await pool.query(`
        SELECT
            COUNT(CASE WHEN J.Status=0 THEN 1 END) as Activos,
            SUM(CASE WHEN INS.IdJugador IS NULL AND J.Status=0 THEN 1 ELSE 0 END) as PendInsc,
            SUM(CASE WHEN COALESCE(MEN.PagosCount,0) < ? AND J.Status=0 THEN 1 ELSE 0 END) as PendMens,
            SUM(CASE WHEN J.Status=0 AND INS.IdJugador IS NOT NULL AND COALESCE(MEN.PagosCount,0) >= ? THEN 1 ELSE 0 END) as AlCorriente,
            SUM(CASE WHEN J.Status=0 AND (INS.IdJugador IS NULL OR COALESCE(MEN.PagosCount,0) < ?) THEN 1 ELSE 0 END) as Debe
        FROM tblJugadores J
        LEFT JOIN (SELECT P.IdJugador FROM tblPagos P INNER JOIN tblProductos PR ON P.IdProducto=PR.IdProducto
                   WHERE P.IdTemporada=? AND PR.IdTipoProducto=2 AND P.Status=0 GROUP BY P.IdJugador) INS ON INS.IdJugador=J.IdJugador
        LEFT JOIN (SELECT P.IdJugador, COUNT(DISTINCT P.Mes) as PagosCount FROM tblPagos P INNER JOIN tblProductos PR ON P.IdProducto=PR.IdProducto
                   WHERE P.IdTemporada=? AND PR.IdTipoProducto=1 AND P.Status=0 AND P.Mes>=? AND P.Mes<=? GROUP BY P.IdJugador) MEN ON MEN.IdJugador=J.IdJugador
        WHERE ${sedeId ? 'J.IdSede = ?' : '1=1'}
    `, sedeId
        ? [m.mesesExigibles, m.mesesExigibles, m.mesesExigibles, m.seasonId, m.seasonId, m.startMonth, m.hastaMonth, sedeId]
        : [m.mesesExigibles, m.mesesExigibles, m.mesesExigibles, m.seasonId, m.seasonId, m.startMonth, m.hastaMonth]);
    return r;
}

// Modal JS (replica players route)
async function modal(m, sedeId) {
    const [rows] = await pool.query(`
        SELECT J.Status, CASE WHEN INS.IdJugador IS NOT NULL THEN 1 ELSE 0 END as Insc, COALESCE(MEN.MesesPagados,'') as MesesPagados
        FROM tblJugadores J
        LEFT JOIN (SELECT P.IdJugador FROM tblPagos P INNER JOIN tblProductos PR ON P.IdProducto=PR.IdProducto
                   WHERE P.IdTemporada=? AND PR.IdTipoProducto=2 AND P.Status=0 GROUP BY P.IdJugador) INS ON INS.IdJugador=J.IdJugador
        LEFT JOIN (SELECT P.IdJugador, GROUP_CONCAT(DISTINCT P.Mes) as MesesPagados FROM tblPagos P INNER JOIN tblProductos PR ON P.IdProducto=PR.IdProducto
                   WHERE P.IdTemporada=? AND PR.IdTipoProducto=1 AND P.Status=0 AND P.Mes>=? AND P.Mes<=? GROUP BY P.IdJugador) MEN ON MEN.IdJugador=J.IdJugador
        ${sedeId ? 'WHERE J.IdSede = ?' : ''}
    `, sedeId ? [m.seasonId, m.seasonId, m.startMonth, m.endMonth, sedeId] : [m.seasonId, m.seasonId, m.startMonth, m.endMonth]);
    let alCorriente=0, debe=0, activos=0, pendInsc=0, pendMens=0;
    for (const p of rows) {
        if (p.Status !== 0) continue;
        activos++;
        const paid = String(p.MesesPagados||'').split(',').map(x=>parseInt(x.trim())).filter(x=>!isNaN(x));
        let missing=0;
        for (let mm=m.startMonth; mm<=m.hastaMonth; mm++) if (!paid.includes(mm)) missing++;
        if (!p.Insc) pendInsc++;
        if (missing>0) pendMens++;
        if (p.Insc && missing===0) alCorriente++;
        if (!p.Insc || missing>0) debe++;
    }
    return { activos, pendInsc, pendMens, alCorriente, debe };
}

async function main() {
    const [[season]] = await pool.query('SELECT IdTemporada, Temporada, FechaInicio, FechaFin FROM tblTemporadas WHERE EsActiva=1');
    const m = resolveMonths(season);
    console.log(`${season.Temporada} | start ${m.startMonth} hasta ${m.hastaMonth} | mesesExigibles ${m.mesesExigibles}\n`);

    // Global
    const g = await summary(m, null);
    console.log(`GLOBAL  Activos ${g.Activos}  AlCorriente ${g.AlCorriente}  Debe ${g.Debe}  (suma ${Number(g.AlCorriente)+Number(g.Debe)})  PendInsc ${g.PendInsc}  PendMens ${g.PendMens}`);
    console.log(`  -> al corriente esperado ~201 (inscritos). Obtenido: ${g.AlCorriente}`);
    console.log(`  -> particion Activos = AlCorriente + Debe: ${Number(g.Activos) === Number(g.AlCorriente)+Number(g.Debe) ? 'OK' : 'FALLA'}\n`);

    const [sedes] = await pool.query('SELECT IdSede, Sede FROM tblSedes ORDER BY Sede LIMIT 6');
    let allOk = true;
    for (const s of sedes) {
        const sum = await summary(m, s.IdSede);
        const mod = await modal(m, s.IdSede);
        const match = Number(sum.AlCorriente)===mod.alCorriente && Number(sum.Debe)===mod.debe
                   && Number(sum.PendMens)===mod.pendMens && Number(sum.PendInsc)===mod.pendInsc;
        const part = Number(sum.Activos) === Number(sum.AlCorriente)+Number(sum.Debe);
        if (!match || !part) allOk = false;
        console.log(`${s.Sede.padEnd(12)} A${sum.Activos} AlCorr ${sum.AlCorriente} Debe ${sum.Debe} | modal AlCorr ${mod.alCorriente} Debe ${mod.debe} | match ${match?'OK':'NO'} particion ${part?'OK':'NO'}`);
    }
    console.log(`\n${allOk ? 'TODO CUADRA' : 'HAY DIFERENCIAS'}`);
    console.log('FIN');
    await pool.end();
}
main().catch(e => { console.error(e); process.exit(1); });
