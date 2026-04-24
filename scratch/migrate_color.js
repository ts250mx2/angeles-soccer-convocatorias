const mysql = require('mysql2/promise');

async function migrate() {
    const connection = await mysql.createConnection({
        host: '26.173.65.119',
        user: 'kyk',
        password: 'merkurio',
        database: 'BDAngelesSoccer'
    });

    try {
        console.log('Checking for Color column...');
        const [cols] = await connection.query("SHOW COLUMNS FROM tblDetalleConvocatorias LIKE 'Color'");
        
        if (cols.length === 0) {
            console.log('Adding Color column...');
            await connection.query(`
                ALTER TABLE tblDetalleConvocatorias 
                ADD COLUMN Color VARCHAR(100) NOT NULL DEFAULT '' AFTER Categoria
            `);
        } else {
            console.log('Color column already exists. Modifying length...');
            await connection.query(`
                ALTER TABLE tblDetalleConvocatorias 
                MODIFY COLUMN Color VARCHAR(100) NOT NULL DEFAULT ''
            `);
        }

        console.log('Updating Primary Key for tblDetalleConvocatorias...');
        await connection.query(`
            ALTER TABLE tblDetalleConvocatorias 
            DROP PRIMARY KEY,
            ADD PRIMARY KEY (IdJugador, IdTemporada, IdLiga, Categoria, Color)
        `);
        console.log('Primary Key updated.');

    } catch (error) {
        console.error('Migration failed:', error);
    } finally {
        await connection.end();
    }
}

migrate();
