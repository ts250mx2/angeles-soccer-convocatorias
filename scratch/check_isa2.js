const mysql = require('mysql2/promise');
const pool = mysql.createPool({host:process.env.DB_HOST,user:process.env.DB_USER,password:process.env.DB_PASSWORD,database:process.env.DB_NAME,connectionLimit:4});
(async()=>{
  const [ins]=await pool.query(`SELECT P.IdPago,P.Recibo,DATE_FORMAT(P.FechaPago,'%d/%m/%Y') Fecha,P.IdTemporada,COALESCE(T.Temporada,'?') Temp,P.Status
    FROM tblPagos P INNER JOIN tblProductos PR ON PR.IdProducto=P.IdProducto AND PR.IdTipoProducto=2
    LEFT JOIN tblTemporadas T ON T.IdTemporada=P.IdTemporada WHERE P.IdJugador=1625 ORDER BY P.FechaPago`);
  console.log('Inscripciones de ISABELLA (1625):'); console.table(ins);
  // Cual es la mas cercana al inicio de temp 9 (2026-01-01) dentro de la ventana
  const [win]=await pool.query(`
    SELECT P.IdPago,DATE_FORMAT(P.FechaPago,'%d/%m/%Y') Fecha,P.IdTemporada,ABS(DATEDIFF(P.FechaPago,'2026-01-01')) dist
    FROM tblPagos P INNER JOIN tblProductos PR ON PR.IdProducto=P.IdProducto AND PR.IdTipoProducto=2
    WHERE P.IdJugador=1625 AND P.Status=0 AND P.IdTemporada IS NOT NULL
      AND P.FechaPago>=DATE_SUB('2026-01-01',INTERVAL 2 MONTH) AND P.FechaPago<=DATE_ADD('2026-01-01',INTERVAL 1 MONTH)
    ORDER BY dist ASC`);
  console.log('Candidatas en ventana [nov1,feb1] ordenadas por cercania a 2026-01-01:'); console.table(win);
  await pool.end();
})().catch(e=>{console.error(e);process.exit(1)});
