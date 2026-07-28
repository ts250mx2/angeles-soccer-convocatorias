// node --env-file=.env scratch/check_keeper.js
const mysql = require('mysql2/promise');
const pool = mysql.createPool({
    host: process.env.DB_HOST, user: process.env.DB_USER,
    password: process.env.DB_PASSWORD, database: process.env.DB_NAME, connectionLimit: 4,
});

async function main() {
    console.log('=== Columnas EsKeeper / EsClinics en tblSedes ===');
    const [cols] = await pool.query(`SHOW COLUMNS FROM tblSedes LIKE 'Es%'`);
    console.table(cols.map(c => ({ Campo: c.Field, Tipo: c.Type })));

    console.log('\n=== Sedes por EsKeeper ===');
    const [s] = await pool.query(`
        SELECT COALESCE(EsKeeper,0) as EsKeeper, COALESCE(EsClinics,0) as EsClinics,
               COUNT(*) n, GROUP_CONCAT(Sede ORDER BY Sede SEPARATOR ', ') as Nombres
        FROM tblSedes GROUP BY COALESCE(EsKeeper,0), COALESCE(EsClinics,0) ORDER BY EsKeeper DESC`);
    s.forEach(r => console.log(`  EsKeeper=${r.EsKeeper} EsClinics=${r.EsClinics}: ${r.n} -> ${String(r.Nombres).slice(0,120)}`));

    console.log('\n=== Jugadores activos en sedes keeper (EsKeeper=1, EsClinics=0) ===');
    const [[j]] = await pool.query(`
        SELECT COUNT(*) as Activos
        FROM tblJugadores J INNER JOIN tblSedes S ON S.IdSede=J.IdSede
        WHERE J.Status=0 AND COALESCE(S.EsKeeper,0)=1 AND COALESCE(S.EsClinics,0)=0`);
    console.log('  activos:', j.Activos);

    // De esos keepers activos, cuantos tienen ALGUNA inscripcion (cualquier temporada)
    // pero NO en la temporada 10 (la seleccionada)
    const [[k]] = await pool.query(`
        SELECT
          SUM(CASE WHEN AnyIns.IdJugador IS NOT NULL THEN 1 ELSE 0 END) as ConAlgunaInsc,
          SUM(CASE WHEN Ins10.IdJugador IS NOT NULL THEN 1 ELSE 0 END) as ConInsc10,
          SUM(CASE WHEN AnyIns.IdJugador IS NOT NULL AND Ins10.IdJugador IS NULL THEN 1 ELSE 0 END) as AlgunaPeroNo10
        FROM tblJugadores J
        INNER JOIN tblSedes S ON S.IdSede=J.IdSede
        LEFT JOIN (SELECT DISTINCT P.IdJugador FROM tblPagos P INNER JOIN tblProductos PR ON P.IdProducto=PR.IdProducto
                   WHERE PR.IdTipoProducto=2 AND P.Status=0) AnyIns ON AnyIns.IdJugador=J.IdJugador
        LEFT JOIN (SELECT DISTINCT P.IdJugador FROM tblPagos P INNER JOIN tblProductos PR ON P.IdProducto=PR.IdProducto
                   WHERE PR.IdTipoProducto=2 AND P.Status=0 AND P.IdTemporada=10) Ins10 ON Ins10.IdJugador=J.IdJugador
        WHERE J.Status=0 AND COALESCE(S.EsKeeper,0)=1 AND COALESCE(S.EsClinics,0)=0`);
    console.log('  con alguna inscripcion (cualquier temp):', k.ConAlgunaInsc);
    console.log('  con inscripcion en temporada 10        :', k.ConInsc10);
    console.log('  con alguna PERO no en la 10 (los que cambian):', k.AlgunaPeroNo10);
    console.log('FIN');
    await pool.end();
}
main().catch(e => { console.error(e); process.exit(1); });
