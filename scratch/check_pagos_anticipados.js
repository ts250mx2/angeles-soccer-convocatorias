// node --env-file=.env scratch/check_pagos_anticipados.js
// Para los "sin inscripcion": ¿que tan lejos del inicio de temporada estan
// (a) la fecha en que pagaron y (b) el mes-anio que ampara el pago?
const mysql = require('mysql2/promise');

const pool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    connectionLimit: 4,
});

const INSCRIPCION = `
    SELECT A.IdJugador FROM tblPagos A
    INNER JOIN tblProductos B ON A.IdProducto = B.IdProducto
    WHERE A.IdTemporada = ? AND B.IdTipoProducto = 2
`;

async function main() {
    const t = 10;
    const [[temp]] = await pool.query(
        'SELECT Temporada, FechaInicio, FechaFin FROM tblTemporadas WHERE IdTemporada = ?', [t]);
    console.log(`${temp.Temporada}: ${String(temp.FechaInicio).slice(0,15)} -> ${String(temp.FechaFin).slice(0,15)}\n`);

    // (a) Meses entre FechaPago y el inicio de temporada
    console.log('=== (a) Antelacion de la FECHA DE PAGO respecto al inicio de temporada ===');
    const [porFecha] = await pool.query(`
        SELECT
            TIMESTAMPDIFF(MONTH, P.FechaPago, TT.FechaInicio) as MesesAntes,
            COUNT(*) as Pagos, COUNT(DISTINCT P.IdJugador) as Jugadores
        FROM tblPagos P
        INNER JOIN tblProductos PR ON P.IdProducto = PR.IdProducto
        INNER JOIN tblTemporadas TT ON TT.IdTemporada = ?
        WHERE P.Status = 0 AND PR.IdTipoProducto = 1
          AND P.Anio IS NOT NULL AND P.Mes BETWEEN 1 AND 12
          AND (P.Anio*100 + P.Mes) BETWEEN (YEAR(TT.FechaInicio)*100 + MONTH(TT.FechaInicio))
                                       AND (YEAR(TT.FechaFin)*100 + MONTH(TT.FechaFin))
          AND P.IdJugador NOT IN (${INSCRIPCION})
          AND P.IdJugador IN (SELECT IdJugador FROM tblJugadores WHERE Status = 0)
        GROUP BY MesesAntes ORDER BY MesesAntes DESC
    `, [t, t]);
    console.table(porFecha);

    const sospechosos = porFecha.filter(r => r.MesesAntes >= 3).reduce((a, r) => a + r.Pagos, 0);
    console.log(`Pagos hechos 3+ meses antes del inicio: ${sospechosos}`);

    // Muestra concreta
    console.log('\n=== Muestra: pagos hechos 3+ meses antes del inicio ===');
    const [muestra] = await pool.query(`
        SELECT J.Jugador, P.IdPago, P.Recibo,
            DATE_FORMAT(P.FechaPago, '%d/%m/%Y') as Pagado,
            P.Mes, P.Anio, P.Pago, P.IdTemporada,
            TIMESTAMPDIFF(MONTH, P.FechaPago, TT.FechaInicio) as MesesAntes
        FROM tblPagos P
        INNER JOIN tblProductos PR ON P.IdProducto = PR.IdProducto
        INNER JOIN tblJugadores J ON J.IdJugador = P.IdJugador
        INNER JOIN tblTemporadas TT ON TT.IdTemporada = ?
        WHERE P.Status = 0 AND PR.IdTipoProducto = 1
          AND P.Anio IS NOT NULL AND P.Mes BETWEEN 1 AND 12
          AND (P.Anio*100 + P.Mes) BETWEEN (YEAR(TT.FechaInicio)*100 + MONTH(TT.FechaInicio))
                                       AND (YEAR(TT.FechaFin)*100 + MONTH(TT.FechaFin))
          AND P.IdJugador NOT IN (${INSCRIPCION})
          AND J.Status = 0
          AND TIMESTAMPDIFF(MONTH, P.FechaPago, TT.FechaInicio) >= 3
        ORDER BY MesesAntes DESC LIMIT 12
    `, [t, t]);
    console.table(muestra.map(m => ({
        Jugador: m.Jugador.slice(0, 26), Recibo: m.Recibo, Pagado: m.Pagado,
        Ampara: `${m.Mes}/${m.Anio}`, Monto: m.Pago, MesesAntes: m.MesesAntes
    })));
    console.log('FIN');

    await pool.end();
}

main().catch(e => { console.error(e); process.exit(1); });
