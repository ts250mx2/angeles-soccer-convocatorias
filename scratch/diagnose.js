const fs = require('fs');
const mysql = require('mysql2/promise');

// Parse .env manually to avoid extra dependencies
const envFile = fs.readFileSync('.env', 'utf-8');
const env = {};
envFile.split('\n').forEach(line => {
    const parts = line.split('=');
    if (parts.length >= 2) {
        env[parts[0].trim()] = parts.slice(1).join('=').trim();
    }
});

async function main() {
    const connection = await mysql.createConnection({
        host: env.DB_HOST,
        user: env.DB_USER,
        password: env.DB_PASSWORD,
        database: env.DB_NAME
    });

    console.log('=== SEDES EN LA BASE DE DATOS ===');
    const [sedes] = await connection.query('SELECT IdSede, Sede FROM tblSedes');
    console.log(sedes);

    const oficinaCentral = sedes.find(s => s.Sede === 'OFICINA CENTRAL');
    const clinic = sedes.find(s => s.Sede === 'CLINICS');

    if (!oficinaCentral || !clinic) {
        console.log('Error: No se encontró OFICINA CENTRAL o CLINIC');
        await connection.end();
        return;
    }

    console.log(`\nOFICINA CENTRAL ID: ${oficinaCentral.IdSede}`);
    console.log(`CLINIC ID: ${clinic.IdSede}`);

    console.log('\n=== PAGOS SIN JOINS COMPLEJOS ===');
    const [pagosRaw] = await connection.query(`
        SELECT P.IdPago, P.Pago, P.FechaPago, P.Recibo, P.IdProducto, P.Status, J.IdJugador, J.Jugador, J.IdSede
        FROM tblPagos P
        INNER JOIN tblJugadores J ON P.IdJugador = J.IdJugador
        WHERE P.IdSedePago = ? AND J.IdSede = ?
    `, [oficinaCentral.IdSede, clinic.IdSede]);
    console.log('Pagos encontrados:', pagosRaw);

    if (pagosRaw.length > 0) {
        for (const p of pagosRaw) {
            console.log(`\n--- Analizando Pago ID: ${p.IdPago} ---`);
            const [prod] = await connection.query('SELECT * FROM tblProductos WHERE IdProducto = ?', [p.IdProducto]);
            console.log('Producto en tblProductos:', prod);

            if (prod.length > 0) {
                const [liga] = await connection.query('SELECT * FROM tblLigas WHERE IdLiga = ?', [prod[0].IdLiga]);
                console.log('Liga en tblLigas:', liga);
            }
        }
    }

    await connection.end();
}

main().catch(console.error);
