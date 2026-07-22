// node --env-file=.env scratch/check_movimientos.js
// SOLO LECTURA. (1) becados subset de inscritos  (2) consulta de movimientos.
const mysql = require('mysql2/promise');
const pool = mysql.createPool({
    host: process.env.DB_HOST, user: process.env.DB_USER,
    password: process.env.DB_PASSWORD, database: process.env.DB_NAME, connectionLimit: 4,
});

const INSC = `
    SELECT A.IdJugador FROM tblPagos A
    INNER JOIN tblProductos B ON A.IdProducto=B.IdProducto
    WHERE A.IdTemporada=? AND B.IdTipoProducto=2 AND A.Status=0`;

async function main() {
    const t = 10;

    console.log('=== (1) becados subset de inscritos ===');
    const [[r]] = await pool.query(`
        SELECT
          COUNT(CASE WHEN J.Status=0 AND INS.IdJugador IS NOT NULL THEN 1 END) as Inscritos,
          COUNT(CASE WHEN J.Status=0 AND INS.IdJugador IS NOT NULL
                      AND J.Beca IS NOT NULL AND J.Beca<>'0' AND J.Beca<>'' THEN 1 END) as BecadosDentro,
          COUNT(CASE WHEN J.Status=0 AND INS.IdJugador IS NULL
                      AND J.Beca IS NOT NULL AND J.Beca<>'0' AND J.Beca<>'' THEN 1 END) as BecadosFuera
        FROM tblJugadores J
        LEFT JOIN (SELECT DISTINCT IdJugador FROM (${INSC}) I) INS ON INS.IdJugador=J.IdJugador
    `, [t]);
    console.log(`Inscritos ${r.Inscritos} | becados DENTRO de inscritos ${r.BecadosDentro} | becados activos SIN inscripcion ${r.BecadosFuera}`);
    console.log(`-> la nota "incluye becados" es correcta: los ${r.BecadosDentro} becados estan contados dentro de Inscritos\n`);

    console.log('=== (2) movimientos de una muestra de inscritos ===');
    const [jug] = await pool.query(`
        SELECT J.IdJugador, J.Jugador FROM tblJugadores J
        WHERE J.Status=0 AND J.IdJugador IN (${INSC}) ORDER BY J.Jugador LIMIT 5`, [t]);
    const ids = jug.map(j => j.IdJugador);
    console.log(`Jugadores muestra: ${ids.join(', ')}`);

    const ph = ids.map(()=>'?').join(',');
    const [movs] = await pool.query(`
        SELECT J.IdJugador, J.Jugador, P.IdPago, P.Recibo,
            DATE_FORMAT(P.FechaPago,'%d/%m/%Y %H:%i') as FechaPago,
            P.Pago, P.Mes, P.Anio,
            COALESCE(PR.Producto,'ELIMINADO') as Producto,
            PR.IdTipoProducto, COALESCE(TP.TipoProducto,'-') as TipoProducto,
            COALESCE(F.FormaPago,'EFECTIVO') as FormaPago
        FROM tblPagos P
        INNER JOIN tblJugadores J ON J.IdJugador=P.IdJugador
        LEFT JOIN tblProductos PR ON P.IdProducto=PR.IdProducto
        LEFT JOIN tblTiposProductos TP ON PR.IdTipoProducto=TP.IdTipoProducto
        LEFT JOIN tblFormasPago F ON COALESCE(P.IdFormaPago,1)=F.IdFormaPago
        INNER JOIN tblTemporadas TT ON TT.IdTemporada=?
        WHERE P.IdJugador IN (${ph}) AND P.Status=0
          AND ((PR.IdTipoProducto=1 AND P.Anio IS NOT NULL AND P.Mes BETWEEN 1 AND 12
                AND (P.Anio*100+P.Mes) BETWEEN (YEAR(TT.FechaInicio)*100+MONTH(TT.FechaInicio))
                                           AND (YEAR(TT.FechaFin)*100+MONTH(TT.FechaFin)))
            OR (COALESCE(PR.IdTipoProducto,0)<>1 AND P.IdTemporada=?))
        ORDER BY J.Jugador, P.FechaPago`, [t, ...ids, t]);

    console.log(`Movimientos encontrados: ${movs.length}`);
    console.table(movs.slice(0,12).map(m => ({
        Jugador: m.Jugador.slice(0,22), Recibo: m.Recibo, Fecha: m.FechaPago,
        Producto: String(m.Producto).slice(0,24), Tipo: m.TipoProducto,
        Mes: m.Mes ? `${m.Mes}/${m.Anio}` : '-', Pago: m.Pago
    })));
    const conMov = new Set(movs.map(m=>m.IdJugador));
    console.log(`Jugadores con movimientos: ${conMov.size} de ${ids.length} (los que no tienen saldran como SIN MOVIMIENTOS)`);
    console.log(`Total muestra: ${movs.reduce((s,m)=>s+Number(m.Pago||0),0)}`);
    console.log('FIN');
    await pool.end();
}
main().catch(e => { console.error(e); process.exit(1); });
