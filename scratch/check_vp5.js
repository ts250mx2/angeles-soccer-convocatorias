const mysql = require('mysql2/promise');
const pool = mysql.createPool({host:process.env.DB_HOST,user:process.env.DB_USER,password:process.env.DB_PASSWORD,database:process.env.DB_NAME,connectionLimit:4});
(async()=>{
  console.log('=== Jugadores cuyo NOMBRE contiene VENTA / PUBLICO ===');
  const [r]=await pool.query(`SELECT J.IdJugador,J.Jugador,J.Categoria,J.Status,COALESCE(S.Sede,J.Sede) Sede,COALESCE(S.EsClinics,0) EsClinics
    FROM tblJugadores J LEFT JOIN tblSedes S ON S.IdSede=J.IdSede
    WHERE UPPER(J.Jugador) LIKE '%VENTA%' OR UPPER(J.Jugador) LIKE '%PUBLIC%' ORDER BY J.Jugador LIMIT 60`);
  console.table(r.map(x=>({Id:x.IdJugador,Jugador:x.Jugador,Cat:x.Categoria,Status:x.Status,Sede:x.Sede,Cli:x.EsClinics})));
  console.log('Muestra total (limit 60):',r.length);
  const [[c]]=await pool.query(`SELECT COUNT(*) tot,
     SUM(CASE WHEN Status=0 THEN 1 ELSE 0 END) act,
     SUM(CASE WHEN Status=2 THEN 1 ELSE 0 END) baj
     FROM tblJugadores WHERE UPPER(Jugador) LIKE '%VENTA%' OR UPPER(Jugador) LIKE '%PUBLIC%'`);
  console.log('TOTAL con VENTA/PUBLICO en nombre:',c.tot,'| activos:',c.act,'| bajas:',c.baj);
  for (const pat of ['%VENTA%PUBLIC%','%VENTA AL PUBLICO%','%VENTA PUBLICO%','%VENTAS PUBLICO%','%PUBLICO%','%VENTA%']) {
    const [[x]]=await pool.query(`SELECT COUNT(*) n, SUM(CASE WHEN Status=0 THEN 1 ELSE 0 END) act FROM tblJugadores WHERE UPPER(Jugador) LIKE ?`,[pat]);
    console.log(`LIKE '${pat}' => total ${x.n}, activos ${x.act}`);
  }
  await pool.end();
})().catch(e=>{console.error(e);process.exit(1)});
