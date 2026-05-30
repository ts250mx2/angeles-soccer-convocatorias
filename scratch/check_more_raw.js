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

    console.log('=== RECENT PAGOS RAW STRINGS ===');
    const [pagos] = await connection.query(`
        SELECT 
            IdPago, Pago,
            CAST(FechaPago AS CHAR) as fp_str,
            CAST(CONVERT_TZ(FechaPago, '+00:00', '-06:00') AS CHAR) as fp_converted_str
        FROM tblPagos 
        ORDER BY IdPago DESC 
        LIMIT 3
    `);
    console.log(pagos);

    console.log('\n=== RECENT EGRESOS RAW STRINGS ===');
    const [egresos] = await connection.query(`
        SELECT 
            IdEgreso, Total,
            CAST(FechaEgreso AS CHAR) as fe_str,
            CAST(CONVERT_TZ(FechaEgreso, '+00:00', '-06:00') AS CHAR) as fe_converted_str
        FROM tblEgresos 
        ORDER BY IdEgreso DESC 
        LIMIT 3
    `);
    console.log(egresos);

    await connection.end();
}

main().catch(console.error);
