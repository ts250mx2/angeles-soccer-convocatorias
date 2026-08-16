/**
 * Cruce entre los preregistros públicos y la plantilla de jugadores.
 *
 * El preregistro lo captura el interesado desde el QR de su sede (tblJugadoresPre); el
 * alta formal la hace el sistema de escritorio en tblJugadores. Entre las dos tablas no
 * hay llave que sirva: `tblJugadoresPre.IdJugador` existe, pero llega en 0 en TODOS los
 * registros de producción, así que la relación hay que deducirla.
 *
 * Las reglas, de más a menos confiable:
 *   1. `IdJugador > 0`             → el escritorio ya selló la conversión.
 *   2. Mismo nombre completo       → el alta se hizo, pero sin sellar el preregistro.
 *   3. Nombre parecido y el MISMO  → el mismo niño capturado con una variante del
 *      día de nacimiento              nombre (un apellido cambiado o añadido).
 *   4. Mismo teléfono o correo     → todavía no es jugador, pero la familia ya está en
 *      de un tutor                   la academia (un hermano): prospecto tibio.
 *   5. Nada                        → prospecto sin capturar. Es lo accionable del reporte.
 *
 * El cruce se hace en memoria y no en SQL a propósito. tblJugadores guarda el nombre
 * completo en una sola columna —`Nombre`/`ApellidoPaterno` vienen NULL en el 97% de las
 * filas— y los teléfonos con formato libre, así que hay que normalizar antes de
 * comparar; además, cruzarlo en SQL obliga a un producto cartesiano que crece con las
 * dos tablas, mientras que indexar en memoria es lineal.
 */

/** Máximo de familiares que viaja al navegador por preregistro. */
const MAX_FAMILIARES = 8;

/** Un teléfono más corto que esto no identifica a nadie: no se indexa. */
const DIGITOS_TELEFONO = 10;

/**
 * Palabras que deben coincidir para aceptar un nombre parecido. Dos —el nombre de pila
 * y un apellido— bastan porque la regla exige además el mismo día de nacimiento: sin
 * esa condición, dos hermanos con el mismo apellido se confundirían entre sí.
 */
const TOKENS_EN_COMUN = 2;

export type Vinculo = 'vinculado' | 'mismo-nombre' | 'probable' | 'familiar' | 'sin-relacion';

/** Fila de tblJugadoresPre tal como la pide la consulta del reporte. */
export interface PreregistroRaw {
    IdJugadorPre: number;
    JugadorPre: string | null;
    /** 'YYYY-MM-DD': la consulta la formatea para que el navegador no la desplace. */
    FechaNacimiento: string | null;
    Edad: number | null;
    Genero: number | null;
    GeneroDesc: string | null;
    CURP: string | null;
    ContactoEmergencia: string | null;
    Padre: string | null;
    TelPadre: string | null;
    CorreoElectronicoPadre: string | null;
    Madre: string | null;
    TelMadre: string | null;
    CorreoElectronicoMadre: string | null;
    Calle: string | null;
    NumExterior: string | null;
    NumInterior: string | null;
    Colonia: string | null;
    CodigoPostal: string | null;
    Municipio: string | null;
    Estado: string | null;
    Escuela: string | null;
    Observaciones: string | null;
    /** 'YYYY-MM-DD HH:mm'. */
    FechaAlta: string | null;
    IdSede: number | null;
    Sede: string | null;
    /** Vínculo explícito del escritorio. 0 = todavía no se convirtió. */
    IdJugadorVinculado: number;
}

/** Jugador de la plantilla, con lo justo para cruzarlo y para mostrarlo. */
export interface JugadorRaw {
    IdJugador: number;
    Jugador: string | null;
    Status: number | null;
    Sede: string | null;
    Categoria: string | null;
    /** 'YYYY-MM-DD'. */
    FechaNacimiento: string | null;
    /** 'YYYY-MM-DD'. */
    FechaAlta: string | null;
    TelPadre: string | null;
    TelMadre: string | null;
    CorreoElectronicoPadre: string | null;
    CorreoElectronicoMadre: string | null;
}

/** Jugador ya resuelto, listo para pintarse junto al preregistro. */
export interface JugadorRelacionado {
    IdJugador: number;
    Jugador: string;
    /** 0 = activo, 2 = baja (mismo criterio que el resto del sistema). */
    Status: number;
    Sede: string | null;
    Categoria: string | null;
    FechaAlta: string | null;
    /** ¿Coincide también la fecha de nacimiento? Sube la confianza del homónimo. */
    MismaFecha: boolean;
}

export interface FilaPreregistro extends PreregistroRaw {
    Vinculo: Vinculo;
    /** Jugador de la relación principal (vínculo explícito u homónimo). */
    Jugador: JugadorRelacionado | null;
    /** Homónimos adicionales: el escritorio tiene nombres repetidos. */
    Homonimos: number;
    /** Hermanos o familiares detectados por contacto del tutor. */
    Familiares: JugadorRelacionado[];
    /** Cuántos hay en total, aunque `Familiares` venga recortado. */
    FamiliaresTotal: number;
    /** Otro preregistro con el mismo nombre y fecha de nacimiento. */
    Duplicado: boolean;
}

const sinAcentos = (valor: string): string =>
    valor.normalize('NFD').replace(/[\u0300-\u036f]/g, '');

/** Nombre comparable: sin acentos, en mayúsculas y sin dobles espacios ni signos. */
export function normalizaNombre(valor: string | null): string {
    if (!valor) return '';
    return sinAcentos(valor)
        .toUpperCase()
        .replace(/[^A-Z0-9 ]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

/**
 * Teléfono comparable. Se capturan con espacios, guiones y a veces con lada de país,
 * así que se comparan solo los últimos diez dígitos, que son los que identifican la
 * línea en México.
 */
export function normalizaTelefono(valor: string | null): string {
    const digitos = (valor ?? '').replace(/\D/g, '');
    if (digitos.length < DIGITOS_TELEFONO) return '';
    return digitos.slice(-DIGITOS_TELEFONO);
}

export function normalizaCorreo(valor: string | null): string {
    return (valor ?? '').trim().toLowerCase();
}

/** Claves de contacto de un tutor, con prefijo para que un teléfono no choque con un correo. */
function clavesDeContacto(
    telefonos: (string | null)[],
    correos: (string | null)[],
): string[] {
    const claves = [
        ...telefonos.map((t) => normalizaTelefono(t)).filter(Boolean).map((t) => `tel:${t}`),
        ...correos.map((c) => normalizaCorreo(c)).filter(Boolean).map((c) => `mail:${c}`),
    ];
    return [...new Set(claves)];
}

function agrega<T>(indice: Map<string, T[]>, clave: string, valor: T): void {
    if (!clave) return;
    const actuales = indice.get(clave);
    if (!actuales) {
        indice.set(clave, [valor]);
        return;
    }
    if (!actuales.includes(valor)) actuales.push(valor);
}

function aRelacionado(jugador: JugadorRaw, fechaPre: string | null): JugadorRelacionado {
    return {
        IdJugador: jugador.IdJugador,
        Jugador: jugador.Jugador ?? '',
        Status: jugador.Status ?? 0,
        Sede: jugador.Sede,
        Categoria: jugador.Categoria,
        FechaAlta: jugador.FechaAlta,
        MismaFecha: Boolean(fechaPre) && jugador.FechaNacimiento === fechaPre,
    };
}

/**
 * De varios homónimos, el más creíble: primero el que además nació el mismo día,
 * luego el que sigue activo y, a igualdad, el alta más reciente.
 */
function mejorHomonimo(candidatos: JugadorRaw[], fechaPre: string | null): JugadorRaw {
    const puntos = (j: JugadorRaw) =>
        (fechaPre && j.FechaNacimiento === fechaPre ? 2 : 0) + ((j.Status ?? 0) === 0 ? 1 : 0);
    return [...candidatos].sort((a, b) => puntos(b) - puntos(a) || b.IdJugador - a.IdJugador)[0];
}

/** Activos primero y, a igualdad, el alta más reciente. */
function ordenaFamiliares(a: JugadorRelacionado, b: JugadorRelacionado): number {
    if ((a.Status === 0 ? 0 : 1) !== (b.Status === 0 ? 0 : 1)) return a.Status === 0 ? -1 : 1;
    return b.IdJugador - a.IdJugador;
}

interface Indices {
    porId: Map<number, JugadorRaw>;
    porNombre: Map<string, JugadorRaw[]>;
    porContacto: Map<string, JugadorRaw[]>;
    porNacimiento: Map<string, JugadorRaw[]>;
}

function construyeIndices(jugadores: JugadorRaw[]): Indices {
    const porId = new Map<number, JugadorRaw>();
    const porNombre = new Map<string, JugadorRaw[]>();
    const porContacto = new Map<string, JugadorRaw[]>();
    const porNacimiento = new Map<string, JugadorRaw[]>();

    for (const jugador of jugadores) {
        porId.set(jugador.IdJugador, jugador);
        agrega(porNombre, normalizaNombre(jugador.Jugador), jugador);
        agrega(porNacimiento, jugador.FechaNacimiento ?? '', jugador);
        const claves = clavesDeContacto(
            [jugador.TelPadre, jugador.TelMadre],
            [jugador.CorreoElectronicoPadre, jugador.CorreoElectronicoMadre],
        );
        for (const clave of claves) agrega(porContacto, clave, jugador);
    }

    return { porId, porNombre, porContacto, porNacimiento };
}

/**
 * Jugadores que nacieron el mismo día y llevan un nombre parecido: mismo nombre de pila
 * y al menos `TOKENS_EN_COMUN` palabras compartidas.
 *
 * Cubre el caso real de la academia: el mismo niño capturado dos veces con el apellido
 * de la madre cambiado, con un apellido compuesto partido, o con una letra de menos.
 * La fecha de nacimiento exacta es la que sostiene la regla; sin ella, "parecido" sería
 * indistinguible de "hermano".
 */
function candidatosParecidos(
    pre: PreregistroRaw,
    porNacimiento: Map<string, JugadorRaw[]>,
): JugadorRaw[] {
    if (!pre.FechaNacimiento) return [];
    const palabras = normalizaNombre(pre.JugadorPre).split(' ').filter(Boolean);
    if (palabras.length < TOKENS_EN_COMUN) return [];

    return (porNacimiento.get(pre.FechaNacimiento) ?? []).filter((jugador) => {
        const suyas = normalizaNombre(jugador.Jugador).split(' ').filter(Boolean);
        if (suyas[0] !== palabras[0]) return false;
        return palabras.filter((palabra) => suyas.includes(palabra)).length >= TOKENS_EN_COMUN;
    });
}

/** Preregistros que se repiten entre sí (mismo nombre y misma fecha de nacimiento). */
function clavesDuplicadas(preregistros: PreregistroRaw[]): Set<string> {
    const vistas = new Map<string, number>();
    for (const pre of preregistros) {
        const clave = `${normalizaNombre(pre.JugadorPre)}|${pre.FechaNacimiento ?? ''}`;
        vistas.set(clave, (vistas.get(clave) ?? 0) + 1);
    }
    return new Set([...vistas].filter(([, veces]) => veces > 1).map(([clave]) => clave));
}

/** Resuelve la relación de cada preregistro con la plantilla de jugadores. */
export function cruzaPreregistros(
    preregistros: PreregistroRaw[],
    jugadores: JugadorRaw[],
): FilaPreregistro[] {
    const { porId, porNombre, porContacto, porNacimiento } = construyeIndices(jugadores);
    const duplicadas = clavesDuplicadas(preregistros);

    return preregistros.map((pre) => {
        const nombre = normalizaNombre(pre.JugadorPre);
        const homonimos = porNombre.get(nombre) ?? [];
        // Buscar parecidos solo tiene sentido cuando no hay un nombre idéntico.
        const parecidos = homonimos.length > 0 ? [] : candidatosParecidos(pre, porNacimiento);

        // 1) Vínculo explícito del escritorio; 2) homónimo; 3) nombre parecido.
        const vinculado = pre.IdJugadorVinculado > 0 ? porId.get(pre.IdJugadorVinculado) : undefined;
        const coincidencias = homonimos.length > 0 ? homonimos : parecidos;
        const principal =
            vinculado ?? (coincidencias.length > 0 ? mejorHomonimo(coincidencias, pre.FechaNacimiento) : undefined);

        /* Un familiar es alguien de la misma casa que NO es este jugador: se descartan
           el principal y cualquier coincidencia de nombre, para que un hermano no se
           confunda con la conversión del propio preregistro. */
        const excluidos = new Set<number>([
            ...(principal ? [principal.IdJugador] : []),
            ...coincidencias.map((j) => j.IdJugador),
        ]);
        const claves = clavesDeContacto(
            [pre.TelPadre, pre.TelMadre],
            [pre.CorreoElectronicoPadre, pre.CorreoElectronicoMadre],
        );
        const familiares = [
            ...new Map(
                claves
                    .flatMap((clave) => porContacto.get(clave) ?? [])
                    .filter((j) => !excluidos.has(j.IdJugador))
                    .map((j) => [j.IdJugador, aRelacionado(j, pre.FechaNacimiento)] as const),
            ).values(),
        ].sort(ordenaFamiliares);

        const vinculo: Vinculo = vinculado
            ? 'vinculado'
            : homonimos.length > 0
              ? 'mismo-nombre'
              : parecidos.length > 0
                ? 'probable'
                : familiares.length > 0
                  ? 'familiar'
                  : 'sin-relacion';

        return {
            ...pre,
            Vinculo: vinculo,
            Jugador: principal ? aRelacionado(principal, pre.FechaNacimiento) : null,
            Homonimos: homonimos.length,
            Familiares: familiares.slice(0, MAX_FAMILIARES),
            FamiliaresTotal: familiares.length,
            Duplicado: duplicadas.has(`${nombre}|${pre.FechaNacimiento ?? ''}`),
        };
    });
}

/**
 * ¿El preregistro terminó siendo jugador? Sellado, por nombre idéntico o por nombre
 * parecido con el mismo día de nacimiento: las tres formas cuentan como conversión,
 * porque en las tres el niño ya está en la plantilla.
 */
export const esConvertido = (fila: FilaPreregistro): boolean =>
    fila.Vinculo === 'vinculado' || fila.Vinculo === 'mismo-nombre' || fila.Vinculo === 'probable';
