const mysql = require('mysql2/promise');
const pool = mysql.createPool({host:process.env.DB_HOST,user:process.env.DB_USER,password:process.env.DB_PASSWORD,database:process.env.DB_NAME,connectionLimit:4});
const T=10;
(async()=>{
  // 1) Inscritos activos (definicion del modulo inscripciones): pago inscripcion tipo 2 en ESTA temporada
  const [[a]]=await pool.query(`
    SELECT COUNT(*) n FROM tblJugadores J
    WHERE J.Status=0 AND J.IdJugador IN (
      SELECT A.IdJugador FROM tblPagos A INNER JOIN tblProductos B ON A.IdProducto=B.IdProducto
      WHERE A.IdTemporada=? AND B.IdTipoProducto=2 AND A.Status=0)`,[T]);
  console.log('1) INSCRITOS activos (modulo inscripciones, incluye clinics/futsal):', a.n);

  // 2) De esos inscritos, cuantos estan en sede clinics o categoria futsal (adeudos los excluye)
  const [[b]]=await pool.query(`
    SELECT COUNT(*) n FROM tblJugadores J LEFT JOIN tblSedes S ON S.IdSede=J.IdSede
    WHERE J.Status=0 AND (COALESCE(S.EsClinics,0)=1 OR UPPER(J.Categoria) LIKE '%FUTSAL%')
      AND J.IdJugador IN (SELECT A.IdJugador FROM tblPagos A INNER JOIN tblProductos B ON A.IdProducto=B.IdProducto WHERE A.IdTemporada=? AND B.IdTipoProducto=2 AND A.Status=0)`,[T]);
  console.log('2)   ...de ellos en clinics/futsal (adeudos NO cuenta):', b.n);
  console.log('   => inscritos que SÍ entran a adeudos:', a.n - b.n);

  // 3) Rango de meses vencidos de la temporada 10
  const [[t]]=await pool.query(`SELECT DATE_FORMAT(FechaInicio,'%Y-%m-%d') ini, DATE_FORMAT(FechaFin,'%Y-%m-%d') fin, MONTH(FechaInicio) m1, MONTH(FechaFin) m2 FROM tblTemporadas WHERE IdTemporada=?`,[T]);
  console.log('3) Temporada 10:', t.ini, '->', t.fin, '(hoy 2026-07-25, inicia agosto: aun sin meses vencidos)');

  // 4) keepers/porteros que cuentan como inscritos SIN inscripcion en temp 10 (adeudos SÍ, inscripciones NO)
  const [[k]]=await pool.query(`
    SELECT COUNT(*) n FROM tblJugadores J LEFT JOIN tblSedes S ON S.IdSede=J.IdSede
    WHERE J.Status=0 AND COALESCE(S.EsClinics,0)=0 AND UPPER(J.Categoria) NOT LIKE '%FUTSAL%'
      AND (COALESCE(S.EsKeeper,0)=1 OR UPPER(J.Categoria) LIKE '%PORTERO%')
      AND J.IdJugador NOT IN (SELECT A.IdJugador FROM tblPagos A INNER JOIN tblProductos B ON A.IdProducto=B.IdProducto WHERE A.IdTemporada=? AND B.IdTipoProducto=2 AND A.Status=0)
      AND J.IdJugador IN (SELECT A.IdJugador FROM tblPagos A INNER JOIN tblProductos B ON A.IdProducto=B.IdProducto WHERE B.IdTipoProducto=2 AND A.Status=0)`,[T]);
  console.log('4) keeper/portero SIN inscripcion en temp 10 pero con inscripcion previa (adeudos SÍ cuenta, inscripciones NO):', k.n);
  await pool.end();
})().catch(e=>{console.error(e);process.exit(1)});
