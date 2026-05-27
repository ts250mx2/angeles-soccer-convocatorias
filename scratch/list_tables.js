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
    const [tables] = await pool.query('SHOW TABLES');
    console.log('--- Tablas ---');
    console.table(tables);
  } catch (e) {
    console.error(e);
  } finally {
    process.exit();
  }
}

check();
