// node --env-file=.env scratch/check_200_vs_201.js
const mysql = require('mysql2/promise');
const pool = mysql.createPool({
    host: process.env.DB_HOST, user: process.env.DB_USER,
    password: process.env.DB_PASSWORD, database: process.env.DB_NAME, connectionLimit: 4,
});

async function main() {
    const t = 10;
    // inscritos SIN filtrar Status del pago (como inscripciones hoy)
    const [[a]] = await pool.query(`
        SELECT COUNT(*) n FROM tblJugadores J WHERE J.Status=0 AND J.IdJugador IN (
            SELECT A.IdJugador FROM tblPagos A INNER JOIN tblProductos B ON A.IdProducto=B.IdProducto
            WHERE A.IdTemporada=? AND B.IdTipoProducto=2)`, [t]);
    // inscritos filtrando Status=0 (como adeudos)
    const [[b]] = await pool.query(`
        SELECT COUNT(*) n FROM tblJugadores J WHERE J.Status=0 AND J.IdJugador IN (
            SELECT A.IdJugador FROM tblPagos A INNER JOIN tblProductos B ON A.IdProducto=B.IdProducto
            WHERE A.IdTemporada=? AND B.IdTipoProducto=2 AND A.Status=0)`, [t]);
    console.log(`inscritos sin filtrar Status del pago: ${a.n}`);
    console.log(`inscritos con A.Status=0 (pagos validos): ${b.n}`);

    // El jugador de diferencia: inscripcion cancelada como unico pago de inscripcion
    const [diff] = await pool.query(`
        SELECT J.IdJugador, J.Jugador, J.Status,
            GROUP_CONCAT(CONCAT('pago ', A.IdPago, ' status ', A.Status)) as PagosInsc
        FROM tblJugadores J
        INNER JOIN tblPagos A ON A.IdJugador=J.IdJugador
        INNER JOIN tblProductos B ON A.IdProducto=B.IdProducto AND B.IdTipoProducto=2 AND A.IdTemporada=?
        WHERE J.Status=0
          AND J.IdJugador NOT IN (SELECT A2.IdJugador FROM tblPagos A2 INNER JOIN tblProductos B2 ON A2.IdProducto=B2.IdProducto
                                  WHERE A2.IdTemporada=? AND B2.IdTipoProducto=2 AND A2.Status=0)
        GROUP BY J.IdJugador, J.Jugador, J.Status`, [t, t]);
    console.log('\nJugador(es) con inscripcion SOLO cancelada (la diferencia):');
    console.table(diff.map(d => ({ Id: d.IdJugador, Jugador: d.Jugador.slice(0,26), Pagos: d.PagosInsc })));
    console.log('FIN');
    await pool.end();
}
main().catch(e => { console.error(e); process.exit(1); });
