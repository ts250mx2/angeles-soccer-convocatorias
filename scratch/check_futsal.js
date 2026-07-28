const mysql = require('mysql2/promise');
const pool = mysql.createPool({host:process.env.DB_HOST,user:process.env.DB_USER,password:process.env.DB_PASSWORD,database:process.env.DB_NAME,connectionLimit:4});
(async()=>{
  console.log('=== Columnas de tblSedes ===');
  const [cols]=await pool.query(`SHOW COLUMNS FROM tblSedes`);
  console.table(cols.map(c=>({Field:c.Field,Type:c.Type,Default:c.Default})));
  console.log('=== Todas las sedes ===');
  const [s]=await pool.query(`SELECT * FROM tblSedes ORDER BY IdSede`);
  console.table(s);
  console.log('=== Categorias que contienen FUTSAL (activos, no clinics) ===');
  const [c]=await pool.query(`
    SELECT J.Categoria, COUNT(*) Activos, SUM(CASE WHEN COALESCE(S.EsClinics,0)=1 THEN 1 ELSE 0 END) EnClinics,
           GROUP_CONCAT(DISTINCT COALESCE(S.Sede,J.Sede)) Sedes
    FROM tblJugadores J LEFT JOIN tblSedes S ON S.IdSede=J.IdSede
    WHERE J.Status=0 AND UPPER(J.Categoria) LIKE '%FUTSAL%'
    GROUP BY J.Categoria ORDER BY Activos DESC`);
  console.table(c.map(x=>({Categoria:x.Categoria,Activos:Number(x.Activos),EnClinics:Number(x.EnClinics),Sedes:x.Sedes})));
  console.log('Total activos categoria futsal:', c.reduce((a,x)=>a+Number(x.Activos),0));
  await pool.end();
})().catch(e=>{console.error(e);process.exit(1)});
