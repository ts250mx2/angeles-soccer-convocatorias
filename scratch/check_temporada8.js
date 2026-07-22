// node --env-file=.env scratch/check_temporada8.js
// ¿Por qué la temporada 8 se queda sin inscritos con la regla IdTipoProducto = 2?
const mysql = require('mysql2/promise');

const pool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    connectionLimit: 4,
});

async function main() {
    console.log('=== Pagos por tipo de producto y temporada ===');
    const [rows] = await pool.query(`
        SELECT
            P.IdTemporada,
            COALESCE(T.Temporada, '(sin temporada)') as Temporada,
            COALESCE(TP.TipoProducto, CONCAT('tipo ', PR.IdTipoProducto)) as Tipo,
            PR.IdTipoProducto,
            COUNT(*) as Pagos,
            COUNT(DISTINCT P.IdJugador) as Jugadores
        FROM tblPagos P
        INNER JOIN tblProductos PR ON P.IdProducto = PR.IdProducto
        LEFT JOIN tblTiposProductos TP ON PR.IdTipoProducto = TP.IdTipoProducto
        LEFT JOIN tblTemporadas T ON P.IdTemporada = T.IdTemporada
        WHERE P.Status = 0 AND P.IdTemporada >= 7
        GROUP BY P.IdTemporada, T.Temporada, PR.IdTipoProducto, TP.TipoProducto
        ORDER BY P.IdTemporada DESC, PR.IdTipoProducto
    `);
    console.table(rows.map(r => ({
        Temp: r.IdTemporada, Temporada: r.Temporada, Tipo: `${r.IdTipoProducto} ${r.Tipo}`,
        Pagos: r.Pagos, Jugadores: r.Jugadores
    })));

    console.log('\n=== Productos de inscripción (tipo 2) por temporada ===');
    const [prods] = await pool.query(`
        SELECT PR.IdTemporada, COUNT(*) as Productos,
               GROUP_CONCAT(DISTINCT PR.Producto ORDER BY PR.Producto SEPARATOR ' | ') as Ejemplos
        FROM tblProductos PR
        WHERE PR.IdTipoProducto = 2
        GROUP BY PR.IdTemporada
        ORDER BY PR.IdTemporada DESC
        LIMIT 6
    `);
    prods.forEach(p => console.log(`  temporada ${p.IdTemporada}: ${p.Productos} productos · ${String(p.Ejemplos).slice(0, 150)}`));

    await pool.end();
}

main().catch(e => { console.error(e); process.exit(1); });
