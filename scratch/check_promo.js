const mysql = require('mysql2/promise');
const pool = mysql.createPool({host:process.env.DB_HOST,user:process.env.DB_USER,password:process.env.DB_PASSWORD,database:process.env.DB_NAME,connectionLimit:4});
(async()=>{
  // X = temp 9 (ene-jun 2026, endMonth=6, code 202606). siguiente = temp 10 (inicia 2026-08-01).
  // Promo: sin inscripcion temp9, con inscripcion temp10 pagada en [2026-07-01,2026-08-01),
  //        y MIN(mensualidad temp9 en 202601..202606) = 202606 (junio, primera=ultima).
  const [rows]=await pool.query(`
    SELECT J.IdJugador, J.Jugador, COALESCE(S.Sede,J.Sede) Sede, J.Categoria,
           MINM.minCode, PR10.fecha10
    FROM tblJugadores J
    LEFT JOIN tblSedes S ON S.IdSede=J.IdSede
    INNER JOIN (
       SELECT P.IdJugador, DATE_FORMAT(MIN(P.FechaPago),'%Y-%m-%d') fecha10
       FROM tblPagos P INNER JOIN tblProductos PR ON PR.IdProducto=P.IdProducto AND PR.IdTipoProducto=2
       WHERE P.Status=0 AND P.IdTemporada=10 AND P.FechaPago>=DATE_SUB('2026-08-01',INTERVAL 1 MONTH) AND P.FechaPago<'2026-08-01'
       GROUP BY P.IdJugador
    ) PR10 ON PR10.IdJugador=J.IdJugador
    LEFT JOIN (
       SELECT DISTINCT P.IdJugador FROM tblPagos P INNER JOIN tblProductos PR ON PR.IdProducto=P.IdProducto AND PR.IdTipoProducto=2
       WHERE P.Status=0 AND P.IdTemporada=9
    ) INS9 ON INS9.IdJugador=J.IdJugador
    INNER JOIN (
       SELECT P.IdJugador, MIN(P.Anio*100+P.Mes) minCode
       FROM tblPagos P INNER JOIN tblProductos PR ON PR.IdProducto=P.IdProducto AND PR.IdTipoProducto=1
       WHERE P.Status=0 AND (P.Anio*100+P.Mes) BETWEEN 202601 AND 202606
       GROUP BY P.IdJugador
    ) MINM ON MINM.IdJugador=J.IdJugador
    WHERE J.Status=0 AND INS9.IdJugador IS NULL AND MINM.minCode=202606
      AND COALESCE(S.EsClinics,0)=0
    ORDER BY J.Jugador`);
  console.log('Promo candidatos (temp9, primera mensualidad=junio, insc temp10 en julio, sin insc temp9):', rows.length);
  console.table(rows.slice(0,20).map(r=>({Id:r.IdJugador,Jugador:String(r.Jugador).slice(0,26),Sede:r.Sede,Cat:r.Categoria,minMens:r.minCode,insc10:r.fecha10})));
  // Comparacion: cuantos con primera mensualidad=junio en total (sin las otras condiciones)
  const [[c1]]=await pool.query(`SELECT COUNT(*) n FROM (SELECT P.IdJugador FROM tblPagos P INNER JOIN tblProductos PR ON PR.IdProducto=P.IdProducto AND PR.IdTipoProducto=1 WHERE P.Status=0 AND (P.Anio*100+P.Mes) BETWEEN 202601 AND 202606 GROUP BY P.IdJugador HAVING MIN(P.Anio*100+P.Mes)=202606) x`);
  console.log('Total con primera mensualidad temp9 = junio:', c1.n);
  await pool.end();
})().catch(e=>{console.error(e);process.exit(1)});
