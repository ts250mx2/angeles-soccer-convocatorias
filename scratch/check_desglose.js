// node --env-file=.env scratch/check_desglose.js
// SOLO LECTURA. Verifica el desglose por concepto (inscripcion / cada mes vencido):
//  - conteo del chip (SQL) == conteo del modal (JS, filtro debe-mes / pendiente-inscripcion)
//  - union de los conceptos == Debe total
const mysql = require('mysql2/promise');
const pool = mysql.createPool({
    host: process.env.DB_HOST, user: process.env.DB_USER,
    password: process.env.DB_PASSWORD, database: process.env.DB_NAME, connectionLimit: 4,
});

function resolveMonths(s, now = new Date()) {
    const ini = new Date(s.FechaInicio), fin = new Date(s.FechaFin);
    const startMonth = ini.getUTCMonth()+1, endMonth = fin.getUTCMonth()+1;
    const cierre = new Date(fin); cierre.setUTCHours(23,59,59,999);
    const hastaMonth = now.getTime() > cierre.getTime() ? endMonth : (now.getUTCMonth()+1);
    return { seasonId: s.IdTemporada, nombre: s.Temporada, startMonth, endMonth, hastaMonth,
             mesesExigibles: Math.max(0, hastaMonth-startMonth+1) };
}

// Replica del SQL de countsByGroup (global, sin agrupar)
async function desgloseSQL(m) {
    const meses = [];
    for (let x=m.startMonth; x<=m.hastaMonth; x++) meses.push(x);
    const flags = meses.map(x=>`MAX(CASE WHEN P.Mes = ${x} THEN 1 ELSE 0 END) as M${x}`).join(', ');
    const conteos = meses.map(x=>`SUM(CASE WHEN J.Status=0 AND COALESCE(MEN.M${x},0)=0 THEN 1 ELSE 0 END) as Debe${x}`).join(', ');
    const [[r]] = await pool.query(`
        SELECT
          SUM(CASE WHEN J.Status=0 AND (INS.IdJugador IS NULL OR COALESCE(MEN.PagosCount,0) < ?) THEN 1 ELSE 0 END) as Debe,
          SUM(CASE WHEN J.Status=0 AND INS.IdJugador IS NULL THEN 1 ELSE 0 END) as DebeInscripcion
          ${conteos ? ', '+conteos : ''}
        FROM tblJugadores J
        LEFT JOIN (SELECT P.IdJugador FROM tblPagos P INNER JOIN tblProductos PR ON P.IdProducto=PR.IdProducto
                   WHERE P.IdTemporada=? AND PR.IdTipoProducto=2 AND P.Status=0 GROUP BY P.IdJugador) INS ON INS.IdJugador=J.IdJugador
        LEFT JOIN (SELECT P.IdJugador, COUNT(DISTINCT P.Mes) as PagosCount ${flags ? ', '+flags : ''}
                   FROM tblPagos P INNER JOIN tblProductos PR ON P.IdProducto=PR.IdProducto
                   WHERE P.IdTemporada=? AND PR.IdTipoProducto=1 AND P.Status=0 AND P.Mes>=? AND P.Mes<=?
                   GROUP BY P.IdJugador) MEN ON MEN.IdJugador=J.IdJugador
    `, [m.mesesExigibles, m.seasonId, m.seasonId, m.startMonth, m.hastaMonth]);
    return { r, meses };
}

// Replica del modal en JS
async function modalJS(m) {
    const [rows] = await pool.query(`
        SELECT J.IdJugador, J.Status, CASE WHEN INS.IdJugador IS NOT NULL THEN 1 ELSE 0 END as Insc,
               COALESCE(MEN.MesesPagados,'') as MesesPagados
        FROM tblJugadores J
        LEFT JOIN (SELECT P.IdJugador FROM tblPagos P INNER JOIN tblProductos PR ON P.IdProducto=PR.IdProducto
                   WHERE P.IdTemporada=? AND PR.IdTipoProducto=2 AND P.Status=0 GROUP BY P.IdJugador) INS ON INS.IdJugador=J.IdJugador
        LEFT JOIN (SELECT P.IdJugador, GROUP_CONCAT(DISTINCT P.Mes) as MesesPagados FROM tblPagos P INNER JOIN tblProductos PR ON P.IdProducto=PR.IdProducto
                   WHERE P.IdTemporada=? AND PR.IdTipoProducto=1 AND P.Status=0 AND P.Mes>=? AND P.Mes<=? GROUP BY P.IdJugador) MEN ON MEN.IdJugador=J.IdJugador
    `, [m.seasonId, m.seasonId, m.startMonth, m.endMonth]);

    const porMes = {}, unionIds = new Set();
    let debeInsc = 0, debeTotal = 0;
    for (const p of rows) {
        if (p.Status !== 0) continue;
        const paid = String(p.MesesPagados||'').split(',').map(x=>parseInt(x.trim())).filter(x=>!isNaN(x));
        let missing = 0;
        for (let x=m.startMonth; x<=m.hastaMonth; x++) {
            if (!paid.includes(x)) { missing++; porMes[x]=(porMes[x]||0)+1; unionIds.add(p.IdJugador); }
        }
        if (!p.Insc) { debeInsc++; unionIds.add(p.IdJugador); }
        if (!p.Insc || missing>0) debeTotal++;
    }
    return { debeInsc, porMes, debeTotal, union: unionIds.size };
}

async function main() {
    const [[sel]] = await pool.query('SELECT IdTemporada, Temporada, FechaInicio, FechaFin FROM tblTemporadas WHERE EsActiva=1');
    const [prev] = await pool.query(`
        SELECT IdTemporada, Temporada, FechaInicio, FechaFin FROM tblTemporadas
        WHERE FechaInicio < ? ORDER BY FechaInicio DESC, IdTemporada DESC LIMIT 1`, [sel.FechaInicio]);

    for (const s of [sel, prev[0]]) {
        if (!s) continue;
        const m = resolveMonths(s);
        const { r, meses } = await desgloseSQL(m);
        const js = await modalJS(m);

        console.log(`\n=== ${m.nombre} (meses ${m.startMonth}-${m.endMonth}, exigibles ${m.mesesExigibles}) ===`);
        console.log(`Debe total: ${r.Debe}   (modal ${js.debeTotal})  ${Number(r.Debe)===js.debeTotal?'OK':'*** DIFIERE ***'}`);
        console.log(`Inscripcion: sql ${r.DebeInscripcion} | modal ${js.debeInsc}  ${Number(r.DebeInscripcion)===js.debeInsc?'OK':'*** DIFIERE ***'}`);
        if (meses.length === 0) { console.log('Sin meses vencidos -> el desglose solo muestra inscripcion'); }
        let ok = true;
        for (const x of meses) {
            const sqlN = Number(r[`Debe${x}`])||0, jsN = js.porMes[x]||0;
            if (sqlN !== jsN) ok = false;
            console.log(`  mes ${String(x).padStart(2)}: sql ${String(sqlN).padStart(5)} | modal ${String(jsN).padStart(5)}  ${sqlN===jsN?'OK':'*** DIFIERE ***'}`);
        }
        if (meses.length) console.log(`  meses: ${ok?'todos cuadran':'HAY DIFERENCIAS'}`);
        console.log(`Union de conceptos (unicos) = ${js.union} vs Debe total ${js.debeTotal}  ${js.union===js.debeTotal?'OK (el desglose cubre exactamente a los deudores)':'revisar'}`);
    }
    console.log('\nFIN');
    await pool.end();
}
main().catch(e => { console.error(e); process.exit(1); });
