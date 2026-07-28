const mysql = require('mysql2/promise');
const pool = mysql.createPool({host:process.env.DB_HOST,user:process.env.DB_USER,password:process.env.DB_PASSWORD,database:process.env.DB_NAME,connectionLimit:4});
(async()=>{
  const [cols]=await pool.query(`SHOW COLUMNS FROM tblSedes`);
  const names = cols.map(c=>c.Field);
  console.log('Columnas tblSedes:', names.join(', '));
  console.log('Tiene EsFutsal?', names.includes('EsFutsal'));
  if (names.includes('EsFutsal')) {
    const [s]=await pool.query(`SELECT IdSede,Sede,EsClinics,EsKeeper,EsFutsal,
       (SELECT COUNT(*) FROM tblJugadores J WHERE J.IdSede=S.IdSede AND J.Status=0) activos
       FROM tblSedes S ORDER BY IdSede`);
    console.table(s);
  } else {
    // fallback: la sede FUTSAL actual
    const [s]=await pool.query(`SELECT IdSede,Sede,EsClinics,EsKeeper FROM tblSedes WHERE UPPER(Sede) LIKE '%FUTSAL%'`);
    console.table(s);
  }
  await pool.end();
})().catch(e=>{console.error(e);process.exit(1)});
