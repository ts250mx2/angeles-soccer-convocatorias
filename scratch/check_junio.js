// node --env-file=.env scratch/check_junio.js
// ¿El filtro de "sin inscripción" está dejando pasar meses fuera del rango?
const mysql = require('mysql2/promise');

const pool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    connectionLimit: 4,
});

async function main() {
    const t = 10;
    const [[temp]] = await pool.query(
        'SELECT IdTemporada, Temporada, FechaInicio, FechaFin FROM tblTemporadas WHERE IdTemporada = ?', [t]);
    console.log('Temporada:', temp.Temporada, '|', String(temp.FechaInicio).slice(0, 15), '->', String(temp.FechaFin).slice(0, 15));

    const [[rango]] = await pool.query(`
        SELECT YEAR(FechaInicio)*100 + MONTH(FechaInicio) as desde,
               YEAR(FechaFin)*100 + MONTH(FechaFin) as hasta
        FROM tblTemporadas WHERE IdTemporada = ?`, [t]);
    console.log('Rango calculado (Anio*100+Mes):', rango.desde, '->', rango.hasta);

    // Meses-año que REALMENTE entran al conjunto de mensualidades
    console.log('\n=== Mes-año de las mensualidades que pasan el filtro ===');
    const [meses] = await pool.query(`
        SELECT A.Anio, A.Mes, COUNT(*) as Pagos, COUNT(DISTINCT A.IdJugador) as Jugadores
        FROM tblPagos A
        INNER JOIN tblProductos B ON A.IdProducto = B.IdProducto
        INNER JOIN tblTemporadas T ON T.IdTemporada = ?
        WHERE A.Status = 0 AND B.IdTipoProducto = 1
          AND A.Anio IS NOT NULL AND A.Mes BETWEEN 1 AND 12
          AND (A.Anio * 100 + A.Mes)
              BETWEEN (YEAR(T.FechaInicio)*100 + MONTH(T.FechaInicio))
                  AND (YEAR(T.FechaFin)*100 + MONTH(T.FechaFin))
        GROUP BY A.Anio, A.Mes
        ORDER BY A.Anio, A.Mes
    `, [t]);
    console.table(meses);

    // Fechas de pago (cuándo pagaron) de esas mismas mensualidades
    console.log('=== Mes en que se REALIZO el pago (FechaPago) de esas mensualidades ===');
    const [fechas] = await pool.query(`
        SELECT MONTH(A.FechaPago) as MesPago, YEAR(A.FechaPago) as AnioPago, COUNT(*) as Pagos
        FROM tblPagos A
        INNER JOIN tblProductos B ON A.IdProducto = B.IdProducto
        INNER JOIN tblTemporadas T ON T.IdTemporada = ?
        WHERE A.Status = 0 AND B.IdTipoProducto = 1
          AND A.Anio IS NOT NULL AND A.Mes BETWEEN 1 AND 12
          AND (A.Anio * 100 + A.Mes)
              BETWEEN (YEAR(T.FechaInicio)*100 + MONTH(T.FechaInicio))
                  AND (YEAR(T.FechaFin)*100 + MONTH(T.FechaFin))
        GROUP BY YEAR(A.FechaPago), MONTH(A.FechaPago)
        ORDER BY AnioPago, MesPago
    `, [t]);
    console.table(fechas);

    await pool.end();
}

main().catch(e => { console.error(e); process.exit(1); });
