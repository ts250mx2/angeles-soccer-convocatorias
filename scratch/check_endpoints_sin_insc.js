// node --env-file=.env scratch/check_endpoints_sin_insc.js
// Replica exacta del SQL que arman los routes de sedes y players (filtro sin-inscripcion).
const mysql = require('mysql2/promise');

const pool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    connectionLimit: 4,
});

const JUGADORES_DE_TEMPORADA_SQL = `
    SELECT A.IdJugador
    FROM tblPagos A
    INNER JOIN tblProductos B ON A.IdProducto = B.IdProducto
    WHERE A.IdTemporada = ? AND B.IdTipoProducto = 2
`;

const MENSUALIDADES_EN_TEMPORADA_SQL = `
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

const SEDES = `
    SELECT
        S.IdSede, S.Sede,
        COUNT(CASE WHEN J.Status = 0 AND INS.IdJugador IS NOT NULL THEN 1 END) as Inscritos,
        COUNT(CASE WHEN J.Status = 2 AND INS.IdJugador IS NOT NULL THEN 1 END) as Bajas,
        COUNT(CASE WHEN J.Status = 0 AND MEN.IdJugador IS NOT NULL AND INS.IdJugador IS NULL THEN 1 END) as SinInscripcion,
        GROUP_CONCAT(CASE WHEN J.Status = 0 AND INS.IdJugador IS NOT NULL
              AND J.Beca IS NOT NULL AND J.Beca != '0' AND J.Beca != '' THEN J.Beca END) as BecasDetail
    FROM tblSedes S
    LEFT JOIN tblJugadores J ON S.IdSede = J.IdSede
    LEFT JOIN (SELECT DISTINCT IdJugador FROM (${JUGADORES_DE_TEMPORADA_SQL}) I) INS ON INS.IdJugador = J.IdJugador
    LEFT JOIN (SELECT DISTINCT IdJugador FROM (${MENSUALIDADES_EN_TEMPORADA_SQL}) M) MEN ON MEN.IdJugador = J.IdJugador
    GROUP BY S.IdSede, S.Sede
    ORDER BY Inscritos DESC, S.Sede ASC
`;

// players con filtro=sin-inscripcion, temporadaId, sin sede
const PLAYERS = `
    SELECT
        J.IdJugador, J.Jugador, J.Categoria, J.Status, J.Beca, J.IdSede,
        COALESCE(S.Sede, J.Sede) as SedeNombre,
        FI.FechaInscripcion
    FROM tblJugadores J
    LEFT JOIN tblSedes S ON J.IdSede = S.IdSede
    LEFT JOIN (
        SELECT P.IdJugador, DATE_FORMAT(MIN(P.FechaPago), '%d/%m/%Y') as FechaInscripcion
        FROM tblPagos P
        INNER JOIN tblProductos PR ON P.IdProducto = PR.IdProducto
        INNER JOIN tblTemporadas T ON T.IdTemporada = ?
        WHERE P.Status = 0 AND PR.IdTipoProducto = 1
          AND P.Anio IS NOT NULL AND P.Mes BETWEEN 1 AND 12
          AND (P.Anio * 100 + P.Mes) BETWEEN (YEAR(T.FechaInicio)*100 + MONTH(T.FechaInicio))
                                         AND (YEAR(T.FechaFin)*100 + MONTH(T.FechaFin))
        GROUP BY P.IdJugador
    ) FI ON FI.IdJugador = J.IdJugador
    WHERE J.IdJugador IN (${MENSUALIDADES_EN_TEMPORADA_SQL})
      AND J.IdJugador NOT IN (${JUGADORES_DE_TEMPORADA_SQL})
      AND J.Status = 0
    ORDER BY SedeNombre ASC, J.Categoria ASC, J.Jugador ASC
    LIMIT 2000
`;

async function main() {
    const t = 10;

    let t0 = Date.now();
    const [sedes] = await pool.query(SEDES, [t, t]);
    console.log(`SEDES: ${Date.now() - t0} ms`);
    console.table(sedes.filter(s => s.Inscritos > 0 || s.SinInscripcion > 0).map(s => ({
        Sede: s.Sede, Inscritos: Number(s.Inscritos), Bajas: Number(s.Bajas), SinInscripcion: Number(s.SinInscripcion)
    })));
    console.log('Totales -> inscritos:', sedes.reduce((a, s) => a + Number(s.Inscritos), 0),
                '· sin inscripción:', sedes.reduce((a, s) => a + Number(s.SinInscripcion), 0));

    t0 = Date.now();
    const [players] = await pool.query(PLAYERS, [t, t, t]);
    console.log(`\nPLAYERS (sin-inscripcion): ${Date.now() - t0} ms · ${players.length} filas · sin fecha: ${players.filter(p => !p.FechaInscripcion).length}`);
    console.table(players.slice(0, 6).map(p => ({
        Id: p.IdJugador, Jugador: p.Jugador, Cat: p.Categoria, Sede: p.SedeNombre, PrimerPago: p.FechaInscripcion
    })));

    // El total del listado debe cuadrar con la suma de los cards
    const suma = sedes.reduce((a, s) => a + Number(s.SinInscripcion), 0);
    console.log(`\nCuadre: listado ${players.length} vs suma de sedes ${suma} -> ${players.length === suma ? 'OK' : 'DIFIERE'}`);
    console.log('FIN');

    await pool.end();
}

main().catch(e => { console.error(e); process.exit(1); });
