const mysql = require('mysql2/promise');

async function revert() {
    const connection = await mysql.createConnection({
        host: '26.173.65.119',
        user: 'kyk',
        password: 'merkurio',
        database: 'BDAngelesSoccer'
    });

    try {
        console.log('Reverting Primary Key for tblDetalleConvocatorias...');
        await connection.query(`
            ALTER TABLE tblDetalleConvocatorias 
            DROP PRIMARY KEY,
            ADD PRIMARY KEY (IdJugador, IdTemporada, IdLiga, Categoria)
        `);
        console.log('Primary Key reverted.');

        console.log('Removing Color column from tblDetalleConvocatorias...');
        await connection.query(`
            ALTER TABLE tblDetalleConvocatorias 
            DROP COLUMN Color
        `);
        console.log('Color column removed.');

    } catch (error) {
        console.error('Reversion failed:', error);
    } finally {
        await connection.end();
    }
}

revert();
