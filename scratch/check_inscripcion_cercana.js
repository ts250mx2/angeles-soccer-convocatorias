// node --env-file=.env scratch/check_inscripcion_cercana.js
// SOLO LECTURA. Para los jugadores "sin inscripcion" de la temporada:
// ¿existe un pago de inscripcion (tipo 2) en fechas cercanas a sus mensualidades?
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
    WHERE A.Status = 0 AND B.IdTipoProducto = 1
      AND A.Anio IS NOT NULL AND A.Mes BETWEEN 1 AND 12
      AND (A.Anio*100 + A.Mes) BETWEEN (YEAR(T.FechaInicio)*100 + MONTH(T.FechaInicio))
                                   AND (YEAR(T.FechaFin)*100 + MONTH(T.FechaFin))
`;

async function main() {
    const t = 10;

    // Por cada jugador sin inscripcion: su inscripcion (tipo 2) mas cercana en el
    // tiempo a cualquiera de sus mensualidades que califican para la temporada.
    const [rows] = await pool.query(`
        SELECT
            J.IdJugador, J.Jugador, COALESCE(S.Sede, J.Sede) as Sede,
            INS.IdPago as IdPagoInscripcion,
            DATE_FORMAT(INS.FechaPago, '%d/%m/%Y') as FechaInscripcion,
            INS.IdTemporada as TemporadaInscripcion,
            COALESCE(TI.Temporada, '(sin temporada)') as NombreTemporadaInsc,
            INS.Pago as MontoInscripcion,
            PRI.Producto as ProductoInscripcion,
            MIN(ABS(DATEDIFF(INS.FechaPago, MEN.FechaPago))) as DiasDeDistancia
        FROM tblJugadores J
        LEFT JOIN tblSedes S ON J.IdSede = S.IdSede
        -- mensualidades del jugador que califican para la temporada
        INNER JOIN tblPagos MEN ON MEN.IdJugador = J.IdJugador AND MEN.Status = 0
        INNER JOIN tblProductos PRM ON MEN.IdProducto = PRM.IdProducto AND PRM.IdTipoProducto = 1
        INNER JOIN tblTemporadas TT ON TT.IdTemporada = ?
        -- cualquier inscripcion del jugador, de cualquier temporada
        INNER JOIN tblPagos INS ON INS.IdJugador = J.IdJugador AND INS.Status = 0
        INNER JOIN tblProductos PRI ON INS.IdProducto = PRI.IdProducto AND PRI.IdTipoProducto = 2
        LEFT JOIN tblTemporadas TI ON TI.IdTemporada = INS.IdTemporada
        WHERE J.Status = 0
          AND (MEN.Anio*100 + MEN.Mes) BETWEEN (YEAR(TT.FechaInicio)*100 + MONTH(TT.FechaInicio))
                                           AND (YEAR(TT.FechaFin)*100 + MONTH(TT.FechaFin))
          AND J.IdJugador IN (${MENSUALIDAD})
          AND J.IdJugador NOT IN (${INSCRIPCION})
        GROUP BY J.IdJugador, J.Jugador, Sede, INS.IdPago, INS.FechaPago,
                 INS.IdTemporada, TI.Temporada, INS.Pago, PRI.Producto
        ORDER BY J.Jugador, DiasDeDistancia
    `, [t, t, t]);

    // Solo la inscripcion mas cercana de cada jugador
    const mejorPorJugador = new Map();
    for (const r of rows) {
        const prev = mejorPorJugador.get(r.IdJugador);
        if (!prev || r.DiasDeDistancia < prev.DiasDeDistancia) mejorPorJugador.set(r.IdJugador, r);
    }
    const mejores = [...mejorPorJugador.values()];

    console.log(`Jugadores sin inscripcion que SI tienen algun pago de inscripcion: ${mejores.length}`);

    console.log('\n=== Distribucion de la distancia en dias ===');
    const cubos = { '0 (mismo dia)': 0, '1-7': 0, '8-30': 0, '31-60': 0, '61-120': 0, '121-365': 0, '>365': 0 };
    mejores.forEach(m => {
        const d = m.DiasDeDistancia;
        if (d === 0) cubos['0 (mismo dia)']++;
        else if (d <= 7) cubos['1-7']++;
        else if (d <= 30) cubos['8-30']++;
        else if (d <= 60) cubos['31-60']++;
        else if (d <= 120) cubos['61-120']++;
        else if (d <= 365) cubos['121-365']++;
        else cubos['>365']++;
    });
    console.table(cubos);

    console.log('\n=== Candidatos mas cercanos (<= 60 dias) ===');
    console.table(mejores.filter(m => m.DiasDeDistancia <= 60).slice(0, 20).map(m => ({
        Jugador: m.Jugador.slice(0, 24), Sede: m.Sede,
        Pago: m.IdPagoInscripcion, Fecha: m.FechaInscripcion,
        Producto: String(m.ProductoInscripcion).slice(0, 28),
        TempActual: `${m.TemporadaInscripcion} ${String(m.NombreTemporadaInsc).slice(0, 18)}`,
        Dias: m.DiasDeDistancia, Monto: m.MontoInscripcion
    })));

    console.log('FIN');
    await pool.end();
}

main().catch(e => { console.error(e); process.exit(1); });
