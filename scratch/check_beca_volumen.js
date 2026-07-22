// node --env-file=.env scratch/check_beca_volumen.js
const mysql = require('mysql2/promise');
const pool = mysql.createPool({
    host: process.env.DB_HOST, user: process.env.DB_USER,
    password: process.env.DB_PASSWORD, database: process.env.DB_NAME, connectionLimit: 4,
});

async function main() {
    const [[cnt]] = await pool.query('SELECT COUNT(*) as total, SUM(Status=0) as activos, SUM(Status=2) as bajas FROM tblJugadores');
    console.log('tblJugadores:', cnt);

    console.log('\nValores distintos de Beca (top 20):');
    const [becas] = await pool.query(`
        SELECT Beca, COUNT(*) n FROM tblJugadores GROUP BY Beca ORDER BY n DESC LIMIT 20`);
    console.table(becas.map(b => ({ Beca: JSON.stringify(b.Beca), n: Number(b.n) })));

    // ¿CAST(Beca AS DECIMAL) coincide con parseFloat? ver casos no numericos
    console.log('\nBecas no vacias que no castean a numero limpio:');
    const [raras] = await pool.query(`
        SELECT DISTINCT Beca FROM tblJugadores
        WHERE Beca IS NOT NULL AND Beca <> '' AND Beca <> '0'
          AND Beca NOT REGEXP '^[0-9]+(\\.[0-9]+)?$' LIMIT 20`);
    console.table(raras.map(r => ({ Beca: JSON.stringify(r.Beca) })));

    // Inscritos temporada 10 (para comparar con "al corriente" esperado = 201)
    const [[insc]] = await pool.query(`
        SELECT COUNT(*) n FROM tblJugadores J WHERE J.Status=0 AND J.IdJugador IN (
            SELECT A.IdJugador FROM tblPagos A INNER JOIN tblProductos B ON A.IdProducto=B.IdProducto
            WHERE A.IdTemporada=10 AND B.IdTipoProducto=2)`);
    console.log(`\nActivos con inscripcion (temporada 10): ${insc.n}`);

    // beca100 activos sin inscripcion
    const [[b100]] = await pool.query(`
        SELECT COUNT(*) n FROM tblJugadores J WHERE J.Status=0
          AND (J.Beca LIKE '%100%')
          AND J.IdJugador NOT IN (SELECT A.IdJugador FROM tblPagos A INNER JOIN tblProductos B ON A.IdProducto=B.IdProducto
                                  WHERE A.IdTemporada=10 AND B.IdTipoProducto=2)`);
    console.log(`Activos beca100 SIN inscripcion (temporada 10): ${b100.n}`);
    console.log('FIN');
    await pool.end();
}
main().catch(e => { console.error(e); process.exit(1); });
