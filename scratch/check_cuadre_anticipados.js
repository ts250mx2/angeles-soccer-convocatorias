// node --env-file=.env scratch/check_cuadre_anticipados.js
// SOLO LECTURA. Mide en UNA sola corrida: pagos anticipados totales vs. los que
// quedan cubiertos por el badge, para ver si falta alguno o si solo hubo deriva.
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

    // A) Todos los pagos anticipados de la temporada, con el estado del jugador
    const [todos] = await pool.query(`
        SELECT P.IdPago, J.IdJugador, J.Jugador, J.Status as StatusJugador,
            P.Mes, P.Anio,
            CASE WHEN J.IdJugador IN (${INSCRIPCION}) THEN 1 ELSE 0 END as TieneInscripcion
        FROM tblPagos P
        INNER JOIN tblProductos PR ON P.IdProducto = PR.IdProducto
        INNER JOIN tblJugadores J ON J.IdJugador = P.IdJugador
        INNER JOIN tblTemporadas TT ON TT.IdTemporada = ?
        WHERE P.Status = 0 AND PR.IdTipoProducto = 1
          AND P.Anio IS NOT NULL AND P.Mes BETWEEN 1 AND 12
          AND (P.Anio*100 + P.Mes) BETWEEN (YEAR(TT.FechaInicio)*100 + MONTH(TT.FechaInicio))
                                       AND (YEAR(TT.FechaFin)*100 + MONTH(TT.FechaFin))
          AND TIMESTAMPDIFF(MONTH, P.FechaPago, TT.FechaInicio) >= 3
    `, [t, t]);

    console.log(`Pagos anticipados en total: ${todos.length}`);
    console.log(`  jugadores distintos: ${new Set(todos.map(p => p.IdJugador)).size}`);

    const activos = todos.filter(p => p.StatusJugador === 0);
    const bajas = todos.filter(p => p.StatusJugador !== 0);
    const conInsc = activos.filter(p => p.TieneInscripcion === 1);
    const sinInsc = activos.filter(p => p.TieneInscripcion === 0);

    console.log(`\nDesglose:`);
    console.log(`  jugador ACTIVO  sin inscripcion : ${sinInsc.length} pagos  (los que ve el badge)`);
    console.log(`  jugador ACTIVO  con inscripcion : ${conInsc.length} pagos`);
    console.log(`  jugador DADO DE BAJA            : ${bajas.length} pagos  (no aparecen en cortes de activos)`);

    if (bajas.length) {
        console.log('\n  Pagos anticipados de jugadores dados de baja:');
        console.table(bajas.map(p => ({
            Pago: p.IdPago, Jugador: p.Jugador.slice(0, 26),
            Ampara: `${p.Mes}/${p.Anio}`, StatusJugador: p.StatusJugador
        })));
    }
    if (conInsc.length) {
        console.log('\n  Pagos anticipados de jugadores CON inscripcion:');
        console.table(conInsc.slice(0, 10).map(p => ({
            Pago: p.IdPago, Jugador: p.Jugador.slice(0, 26), Ampara: `${p.Mes}/${p.Anio}`
        })));
    }

    console.log('FIN');
    await pool.end();
}

main().catch(e => { console.error(e); process.exit(1); });
