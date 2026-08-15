/**
 * Fragmentos SQL compartidos para clasificar jugadores en adeudos e inscripciones.
 *
 * Todos asumen la tabla de jugadores con alias `J`. El de keeper recibe el alias de
 * la sede porque en cada consulta cambia (SD / S).
 */

/**
 * Registros "dummy" de venta al público (p.ej. "VENTAS PUBLICO EN GENERAL"): no son
 * jugadores reales, así que se separan de los conteos y se sacan de todo adeudo.
 * Se identifican por el NOMBRE del jugador. Requiere alias J.
 */
export const ES_VENTA_PUBLICO = `UPPER(J.Jugador) LIKE '%VENTA%PUBLIC%'`;

/**
 * Categoría de portero/keeper: cualquier categoría cuyo nombre contenga PORT o KEEP
 * (cubre PORTERO, CLPORTSLT, VERANOKEEP, etc.). Requiere alias J.
 */
export const ES_CATEGORIA_PORTERO =
    `(UPPER(J.Categoria) LIKE '%PORT%' OR UPPER(J.Categoria) LIKE '%KEEP%')`;

/**
 * Jugador "tipo portero": sede keeper (tblSedes.EsKeeper = 1) o categoría de
 * portero/keeper. `sedeAlias` es el alias de la tabla de sedes en esa consulta.
 */
export const esKeeperOPortero = (sedeAlias: string) =>
    `(COALESCE(${sedeAlias}.EsKeeper, 0) = 1 OR ${ES_CATEGORIA_PORTERO})`;

/**
 * Jugador FUERA DE LUGAR en una sede de keepers: está dado de alta en una sede
 * marcada como keeper pero su categoría no es de portero.
 *
 * Una sede de keepers solo debería tener porteros, así que esto es un error de
 * captura, no un caso de negocio. Se saca de los conteos de esa sede (que de otro
 * modo lo contarían como keeper, porque la sede lo es) y se reporta aparte para que
 * alguien lo corrija. `sedeAlias` es el alias de la tabla de sedes en esa consulta.
 */
export const esFueraDeLugarKeeper = (sedeAlias: string) =>
    `(COALESCE(${sedeAlias}.EsKeeper, 0) = 1 AND NOT ${ES_CATEGORIA_PORTERO})`;

/**
 * Categoría de futsal: cualquier categoría cuyo nombre contenga FUTSAL. Requiere J.
 */
export const ES_FUTSAL_CATEGORIA = `UPPER(J.Categoria) LIKE '%FUTSAL%'`;

/**
 * Categoría de clinics: cualquier categoría cuyo nombre contenga CLINICS. Requiere J.
 */
export const ES_CLINICS_CATEGORIA = `UPPER(J.Categoria) LIKE '%CLINICS%'`;

/**
 * Clinics Futsal: jugador en sede futsal (EsFutsal = 1) cuya categoría contiene
 * CLINICS. Estos NO manejan inscripción ni mensualidades (igual que las clinics
 * normales), y se excluyen de todo cálculo de adeudo. `sedeAlias` es el alias de
 * la tabla de sedes en esa consulta.
 */
export const esClinicsFutsal = (sedeAlias: string) =>
    `(COALESCE(${sedeAlias}.EsFutsal, 0) = 1 AND ${ES_CLINICS_CATEGORIA})`;

/**
 * Jugador "tipo futsal" PURO (sin clinics futsal): sede de futsal (tblSedes.EsFutsal = 1)
 * o categoría de futsal, PERO excluyendo a los que son clinics futsal (categoría CLINICS
 * en sede futsal). Se maneja en adeudos/inscripciones como una sede normal (cuenta en los
 * cálculos), pero se separa en un cuadro aparte de los KPIs de totales. `sedeAlias` es
 * el alias de la tabla de sedes en esa consulta.
 */
export const esFutsal = (sedeAlias: string) =>
    `((COALESCE(${sedeAlias}.EsFutsal, 0) = 1 OR ${ES_FUTSAL_CATEGORIA}) AND NOT ${esClinicsFutsal(sedeAlias)})`;

