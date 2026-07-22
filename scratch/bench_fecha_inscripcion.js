// node --env-file=.env scratch/bench_fecha_inscripcion.js
// Verifica las consultas finales de los routes (LEFT JOIN agregado + DATE_FORMAT, sin CONVERT_TZ).
const mysql = require('mysql2/promise');

const pool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    connectionLimit: 4,
});

const TEMPORADA_SUB = `
    SELECT A.IdJugador FROM tblPagos A
    INNER JOIN tblProductos B ON A.IdProducto = B.IdProducto
    WHERE A.IdTemporada = ? AND B.IdTipoProducto IN (1, 2)
`;

const PLAYERS = `
    SELECT
        J.IdJugador, J.Jugador, J.Categoria, J.Status, J.Beca, J.IdSede,
        COALESCE(S.Sede, J.Sede) as SedeNombre,
        FI.FechaInscripcion
    FROM tblJugadores J
    LEFT JOIN tblSedes S ON J.IdSede = S.IdSede
    LEFT JOIN (
        SELECT
            P.IdJugador,
            DATE_FORMAT(MIN(P.FechaPago), '%d/%m/%Y') as FechaInscripcion
        FROM tblPagos P
        INNER JOIN tblProductos PR ON P.IdProducto = PR.IdProducto
        WHERE P.Status = 0 AND PR.IdTipoProducto IN (1, 2) AND P.IdTemporada = ?
        GROUP BY P.IdJugador
    ) FI ON FI.IdJugador = J.IdJugador
    WHERE J.Status = 0 AND J.IdJugador IN (${TEMPORADA_SUB})
    ORDER BY SedeNombre ASC, J.Categoria ASC, J.Jugador ASC
    LIMIT 2000
`;

const PAGOS = `
    SELECT
        P.IdPago,
        DATE_FORMAT(P.FechaPago, '%d/%m/%Y %H:%i') as FechaPago,
        DATE_FORMAT(P.FechaPago, '%Y-%m-%d %H:%i:%s') as FechaOrden,
        P.Pago, P.Mes, P.Anio, P.Recibo,
        COALESCE(PR.Producto, 'PRODUCTO ELIMINADO') as Producto,
        PR.IdTipoProducto,
        COALESCE(TP.TipoProducto, '-') as TipoProducto,
        COALESCE(F.FormaPago, 'EFECTIVO') as FormaPago,
        COALESCE(SP.Sede, '-') as SedePago
    FROM tblPagos P
    LEFT JOIN tblProductos PR ON P.IdProducto = PR.IdProducto
    LEFT JOIN tblTiposProductos TP ON PR.IdTipoProducto = TP.IdTipoProducto
    LEFT JOIN tblFormasPago F ON COALESCE(P.IdFormaPago, 1) = F.IdFormaPago
    LEFT JOIN tblSedes SP ON P.IdSedePago = SP.IdSede
    WHERE P.IdJugador = ? AND P.Status = 0 AND P.IdTemporada = ?
    ORDER BY P.FechaPago DESC
    LIMIT 1000
`;

async function main() {
    const t = 10;

    let t0 = Date.now();
    const [players] = await pool.query(PLAYERS, [t, t]);
    console.log(`PLAYERS: ${Date.now() - t0} ms · ${players.length} filas · sin fecha: ${players.filter(p => !p.FechaInscripcion).length}`);
    console.table(players.slice(0, 5).map(p => ({
        Id: p.IdJugador, Jugador: p.Jugador, Sede: p.SedeNombre, Inscripcion: p.FechaInscripcion
    })));

    const id = players[0].IdJugador;
    t0 = Date.now();
    const [pagos] = await pool.query(PAGOS, [id, t]);
    console.log(`PAGOS (${players[0].Jugador}): ${Date.now() - t0} ms · ${pagos.length} filas`);
    console.table(pagos.slice(0, 5).map(p => ({
        Recibo: p.Recibo, Fecha: p.FechaPago, Producto: p.Producto, Tipo: p.TipoProducto, Pago: p.Pago
    })));
    console.log('Total:', pagos.reduce((s, p) => s + Number(p.Pago || 0), 0));
    console.log('FIN');

    await pool.end();
}

main().catch(e => { console.error(e); process.exit(1); });
