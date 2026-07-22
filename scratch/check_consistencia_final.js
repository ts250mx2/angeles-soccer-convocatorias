// node --env-file=.env scratch/check_consistencia_final.js
// SOLO LECTURA. Confirma inscripciones (nueva regla con Status=0) == adeudos al-corriente.
const mysql = require('mysql2/promise');
const pool = mysql.createPool({
    host: process.env.DB_HOST, user: process.env.DB_USER,
    password: process.env.DB_PASSWORD, database: process.env.DB_NAME, connectionLimit: 4,
});

async function main() {
    const [temps] = await pool.query('SELECT IdTemporada, Temporada, FechaInicio, FechaFin, EsActiva FROM tblTemporadas ORDER BY IdTemporada DESC LIMIT 4');

    for (const T of temps) {
        const t = T.IdTemporada;
        // Inscripciones NUEVA regla (con A.Status=0)
        const [[insc]] = await pool.query(`
            SELECT COUNT(*) n FROM tblJugadores J WHERE J.Status=0 AND J.IdJugador IN (
                SELECT A.IdJugador FROM tblPagos A INNER JOIN tblProductos B ON A.IdProducto=B.IdProducto
                WHERE A.IdTemporada=? AND B.IdTipoProducto=2 AND A.Status=0)`, [t]);

        // Adeudos al-corriente = activo con inscripcion(Status0) y sin meses vencidos
        const inicio = new Date(T.FechaInicio), fin = new Date(T.FechaFin);
        const startMonth = inicio.getUTCMonth()+1, endMonth = fin.getUTCMonth()+1;
        const now = new Date();
        const finCierre = new Date(fin); finCierre.setUTCHours(23,59,59,999);
        const hastaMonth = now.getTime() > finCierre.getTime() ? endMonth : (now.getUTCMonth()+1);
        const mesesExigibles = Math.max(0, hastaMonth - startMonth + 1);

        const [[alcorr]] = await pool.query(`
            SELECT SUM(CASE WHEN J.Status=0 AND INS.IdJugador IS NOT NULL AND COALESCE(MEN.PagosCount,0) >= ? THEN 1 ELSE 0 END) n
            FROM tblJugadores J
            LEFT JOIN (SELECT P.IdJugador FROM tblPagos P INNER JOIN tblProductos PR ON P.IdProducto=PR.IdProducto
                       WHERE P.IdTemporada=? AND PR.IdTipoProducto=2 AND P.Status=0 GROUP BY P.IdJugador) INS ON INS.IdJugador=J.IdJugador
            LEFT JOIN (SELECT P.IdJugador, COUNT(DISTINCT P.Mes) as PagosCount FROM tblPagos P INNER JOIN tblProductos PR ON P.IdProducto=PR.IdProducto
                       WHERE P.IdTemporada=? AND PR.IdTipoProducto=1 AND P.Status=0 AND P.Mes>=? AND P.Mes<=? GROUP BY P.IdJugador) MEN ON MEN.IdJugador=J.IdJugador
        `, [mesesExigibles, t, t, startMonth, hastaMonth]);

        const marca = T.EsActiva ? ' (activa, sin arrancar)' : '';
        console.log(`temp ${String(t).padStart(2)} ${T.Temporada.padEnd(24)} inscritos=${String(insc.n).padStart(4)}  adeudos.alCorriente=${String(Number(alcorr.n)||0).padStart(4)}  ${insc.n===(Number(alcorr.n)||0)?'IGUAL':'difieren (esperado si hay meses vencidos)'}${marca}`);
    }
    console.log('\n(En la activa deben ser iguales porque no hay meses vencidos; en pasadas al-corriente <= inscritos porque algunos quedaron a deber meses.)');
    console.log('FIN');
    await pool.end();
}
main().catch(e => { console.error(e); process.exit(1); });
