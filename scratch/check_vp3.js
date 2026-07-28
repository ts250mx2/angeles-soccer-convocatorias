const mysql = require('mysql2/promise');
const pool = mysql.createPool({host:process.env.DB_HOST,user:process.env.DB_USER,password:process.env.DB_PASSWORD,database:process.env.DB_NAME,connectionLimit:4});
(async()=>{
  console.log('=== Productos con VENTA/PUBLICO ===');
  const [p]=await pool.query(`SELECT IdProducto,Producto,IdTipoProducto FROM tblProductos WHERE UPPER(Producto) LIKE '%VENTA%' OR UPPER(Producto) LIKE '%PUBLIC%' LIMIT 30`);
  console.table(p);
  console.log('=== Tipos de producto ===');
  const [tp]=await pool.query(`SELECT * FROM tblTiposProductos`);
  console.table(tp);
  console.log('=== Columnas de tblJugadores (por si hay un flag) ===');
  const [cols]=await pool.query(`SHOW COLUMNS FROM tblJugadores`);
  console.log(cols.map(c=>c.Field).join(', '));
  await pool.end();
})().catch(e=>{console.error(e);process.exit(1)});
