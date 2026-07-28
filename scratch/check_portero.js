// node --env-file=.env scratch/check_portero.js
const mysql = require('mysql2/promise');
const pool = mysql.createPool({
    host: process.env.DB_HOST, user: process.env.DB_USER,
    password: process.env.DB_PASSWORD, database: process.env.DB_NAME, connectionLimit: 4,
});
async function main() {
    console.log('=== Categorias que contienen PORTERO (activos, no clinics) ===');
    const [c] = await pool.query(`
        SELECT J.Categoria, COUNT(*) as Activos,
               SUM(CASE WHEN COALESCE(S.EsKeeper,0)=1 THEN 1 ELSE 0 END) as EnSedeKeeper
        FROM tblJugadores J LEFT JOIN tblSedes S ON S.IdSede=J.IdSede
        WHERE J.Status=0 AND COALESCE(S.EsClinics,0)=0
          AND UPPER(J.Categoria) LIKE '%PORTERO%'
        GROUP BY J.Categoria ORDER BY Activos DESC`);
    console.table(c.map(x=>({Categoria:x.Categoria,Activos:Number(x.Activos),EnSedeKeeper:Number(x.EnSedeKeeper)})));
    const total = c.reduce((a,x)=>a+Number(x.Activos),0);
    console.log('Total activos en categoria portero (no clinics):', total);

    // De esos, cuantos NO estan en sede keeper (los que agrega esta regla nueva)
    const [[extra]] = await pool.query(`
        SELECT COUNT(*) n FROM tblJugadores J LEFT JOIN tblSedes S ON S.IdSede=J.IdSede
        WHERE J.Status=0 AND COALESCE(S.EsClinics,0)=0
          AND UPPER(J.Categoria) LIKE '%PORTERO%' AND COALESCE(S.EsKeeper,0)=0`);
    console.log('Porteros por categoria que NO estan en sede keeper:', extra.n);

    // De esos, cuantos tienen alguna inscripcion pero no en temp 10
    const [[k]] = await pool.query(`
        SELECT SUM(CASE WHEN Any2.IdJugador IS NOT NULL AND Ins10.IdJugador IS NULL THEN 1 ELSE 0 END) as CambianAlAplicar
        FROM tblJugadores J LEFT JOIN tblSedes S ON S.IdSede=J.IdSede
        LEFT JOIN (SELECT DISTINCT P.IdJugador FROM tblPagos P INNER JOIN tblProductos PR ON P.IdProducto=PR.IdProducto WHERE PR.IdTipoProducto=2 AND P.Status=0) Any2 ON Any2.IdJugador=J.IdJugador
        LEFT JOIN (SELECT DISTINCT P.IdJugador FROM tblPagos P INNER JOIN tblProductos PR ON P.IdProducto=PR.IdProducto WHERE PR.IdTipoProducto=2 AND P.Status=0 AND P.IdTemporada=10) Ins10 ON Ins10.IdJugador=J.IdJugador
        WHERE J.Status=0 AND COALESCE(S.EsClinics,0)=0 AND COALESCE(S.EsKeeper,0)=0 AND UPPER(J.Categoria) LIKE '%PORTERO%'`);
    console.log('De esos, con alguna inscripcion pero no en temp 10 (los que pasan a inscritos):', Number(k.CambianAlAplicar)||0);
    console.log('FIN');
    await pool.end();
}
main().catch(e => { console.error(e); process.exit(1); });
