// node --env-file=.env scratch/check_categoria_filtro.js
// SOLO LECTURA. Confirma que players con sedeId+categoria+filtro cuadra con el
// conteo de la categoria, y que los datos de cuadritos siguen presentes.
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

    // Una sede con inscritos y sus categorias
    const [[sede]] = await pool.query(`
        SELECT J.IdSede, COALESCE(S.Sede, J.Sede) as Sede, COUNT(*) as N
        FROM tblJugadores J
        LEFT JOIN tblSedes S ON J.IdSede = S.IdSede
        WHERE J.Status = 0 AND J.IdJugador IN (${INSCRIPCION})
        GROUP BY J.IdSede, Sede ORDER BY N DESC LIMIT 1
    `, [t]);
    console.log(`Sede: ${sede.Sede} (${sede.IdSede}) · ${sede.N} inscritos\n`);

    // Inscritos por categoria de esa sede (lo que muestran las cards)
    const [cats] = await pool.query(`
        SELECT J.Categoria, COUNT(*) as Inscritos
        FROM tblJugadores J
        WHERE J.Status = 0 AND J.IdSede = ? AND J.IdJugador IN (${INSCRIPCION})
        GROUP BY J.Categoria ORDER BY Inscritos DESC LIMIT 5
    `, [sede.IdSede, t]);
    console.log('Inscritos por categoria (cards):');
    console.table(cats.map(c => ({ Categoria: c.Categoria, Inscritos: Number(c.Inscritos) })));

    // Replica del route players con filtro=inscritos + sede + categoria
    const cat = cats[0].Categoria;
    const [players] = await pool.query(`
        SELECT J.IdJugador, J.Jugador, J.Categoria,
            COALESCE(MP.MesesPagados, '') as MesesPagados,
            CASE WHEN INS.IdJugador IS NOT NULL THEN 1 ELSE 0 END as InscripcionPagada
        FROM tblJugadores J
        LEFT JOIN tblSedes S ON J.IdSede = S.IdSede
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
        WHERE J.IdSede = ? AND J.Categoria = ? AND J.Status = 0
          AND J.IdJugador IN (${INSCRIPCION})
        ORDER BY J.Jugador
    `, [t, t, sede.IdSede, cat, t]);

    console.log(`\nplayers (sede ${sede.IdSede}, categoria "${cat}", filtro inscritos): ${players.length} filas`);
    console.log(`Esperado por la card: ${cats[0].Inscritos} -> ${players.length === Number(cats[0].Inscritos) ? 'OK' : 'DIFIERE'}`);
    console.table(players.slice(0, 5).map(p => ({
        Jugador: p.Jugador.slice(0, 26), Insc: p.InscripcionPagada, Meses: p.MesesPagados
    })));
    console.log('FIN');

    await pool.end();
}

main().catch(e => { console.error(e); process.exit(1); });
