// node --env-file=.env scratch/check_badge_anticipados.js
// SOLO LECTURA: replica del join MP del route de players, con PagosAnticipados.
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
      AND (A.Anio*100 + A.Mes) BETWEEN (YEAR(T.FechaInicio)*100 + MONTH(T.FechaInicio))
                                   AND (YEAR(T.FechaFin)*100 + MONTH(T.FechaFin))
`;

const PLAYERS = (whereExtra) => `
    SELECT J.IdJugador, J.Jugador, COALESCE(S.Sede, J.Sede) as SedeNombre,
        COALESCE(MP.MesesPagados, '') as MesesPagados,
        COALESCE(MP.PagosAnticipados, 0) as PagosAnticipados,
        CASE WHEN INS.IdJugador IS NOT NULL THEN 1 ELSE 0 END as InscripcionPagada
    FROM tblJugadores J
    LEFT JOIN tblSedes S ON J.IdSede = S.IdSede
    LEFT JOIN (
        SELECT P.IdJugador,
            GROUP_CONCAT(DISTINCT (P.Anio*100 + P.Mes)) as MesesPagados,
            SUM(TIMESTAMPDIFF(MONTH, P.FechaPago, T.FechaInicio) >= 3) as PagosAnticipados
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
    ORDER BY PagosAnticipados DESC, J.Jugador
    LIMIT 2000
`;

async function main() {
    const t = 10;

    const [sinInsc] = await pool.query(
        PLAYERS(`J.IdJugador IN (${MENSUALIDAD}) AND J.IdJugador NOT IN (${INSCRIPCION}) AND J.Status = 0`),
        [t, t, t, t]
    );
    const conAviso = sinInsc.filter(p => Number(p.PagosAnticipados) > 0);
    console.log(`SIN-INSCRIPCION: ${sinInsc.length} jugadores · con badge de anticipado: ${conAviso.length}`);
    console.table(conAviso.slice(0, 10).map(p => ({
        Id: p.IdJugador, Jugador: p.Jugador.slice(0, 26), Sede: p.SedeNombre,
        Anticipados: Number(p.PagosAnticipados), Meses: p.MesesPagados
    })));

    const [inscritos] = await pool.query(
        PLAYERS(`J.IdJugador IN (${INSCRIPCION}) AND J.Status = 0`), [t, t, t]
    );
    const inscConAviso = inscritos.filter(p => Number(p.PagosAnticipados) > 0);
    console.log(`\nINSCRITOS: ${inscritos.length} jugadores · con badge de anticipado: ${inscConAviso.length}`);

    // El total de pagos marcados debe coincidir con los 31 del corte sin inscripcion
    const totalSinInsc = conAviso.reduce((a, p) => a + Number(p.PagosAnticipados), 0);
    console.log(`\nTotal de pagos marcados en sin-inscripcion: ${totalSinInsc} (esperado 31)`);
    console.log('FIN');

    await pool.end();
}

main().catch(e => { console.error(e); process.exit(1); });
