// node --env-file=.env scratch/check_pagos_modal.js
// Antes vs. despues: el detalle de pagos acotado por IdTemporada vs. por mes-año.
const mysql = require('mysql2/promise');

const pool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    connectionLimit: 4,
});

const SELECT = `
    SELECT P.IdPago, P.Mes, P.Anio, P.Pago, P.IdTemporada,
        COALESCE(PR.Producto, 'ELIMINADO') as Producto,
        PR.IdTipoProducto,
        COALESCE(TP.TipoProducto, '-') as TipoProducto
    FROM tblPagos P
    LEFT JOIN tblProductos PR ON P.IdProducto = PR.IdProducto
    LEFT JOIN tblTiposProductos TP ON PR.IdTipoProducto = TP.IdTipoProducto
`;

const ANTES = `${SELECT} WHERE P.IdJugador = ? AND P.Status = 0 AND P.IdTemporada = ? ORDER BY P.FechaPago DESC`;

const DESPUES = `${SELECT}
    INNER JOIN tblTemporadas TT ON TT.IdTemporada = ?
    WHERE P.IdJugador = ? AND P.Status = 0
      AND (
        (PR.IdTipoProducto = 1 AND P.Anio IS NOT NULL AND P.Mes BETWEEN 1 AND 12
         AND (P.Anio*100 + P.Mes) BETWEEN (YEAR(TT.FechaInicio)*100 + MONTH(TT.FechaInicio))
                                      AND (YEAR(TT.FechaFin)*100 + MONTH(TT.FechaFin)))
        OR (COALESCE(PR.IdTipoProducto, 0) <> 1 AND P.IdTemporada = ?)
      )
    ORDER BY P.FechaPago DESC`;

async function main() {
    const t = 10;
    const [[rango]] = await pool.query(`
        SELECT YEAR(FechaInicio)*100+MONTH(FechaInicio) as Desde, YEAR(FechaFin)*100+MONTH(FechaFin) as Hasta
        FROM tblTemporadas WHERE IdTemporada = ?`, [t]);
    console.log(`Temporada ${t}: rango ${rango.Desde} - ${rango.Hasta}\n`);

    // Jugadores con mensualidades fuera del rango archivadas bajo la temporada 10
    const [candidatos] = await pool.query(`
        SELECT P.IdJugador, J.Jugador, COUNT(*) as PagosFuera
        FROM tblPagos P
        INNER JOIN tblProductos PR ON P.IdProducto = PR.IdProducto
        INNER JOIN tblJugadores J ON J.IdJugador = P.IdJugador
        WHERE P.Status = 0 AND P.IdTemporada = ? AND PR.IdTipoProducto = 1
          AND (P.Anio*100 + P.Mes) NOT BETWEEN ? AND ?
        GROUP BY P.IdJugador, J.Jugador
        ORDER BY PagosFuera DESC LIMIT 3
    `, [t, rango.Desde, rango.Hasta]);

    for (const c of candidatos) {
        const [antes] = await pool.query(ANTES, [c.IdJugador, t]);
        const [despues] = await pool.query(DESPUES, [t, c.IdJugador, t]);

        const fuera = (rows) => rows.filter(r =>
            r.IdTipoProducto === 1 && (r.Anio * 100 + r.Mes < rango.Desde || r.Anio * 100 + r.Mes > rango.Hasta));

        console.log(`--- ${c.Jugador} (id ${c.IdJugador}) ---`);
        console.log(`  ANTES:   ${antes.length} pagos · mensualidades fuera de rango: ${fuera(antes).length}`);
        if (fuera(antes).length) {
            console.log('    ' + fuera(antes).map(r => `${r.Mes}/${r.Anio}`).join(', '));
        }
        console.log(`  DESPUES: ${despues.length} pagos · mensualidades fuera de rango: ${fuera(despues).length}`);
        console.log('    meses incluidos: ' + despues.filter(r => r.IdTipoProducto === 1).map(r => `${r.Mes}/${r.Anio}`).join(', '));
        console.log('    otros conceptos: ' + (despues.filter(r => r.IdTipoProducto !== 1).map(r => r.TipoProducto).join(', ') || 'ninguno'));
    }
    console.log('FIN');

    await pool.end();
}

main().catch(e => { console.error(e); process.exit(1); });
