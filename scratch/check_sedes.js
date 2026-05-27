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
    console.log('--- Checking for tblSedes ---');
    const [tables] = await pool.query("SHOW TABLES LIKE 'tblSedes'");
    if (tables.length > 0) {
      const [sedes] = await pool.query('SELECT * FROM tblSedes');
      console.log('--- tblSedes content ---');
      console.table(sedes);
    } else {
      console.log('tblSedes not found');
    }

    console.log('\n--- Checking tblJugadores columns related to Sede ---');
    const [columns] = await pool.query("SHOW COLUMNS FROM tblJugadores LIKE '%Sede%'");
    console.table(columns);

    const [sample] = await pool.query('SELECT IdJugador, Jugador, IdSede FROM tblJugadores LIMIT 5');
    console.log('--- Sample data from tblJugadores ---');
    console.table(sample);

  } catch (e) {
    console.error(e);
  } finally {
    process.exit();
  }
}

check();
