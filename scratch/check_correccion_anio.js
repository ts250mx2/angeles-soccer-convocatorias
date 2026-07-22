// node --env-file=.env scratch/check_correccion_anio.js
// SOLO LECTURA: simula la correccion de año sin tocar la base.
// Replica la resolucion de temporada del endpoint PATCH /api/inscripciones/pagos/anio.
const mysql = require('mysql2/promise');

const pool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    connectionLimit: 4,
});

async function resolverTemporada(codigo) {
    const [c] = await pool.query(`
        SELECT IdTemporada, Temporada
        FROM tblTemporadas
        WHERE (YEAR(FechaInicio)*100 + MONTH(FechaInicio)) <= (YEAR(FechaFin)*100 + MONTH(FechaFin))
          AND ? BETWEEN (YEAR(FechaInicio)*100 + MONTH(FechaInicio))
                    AND (YEAR(FechaFin)*100 + MONTH(FechaFin))
        ORDER BY IdTemporada DESC`, [codigo]);
    return c;
}

async function main() {
    const t = 10;

    // 1. Verifica el calculo de antelacion que devuelve el endpoint de pagos
    console.log('=== MesesAntesDeTemporada: distribucion en la temporada 10 ===');
    const [dist] = await pool.query(`
        SELECT TIMESTAMPDIFF(MONTH, P.FechaPago, TT.FechaInicio) as MesesAntes, COUNT(*) as Pagos
        FROM tblPagos P
        INNER JOIN tblProductos PR ON P.IdProducto = PR.IdProducto
        INNER JOIN tblTemporadas TT ON TT.IdTemporada = ?
        WHERE P.Status = 0 AND PR.IdTipoProducto = 1
          AND (P.Anio*100 + P.Mes) BETWEEN (YEAR(TT.FechaInicio)*100 + MONTH(TT.FechaInicio))
                                       AND (YEAR(TT.FechaFin)*100 + MONTH(TT.FechaFin))
        GROUP BY MesesAntes HAVING MesesAntes >= 3 ORDER BY MesesAntes DESC`, [t]);
    console.table(dist);

    // 2. Simula la correccion: año actual - 1 (la hipotesis natural)
    console.log('\n=== Simulacion: corregir a (año - 1) ===');
    const [sospechosos] = await pool.query(`
        SELECT P.IdPago, J.Jugador, P.Mes, P.Anio, P.IdTemporada,
            DATE_FORMAT(P.FechaPago, '%d/%m/%Y') as Pagado,
            TIMESTAMPDIFF(MONTH, P.FechaPago, TT.FechaInicio) as MesesAntes
        FROM tblPagos P
        INNER JOIN tblProductos PR ON P.IdProducto = PR.IdProducto
        INNER JOIN tblJugadores J ON J.IdJugador = P.IdJugador
        INNER JOIN tblTemporadas TT ON TT.IdTemporada = ?
        WHERE P.Status = 0 AND PR.IdTipoProducto = 1 AND J.Status = 0
          AND (P.Anio*100 + P.Mes) BETWEEN (YEAR(TT.FechaInicio)*100 + MONTH(TT.FechaInicio))
                                       AND (YEAR(TT.FechaFin)*100 + MONTH(TT.FechaFin))
          AND TIMESTAMPDIFF(MONTH, P.FechaPago, TT.FechaInicio) >= 3
        ORDER BY MesesAntes DESC`, [t]);

    const filas = [];
    let ambiguas = 0, sinTemporada = 0;
    for (const s of sospechosos) {
        const nuevoAnio = s.Anio - 1;
        const cand = await resolverTemporada(nuevoAnio * 100 + s.Mes);
        if (cand.length === 0) sinTemporada++;
        if (cand.length > 1) ambiguas++;
        filas.push({
            Pago: s.IdPago,
            Jugador: s.Jugador.slice(0, 22),
            Pagado: s.Pagado,
            Ampara: `${s.Mes}/${s.Anio}`,
            Quedaria: `${s.Mes}/${nuevoAnio}`,
            Temp: `${s.IdTemporada} -> ${cand.length ? cand[0].IdTemporada : '(sin cambio)'}`,
            Candidatas: cand.length,
        });
    }
    console.table(filas);
    console.log(`Total: ${filas.length} · ambiguas (varias temporadas cubren el mes): ${ambiguas} · sin temporada: ${sinTemporada}`);

    // 3. Confirma que NO se escribio nada
    const [[check]] = await pool.query(
        `SELECT COUNT(*) as n FROM tblPagos WHERE IdTemporada = ? AND Anio <> 2026 AND Status = 0`, [t]);
    console.log(`\nControl (solo lectura, nada modificado). Pagos temporada 10 con Anio != 2026: ${check.n}`);
    console.log('FIN');

    await pool.end();
}

main().catch(e => { console.error(e); process.exit(1); });
