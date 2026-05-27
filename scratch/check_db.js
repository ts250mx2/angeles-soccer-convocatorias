const mysql = require('mysql2/promise');

const pool = mysql.createPool({
    host: '26.173.65.119',
    user: 'kyk',
    password: 'merkurio',
    database: 'BDAngelesSoccer',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

async function check() {
  try {
    const [types] = await pool.query('SELECT * FROM tblTiposProductos');
    console.log('--- Tipos de Productos ---');
    console.table(types);

    const [products] = await pool.query('SELECT IdProducto, Producto, IdTipoProducto FROM tblProductos WHERE IdTipoProducto IN (3, 4) LIMIT 20');
    console.log('--- Muestra de Productos (Tipos 3, 4) ---');
    console.table(products);

    const [season] = await pool.query('SELECT * FROM tblTemporadas WHERE EsActiva = 1');
    console.log('--- Temporada Activa ---');
    console.table(season);
  } catch (e) {
    console.error(e);
  } finally {
    process.exit();
  }
}

check();
