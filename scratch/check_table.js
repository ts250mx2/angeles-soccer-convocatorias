import { pool } from './src/lib/db.js';

async function checkTable() {
    try {
        const [rows] = await pool.query('DESCRIBE tblConvocatorias');
        console.log(JSON.stringify(rows, null, 2));
    } catch (error) {
        console.error('Error describing table:', error);
    } finally {
        process.exit();
    }
}

checkTable();
