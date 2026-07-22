// node --env-file=.env scratch/check_anios.js
// ¿Qué pagos exactamente hacen calificar a cada jugador de "sin inscripcion"?
// ¿Y qué muestra el modal de pagos (que filtra por IdTemporada)?
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

    console.log('=== 1. Pagos que hacen calificar (filtro por Anio*100+Mes) ===');
    const [califica] = await pool.query(`
        SELECT A.Anio, A.Mes, COUNT(*) as Pagos, COUNT(DISTINCT A.IdJugador) as Jugadores
        FROM tblPagos A
        INNER JOIN tblProductos B ON A.IdProducto = B.IdProducto
        INNER JOIN tblTemporadas T ON T.IdTemporada = ?
        WHERE A.Status = 0 AND B.IdTipoProducto = 1
          AND A.Anio IS NOT NULL AND A.Mes BETWEEN 1 AND 12
          AND (A.Anio * 100 + A.Mes) BETWEEN (YEAR(T.FechaInicio)*100 + MONTH(T.FechaInicio))
                                         AND (YEAR(T.FechaFin)*100 + MONTH(T.FechaFin))
        GROUP BY A.Anio, A.Mes ORDER BY A.Anio, A.Mes
    `, [t]);
    console.table(califica);

    console.log('=== 2. Mensualidades archivadas bajo IdTemporada = 10, por año ===');
    const [bajoTemp] = await pool.query(`
        SELECT A.Anio, A.Mes, COUNT(*) as Pagos
        FROM tblPagos A
        INNER JOIN tblProductos B ON A.IdProducto = B.IdProducto
        WHERE A.Status = 0 AND B.IdTipoProducto = 1 AND A.IdTemporada = ?
        GROUP BY A.Anio, A.Mes ORDER BY A.Anio, A.Mes
    `, [t]);
    console.table(bajoTemp);

    console.log('=== 3. TODOS los pagos bajo IdTemporada = 10 (lo que ve el modal), por año ===');
    const [modal] = await pool.query(`
        SELECT A.Anio, COUNT(*) as Pagos, COUNT(DISTINCT A.IdJugador) as Jugadores
        FROM tblPagos A
        WHERE A.Status = 0 AND A.IdTemporada = ?
        GROUP BY A.Anio ORDER BY A.Anio
    `, [t]);
    console.table(modal);

    console.log('=== 4. Los 94 "sin inscripcion": ¿de que temporada son sus mensualidades que califican? ===');
    const [origen] = await pool.query(`
        SELECT A.IdTemporada as TemporadaDelPago, COALESCE(TT.Temporada,'?') as Nombre,
               COUNT(*) as Pagos, COUNT(DISTINCT A.IdJugador) as Jugadores
        FROM tblPagos A
        INNER JOIN tblProductos B ON A.IdProducto = B.IdProducto
        INNER JOIN tblTemporadas T ON T.IdTemporada = ?
        LEFT JOIN tblTemporadas TT ON TT.IdTemporada = A.IdTemporada
        WHERE A.Status = 0 AND B.IdTipoProducto = 1
          AND A.Anio IS NOT NULL AND A.Mes BETWEEN 1 AND 12
          AND (A.Anio * 100 + A.Mes) BETWEEN (YEAR(T.FechaInicio)*100 + MONTH(T.FechaInicio))
                                         AND (YEAR(T.FechaFin)*100 + MONTH(T.FechaFin))
          AND A.IdJugador IN (
              SELECT J.IdJugador FROM tblJugadores J WHERE J.Status = 0
                AND J.IdJugador NOT IN (SELECT A2.IdJugador FROM tblPagos A2
                    INNER JOIN tblProductos B2 ON A2.IdProducto = B2.IdProducto
                    WHERE A2.IdTemporada = ? AND B2.IdTipoProducto = 2))
        GROUP BY A.IdTemporada, TT.Temporada
        ORDER BY Pagos DESC
    `, [t, t]);
    console.table(origen);
    console.log('FIN');

    await pool.end();
}

main().catch(e => { console.error(e); process.exit(1); });
