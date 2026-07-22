// node --env-file=.env scratch/check_fechas_temporadas.js
const mysql = require('mysql2/promise');
const pool = mysql.createPool({
    host: process.env.DB_HOST, user: process.env.DB_USER,
    password: process.env.DB_PASSWORD, database: process.env.DB_NAME, connectionLimit: 2,
});
async function main() {
    const [r] = await pool.query(`
        SELECT IdTemporada, Temporada,
               DATE_FORMAT(FechaInicio,'%Y-%m-%d') as ini,
               DATE_FORMAT(FechaFin,'%Y-%m-%d') as fin,
               EsActiva
        FROM tblTemporadas WHERE IdTemporada IN (8,9,10) ORDER BY IdTemporada DESC`);
    console.table(r);
    const [[n]] = await pool.query('SELECT NOW() as ahora');
    console.log('Reloj del servidor MySQL:', String(n.ahora));
    console.log('FIN');
    await pool.end();
}
main().catch(e => { console.error(e); process.exit(1); });
