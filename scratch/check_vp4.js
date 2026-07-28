const mysql = require('mysql2/promise');
const pool = mysql.createPool({host:process.env.DB_HOST,user:process.env.DB_USER,password:process.env.DB_PASSWORD,database:process.env.DB_NAME,connectionLimit:4});
(async()=>{
  for (const col of ['TipoJugador','EsquemaPago','EstatusIngreso','Grupo']) {
    const [r]=await pool.query(`SELECT \`${col}\` v, COUNT(*) n, SUM(CASE WHEN Status=0 THEN 1 ELSE 0 END) act FROM tblJugadores WHERE \`${col}\` IS NOT NULL AND \`${col}\`<>'' GROUP BY \`${col}\` ORDER BY n DESC LIMIT 25`);
    console.log('=== '+col+' ===');
    console.table(r.map(x=>({valor:x.v,total:Number(x.n),activos:Number(x.act)})));
  }
  await pool.end();
})().catch(e=>{console.error(e);process.exit(1)});
