const mysql = require('mysql2/promise');
const pool = mysql.createPool({host:process.env.DB_HOST,user:process.env.DB_USER,password:process.env.DB_PASSWORD,database:process.env.DB_NAME,connectionLimit:4});
(async()=>{
  // 33 con primera mensualidad temp9 = junio: desglosar
  const [rows]=await pool.query(`
    SELECT J.IdJugador, J.Jugador,
      (INS9.IdJugador IS NOT NULL) tieneInsc9,
      (PR10.IdJugador IS NOT NULL) tieneInsc10jul,
      PR10.fecha10, INS10any.fechaAny10, INS9.fecha9
    FROM (SELECT P.IdJugador FROM tblPagos P INNER JOIN tblProductos PR ON PR.IdProducto=P.IdProducto AND PR.IdTipoProducto=1 WHERE P.Status=0 AND (P.Anio*100+P.Mes) BETWEEN 202601 AND 202606 GROUP BY P.IdJugador HAVING MIN(P.Anio*100+P.Mes)=202606) M
    INNER JOIN tblJugadores J ON J.IdJugador=M.IdJugador
    LEFT JOIN (SELECT P.IdJugador, DATE_FORMAT(MIN(P.FechaPago),'%Y-%m-%d') fecha9 FROM tblPagos P INNER JOIN tblProductos PR ON PR.IdProducto=P.IdProducto AND PR.IdTipoProducto=2 WHERE P.Status=0 AND P.IdTemporada=9 GROUP BY P.IdJugador) INS9 ON INS9.IdJugador=J.IdJugador
    LEFT JOIN (SELECT P.IdJugador, DATE_FORMAT(MIN(P.FechaPago),'%Y-%m-%d') fecha10 FROM tblPagos P INNER JOIN tblProductos PR ON PR.IdProducto=P.IdProducto AND PR.IdTipoProducto=2 WHERE P.Status=0 AND P.IdTemporada=10 AND P.FechaPago>=DATE_SUB('2026-08-01',INTERVAL 1 MONTH) AND P.FechaPago<'2026-08-01' GROUP BY P.IdJugador) PR10 ON PR10.IdJugador=J.IdJugador
    LEFT JOIN (SELECT P.IdJugador, DATE_FORMAT(MIN(P.FechaPago),'%Y-%m-%d') fechaAny10 FROM tblPagos P INNER JOIN tblProductos PR ON PR.IdProducto=P.IdProducto AND PR.IdTipoProducto=2 WHERE P.Status=0 AND P.IdTemporada=10 GROUP BY P.IdJugador) INS10any ON INS10any.IdJugador=J.IdJugador
    ORDER BY tieneInsc9, tieneInsc10jul`);
  console.table(rows.map(r=>({Id:r.IdJugador,Jugador:String(r.Jugador).slice(0,24),insc9:Number(r.tieneInsc9),insc10jul:Number(r.tieneInsc10jul),f9:r.fecha9,f10any:r.fechaAny10})));
  const sinInsc9 = rows.filter(r=>!Number(r.tieneInsc9));
  console.log('De 33: con insc9=',rows.filter(r=>Number(r.tieneInsc9)).length,'| sin insc9=',sinInsc9.length,'| sin insc9 y con insc10-julio=',sinInsc9.filter(r=>Number(r.tieneInsc10jul)).length);
  await pool.end();
})().catch(e=>{console.error(e);process.exit(1)});
