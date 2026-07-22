// node --env-file=.env scratch/check_clinics.js
const mysql = require('mysql2/promise');
const pool = mysql.createPool({
    host: process.env.DB_HOST, user: process.env.DB_USER,
    password: process.env.DB_PASSWORD, database: process.env.DB_NAME, connectionLimit: 4,
});
async function main() {
    console.log('=== Sedes por EsClinics ===');
    const [s] = await pool.query(`
        SELECT COALESCE(EsClinics,0) as EsClinics, COUNT(*) as Sedes,
               GROUP_CONCAT(Sede ORDER BY Sede SEPARATOR ', ') as Nombres
        FROM tblSedes GROUP BY COALESCE(EsClinics,0)`);
    s.forEach(r => console.log(`  EsClinics=${r.EsClinics}: ${r.Sedes} sedes -> ${String(r.Nombres).slice(0,140)}`));

    console.log('\n=== Jugadores por EsClinics y estatus ===');
    const [j] = await pool.query(`
        SELECT COALESCE(S.EsClinics,0) as EsClinics,
               COUNT(CASE WHEN J.Status=0 THEN 1 END) as Activos,
               COUNT(CASE WHEN J.Status=2 THEN 1 END) as Bajas
        FROM tblJugadores J LEFT JOIN tblSedes S ON S.IdSede=J.IdSede
        GROUP BY COALESCE(S.EsClinics,0)`);
    console.table(j);
    console.log('FIN');
    await pool.end();
}
main().catch(e => { console.error(e); process.exit(1); });
