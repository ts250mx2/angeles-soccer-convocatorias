/**
 * Aplica un archivo de migrations/ contra la base del .env.
 *
 * Existe porque el proyecto no tiene corredor de migraciones y no siempre está a la
 * mano el cliente `mysql` de línea de comandos: esto usa el mismo mysql2 que ya
 * instala la aplicación y las mismas credenciales del .env, así que no hay nada que
 * configurar.
 *
 *   node scripts/aplicar-migracion.mjs migrations/010-precios-manuales-convocatorias.sql
 *   node scripts/aplicar-migracion.mjs migrations/005-...sql --dry   (solo muestra)
 *
 * Las migraciones del proyecto están escritas para poder correrse dos veces sin hacer
 * daño (CREATE TABLE IF NOT EXISTS, INSERT IGNORE), así que repetir una es inofensivo.
 */
import fs from 'fs';
import path from 'path';
import mysql from 'mysql2/promise';

const [archivo, ...banderas] = process.argv.slice(2);
const dry = banderas.includes('--dry');

if (!archivo) {
    console.error('Uso: node scripts/aplicar-migracion.mjs <archivo.sql> [--dry]');
    process.exit(1);
}
if (!fs.existsSync(archivo)) {
    console.error(`No existe el archivo: ${archivo}`);
    process.exit(1);
}

/** Lee el .env a mano: este script corre fuera de Next, que es quien normalmente lo carga. */
function leeEnv() {
    const ruta = path.resolve('.env');
    if (!fs.existsSync(ruta)) {
        console.error('No se encontró el .env en la carpeta del proyecto.');
        process.exit(1);
    }
    const env = {};
    for (const linea of fs.readFileSync(ruta, 'utf8').split(/\r?\n/)) {
        const m = linea.match(/^\s*([A-Z_0-9]+)\s*=\s*(.*)\s*$/);
        if (m) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
    }
    return env;
}

/**
 * Parte el archivo en sentencias. Se quitan los comentarios `--` antes de cortar por
 * `;` para que un punto y coma dentro de un comentario no parta una sentencia en dos.
 */
function sentencias(sql) {
    const limpio = sql
        .split(/\r?\n/)
        .filter((l) => !l.trim().startsWith('--'))
        .join('\n');
    return limpio
        .split(';')
        .map((s) => s.trim())
        .filter(Boolean);
}

const env = leeEnv();
const partes = sentencias(fs.readFileSync(archivo, 'utf8'));

console.log(`${archivo}: ${partes.length} sentencia(s)${dry ? ' (simulación, no se ejecuta nada)' : ''}\n`);

if (dry) {
    partes.forEach((s, i) => console.log(`--- ${i + 1} ---\n${s}\n`));
    process.exit(0);
}

const conexion = await mysql.createConnection({
    host: env.DB_HOST,
    user: env.DB_USER,
    password: env.DB_PASSWORD,
    database: env.DB_NAME,
});

try {
    for (const [i, sentencia] of partes.entries()) {
        const resumen = sentencia.replace(/\s+/g, ' ').slice(0, 70);
        const [res] = await conexion.query(sentencia);
        const filas = res?.affectedRows;
        console.log(`  ${i + 1}/${partes.length} OK  ${resumen}…${filas !== undefined ? `  (${filas} fila(s))` : ''}`);
    }
    console.log(`\nListo: ${env.DB_NAME} en ${env.DB_HOST}`);
} catch (error) {
    console.error(`\nFalló: ${error.message}`);
    process.exitCode = 1;
} finally {
    await conexion.end();
}
