// node --env-file=.env scratch/check_pagos_tz2.js
// ¿tblPagos.FechaPago sigue el reloj NOW() (local) o UTC_TIMESTAMP() del servidor?
const mysql = require('mysql2/promise');

const pool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    connectionLimit: 4,
    dateStrings: true,
});

async function main() {
    const [[r]] = await pool.query(`
        SELECT
            NOW()                                   as db_local,
            UTC_TIMESTAMP()                         as db_utc,
            (SELECT MAX(FechaPago) FROM tblPagos WHERE Status = 0)          as ultimo_pago,
            (SELECT MAX(FechaApertura) FROM tblAperturasCierres)            as ultima_apertura,
            (SELECT MAX(FechaVenta) FROM tblVentas WHERE Status = 0)        as ultima_venta
    `);
    console.log(r);

    const diff = (a, b) => ((new Date(a.replace(' ', 'T')) - new Date(b.replace(' ', 'T'))) / 3600000).toFixed(2);
    console.log('\nHoras entre el último registro y cada reloj (negativo = en el pasado):');
    for (const [k, v] of Object.entries({
        ultimo_pago: r.ultimo_pago,
        ultima_apertura: r.ultima_apertura,
        ultima_venta: r.ultima_venta,
    })) {
        if (!v) continue;
        console.log(`  ${k.padEnd(16)} vs NOW(): ${diff(v, r.db_local).padStart(8)} h · vs UTC(): ${diff(v, r.db_utc).padStart(8)} h`);
    }

    console.log('\nDistribución horaria — aperturas (documentadas como LOCAL):');
    const [ap] = await pool.query(`
        SELECT HOUR(FechaApertura) as hora, COUNT(*) as n
        FROM tblAperturasCierres GROUP BY HOUR(FechaApertura) ORDER BY n DESC LIMIT 6
    `);
    console.table(ap);

    console.log('Distribución horaria — pagos:');
    const [pg] = await pool.query(`
        SELECT HOUR(FechaPago) as hora, COUNT(*) as n
        FROM tblPagos WHERE Status = 0 AND HOUR(FechaPago) <> 0
        GROUP BY HOUR(FechaPago) ORDER BY n DESC LIMIT 6
    `);
    console.table(pg);

    await pool.end();
}

main().catch(e => { console.error(e); process.exit(1); });
