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

    const [rows] = await connection.query(`
        SELECT 
            CAST(NOW() AS CHAR) as now_str, 
            CAST(UTC_TIMESTAMP() AS CHAR) as utc_str,
            CAST(CONVERT_TZ(NOW(), '+00:00', '-06:00') AS CHAR) as converted_now_str
    `);
    console.log('=== RAW STRING STRINGS ===');
    console.log(rows[0]);

    const [recent] = await connection.query(`
        SELECT 
            IdApertura,
            CAST(FechaApertura AS CHAR) as fa_str,
            CAST(CONVERT_TZ(FechaApertura, '+00:00', '-06:00') AS CHAR) as fa_converted_str
        FROM tblAperturasCierres 
        ORDER BY IdApertura DESC 
        LIMIT 3
    `);
    console.log('\n=== RECENT APERTURAS RAW STRINGS ===');
    console.log(recent);

    await connection.end();
}

main().catch(console.error);
