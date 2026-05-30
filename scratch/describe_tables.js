const fs = require('fs');
const mysql = require('mysql2/promise');

const envFile = fs.readFileSync('.env', 'utf-8');
const env = {};
envFile.split('\n').forEach(line => {
    const parts = line.split('=');
    if (parts.length >= 2) {
        env[parts[0].trim()] = parts.slice(1).join('=').trim();
    }
});

async function main() {
    const connection = await mysql.createConnection({
        host: env.DB_HOST,
        user: env.DB_USER,
        password: env.DB_PASSWORD,
        database: env.DB_NAME
    });

    console.log('=== SHOW TABLES ===');
    const [tables] = await connection.query('SHOW TABLES');
    console.log(tables);

    for (const tableObj of tables) {
        const tableName = Object.values(tableObj)[0];
        console.log(`\n=== DESCRIBE ${tableName} ===`);
        const [columns] = await connection.query(`DESCRIBE ${tableName}`);
        console.log(columns.map(c => `${c.Field}: ${c.Type} (${c.Null}, ${c.Key})`));
    }

    await connection.end();
}

main().catch(console.error);
