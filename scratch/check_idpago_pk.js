// node --env-file=.env scratch/check_idpago_pk.js
// Antes de hacer UPDATE ... WHERE IdPago = ?: ¿es realmente unico?
const mysql = require('mysql2/promise');

const pool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    connectionLimit: 4,
});

async function main() {
    const [cols] = await pool.query(`SHOW COLUMNS FROM tblPagos`);
    console.log('=== Columnas clave de tblPagos ===');
    console.table(cols.filter(c => c.Key || ['Anio', 'Mes', 'IdTemporada', 'Status'].includes(c.Field))
        .map(c => ({ Campo: c.Field, Tipo: c.Type, Null: c.Null, Key: c.Key, Default: c.Default })));

    const [[dup]] = await pool.query(`
        SELECT COUNT(*) as Total, COUNT(DISTINCT IdPago) as Distintos FROM tblPagos
    `);
    console.log(`\nFilas: ${dup.Total} · IdPago distintos: ${dup.Distintos} · ${dup.Total === dup.Distintos ? 'UNICO' : 'HAY DUPLICADOS'}`);

    // Temporadas disponibles y sus rangos, para el recalculo de IdTemporada
    console.log('\n=== Rangos de temporada (para reasignar IdTemporada) ===');
    const [temps] = await pool.query(`
        SELECT IdTemporada, Temporada,
            YEAR(FechaInicio)*100 + MONTH(FechaInicio) as Desde,
            YEAR(FechaFin)*100 + MONTH(FechaFin) as Hasta
        FROM tblTemporadas ORDER BY IdTemporada DESC LIMIT 8
    `);
    console.table(temps);

    // ¿Los rangos se traslapan? Si si, el recalculo puede ser ambiguo.
    const orden = [...temps].sort((a, b) => a.Desde - b.Desde);
    const traslapes = [];
    for (let i = 1; i < orden.length; i++) {
        if (orden[i].Desde <= orden[i - 1].Hasta) {
            traslapes.push(`${orden[i - 1].Temporada} (${orden[i - 1].Desde}-${orden[i - 1].Hasta}) <-> ${orden[i].Temporada} (${orden[i].Desde}-${orden[i].Hasta})`);
        }
    }
    console.log(traslapes.length ? 'TRASLAPES:\n  ' + traslapes.join('\n  ') : 'Sin traslapes entre temporadas');
    console.log('FIN');

    await pool.end();
}

main().catch(e => { console.error(e); process.exit(1); });
