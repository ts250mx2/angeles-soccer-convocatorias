// node --env-file=.env scratch/check_regla_inscritos.js
// Impacto de cambiar la regla de temporada: IdTipoProducto IN (1,2) -> = 2
const mysql = require('mysql2/promise');

const pool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    connectionLimit: 4,
});

const sub = (tipos) => `
    SELECT A.IdJugador FROM tblPagos A
    INNER JOIN tblProductos B ON A.IdProducto = B.IdProducto
    WHERE A.IdTemporada = ? AND B.IdTipoProducto ${tipos}
`;

async function main() {
    const [temporadas] = await pool.query(
        'SELECT IdTemporada, Temporada, EsActiva FROM tblTemporadas ORDER BY IdTemporada DESC LIMIT 4'
    );

    console.log('=== Totales por temporada (Status = 0) ===');
    for (const t of temporadas) {
        const [[antes]] = await pool.query(
            `SELECT COUNT(*) n FROM tblJugadores J WHERE J.Status = 0 AND J.IdJugador IN (${sub('IN (1, 2)')})`, [t.IdTemporada]);
        const [[ahora]] = await pool.query(
            `SELECT COUNT(*) n FROM tblJugadores J WHERE J.Status = 0 AND J.IdJugador IN (${sub('= 2')})`, [t.IdTemporada]);
        console.log(`  ${String(t.IdTemporada).padStart(3)} ${t.Temporada.padEnd(26)}${t.EsActiva ? '(activa)' : '        '}  antes: ${String(antes.n).padStart(5)}  ahora: ${String(ahora.n).padStart(5)}  Δ ${String(ahora.n - antes.n).padStart(6)}`);
    }

    const activa = temporadas.find(t => t.EsActiva) ?? temporadas[0];
    const t = activa.IdTemporada;

    console.log(`\n=== Por sede — temporada ${t} (${activa.Temporada}) ===`);
    const [sedes] = await pool.query(`
        SELECT COALESCE(S.Sede, J.Sede) as Sede,
            SUM(CASE WHEN J.IdJugador IN (${sub('IN (1, 2)')}) THEN 1 ELSE 0 END) as Antes,
            SUM(CASE WHEN J.IdJugador IN (${sub('= 2')}) THEN 1 ELSE 0 END) as Ahora
        FROM tblJugadores J
        LEFT JOIN tblSedes S ON J.IdSede = S.IdSede
        WHERE J.Status = 0
        GROUP BY COALESCE(S.Sede, J.Sede)
        HAVING Antes > 0 OR Ahora > 0
        ORDER BY Antes DESC
    `, [t, t]);
    console.table(sedes.map(s => ({ Sede: s.Sede, Antes: Number(s.Antes), Ahora: Number(s.Ahora), Delta: Number(s.Ahora) - Number(s.Antes) })));

    // ¿Cuántos jugadores tienen mensualidad pero nunca pagaron inscripción?
    const [[solo1]] = await pool.query(`
        SELECT COUNT(DISTINCT J.IdJugador) n
        FROM tblJugadores J
        WHERE J.Status = 0
          AND J.IdJugador IN (${sub('= 1')})
          AND J.IdJugador NOT IN (${sub('= 2')})
    `, [t, t]);
    console.log(`\nJugadores con mensualidad pero SIN pago de inscripción en la temporada ${t}: ${solo1.n}`);
    console.log('(esos son los que dejan de contar como inscritos)');

    // Cobertura de la fecha de inscripción con la nueva regla
    const [[cob]] = await pool.query(`
        SELECT
            COUNT(*) total,
            SUM(CASE WHEN FI.IdJugador IS NULL THEN 1 ELSE 0 END) sin_fecha
        FROM tblJugadores J
        LEFT JOIN (
            SELECT P.IdJugador FROM tblPagos P
            INNER JOIN tblProductos PR ON P.IdProducto = PR.IdProducto
            WHERE P.Status = 0 AND PR.IdTipoProducto = 2 AND P.IdTemporada = ?
            GROUP BY P.IdJugador
        ) FI ON FI.IdJugador = J.IdJugador
        WHERE J.Status = 0 AND J.IdJugador IN (${sub('= 2')})
    `, [t, t]);
    console.log(`\nCobertura de fecha de inscripción: ${cob.total - cob.sin_fecha} de ${cob.total} (sin fecha: ${cob.sin_fecha})`);

    await pool.end();
}

main().catch(e => { console.error(e); process.exit(1); });
