// node --env-file=.env scratch/check_alcorriente.js
// SOLO LECTURA. Verifica que AlCorriente del resumen (SQL) empate con el filtro
// al-corriente del modal (JS), y su relación con activos y los pendientes.
const mysql = require('mysql2/promise');

const pool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    connectionLimit: 4,
});

function resolveMonths(season, now = new Date()) {
    const inicio = new Date(season.FechaInicio);
    const fin = new Date(season.FechaFin);
    const startMonth = inicio.getUTCMonth() + 1;
    const endMonth = fin.getUTCMonth() + 1;
    const currentMonth = now.getUTCMonth() + 1;
    const finCierre = new Date(fin); finCierre.setUTCHours(23, 59, 59, 999);
    const esPasada = now.getTime() > finCierre.getTime();
    return { seasonId: season.IdTemporada, startMonth, endMonth,
        hastaMonth: esPasada ? endMonth : currentMonth,
        numMonthsExpected: Math.max(0, endMonth - startMonth + 1) };
}

async function summary(m, sedeId) {
    const [[r]] = await pool.query(`
        SELECT
            COUNT(CASE WHEN J.Status = 0 THEN 1 END) as Activos,
            SUM(CASE WHEN INS.IdJugador IS NULL AND J.Status = 0 THEN 1 ELSE 0 END) as PendInsc,
            SUM(CASE WHEN COALESCE(MEN.PagosCount,0) < ? AND J.Status = 0 THEN 1 ELSE 0 END) as PendMens,
            SUM(CASE WHEN J.Status = 0 AND INS.IdJugador IS NOT NULL AND COALESCE(MEN.PagosCount,0) >= ? THEN 1 ELSE 0 END) as AlCorriente
        FROM tblJugadores J
        LEFT JOIN (SELECT P.IdJugador FROM tblPagos P INNER JOIN tblProductos PR ON P.IdProducto=PR.IdProducto
                   WHERE P.IdTemporada=? AND PR.IdTipoProducto=2 AND P.Status=0 GROUP BY P.IdJugador) INS ON INS.IdJugador=J.IdJugador
        LEFT JOIN (SELECT P.IdJugador, COUNT(DISTINCT P.Mes) as PagosCount FROM tblPagos P INNER JOIN tblProductos PR ON P.IdProducto=PR.IdProducto
                   WHERE P.IdTemporada=? AND PR.IdTipoProducto=1 AND P.Status=0 AND P.Mes>=? AND P.Mes<=? GROUP BY P.IdJugador) MEN ON MEN.IdJugador=J.IdJugador
        WHERE J.IdSede = ?
    `, [m.numMonthsExpected, m.numMonthsExpected, m.seasonId, m.seasonId, m.startMonth, m.endMonth, sedeId]);
    return r;
}

async function modalCounts(m, sedeId) {
    const [rows] = await pool.query(`
        SELECT J.Status,
            CASE WHEN INS.IdJugador IS NOT NULL THEN 1 ELSE 0 END as InscripcionPagada,
            COALESCE(MEN.MesesPagados,'') as MesesPagados
        FROM tblJugadores J
        LEFT JOIN (SELECT P.IdJugador FROM tblPagos P INNER JOIN tblProductos PR ON P.IdProducto=PR.IdProducto
                   WHERE P.IdTemporada=? AND PR.IdTipoProducto=2 AND P.Status=0 GROUP BY P.IdJugador) INS ON INS.IdJugador=J.IdJugador
        LEFT JOIN (SELECT P.IdJugador, GROUP_CONCAT(DISTINCT P.Mes) as MesesPagados FROM tblPagos P INNER JOIN tblProductos PR ON P.IdProducto=PR.IdProducto
                   WHERE P.IdTemporada=? AND PR.IdTipoProducto=1 AND P.Status=0 AND P.Mes>=? AND P.Mes<=? GROUP BY P.IdJugador) MEN ON MEN.IdJugador=J.IdJugador
        WHERE J.IdSede = ?
    `, [m.seasonId, m.seasonId, m.startMonth, m.endMonth, sedeId]);
    let alCorriente = 0;
    for (const p of rows) {
        const paid = String(p.MesesPagados||'').split(',').map(x=>parseInt(x.trim())).filter(x=>!isNaN(x));
        const pagosCount = paid.filter(x=>x>=m.startMonth && x<=m.endMonth).length;
        if (p.Status===0 && p.InscripcionPagada && pagosCount >= m.numMonthsExpected) alCorriente++;
    }
    return alCorriente;
}

async function main() {
    const [[season]] = await pool.query('SELECT IdTemporada, Temporada, FechaInicio, FechaFin FROM tblTemporadas WHERE EsActiva=1');
    const m = resolveMonths(season);
    console.log(`${season.Temporada} | meses ${m.startMonth}-${m.endMonth} | esperados ${m.numMonthsExpected}\n`);

    // Prueba tambien con una temporada pasada bien formada (7: ENERO-JULIO 2025)
    const [[pasada]] = await pool.query('SELECT IdTemporada, Temporada, FechaInicio, FechaFin FROM tblTemporadas WHERE IdTemporada=7');
    const mp = resolveMonths(pasada);
    console.log(`Comparativa temporada pasada: ${pasada.Temporada} | meses ${mp.startMonth}-${mp.endMonth} | esperados ${mp.numMonthsExpected}\n`);

    const [sedes] = await pool.query('SELECT IdSede, Sede FROM tblSedes ORDER BY Sede LIMIT 6');
    for (const label of [{ m, tag: 'ACTIVA' }, { m: mp, tag: 'PASADA-7' }]) {
      console.log(`=== ${label.tag} ===`);
      let ok = true;
      for (const s of sedes) {
        const sum = await summary(label.m, s.IdSede);
        const modal = await modalCounts(label.m, s.IdSede);
        const match = Number(sum.AlCorriente) === modal;
        if (!match) ok = false;
        console.log(`${s.Sede.padEnd(12)} A${sum.Activos} AlCorr(sql)=${sum.AlCorriente} AlCorr(modal)=${modal} ${match?'OK':'*** DIFIERE ***'}  [PendInsc ${sum.PendInsc} PendMens ${sum.PendMens}]`);
      }
      console.log(ok ? 'cuadran\n' : 'DIFIEREN\n');
    }
    console.log('FIN');
    await pool.end();
}

main().catch(e => { console.error(e); process.exit(1); });
