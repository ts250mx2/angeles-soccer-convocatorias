const mysql = require('mysql2/promise');

async function check() {
    const connection = await mysql.createConnection({
        host: '26.173.65.119',
        user: 'kyk',
        password: 'merkurio',
        database: 'BDAngelesSoccer'
    });

    try {
        console.log('Checking for IdProfesor column...');
        const [cols] = await connection.query("SHOW COLUMNS FROM tblConvocatorias LIKE 'IdProfesor'");
        if (cols.length === 0) {
            console.log('Adding IdProfesor column...');
            await connection.query(`
                ALTER TABLE tblConvocatorias 
                ADD COLUMN IdProfesor INT AFTER Color
            `);
            console.log('Column added.');
        } else {
            console.log('Column already exists.');
        }
    } catch (error) {
        console.error('Error:', error);
    } finally {
        await connection.end();
    }
}

check();
