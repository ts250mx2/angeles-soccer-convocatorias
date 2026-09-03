import type { Pool, PoolConnection } from 'mysql2/promise';
import { sqlFactorBecaDeTorneo } from '@/lib/beca-torneo';
import type { ClavePrecio } from '@/lib/convocatorias-precios';

/**
 * La beca de torneo, aplicada a mano.
 *
 * La beca vive en la ficha del jugador (BecaCopas y BecaLigas, ver @/lib/beca-torneo) y
 * antes se aplicaba sola: convocar a un becado le rebajaba el precio en el acto y el
 * sincronizado se lo volvía a rebajar en cada visita. Eso daba por hecho que la beca
 * vale para todos los torneos, y no es así: es una condición general del club que en
 * cada copa o liga se decide si se respeta.
 *
 * Ahora la decisión es explícita y por renglón del detalle: el jugador se convoca al
 * precio de lista y la beca se aplica con el botón de la pantalla. Esta tabla es la
 * memoria de esa decisión —está el renglón, se cobra con beca; no está, se cobra
 * completo— y la consultan los cuatro sitios que calculan un precio, para que todos
 * digan lo mismo.
 *
 * Es hermana de @/lib/convocatorias-precios y se comporta igual en dos cosas: vive en
 * tabla aparte porque tblDetalleConvocatorias la comparte el sistema de escritorio, y
 * mientras la migración no esté aplicada todo sigue funcionando como antes (la beca se
 * aplica sola), en vez de tronar.
 *
 * El precio fijado a mano MANDA sobre esto: si el renglón trae precio manual, aplicar o
 * quitar la beca deja la marca puesta pero no toca el importe. Un precio especial es una
 * decisión más específica que la beca.
 */

/** El pool o una conexión dentro de una transacción. */
type Ejecutor = Pool | PoolConnection;

export const TABLA_BECAS = 'tblConvocatoriasBecas';

const valoresDeClave = (c: ClavePrecio) => [c.idJugador, c.seasonId, c.leagueId, c.categoria, c.color ?? ''];

const CONDICION_CLAVE =
    'IdJugador = ? AND IdTemporada = ? AND IdLiga = ? AND Categoria = ? AND COALESCE(Color, \'\') = ?';

/* Se recuerda solo el caso bueno: mientras falte la tabla se vuelve a mirar, y así
   aplicar la migración surte efecto sin reiniciar el servidor. */
let tablaConfirmada = false;

/** ¿Está aplicada migrations/027-becas-convocatorias-por-boton.sql? */
export async function becasPorBotonDisponibles(db: Ejecutor): Promise<boolean> {
    if (tablaConfirmada) return true;
    const [filas] = (await db.query('SHOW TABLES LIKE ?', [TABLA_BECAS])) as [unknown[], unknown];
    tablaConfirmada = filas.length > 0;
    if (!tablaConfirmada) {
        console.warn(
            `[convocatorias] Falta ${TABLA_BECAS}: aplica migrations/027-becas-convocatorias-por-boton.sql. ` +
            'Mientras tanto, la beca del jugador se sigue aplicando sola al convocar.',
        );
    }
    return tablaConfirmada;
}

/**
 * LEFT JOIN contra la tabla de becas aplicadas. `alias` es el de tblDetalleConvocatorias;
 * la beca está aplicada cuando `<aliasBeca>.IdJugador` no es NULL.
 */
export const joinBecaAplicada = (alias: string, aliasBeca = 'BEC'): string => `
    LEFT JOIN ${TABLA_BECAS} ${aliasBeca}
           ON ${aliasBeca}.IdJugador   = ${alias}.IdJugador
          AND ${aliasBeca}.IdTemporada = ${alias}.IdTemporada
          AND ${aliasBeca}.IdLiga      = ${alias}.IdLiga
          AND ${aliasBeca}.Categoria   = ${alias}.Categoria
          AND ${aliasBeca}.Color       = ${alias}.Color`;

/**
 * Lo que hay que multiplicar al precio de lista, ya considerando si la beca se aplicó.
 *
 * Sin la marca vale 1 —precio completo— aunque el jugador tenga beca en su ficha. Con
 * `disponible` en false se comporta como antes de la migración: la beca se aplica sola.
 */
export const sqlFactorBeca = (
    jugador: string,
    liga: string,
    disponible: boolean,
    aliasBeca = 'BEC',
): string =>
    disponible
        ? `IF(${aliasBeca}.IdJugador IS NULL, 1, ${sqlFactorBecaDeTorneo(jugador, liga)})`
        : sqlFactorBecaDeTorneo(jugador, liga);

/** ¿Este renglón cobra con beca? */
export async function tieneBecaAplicada(db: Ejecutor, clave: ClavePrecio): Promise<boolean> {
    if (!(await becasPorBotonDisponibles(db))) return true;
    const [filas] = (await db.query(
        `SELECT 1 FROM ${TABLA_BECAS} WHERE ${CONDICION_CLAVE} LIMIT 1`,
        valoresDeClave(clave),
    )) as [unknown[], unknown];
    return filas.length > 0;
}

/** Aplica la beca del jugador a este renglón. */
export async function aplicaBeca(db: Ejecutor, clave: ClavePrecio): Promise<void> {
    await db.query(
        `REPLACE INTO ${TABLA_BECAS}
            (IdJugador, IdTemporada, IdLiga, Categoria, Color, FechaAct)
         VALUES (?, ?, ?, ?, ?, NOW())`,
        valoresDeClave(clave),
    );
}

/** Le quita la beca a este renglón: vuelve a cobrar el precio de lista. */
export async function quitaBeca(db: Ejecutor, clave: ClavePrecio): Promise<void> {
    await db.query(`DELETE FROM ${TABLA_BECAS} WHERE ${CONDICION_CLAVE}`, valoresDeClave(clave));
}

/** Olvida las becas de una convocatoria completa (se eliminó, o cambió de color). */
export async function olvidaBecasDeConvocatoria(
    db: Ejecutor,
    seasonId: number | string,
    leagueId: number | string,
    categoria: string,
    color: string,
): Promise<void> {
    if (!(await becasPorBotonDisponibles(db))) return;
    await db.query(
        `DELETE FROM ${TABLA_BECAS}
         WHERE IdTemporada = ? AND IdLiga = ? AND Categoria = ? AND COALESCE(Color, '') = ?`,
        [seasonId, leagueId, categoria, color ?? ''],
    );
}

/** Mueve las becas cuando una convocatoria cambia de color (el color es parte de la llave). */
export async function mueveColorDeBecas(
    db: Ejecutor,
    seasonId: number | string,
    leagueId: number | string,
    categoria: string,
    colorViejo: string,
    colorNuevo: string,
): Promise<void> {
    if (!(await becasPorBotonDisponibles(db))) return;
    await db.query(
        `UPDATE ${TABLA_BECAS} SET Color = ?
         WHERE IdTemporada = ? AND IdLiga = ? AND Categoria = ? AND COALESCE(Color, '') = ?`,
        [colorNuevo ?? '', seasonId, leagueId, categoria, colorViejo ?? ''],
    );
}
