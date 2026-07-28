const mysql = require('mysql2/promise');
const pool = mysql.createPool({host:process.env.DB_HOST,user:process.env.DB_USER,password:process.env.DB_PASSWORD,database:process.env.DB_NAME,connectionLimit:4});
(async()=>{
  console.log('=== Temporadas ===');
  const [t]=await pool.query(`SELECT IdTemporada,Temporada,DATE_FORMAT(FechaInicio,'%Y-%m-%d') ini,DATE_FORMAT(FechaFin,'%Y-%m-%d') fin,EsActiva FROM tblTemporadas ORDER BY FechaInicio`);
  console.table(t);
  // Contexto: selecc=10 (AGO-DIC 2026), anterior=9 (ENE-JUL 2026), siguiente de la anterior = 10.
  // Promo: inscripcion pagada 1 mes antes del inicio de la 10 (=julio 2026),
  //        y primer mensualidad en temporada 9 es el ultimo mes de la 9.
  console.log('\n=== Inscripciones (tipo2) pagadas en JULIO 2026 (mes antes de AGO 2026) ===');
  const [ins]=await pool.query(`
    SELECT P.IdJugador, J.Jugador, P.IdTemporada tempPago, DATE_FORMAT(P.FechaPago,'%Y-%m-%d') fecha
    FROM tblPagos P INNER JOIN tblProductos PR ON PR.IdProducto=P.IdProducto AND PR.IdTipoProducto=2
    INNER JOIN tblJugadores J ON J.IdJugador=P.IdJugador
    WHERE P.Status=0 AND YEAR(P.FechaPago)=2026 AND MONTH(P.FechaPago)=7
    ORDER BY P.IdJugador LIMIT 40`);
  console.log('  count julio-2026 inscripciones:', ins.length);
  console.table(ins.slice(0,15));
  // De esos, cuantos NO tienen inscripcion en temp 9 y su primer mensualidad de temp 9 es julio(7)/junio(6)
  console.log('\n=== Rango de meses de mensualidades de temp 9 pagadas (para ver cual es "ultimo mes") ===');
  const [mm]=await pool.query(`
    SELECT P.Anio, P.Mes, COUNT(*) n FROM tblPagos P
    INNER JOIN tblProductos PR ON PR.IdProducto=P.IdProducto AND PR.IdTipoProducto=1
    WHERE P.Status=0 AND (P.Anio*100+P.Mes) BETWEEN 202601 AND 202607
    GROUP BY P.Anio,P.Mes ORDER BY P.Anio,P.Mes`);
  console.table(mm);
  await pool.end();
})().catch(e=>{console.error(e);process.exit(1)});
