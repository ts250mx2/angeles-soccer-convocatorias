const fs = require('fs');
const mysql = require('mysql2/promise');

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

    console.log('=== COUNT tblVentas ===');
    const [count] = await connection.query('SELECT COUNT(*) as cnt FROM tblVentas');
    console.log(count);

    console.log('=== FIRST 5 tblVentas ===');
    const [rows] = await connection.query('SELECT * FROM tblVentas LIMIT 5');
    console.log(rows);

    console.log('=== PRODUCTS ===');
    const [products] = await connection.query('SELECT IdProducto, Producto, Precio FROM tblProductos LIMIT 5');
    console.log(products);

    console.log('=== FORMAS DE PAGO (DISTINCT) ===');
    const [formas] = await connection.query('SELECT DISTINCT IdFormaPago, FormaPago FROM tblVentas');
    console.log('Distinct tblVentas formas:', formas);

    await connection.end();
}

main().catch(console.error);
