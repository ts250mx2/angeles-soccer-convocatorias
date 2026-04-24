const mysql = require('mysql2/promise');

async function check() {
    const connection = await mysql.createConnection({
        host: '26.173.65.119',
        user: 'kyk',
        password: 'merkurio',
        database: 'BDAngelesSoccer'
    });

    try {
        const [cols] = await connection.query("SHOW COLUMNS FROM tblUsuarios");
        console.log(JSON.stringify(cols, null, 2));
    } catch (error) {
        console.error('Error:', error);
    } finally {
        await connection.end();
    }
}

check();
