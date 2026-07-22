// node --env-file=.env scratch/check_sugerida_endpoint.js
// SOLO LECTURA. Replica exacta de la deteccion de inscripcion sugerida del route,
// y simula (sin escribir) el efecto de moverla a la temporada seleccionada.
const mysql = require('mysql2/promise');

const pool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    connectionLimit: 4,
});

const DIAS = 30;

const MENSUALIDAD = `
    SELECT A.IdJugador
    FROM tblPagos A
    INNER JOIN tblProductos B ON A.IdProducto = B.IdProducto
    INNER JOIN tblTemporadas T ON T.IdTemporada = ?
    WHERE A.Status = 0 AND B.IdTipoProducto = 1
      AND A.Anio IS NOT NULL AND A.Mes BETWEEN 1 AND 12
      AND (A.Anio*100 + A.Mes) BETWEEN (YEAR(T.FechaInicio)*100 + MONTH(T.FechaInicio))
                                   AND (YEAR(T.FechaFin)*100 + MONTH(T.FechaFin))
`;
const INSCRIPCION = `
    SELECT A.IdJugador FROM tblPagos A
    INNER JOIN tblProductos B ON A.IdProducto = B.IdProducto
    WHERE A.IdTemporada = ? AND B.IdTipoProducto = 2
`;

// Replica del subquery de deteccion del route, para un jugador dado.
async function sugerida(idJugador, t) {
    const [rows] = await pool.query(`
        SELECT INS.IdPago,
            DATE_FORMAT(INS.FechaPago, '%d/%m/%Y') as FechaPago,
            INS.Pago, INS.IdTemporada as TemporadaActual,
            COALESCE(TI.Temporada, 'Sin temporada') as TemporadaActualNombre,
            COALESCE(PRI.Producto, 'INSCRIPCION') as Producto,
            MIN(ABS(DATEDIFF(INS.FechaPago, MEN.FechaPago))) as DiasDeDistancia
        FROM tblPagos INS
        INNER JOIN tblProductos PRI ON INS.IdProducto = PRI.IdProducto AND PRI.IdTipoProducto = 2
        LEFT JOIN tblTemporadas TI ON TI.IdTemporada = INS.IdTemporada
        INNER JOIN tblTemporadas TT ON TT.IdTemporada = ?
        INNER JOIN tblPagos MEN ON MEN.IdJugador = INS.IdJugador AND MEN.Status = 0
        INNER JOIN tblProductos PRM ON MEN.IdProducto = PRM.IdProducto AND PRM.IdTipoProducto = 1
        WHERE INS.IdJugador = ? AND INS.Status = 0
          AND (INS.IdTemporada <> ? OR INS.IdTemporada IS NULL)
          AND MEN.Anio IS NOT NULL AND MEN.Mes BETWEEN 1 AND 12
          AND (MEN.Anio*100 + MEN.Mes) BETWEEN (YEAR(TT.FechaInicio)*100 + MONTH(TT.FechaInicio))
                                           AND (YEAR(TT.FechaFin)*100 + MONTH(TT.FechaFin))
          AND ABS(DATEDIFF(INS.FechaPago, MEN.FechaPago)) <= ${DIAS}
        GROUP BY INS.IdPago, INS.FechaPago, INS.Pago, INS.IdTemporada, TI.Temporada, PRI.Producto
        ORDER BY DiasDeDistancia ASC, INS.FechaPago DESC LIMIT 1
    `, [t, idJugador, t]);
    return rows[0] ?? null;
}

async function main() {
    const t = 10;

    // Todos los jugadores sin inscripcion de la temporada
    const [sinInsc] = await pool.query(`
        SELECT J.IdJugador, J.Jugador FROM tblJugadores J
        WHERE J.Status = 0 AND J.IdJugador IN (${MENSUALIDAD}) AND J.IdJugador NOT IN (${INSCRIPCION})
    `, [t, t]);
    console.log(`Jugadores sin inscripcion: ${sinInsc.length}`);

    let conSugerencia = 0;
    const muestra = [];
    const idsInscripcion = new Set();
    for (const j of sinInsc) {
        const s = await sugerida(j.IdJugador, t);
        if (s) {
            conSugerencia++;
            idsInscripcion.add(s.IdPago);
            if (muestra.length < 8) muestra.push({
                Jugador: j.Jugador.slice(0, 24), Pago: s.IdPago, Fecha: s.FechaPago,
                Producto: String(s.Producto).slice(0, 26),
                Actual: String(s.TemporadaActualNombre).slice(0, 18), Dias: s.DiasDeDistancia
            });
        }
    }
    console.log(`Con inscripcion sugerida (<= ${DIAS} dias): ${conSugerencia}`);
    console.table(muestra);

    // Simulacion: si se movieran esas inscripciones a la temporada t, ¿cuantos
    // jugadores pasarian de "sin inscripcion" a "inscrito"?
    console.log(`\nSimulacion: mover ${idsInscripcion.size} pagos de inscripcion a la temporada ${t}`);
    console.log(`  sin inscripcion: ${sinInsc.length} -> ${sinInsc.length - conSugerencia}`);
    console.log(`  inscritos: subirian en ${conSugerencia}`);

    // Que NINGUNA de esas inscripciones ya este en la temporada t (no deberia)
    if (idsInscripcion.size) {
        const [[chk]] = await pool.query(
            `SELECT COUNT(*) n FROM tblPagos WHERE IdPago IN (${[...idsInscripcion].join(',')}) AND IdTemporada = ?`, [t]);
        console.log(`  pagos sugeridos que YA estan en la temporada ${t} (deberia ser 0): ${chk.n}`);
    }
    console.log('FIN (nada modificado)');

    await pool.end();
}

main().catch(e => { console.error(e); process.exit(1); });
