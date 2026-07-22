// node --env-file=.env scratch/check_sin_inscripcion.js
// "Con pagos sin inscripción": mensualidad en los meses-año de la temporada, sin pago de inscripción.
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
    WHERE A.Status = 0
      AND B.IdTipoProducto = 1
      AND A.Anio IS NOT NULL AND A.Mes BETWEEN 1 AND 12
      AND (A.Anio * 100 + A.Mes)
          BETWEEN (YEAR(T.FechaInicio) * 100 + MONTH(T.FechaInicio))
              AND (YEAR(T.FechaFin) * 100 + MONTH(T.FechaFin))
`;

async function main() {
    const [temporadas] = await pool.query(
        'SELECT IdTemporada, Temporada, FechaInicio, FechaFin, EsActiva FROM tblTemporadas ORDER BY IdTemporada DESC LIMIT 4'
    );
    console.log('=== Rangos de temporada ===');
    temporadas.forEach(t => console.log(
        `  ${String(t.IdTemporada).padStart(3)} ${t.Temporada.padEnd(26)} ${String(t.FechaInicio).slice(0, 15)} -> ${String(t.FechaFin).slice(0, 15)}${t.EsActiva ? '  (activa)' : ''}`
    ));

    console.log('\n=== Con pagos sin inscripción (Status = 0) ===');
    for (const t of temporadas) {
        const id = t.IdTemporada;
        const [[r]] = await pool.query(`
            SELECT
                (SELECT COUNT(*) FROM tblJugadores J WHERE J.Status = 0 AND J.IdJugador IN (${INSCRIPCION})) as Inscritos,
                (SELECT COUNT(*) FROM tblJugadores J WHERE J.Status = 0 AND J.IdJugador IN (${MENSUALIDAD})) as ConMensualidad,
                (SELECT COUNT(*) FROM tblJugadores J WHERE J.Status = 0
                    AND J.IdJugador IN (${MENSUALIDAD})
                    AND J.IdJugador NOT IN (${INSCRIPCION})) as SinInscripcion
        `, [id, id, id, id]);
        console.log(`  ${String(id).padStart(3)} ${t.Temporada.padEnd(26)} inscritos: ${String(r.Inscritos).padStart(5)}  con mensualidad: ${String(r.ConMensualidad).padStart(5)}  SIN INSCRIPCION: ${String(r.SinInscripcion).padStart(5)}`);
    }

    const activa = temporadas.find(t => t.EsActiva) ?? temporadas[0];
    const t = activa.IdTemporada;

    console.log(`\n=== Por sede — temporada ${t} (${activa.Temporada}) ===`);
    const [sedes] = await pool.query(`
        SELECT COALESCE(S.Sede, J.Sede) as Sede,
            COUNT(CASE WHEN INS.IdJugador IS NOT NULL THEN 1 END) as Inscritos,
            COUNT(CASE WHEN MEN.IdJugador IS NOT NULL AND INS.IdJugador IS NULL THEN 1 END) as SinInscripcion
        FROM tblJugadores J
        LEFT JOIN tblSedes S ON J.IdSede = S.IdSede
        LEFT JOIN (SELECT DISTINCT A.IdJugador FROM tblPagos A
                   INNER JOIN tblProductos B ON A.IdProducto = B.IdProducto
                   WHERE A.IdTemporada = ? AND B.IdTipoProducto = 2) INS ON INS.IdJugador = J.IdJugador
        LEFT JOIN (SELECT DISTINCT A.IdJugador FROM tblPagos A
                   INNER JOIN tblProductos B ON A.IdProducto = B.IdProducto
                   INNER JOIN tblTemporadas T ON T.IdTemporada = ?
                   WHERE A.Status = 0 AND B.IdTipoProducto = 1
                     AND A.Anio IS NOT NULL AND A.Mes BETWEEN 1 AND 12
                     AND (A.Anio * 100 + A.Mes) BETWEEN (YEAR(T.FechaInicio)*100 + MONTH(T.FechaInicio))
                                                    AND (YEAR(T.FechaFin)*100 + MONTH(T.FechaFin))) MEN ON MEN.IdJugador = J.IdJugador
        WHERE J.Status = 0
        GROUP BY COALESCE(S.Sede, J.Sede)
        HAVING Inscritos > 0 OR SinInscripcion > 0
        ORDER BY SinInscripcion DESC
    `, [t, t]);
    console.table(sedes.map(s => ({ Sede: s.Sede, Inscritos: Number(s.Inscritos), SinInscripcion: Number(s.SinInscripcion) })));

    console.log('\n=== Muestra de jugadores sin inscripción ===');
    const [muestra] = await pool.query(`
        SELECT J.IdJugador, J.Jugador, J.Categoria, COALESCE(S.Sede, J.Sede) as Sede,
            (SELECT GROUP_CONCAT(DISTINCT CONCAT(P.Mes, '/', P.Anio) ORDER BY P.Anio, P.Mes)
             FROM tblPagos P INNER JOIN tblProductos PR ON P.IdProducto = PR.IdProducto
             WHERE P.IdJugador = J.IdJugador AND P.Status = 0 AND PR.IdTipoProducto = 1) as MesesPagados
        FROM tblJugadores J
        LEFT JOIN tblSedes S ON J.IdSede = S.IdSede
        WHERE J.Status = 0 AND J.IdJugador IN (${MENSUALIDAD}) AND J.IdJugador NOT IN (${INSCRIPCION})
        ORDER BY Sede, J.Jugador
        LIMIT 8
    `, [t, t]);
    console.table(muestra.map(m => ({ Id: m.IdJugador, Jugador: m.Jugador, Sede: m.Sede, Meses: String(m.MesesPagados).slice(0, 40) })));

    await pool.end();
}

main().catch(e => { console.error(e); process.exit(1); });
