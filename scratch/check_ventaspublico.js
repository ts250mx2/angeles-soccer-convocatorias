const mysql = require('mysql2/promise');
const pool = mysql.createPool({host:process.env.DB_HOST,user:process.env.DB_USER,password:process.env.DB_PASSWORD,database:process.env.DB_NAME,connectionLimit:4});
(async()=>{
  console.log('=== Categorias que contienen VENTA o PUBLICO ===');
  const [c]=await pool.query(`
    SELECT J.Categoria, COUNT(*) Tot,
      SUM(CASE WHEN J.Status=0 THEN 1 ELSE 0 END) Activos,
      SUM(CASE WHEN J.Status=2 THEN 1 ELSE 0 END) Bajas,
      GROUP_CONCAT(DISTINCT COALESCE(S.Sede,J.Sede)) Sedes
    FROM tblJugadores J LEFT JOIN tblSedes S ON S.IdSede=J.IdSede
    WHERE UPPER(J.Categoria) LIKE '%VENTA%' OR UPPER(J.Categoria) LIKE '%PUBLICO%' OR UPPER(J.Categoria) LIKE '%PÚBLICO%'
    GROUP BY J.Categoria ORDER BY Tot DESC`);
  console.table(c.map(x=>({Categoria:x.Categoria,Tot:Number(x.Tot),Activos:Number(x.Activos),Bajas:Number(x.Bajas),Sedes:x.Sedes})));
  console.log('=== Sedes que contienen VENTA o PUBLICO ===');
  const [s]=await pool.query(`SELECT IdSede,Sede,EsClinics,EsKeeper FROM tblSedes WHERE UPPER(Sede) LIKE '%VENTA%' OR UPPER(Sede) LIKE '%PUBLICO%' OR UPPER(Sede) LIKE '%PÚBLICO%'`);
  console.table(s);
  await pool.end();
})().catch(e=>{console.error(e);process.exit(1)});
