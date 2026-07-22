// node --env-file=.env scratch/check_meses_chips.js
// Replica del SQL final del route de players: meses cubiertos + estatus de inscripción.
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

const MENSUALIDAD = `
    SELECT A.IdJugador
    FROM tblPagos A
    INNER JOIN tblProductos B ON A.IdProducto = B.IdProducto
    INNER JOIN tblTemporadas T ON T.IdTemporada = ?
    WHERE A.Status = 0 AND B.IdTipoProducto = 1
      AND A.Anio IS NOT NULL AND A.Mes BETWEEN 1 AND 12
      AND (A.Anio * 100 + A.Mes) BETWEEN (YEAR(T.FechaInicio)*100 + MONTH(T.FechaInicio))
                                     AND (YEAR(T.FechaFin)*100 + MONTH(T.FechaFin))
`;

const build = (whereExtra) => `
    SELECT
        J.IdJugador, J.Jugador, J.Categoria, J.Status, J.Beca,
        COALESCE(S.Sede, J.Sede) as SedeNombre,
        FI.FechaInscripcion,
        COALESCE(MP.MesesPagados, '') as MesesPagados,
        CASE WHEN INS.IdJugador IS NOT NULL THEN 1 ELSE 0 END as InscripcionPagada
    FROM tblJugadores J
    LEFT JOIN tblSedes S ON J.IdSede = S.IdSede
    LEFT JOIN (
        SELECT P.IdJugador, DATE_FORMAT(MIN(P.FechaPago), '%d/%m/%Y') as FechaInscripcion
        FROM tblPagos P INNER JOIN tblProductos PR ON P.IdProducto = PR.IdProducto
        WHERE P.Status = 0 AND PR.IdTipoProducto = 2 AND P.IdTemporada = ?
        GROUP BY P.IdJugador
    ) FI ON FI.IdJugador = J.IdJugador
    LEFT JOIN (
        SELECT P.IdJugador, GROUP_CONCAT(DISTINCT (P.Anio*100 + P.Mes)) as MesesPagados
        FROM tblPagos P
        INNER JOIN tblProductos PR ON P.IdProducto = PR.IdProducto
        INNER JOIN tblTemporadas T ON T.IdTemporada = ?
        WHERE P.Status = 0 AND PR.IdTipoProducto = 1
          AND P.Anio IS NOT NULL AND P.Mes BETWEEN 1 AND 12
          AND (P.Anio*100 + P.Mes) BETWEEN (YEAR(T.FechaInicio)*100 + MONTH(T.FechaInicio))
                                       AND (YEAR(T.FechaFin)*100 + MONTH(T.FechaFin))
        GROUP BY P.IdJugador
    ) MP ON MP.IdJugador = J.IdJugador
    LEFT JOIN (SELECT DISTINCT IdJugador FROM (${INSCRIPCION}) I) INS ON INS.IdJugador = J.IdJugador
    WHERE ${whereExtra}
    ORDER BY SedeNombre, J.Categoria, J.Jugador
    LIMIT 2000
`;

async function main() {
    const t = 10;

    const [[rango]] = await pool.query(`
        SELECT YEAR(FechaInicio)*100 + MONTH(FechaInicio) as Desde,
               YEAR(FechaFin)*100 + MONTH(FechaFin) as Hasta,
               YEAR(NOW())*100 + MONTH(NOW()) as Hoy
        FROM tblTemporadas WHERE IdTemporada = ?`, [t]);
    console.log('Rango de meses:', rango.Desde, '->', rango.Hasta, '| mes actual:', rango.Hoy);

    // sin-inscripcion
    let t0 = Date.now();
    const [sinInsc] = await pool.query(
        build(`J.IdJugador IN (${MENSUALIDAD}) AND J.IdJugador NOT IN (${INSCRIPCION}) AND J.Status = 0`),
        [t, t, t, t, t]
    );
    console.log(`\nSIN-INSCRIPCION: ${Date.now() - t0} ms · ${sinInsc.length} filas`);
    console.table(sinInsc.slice(0, 6).map(p => ({
        Jugador: p.Jugador.slice(0, 28), Sede: p.SedeNombre, Insc: p.InscripcionPagada,
        FechaInsc: p.FechaInscripcion, Meses: p.MesesPagados
    })));
    const malInsc = sinInsc.filter(p => p.InscripcionPagada === 1 || p.FechaInscripcion);
    console.log(`Con inscripción marcada (deberia ser 0): ${malInsc.length}`);
    const sinMeses = sinInsc.filter(p => !p.MesesPagados);
    console.log(`Sin meses cubiertos (deberia ser 0): ${sinMeses.length}`);

    // inscritos
    t0 = Date.now();
    const [inscritos] = await pool.query(
        build(`J.IdJugador IN (${INSCRIPCION}) AND J.Status = 0`), [t, t, t, t]
    );
    console.log(`\nINSCRITOS: ${Date.now() - t0} ms · ${inscritos.length} filas`);
    console.table(inscritos.slice(0, 6).map(p => ({
        Jugador: p.Jugador.slice(0, 28), Sede: p.SedeNombre, Insc: p.InscripcionPagada,
        FechaInsc: p.FechaInscripcion, Beca: p.Beca, Meses: p.MesesPagados
    })));
    console.log(`Sin inscripción marcada (deberia ser 0): ${inscritos.filter(p => !p.InscripcionPagada).length}`);

    // Todos los codigos de mes deben caer en el rango
    const fuera = new Set();
    [...sinInsc, ...inscritos].forEach(p => {
        String(p.MesesPagados).split(',').filter(Boolean).forEach(c => {
            const n = Number(c);
            if (n < rango.Desde || n > rango.Hasta) fuera.add(n);
        });
    });
    console.log(`\nCodigos de mes fuera del rango ${rango.Desde}-${rango.Hasta}: ${fuera.size ? [...fuera].join(', ') : 'ninguno'}`);
    console.log('FIN');

    await pool.end();
}

main().catch(e => { console.error(e); process.exit(1); });
