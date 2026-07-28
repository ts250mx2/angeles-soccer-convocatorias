const mysql = require('mysql2/promise');
const pool = mysql.createPool({host:process.env.DB_HOST,user:process.env.DB_USER,password:process.env.DB_PASSWORD,database:process.env.DB_NAME,connectionLimit:4});
(async()=>{
  console.log('=== Categorias con PUB / VENT / VTA ===');
  const [c]=await pool.query(`SELECT DISTINCT J.Categoria FROM tblJugadores J
    WHERE UPPER(J.Categoria) LIKE '%PUB%' OR UPPER(J.Categoria) LIKE '%VENT%' OR UPPER(J.Categoria) LIKE '%VTA%' OR UPPER(J.Categoria) LIKE '%VP%'
    ORDER BY J.Categoria`);
  console.log(c.map(x=>x.Categoria));
  console.log('=== J.Sede (texto libre en jugadores) con PUB/VENT ===');
  const [s]=await pool.query(`SELECT DISTINCT J.Sede, COUNT(*) n FROM tblJugadores J
    WHERE UPPER(J.Sede) LIKE '%PUB%' OR UPPER(J.Sede) LIKE '%VENT%' GROUP BY J.Sede`);
  console.table(s);
  console.log('=== Todas las categorias distintas (primeras 120) ===');
  const [all]=await pool.query(`SELECT DISTINCT Categoria FROM tblJugadores WHERE Categoria IS NOT NULL AND Categoria<>'' ORDER BY Categoria`);
  console.log('Total categorias distintas:', all.length);
  console.log(all.map(x=>x.Categoria).join(' | '));
  await pool.end();
})().catch(e=>{console.error(e);process.exit(1)});
