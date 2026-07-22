// node --env-file=.env scratch/check_status_inscripcion.js
// La regla de pertenencia no filtra P.Status: ¿cuántos "inscritos" lo son por un pago cancelado?
const mysql = require('mysql2/promise');

const pool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    connectionLimit: 4,
});

async function main() {
    for (const t of [10, 9, 7]) {
        const [[r]] = await pool.query(`
            SELECT
                (SELECT COUNT(*) FROM tblJugadores J WHERE J.Status = 0 AND J.IdJugador IN (
                    SELECT A.IdJugador FROM tblPagos A
                    INNER JOIN tblProductos B ON A.IdProducto = B.IdProducto
                    WHERE A.IdTemporada = ? AND B.IdTipoProducto = 2)) as SinFiltroStatus,
                (SELECT COUNT(*) FROM tblJugadores J WHERE J.Status = 0 AND J.IdJugador IN (
                    SELECT A.IdJugador FROM tblPagos A
                    INNER JOIN tblProductos B ON A.IdProducto = B.IdProducto
                    WHERE A.IdTemporada = ? AND B.IdTipoProducto = 2 AND A.Status = 0)) as ConFiltroStatus
        `, [t, t, t, t]);
        console.log(`temporada ${t}: sin filtrar Status ${r.SinFiltroStatus} · solo pagos validos ${r.ConFiltroStatus} · diferencia ${r.SinFiltroStatus - r.ConFiltroStatus}`);
    }

    console.log('\nStatus de los pagos de inscripcion (temporada 10):');
    const [st] = await pool.query(`
        SELECT A.Status, COUNT(*) as Pagos
        FROM tblPagos A INNER JOIN tblProductos B ON A.IdProducto = B.IdProducto
        WHERE A.IdTemporada = 10 AND B.IdTipoProducto = 2
        GROUP BY A.Status
    `);
    console.table(st);

    await pool.end();
}

main().catch(e => { console.error(e); process.exit(1); });
