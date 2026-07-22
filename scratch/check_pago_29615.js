// node --env-file=.env scratch/check_pago_29615.js
const mysql = require('mysql2/promise');
const pool = mysql.createPool({
    host: process.env.DB_HOST, user: process.env.DB_USER,
    password: process.env.DB_PASSWORD, database: process.env.DB_NAME, connectionLimit: 4,
});

async function main() {
    const ID = 29615;

    console.log('=== El pago (buscado por IdPago y por Recibo) ===');
    const [p] = await pool.query(`
        SELECT P.IdPago, P.Recibo, P.IdJugador, J.Jugador,
               DATE_FORMAT(P.FechaPago,'%d/%m/%Y %H:%i') as FechaPago,
               P.Mes, P.Anio, P.Pago, P.Status as StatusPago, P.IdTemporada,
               COALESCE(T.Temporada,'(sin temporada)') as Temporada,
               PR.IdTipoProducto, COALESCE(TP.TipoProducto,'-') as Tipo,
               COALESCE(PR.Producto,'(producto eliminado)') as Producto,
               COALESCE(S.Sede, J.Sede) as Sede, COALESCE(S.EsClinics,0) as EsClinics
        FROM tblPagos P
        INNER JOIN tblJugadores J ON J.IdJugador = P.IdJugador
        LEFT JOIN tblProductos PR ON PR.IdProducto = P.IdProducto
        LEFT JOIN tblTiposProductos TP ON TP.IdTipoProducto = PR.IdTipoProducto
        LEFT JOIN tblTemporadas T ON T.IdTemporada = P.IdTemporada
        LEFT JOIN tblSedes S ON S.IdSede = J.IdSede
        WHERE P.IdPago = ? OR P.Recibo = ?`, [ID, String(ID)]);
    console.table(p.map(x => ({
        IdPago: x.IdPago, Recibo: x.Recibo, Jugador: String(x.Jugador).slice(0,22),
        FechaPago: x.FechaPago, Ampara: `${x.Mes}/${x.Anio}`, Monto: x.Pago,
        StatusPago: x.StatusPago, Temp: `${x.IdTemporada} ${String(x.Temporada).slice(0,18)}`,
        Tipo: `${x.IdTipoProducto} ${x.Tipo}`, Sede: x.Sede,
    })));

    if (!p.length) { console.log('No se encontro'); await pool.end(); return; }

    const idJugador = p[0].IdJugador;

    console.log('\n=== Temporadas y sus rangos ===');
    const [t] = await pool.query(`
        SELECT IdTemporada, Temporada, DATE_FORMAT(FechaInicio,'%Y-%m-%d') ini,
               DATE_FORMAT(FechaFin,'%Y-%m-%d') fin, EsActiva
        FROM tblTemporadas WHERE IdTemporada IN (9,10)`);
    console.table(t);

    console.log(`\n=== TODOS los pagos de mensualidad del jugador ${idJugador} ===`);
    const [all] = await pool.query(`
        SELECT P.IdPago, P.Recibo, DATE_FORMAT(P.FechaPago,'%d/%m/%Y') as Pagado,
               P.Mes, P.Anio, P.Pago, P.Status, P.IdTemporada
        FROM tblPagos P
        INNER JOIN tblProductos PR ON PR.IdProducto=P.IdProducto
        WHERE P.IdJugador = ? AND PR.IdTipoProducto = 1
        ORDER BY P.Anio, P.Mes`, [idJugador]);
    console.table(all.map(x => ({ IdPago:x.IdPago, Recibo:x.Recibo, Pagado:x.Pagado,
        Ampara:`${x.Mes}/${x.Anio}`, Monto:x.Pago, StatusPago:x.Status, Temp:x.IdTemporada })));

    console.log('\n=== Que ve el calculo de adeudo para la temporada 9 (mes>=1 y <=6, IdTemporada=9) ===');
    const [vista] = await pool.query(`
        SELECT P.IdPago, P.Mes, P.Anio, P.Pago, P.Status, P.IdTemporada
        FROM tblPagos P INNER JOIN tblProductos PR ON PR.IdProducto=P.IdProducto
        WHERE P.IdJugador=? AND PR.IdTipoProducto=1 AND P.Status=0
          AND P.IdTemporada=9 AND P.Mes>=1 AND P.Mes<=6`, [idJugador]);
    console.log(`  meses que cuentan como pagados: ${vista.map(v=>v.Mes).join(', ') || '(ninguno)'}`);
    console.log('FIN');
    await pool.end();
}
main().catch(e => { console.error(e); process.exit(1); });
