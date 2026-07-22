// node --env-file=.env scratch/check_pagos_tz.js
// ¿tblPagos.FechaPago está en UTC o ya en hora local?
// Prueba: un pago ocurre DENTRO de la apertura de caja que lo registró, y
// tblAperturasCierres.FechaApertura ya está en hora local.
const mysql = require('mysql2/promise');

const pool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    connectionLimit: 4,
    dateStrings: true, // sin reinterpretación de mysql2: se ve el valor crudo
});

async function main() {
    const [[t]] = await pool.query(
        `SELECT NOW() as db_now, UTC_TIMESTAMP() as db_utc, @@session.time_zone as tz`
    );
    console.log('Reloj del servidor MySQL:', t);

    console.log('\n=== Pago vs. apertura de caja que lo contiene ===');
    const [rows] = await pool.query(`
        SELECT
            P.IdPago, P.Recibo,
            P.FechaPago,
            AC.FechaApertura,
            AC.FechaCierre,
            TIMESTAMPDIFF(HOUR, AC.FechaApertura, P.FechaPago) as horas_tras_apertura
        FROM tblPagos P
        INNER JOIN tblAperturasCierres AC ON P.IdApertura = AC.IdApertura
        WHERE P.Status = 0 AND AC.FechaCierre IS NOT NULL
        ORDER BY P.IdPago DESC
        LIMIT 10
    `);
    console.table(rows);

    const dentro = rows.filter(r => r.horas_tras_apertura >= 0 && r.horas_tras_apertura <= 14).length;
    console.log(`Pagos que caen dentro de su apertura (0-14 h): ${dentro} de ${rows.length}`);
    console.log(dentro >= rows.length - 1
        ? '=> FechaPago ya está en hora LOCAL (NO aplicar CONVERT_TZ)'
        : '=> FechaPago parece estar en UTC (sí aplicar CONVERT_TZ)');

    console.log('\n=== Distribución horaria de los pagos (hora cruda) ===');
    const [horas] = await pool.query(`
        SELECT HOUR(FechaPago) as hora, COUNT(*) as pagos
        FROM tblPagos
        WHERE Status = 0
        GROUP BY HOUR(FechaPago)
        ORDER BY hora
    `);
    console.table(horas);

    await pool.end();
}

main().catch(e => { console.error(e); process.exit(1); });
