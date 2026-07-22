// node --env-file=.env scratch/check_adeudos_cuadre.js
// SOLO LECTURA. Verifica que los conteos de las tarjetas (sedes/categories API)
// empaten con los del modal (players API filtrado), para la temporada activa.
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

async function sedeSummary(m, sedeId) {
    const [[r]] = await pool.query(`
        SELECT
            COUNT(CASE WHEN J.Status = 0 THEN 1 END) as Activos,
            COUNT(CASE WHEN J.Status = 2 THEN 1 END) as Bajas,
            SUM(CASE WHEN INS.IdJugador IS NULL AND J.Status = 0 THEN 1 ELSE 0 END) as PendInsc,
            SUM(CASE WHEN COALESCE(MEN.PagosCount,0) < ? AND J.Status = 0 THEN 1 ELSE 0 END) as PendMens
        FROM tblJugadores J
        LEFT JOIN (SELECT P.IdJugador FROM tblPagos P INNER JOIN tblProductos PR ON P.IdProducto=PR.IdProducto
                   WHERE P.IdTemporada=? AND PR.IdTipoProducto=2 AND P.Status=0 GROUP BY P.IdJugador) INS ON INS.IdJugador=J.IdJugador
        LEFT JOIN (SELECT P.IdJugador, COUNT(DISTINCT P.Mes) as PagosCount FROM tblPagos P INNER JOIN tblProductos PR ON P.IdProducto=PR.IdProducto
                   WHERE P.IdTemporada=? AND PR.IdTipoProducto=1 AND P.Status=0 AND P.Mes>=? AND P.Mes<=? GROUP BY P.IdJugador) MEN ON MEN.IdJugador=J.IdJugador
        WHERE J.IdSede = ?
    `, [m.numMonthsExpected, m.seasonId, m.seasonId, m.startMonth, m.endMonth, sedeId]);
    return r;
}

async function playersComputed(m, sedeId) {
    const [rows] = await pool.query(`
        SELECT J.IdJugador, J.Status, J.Beca,
            CASE WHEN INS.IdJugador IS NOT NULL THEN 1 ELSE 0 END as InscripcionPagada,
            COALESCE(MEN.MesesPagados,'') as MesesPagados
        FROM tblJugadores J
        LEFT JOIN (SELECT P.IdJugador FROM tblPagos P INNER JOIN tblProductos PR ON P.IdProducto=PR.IdProducto
                   WHERE P.IdTemporada=? AND PR.IdTipoProducto=2 AND P.Status=0 GROUP BY P.IdJugador) INS ON INS.IdJugador=J.IdJugador
        LEFT JOIN (SELECT P.IdJugador, GROUP_CONCAT(DISTINCT P.Mes) as MesesPagados FROM tblPagos P INNER JOIN tblProductos PR ON P.IdProducto=PR.IdProducto
                   WHERE P.IdTemporada=? AND PR.IdTipoProducto=1 AND P.Status=0 AND P.Mes>=? AND P.Mes<=? GROUP BY P.IdJugador) MEN ON MEN.IdJugador=J.IdJugador
        WHERE J.IdSede = ?
    `, [m.seasonId, m.seasonId, m.startMonth, m.endMonth, sedeId]);

    const enrich = rows.map(p => {
        const paid = String(p.MesesPagados||'').split(',').map(x=>parseInt(x.trim())).filter(x=>!isNaN(x));
        const pagosCount = paid.filter(x => x>=m.startMonth && x<=m.endMonth).length;
        return { ...p, PagosCount: pagosCount };
    });
    return {
        activos: enrich.filter(p => p.Status===0).length,
        bajas: enrich.filter(p => p.Status===2).length,
        pendInsc: enrich.filter(p => p.Status===0 && !p.InscripcionPagada).length,
        pendMens: enrich.filter(p => p.Status===0 && p.PagosCount < m.numMonthsExpected).length,
    };
}

async function main() {
    const [[season]] = await pool.query('SELECT IdTemporada, Temporada, FechaInicio, FechaFin FROM tblTemporadas WHERE EsActiva=1');
    const m = resolveMonths(season);
    console.log(`${season.Temporada} | meses ${m.startMonth}-${m.endMonth} | hasta ${m.hastaMonth} | esperados ${m.numMonthsExpected}\n`);

    const [sedes] = await pool.query('SELECT IdSede, Sede FROM tblSedes ORDER BY Sede LIMIT 6');
    let allOk = true;
    for (const s of sedes) {
        const card = await sedeSummary(m, s.IdSede);
        const modal = await playersComputed(m, s.IdSede);
        const ok = Number(card.Activos)===modal.activos && Number(card.Bajas)===modal.bajas
                && Number(card.PendInsc)===modal.pendInsc && Number(card.PendMens)===modal.pendMens;
        if (!ok) allOk = false;
        console.log(`${s.Sede.padEnd(14)} card[A${card.Activos} B${card.Bajas} PI${card.PendInsc} PM${card.PendMens}] modal[A${modal.activos} B${modal.bajas} PI${modal.pendInsc} PM${modal.pendMens}] ${ok?'OK':'*** DIFIERE ***'}`);
    }
    console.log(`\n${allOk ? 'TODOS CUADRAN' : 'HAY DIFERENCIAS'}`);
    console.log('FIN');
    await pool.end();
}

main().catch(e => { console.error(e); process.exit(1); });
