// node --env-file=.env scratch/check_beca_fix.js
// SOLO LECTURA. Tras excluir la beca total del adeudo:
//  - resumen (SQL) == modal (JS)
//  - particion Activos = Debe + AlCorriente
//  - cuantos becados salieron del adeudo
const mysql = require('mysql2/promise');
const pool = mysql.createPool({
    host: process.env.DB_HOST, user: process.env.DB_USER,
    password: process.env.DB_PASSWORD, database: process.env.DB_NAME, connectionLimit: 4,
});

const BECA = `(COALESCE(NULLIF(TRIM(J.Beca), ''), '0') + 0) >= 100`;

function months(s, now = new Date()) {
    const ini = new Date(s.FechaInicio), fin = new Date(s.FechaFin);
    const startMonth = ini.getUTCMonth()+1, endMonth = fin.getUTCMonth()+1;
    const cierre = new Date(fin); cierre.setUTCHours(23,59,59,999);
    const hastaMonth = now.getTime() > cierre.getTime() ? endMonth : (now.getUTCMonth()+1);
    return { seasonId: s.IdTemporada, nombre: s.Temporada, startMonth, endMonth, hastaMonth,
             mesesExigibles: Math.max(0, hastaMonth-startMonth+1) };
}

async function sqlCounts(m) {
    const meses = []; for (let x=m.startMonth; x<=m.hastaMonth; x++) meses.push(x);
    const flags = meses.map(x=>`MAX(CASE WHEN P.Mes = ${x} THEN 1 ELSE 0 END) as M${x}`).join(', ');
    const cnts = meses.map(x=>`SUM(CASE WHEN J.Status=0 AND NOT ${BECA} AND COALESCE(MEN.M${x},0)=0 THEN 1 ELSE 0 END) as Debe${x}`).join(', ');
    const [[r]] = await pool.query(`
        SELECT
          COUNT(CASE WHEN J.Status=0 THEN 1 END) as Activos,
          SUM(CASE WHEN J.Status=0 AND NOT ${BECA} AND (INS.IdJugador IS NULL OR COALESCE(MEN.PagosCount,0) < ?) THEN 1 ELSE 0 END) as Debe,
          SUM(CASE WHEN J.Status=0 AND (${BECA} OR (INS.IdJugador IS NOT NULL AND COALESCE(MEN.PagosCount,0) >= ?)) THEN 1 ELSE 0 END) as AlCorriente,
          SUM(CASE WHEN J.Status=0 AND NOT ${BECA} AND INS.IdJugador IS NULL THEN 1 ELSE 0 END) as DebeInsc,
          SUM(CASE WHEN J.Status=0 AND ${BECA} THEN 1 ELSE 0 END) as BecaTotalActivos
          ${cnts ? ', '+cnts : ''}
        FROM tblJugadores J
        LEFT JOIN (SELECT P.IdJugador FROM tblPagos P INNER JOIN tblProductos PR ON P.IdProducto=PR.IdProducto
                   WHERE P.IdTemporada=? AND PR.IdTipoProducto=2 AND P.Status=0 GROUP BY P.IdJugador) INS ON INS.IdJugador=J.IdJugador
        LEFT JOIN (SELECT P.IdJugador, COUNT(DISTINCT P.Mes) as PagosCount ${flags ? ', '+flags : ''}
                   FROM tblPagos P INNER JOIN tblProductos PR ON P.IdProducto=PR.IdProducto
                   WHERE P.IdTemporada=? AND PR.IdTipoProducto=1 AND P.Status=0 AND P.Mes>=? AND P.Mes<=?
                   GROUP BY P.IdJugador) MEN ON MEN.IdJugador=J.IdJugador
    `, [m.mesesExigibles, m.mesesExigibles, m.seasonId, m.seasonId, m.startMonth, m.hastaMonth]);
    return { r, meses };
}

async function jsCounts(m) {
    const [rows] = await pool.query(`
        SELECT J.Status, (COALESCE(NULLIF(TRIM(J.Beca),''),'0') + 0) as BecaNum,
               CASE WHEN INS.IdJugador IS NOT NULL THEN 1 ELSE 0 END as Insc,
               COALESCE(MEN.MesesPagados,'') as MesesPagados
        FROM tblJugadores J
        LEFT JOIN (SELECT P.IdJugador FROM tblPagos P INNER JOIN tblProductos PR ON P.IdProducto=PR.IdProducto
                   WHERE P.IdTemporada=? AND PR.IdTipoProducto=2 AND P.Status=0 GROUP BY P.IdJugador) INS ON INS.IdJugador=J.IdJugador
        LEFT JOIN (SELECT P.IdJugador, GROUP_CONCAT(DISTINCT P.Mes) as MesesPagados FROM tblPagos P INNER JOIN tblProductos PR ON P.IdProducto=PR.IdProducto
                   WHERE P.IdTemporada=? AND PR.IdTipoProducto=1 AND P.Status=0 AND P.Mes>=? AND P.Mes<=? GROUP BY P.IdJugador) MEN ON MEN.IdJugador=J.IdJugador
    `, [m.seasonId, m.seasonId, m.startMonth, m.endMonth]);

    let debe=0, alCorr=0, debeInsc=0; const porMes={};
    for (const p of rows) {
        if (p.Status !== 0) continue;
        const becado = Number(p.BecaNum) >= 100;
        const paid = String(p.MesesPagados||'').split(',').map(x=>parseInt(x.trim())).filter(x=>!isNaN(x));
        let missing=0;
        for (let x=m.startMonth; x<=m.hastaMonth; x++) {
            if (!paid.includes(x)) { missing++; if (!becado) porMes[x]=(porMes[x]||0)+1; }
        }
        if (!becado && !p.Insc) debeInsc++;
        if (!becado && (!p.Insc || missing>0)) debe++;
        if (becado || (p.Insc && missing===0)) alCorr++;
    }
    return { debe, alCorr, debeInsc, porMes };
}

async function main() {
    const [[a]] = await pool.query('SELECT IdTemporada,Temporada,FechaInicio,FechaFin FROM tblTemporadas WHERE EsActiva=1');
    const [prev] = await pool.query(`SELECT IdTemporada,Temporada,FechaInicio,FechaFin FROM tblTemporadas
        WHERE FechaInicio < ? ORDER BY FechaInicio DESC, IdTemporada DESC LIMIT 1`, [a.FechaInicio]);

    for (const s of [a, prev[0]]) {
        if (!s) continue;
        const m = months(s);
        const { r, meses } = await sqlCounts(m);
        const js = await jsCounts(m);
        console.log(`\n=== ${m.nombre} (meses ${m.startMonth}-${m.endMonth}, exigibles ${m.mesesExigibles}) ===`);
        console.log(`Activos ${r.Activos} | beca total activos: ${r.BecaTotalActivos}`);
        console.log(`Debe        sql ${String(r.Debe).padStart(5)} | modal ${String(js.debe).padStart(5)}  ${Number(r.Debe)===js.debe?'OK':'*** DIFIERE ***'}`);
        console.log(`AlCorriente sql ${String(r.AlCorriente).padStart(5)} | modal ${String(js.alCorr).padStart(5)}  ${Number(r.AlCorriente)===js.alCorr?'OK':'*** DIFIERE ***'}`);
        console.log(`DebeInsc    sql ${String(r.DebeInsc).padStart(5)} | modal ${String(js.debeInsc).padStart(5)}  ${Number(r.DebeInsc)===js.debeInsc?'OK':'*** DIFIERE ***'}`);
        let ok = true;
        for (const x of meses) {
            const sn = Number(r[`Debe${x}`])||0, jn = js.porMes[x]||0;
            if (sn !== jn) { ok=false; console.log(`  mes ${x}: sql ${sn} | modal ${jn}  *** DIFIERE ***`); }
        }
        if (meses.length) console.log(`Meses: ${ok?'todos cuadran':'HAY DIFERENCIAS'}`);
        const part = Number(r.Activos) === Number(r.Debe)+Number(r.AlCorriente);
        console.log(`Particion Activos = Debe + AlCorriente: ${part?'OK':'NO'}`);
    }
    console.log('\nFIN');
    await pool.end();
}
main().catch(e => { console.error(e); process.exit(1); });
