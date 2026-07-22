// node --env-file=.env scratch/check_pagos_cero.js
// SOLO LECTURA. ¿Por que un jugador con pago en CERO (becado) aparece con adeudo?
const mysql = require('mysql2/promise');
const pool = mysql.createPool({
    host: process.env.DB_HOST, user: process.env.DB_USER,
    password: process.env.DB_PASSWORD, database: process.env.DB_NAME, connectionLimit: 4,
});

async function main() {
    const t = 9; // temporada anterior (ya terminada, tiene meses vencidos)

    console.log('=== 1. Pagos con importe CERO por tipo (temporada 9) ===');
    const [ceros] = await pool.query(`
        SELECT PR.IdTipoProducto, COALESCE(TP.TipoProducto,'-') as Tipo,
               COUNT(*) as Pagos, COUNT(DISTINCT P.IdJugador) as Jugadores,
               SUM(P.Mes IS NULL) as MesNulo,
               SUM(P.Mes = 0) as MesCero
        FROM tblPagos P
        INNER JOIN tblProductos PR ON P.IdProducto=PR.IdProducto
        LEFT JOIN tblTiposProductos TP ON PR.IdTipoProducto=TP.IdTipoProducto
        WHERE P.IdTemporada=? AND P.Status=0 AND P.Pago = 0
        GROUP BY PR.IdTipoProducto, TP.TipoProducto ORDER BY Pagos DESC`, [t]);
    console.table(ceros);

    console.log('\n=== 2. Mensualidades cero: su Mes cae en el rango 1-6? ===');
    const [mesesCero] = await pool.query(`
        SELECT P.Mes, P.Anio, COUNT(*) n
        FROM tblPagos P INNER JOIN tblProductos PR ON P.IdProducto=PR.IdProducto
        WHERE P.IdTemporada=? AND P.Status=0 AND P.Pago=0 AND PR.IdTipoProducto=1
        GROUP BY P.Mes, P.Anio ORDER BY P.Mes`, [t]);
    console.table(mesesCero);

    console.log('\n=== 3. Activos marcados DEBE que tienen algun pago en cero ===');
    const [conCero] = await pool.query(`
        SELECT COUNT(*) n FROM tblJugadores J
        WHERE J.Status=0
          AND EXISTS (SELECT 1 FROM tblPagos P INNER JOIN tblProductos PR ON P.IdProducto=PR.IdProducto
                      WHERE P.IdJugador=J.IdJugador AND P.IdTemporada=? AND P.Status=0 AND P.Pago=0
                        AND PR.IdTipoProducto IN (1,2))
          AND (
            J.IdJugador NOT IN (SELECT P2.IdJugador FROM tblPagos P2 INNER JOIN tblProductos PR2 ON P2.IdProducto=PR2.IdProducto
                                WHERE P2.IdTemporada=? AND PR2.IdTipoProducto=2 AND P2.Status=0)
            OR (SELECT COUNT(DISTINCT P3.Mes) FROM tblPagos P3 INNER JOIN tblProductos PR3 ON P3.IdProducto=PR3.IdProducto
                WHERE P3.IdJugador=J.IdJugador AND P3.IdTemporada=? AND PR3.IdTipoProducto=1 AND P3.Status=0
                  AND P3.Mes BETWEEN 1 AND 6) < 6
          )`, [t, t, t]);
    console.log(`Activos con adeudo que SI tienen algun pago en cero: ${conCero[0].n}`);

    console.log('\n=== 4. Muestra concreta: becados con pagos en cero ===');
    const [muestra] = await pool.query(`
        SELECT J.IdJugador, J.Jugador, J.Beca,
            (SELECT COUNT(*) FROM tblPagos P INNER JOIN tblProductos PR ON P.IdProducto=PR.IdProducto
             WHERE P.IdJugador=J.IdJugador AND P.IdTemporada=? AND P.Status=0 AND PR.IdTipoProducto=2) as TieneInsc,
            (SELECT GROUP_CONCAT(DISTINCT CONCAT(P.Mes,'=',P.Pago) ORDER BY P.Mes)
             FROM tblPagos P INNER JOIN tblProductos PR ON P.IdProducto=PR.IdProducto
             WHERE P.IdJugador=J.IdJugador AND P.IdTemporada=? AND P.Status=0 AND PR.IdTipoProducto=1
               AND P.Mes BETWEEN 1 AND 6) as MesesPagados
        FROM tblJugadores J
        WHERE J.Status=0 AND J.Beca LIKE '%100%'
          AND EXISTS (SELECT 1 FROM tblPagos P INNER JOIN tblProductos PR ON P.IdProducto=PR.IdProducto
                      WHERE P.IdJugador=J.IdJugador AND P.IdTemporada=? AND P.Status=0 AND PR.IdTipoProducto IN (1,2))
        LIMIT 10`, [t, t, t]);
    console.table(muestra.map(x => ({ Id:x.IdJugador, Jugador:String(x.Jugador).slice(0,24), Beca:x.Beca,
        Insc:x.TieneInsc, Meses:String(x.MesesPagados).slice(0,60) })));

    console.log('\n=== 5. Becados activos SIN ningun pago en la temporada ===');
    const [[sinNada]] = await pool.query(`
        SELECT COUNT(*) n FROM tblJugadores J
        WHERE J.Status=0 AND J.Beca IS NOT NULL AND J.Beca<>'0' AND J.Beca<>''
          AND NOT EXISTS (SELECT 1 FROM tblPagos P INNER JOIN tblProductos PR ON P.IdProducto=PR.IdProducto
                          WHERE P.IdJugador=J.IdJugador AND P.IdTemporada=? AND P.Status=0 AND PR.IdTipoProducto IN (1,2))`, [t]);
    console.log(`Becados activos sin ningun pago (tipo 1 o 2) en temporada ${t}: ${sinNada.n}`);
    console.log('FIN');
    await pool.end();
}
main().catch(e => { console.error(e); process.exit(1); });
