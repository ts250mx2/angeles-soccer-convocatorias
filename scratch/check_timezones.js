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

    console.log('=== SYSTEM TIME ===');
    console.log('System ISO:', new Date().toISOString());
    console.log('System Local:', new Date().toLocaleString());

    console.log('\n=== DB TIME ===');
    const [dbNow] = await connection.query('SELECT NOW() as now, UTC_TIMESTAMP() as utc, @@global.time_zone as global_tz, @@session.time_zone as session_tz');
    console.log(dbNow[0]);

    console.log('\n=== TIMEZONE CONVERSIONS ===');
    const [convs] = await connection.query(`
        SELECT 
            NOW() as raw_now,
            CONVERT_TZ(NOW(), '+00:00', '-06:00') as tz_now,
            DATE(CONVERT_TZ(NOW(), '+00:00', '-06:00')) as date_tz_now
    `);
    console.log(convs[0]);

    console.log('\n=== RECENT APERTURAS ===');
    const [aperturas] = await connection.query(`
        SELECT IdApertura, FechaApertura, 
               CONVERT_TZ(FechaApertura, '+00:00', '-06:00') as converted,
               DATE(CONVERT_TZ(FechaApertura, '+00:00', '-06:00')) as date_converted
        FROM tblAperturasCierres 
        ORDER BY IdApertura DESC 
        LIMIT 5
    `);
    console.log(aperturas);

    await connection.end();
}

main().catch(console.error);
