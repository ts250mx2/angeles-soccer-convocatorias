const mysql = require('mysql2/promise');

// Ejecutar con: node --env-file=.env scratch/check_pagos_jugador.js
const pool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

async function main() {
    const [[temp]] = await pool.query('SELECT IdTemporada, Temporada FROM tblTemporadas WHERE EsActiva = 1');
    console.log('Temporada activa:', temp);
    const t = temp.IdTemporada;

    // 1) Lista de jugadores con FechaInscripcion (replica del route)
    const [players] = await pool.query(`
        SELECT
            J.IdJugador, J.Jugador, J.Categoria, J.Status, J.Beca, J.IdSede,
            COALESCE(S.Sede, J.Sede) as SedeNombre,
            (
                SELECT MIN(CONVERT_TZ(P.FechaPago, '+00:00', '-06:00'))
                FROM tblPagos P
                INNER JOIN tblProductos PR ON P.IdProducto = PR.IdProducto
                WHERE P.IdJugador = J.IdJugador
                  AND P.Status = 0
                  AND PR.IdTipoProducto IN (1, 2)
                  AND P.IdTemporada = ?
            ) as FechaInscripcion
        FROM tblJugadores J
        LEFT JOIN tblSedes S ON J.IdSede = S.IdSede
        WHERE J.IdJugador IN (
            SELECT A.IdJugador FROM tblPagos A
            INNER JOIN tblProductos B ON A.IdProducto = B.IdProducto
            WHERE A.IdTemporada = ? AND B.IdTipoProducto IN (1, 2)
        ) AND J.Status = 0
        ORDER BY SedeNombre, J.Categoria, J.Jugador
        LIMIT 8
    `, [t, t]);
    console.log('\n--- Jugadores inscritos (muestra) ---');
    console.table(players.map(p => ({
        Id: p.IdJugador, Jugador: p.Jugador, Cat: p.Categoria,
        Sede: p.SedeNombre, Inscripcion: p.FechaInscripcion
    })));

    const sinFecha = players.filter(p => !p.FechaInscripcion).length;
    console.log(`Sin FechaInscripcion en la muestra: ${sinFecha} de ${players.length}`);

    // 2) Pagos del primer jugador
    if (players.length > 0) {
        const id = players[0].IdJugador;
        const [pagos] = await pool.query(`
            SELECT
                P.IdPago,
                CONVERT_TZ(P.FechaPago, '+00:00', '-06:00') as FechaPago,
                P.Pago, P.Mes, P.Anio, P.Recibo,
                COALESCE(PR.Producto, 'PRODUCTO ELIMINADO') as Producto,
                PR.IdTipoProducto,
                COALESCE(TP.TipoProducto, '-') as TipoProducto,
                COALESCE(F.FormaPago, 'EFECTIVO') as FormaPago,
                COALESCE(SP.Sede, '-') as SedePago,
                COALESCE(T.Temporada, '-') as Temporada
            FROM tblPagos P
            LEFT JOIN tblProductos PR ON P.IdProducto = PR.IdProducto
            LEFT JOIN tblTiposProductos TP ON PR.IdTipoProducto = TP.IdTipoProducto
            LEFT JOIN tblFormasPago F ON COALESCE(P.IdFormaPago, 1) = F.IdFormaPago
            LEFT JOIN tblSedes SP ON P.IdSedePago = SP.IdSede
            LEFT JOIN tblTemporadas T ON P.IdTemporada = T.IdTemporada
            WHERE P.IdJugador = ? AND P.Status = 0 AND P.IdTemporada = ?
            ORDER BY P.FechaPago DESC
            LIMIT 20
        `, [id, t]);
        console.log(`\n--- Pagos de ${players[0].Jugador} (id ${id}) en temporada ${t} ---`);
        console.table(pagos.map(p => ({
            Recibo: p.Recibo, Fecha: p.FechaPago, Producto: p.Producto,
            Tipo: p.TipoProducto, Mes: p.Mes, Forma: p.FormaPago, Pago: p.Pago
        })));
        console.log('Total:', pagos.reduce((s, p) => s + Number(p.Pago || 0), 0));
    }

    await pool.end();
}

main().catch(e => { console.error(e); process.exit(1); });
