const mysql = require('mysql2/promise');
const pool = mysql.createPool({host:process.env.DB_HOST,user:process.env.DB_USER,password:process.env.DB_PASSWORD,database:process.env.DB_NAME,connectionLimit:4});
(async()=>{
  console.log('=== Categorias con PORT o KEEP (activos) ===');
  const [c]=await pool.query(`
    SELECT J.Categoria, COUNT(*) tot, SUM(CASE WHEN J.Status=0 THEN 1 ELSE 0 END) act,
      MAX(CASE WHEN UPPER(J.Categoria) LIKE '%PORTERO%' THEN 1 ELSE 0 END) yaPortero
    FROM tblJugadores J
    WHERE UPPER(J.Categoria) LIKE '%PORT%' OR UPPER(J.Categoria) LIKE '%KEEP%'
    GROUP BY J.Categoria ORDER BY yaPortero, J.Categoria`);
  console.table(c.map(x=>({Categoria:x.Categoria,tot:Number(x.tot),act:Number(x.act),yaMatcheaPortero:Number(x.yaPortero)})));
  console.log('=== NUEVAS (PORT/KEEP pero NO PORTERO) ===');
  const nuevas=c.filter(x=>!Number(x.yaPortero));
  console.log(nuevas.map(x=>x.Categoria+' (act:'+Number(x.act)+')').join(' | ') || 'ninguna');
  console.log('Total categorias PORT/KEEP:',c.length,'| ya-portero:',c.filter(x=>Number(x.yaPortero)).length,'| nuevas:',nuevas.length);
  console.log('Activos nuevos que se agregan:', nuevas.reduce((a,x)=>a+Number(x.act),0));
  await pool.end();
})().catch(e=>{console.error(e);process.exit(1)});
