// node --env-file=.env scratch/check_isabella.js
const mysql = require('mysql2/promise');
const pool = mysql.createPool({
    host: process.env.DB_HOST, user: process.env.DB_USER,
    password: process.env.DB_PASSWORD, database: process.env.DB_NAME, connectionLimit: 4,
});

async function main() {
    console.log('=== Pago recibo 23043 ===');
    const [pago] = await pool.query(`
        SELECT P.IdPago, P.Recibo, P.IdJugador, J.Jugador,
               DATE_FORMAT(P.FechaPago,'%d/%m/%Y') as FechaPago,
               P.Mes, P.Anio, P.Pago, P.Status as StatusPago, P.IdTemporada,
               COALESCE(T.Temporada,'?') as Temporada,
               PR.IdTipoProducto, COALESCE(TP.TipoProducto,'-') as Tipo,
               COALESCE(S.Sede,J.Sede) as Sede, COALESCE(S.EsKeeper,0) as EsKeeper, COALESCE(S.EsClinics,0) as EsClinics,
               J.Status as StatusJugador
        FROM tblPagos P
        INNER JOIN tblJugadores J ON J.IdJugador=P.IdJugador
        LEFT JOIN tblProductos PR ON PR.IdProducto=P.IdProducto
        LEFT JOIN tblTiposProductos TP ON TP.IdTipoProducto=PR.IdTipoProducto
        LEFT JOIN tblTemporadas T ON T.IdTemporada=P.IdTemporada
        LEFT JOIN tblSedes S ON S.IdSede=J.IdSede
        WHERE P.Recibo = '23043'`);
    console.table(pago);

    // Buscar por nombre tambien
    console.log('\n=== Todas las inscripciones (tipo 2) de ISABELLA PADILLA ELIZONDO ===');
    const [ins] = await pool.query(`
        SELECT P.IdPago, P.Recibo, DATE_FORMAT(P.FechaPago,'%d/%m/%Y') as FechaPago,
               P.Pago, P.Status, P.IdTemporada, COALESCE(T.Temporada,'?') as Temporada, J.Status as StatusJug
        FROM tblPagos P
        INNER JOIN tblJugadores J ON J.IdJugador=P.IdJugador
        INNER JOIN tblProductos PR ON PR.IdProducto=P.IdProducto AND PR.IdTipoProducto=2
        LEFT JOIN tblTemporadas T ON T.IdTemporada=P.IdTemporada
        WHERE J.Jugador LIKE '%ISABELLA PADILLA ELIZONDO%'
        ORDER BY P.FechaPago`);
    console.table(ins);

    console.log('\n=== Rangos de temporada 9 y 10 ===');
    const [t] = await pool.query(`
        SELECT IdTemporada, Temporada, DATE_FORMAT(FechaInicio,'%Y-%m-%d') ini,
               DATE_FORMAT(FechaFin,'%Y-%m-%d') fin, EsActiva
        FROM tblTemporadas WHERE IdTemporada IN (9,10)`);
    console.table(t);
    // corte de 2 meses antes del inicio de la 10
    const [[c]] = await pool.query(`
        SELECT DATE_FORMAT(DATE_SUB(FechaInicio, INTERVAL 2 MONTH),'%Y-%m-%d') as corte2meses
        FROM tblTemporadas WHERE IdTemporada=10`);
    console.log('Corte (2 meses antes del inicio de la 10):', c.corte2meses);
    console.log('FIN');
    await pool.end();
}
main().catch(e => { console.error(e); process.exit(1); });
