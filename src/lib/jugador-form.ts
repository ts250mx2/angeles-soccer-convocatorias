import { z } from 'zod';

/**
 * Alta y edición de un jugador: los mismos campos, y las mismas reglas, que el
 * frmCapJugador del sistema de escritorio (AngelesSoccer.vbp).
 *
 * La ficha del jugador se sigue capturando también allá, así que este formulario NO
 * puede inventar su propio formato: si aquí se guardara el género como texto libre o la
 * categoría suelta del equipo, la misma ficha se vería de dos maneras según por dónde se
 * abriera. Por eso los catálogos de abajo son literalmente las listas de aquellos
 * combos —el índice es lo que se guarda en la columna Id*, y el texto en la columna
 * gemela— y están verificados contra lo que hoy tiene la base.
 *
 * Dos cosas que el formulario de escritorio hace mal y que aquí NO se copian:
 *
 *   Su INSERT guarda el nombre de la ESCUELA en la columna Estado (a `Estado` le pasa
 *   `txtEscuela.Text`). Es un copiar y pegar; el UPDATE de al lado sí guarda el estado.
 *   Aquí se guarda el estado en las dos operaciones.
 *
 *   Su INSERT no pone FechaAlta, así que quien se da de alta desde ahí sale sin fecha
 *   en la Lista de Jugadores. Aquí se sella al crear.
 *
 * Todo se guarda en MAYÚSCULAS menos los correos, que es como está capturada la base y
 * como ya lo hace el preregistro público.
 */

/** Una opción de catálogo: el índice que se guarda y el texto que lo acompaña. */
export interface OpcionCatalogo {
    id: number;
    texto: string;
}

/* Los cuatro combos de frmCapJugador, con su MISMO orden: lo que se guarda es la
   posición en la lista (ListIndex), no un id de catálogo. El 0 de los tres primeros es
   "Seleccione...", que en la base significa "sin capturar". */

export const GENEROS: OpcionCatalogo[] = [
    { id: 1, texto: 'MASCULINO' },
    { id: 2, texto: 'FEMENINO' },
];

export const TIPOS_JUGADOR: OpcionCatalogo[] = [
    { id: 1, texto: 'SOCIO' },
    { id: 2, texto: 'EXTERNO' },
];

export const ESQUEMAS_PAGO: OpcionCatalogo[] = [
    { id: 1, texto: 'MENSUAL' },
    { id: 2, texto: 'BIMESTRAL' },
    { id: 3, texto: 'SEMESTRAL' },
    { id: 4, texto: 'BECA 100%' },
];

/* "Vive con" no lleva "Seleccione...": su primera opción ya es un valor bueno, y por eso
   el 0 significa SUS PADRES y no "sin capturar". La columna es varchar y guarda el
   número como texto; así está en la base. */
export const VIVE_CON: OpcionCatalogo[] = [
    { id: 0, texto: 'SUS PADRES' },
    { id: 1, texto: 'SOLO PADRE' },
    { id: 2, texto: 'SOLO MADRE' },
    { id: 3, texto: 'PARIENTES' },
    { id: 4, texto: 'OTRO' },
];

/** El texto que le toca a un índice; cadena vacía si el índice no está en la lista. */
export const textoDeCatalogo = (catalogo: OpcionCatalogo[], id: number | null | undefined): string =>
    catalogo.find((o) => o.id === Number(id))?.texto ?? '';

/**
 * Tope de la foto ya reducida, en caracteres del data URI.
 *
 * La columna es LONGTEXT (ver migrations/019-foto-jugador.sql), así que de ahí no viene
 * el limite: viene de que la foto viaja dentro del JSON de la ficha y se guarda dentro
 * de la base. 400 KB es holgado para un cuadrado de 640 px en WEBP —que ronda los
 * 40-120 KB— y corta a tiempo si algun dia se cuela una imagen sin reducir.
 */
export const MAX_FOTO_JUGADOR = 400_000;

/** Status de tblJugadores, el mismo del sistema de escritorio. */
export const ACTIVO = 0;
export const BAJA = 2;

/* Largos reales de las columnas de tblJugadores. Recortar aquí evita que MySQL trunque
   en silencio y que el usuario se entere hasta volver a abrir la ficha. */
const LARGO = {
    jugador: 245, categoria: 100, entidadNacimiento: 45, curp: 45,
    contactoEmergencia: 245, dorsal: 10, observaciones: 2500,
    persona: 245, telefono: 245, correo: 245, telCasa: 45,
    calle: 245, numero: 45, colonia: 245, codigoPostal: 45,
    municipio: 45, estado: 45, escuela: 45, sede: 245, coach: 245,
    numeroSocio: 45,
} as const;

const texto = (max: number) => z.string().trim().max(max).optional().nullable();

/** Un porcentaje de beca: de 0 a 100, con decimales, y vacío cuenta como 0. */
const porcentaje = z
    .union([z.number(), z.string()])
    .optional()
    .nullable()
    .transform((v) => {
        const n = Number(String(v ?? '').trim() || 0);
        return Number.isFinite(n) ? Math.min(100, Math.max(0, n)) : 0;
    });

const importe = z
    .union([z.number(), z.string()])
    .optional()
    .nullable()
    .transform((v) => {
        const n = Number(String(v ?? '').trim() || 0);
        return Number.isFinite(n) && n >= 0 ? n : 0;
    });

/* Un índice de catálogo. Los opcionales aceptan además el 0 de "Seleccione...", que es
   como la base guarda "todavía no se captura". */
const indice = (catalogo: OpcionCatalogo[], obligatorio: boolean, campo: string) =>
    z.coerce.number().int().refine(
        (v) => (obligatorio ? catalogo.some((o) => o.id === v) : v === 0 || catalogo.some((o) => o.id === v)),
        { message: `Selecciona ${campo}.` },
    );

const RE_FECHA = /^\d{4}-\d{2}-\d{2}$/;
const RE_FOTO = /^data:image\/(?:png|jpeg|webp|gif);base64,[A-Za-z0-9+/]+={0,2}$/;
const RE_CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const correo = z
    .string()
    .trim()
    .max(LARGO.correo)
    .optional()
    .nullable()
    .refine((v) => !v || RE_CORREO.test(v), { message: 'El correo electrónico no es válido.' });

/**
 * Lo que el formulario manda al servidor.
 *
 * Solo son obligatorios los cinco datos que el escritorio también exige antes de
 * guardar: jugador, sede, categoría (que trae su equipo), género y fecha de nacimiento.
 * El resto de la ficha se completa después, y bloquear el alta por un teléfono faltante
 * dejaría fuera del sistema a quien ya está entrenando.
 */
export const jugadorSchema = z.object({
    jugador: z.string().trim().min(1, 'El nombre del jugador es obligatorio.').max(LARGO.jugador),
    idSede: z.coerce.number().int().positive('Selecciona la sede.'),
    sede: texto(LARGO.sede),
    idEquipo: z.coerce.number().int().positive('Selecciona la categoría.'),
    categoria: z.string().trim().min(1, 'Selecciona la categoría.').max(LARGO.categoria),
    coach: texto(LARGO.coach),

    genero: indice(GENEROS, true, 'el género'),
    idTipoJugador: indice(TIPOS_JUGADOR, false, 'el tipo de jugador'),
    idEsquemaPago: indice(ESQUEMAS_PAGO, false, 'el esquema de pago'),
    viveCon: indice(VIVE_CON, false, 'con quién vive'),

    fechaNacimiento: z.string().regex(RE_FECHA, 'La fecha de nacimiento es obligatoria.'),
    entidadNacimiento: texto(LARGO.entidadNacimiento),
    curp: texto(LARGO.curp),
    dorsal: texto(LARGO.dorsal),
    numeroSocio: texto(LARGO.numeroSocio),
    contactoEmergencia: texto(LARGO.contactoEmergencia),
    observaciones: texto(LARGO.observaciones),

    /* Tres becas distintas, y con frecuencia una sin las otras: `Beca` descuenta las
       mensualidades, `BecaCopas` las copas y `BecaLigas` las ligas. Copas y ligas van
       aparte porque se cobran aparte —una copa es un evento suelto, una liga un torneo
       largo— y el club las beca por separado. Ver @/lib/beca-torneo. */
    beca: porcentaje,
    becaCopas: porcentaje,
    becaLigas: porcentaje,
    ingresosMensuales: importe,

    idEscuela: z.coerce.number().int().nonnegative().optional().nullable(),
    escuela: texto(LARGO.escuela),

    padre: texto(LARGO.persona),
    telPadre: texto(LARGO.telefono),
    correoElectronicoPadre: correo,
    madre: texto(LARGO.persona),
    telMadre: texto(LARGO.telefono),
    correoElectronicoMadre: correo,
    telCasa: texto(LARGO.telCasa),

    calle: texto(LARGO.calle),
    numExterior: texto(LARGO.numero),
    numInterior: texto(LARGO.numero),
    colonia: texto(LARGO.colonia),
    codigoPostal: texto(LARGO.codigoPostal),
    municipio: texto(LARGO.municipio),
    estado: texto(LARGO.estado),

    /**
     * La foto, como data URI ('data:image/webp;base64,...'), igual que el escudo de las
     * copas y ligas. Cadena vacía o null = quitarla.
     *
     * Se valida el formato de verdad y no solo el prefijo porque este texto acaba
     * sirviéndose como imagen a un navegador.
     */
    foto: z
        .string()
        .max(MAX_FOTO_JUGADOR, 'La foto es demasiado grande.')
        .optional()
        .nullable()
        .refine((v) => !v || RE_FOTO.test(v), { message: 'El formato de la foto no es válido.' }),

    /** Solo al editar: dar de baja o reactivar desde la misma ficha. */
    status: z.union([z.literal(ACTIVO), z.literal(BAJA)]).optional(),
    /** El motivo de la baja se guarda en ObservacionesVenta, como en el escritorio. */
    motivoBaja: texto(LARGO.observaciones),
});

export type JugadorForm = z.infer<typeof jugadorSchema>;

/** El año que se guarda en AnioNacimiento, tomado de la fecha ya validada. */
export const anioDeFecha = (fecha: string): number => Number(fecha.slice(0, 4));

/** Ficha vacía para el alta. Los combos arrancan sin selección, como en el escritorio. */
export const FICHA_NUEVA = {
    jugador: '', idSede: 0, sede: '', idEquipo: 0, categoria: '', coach: '',
    genero: 0, idTipoJugador: 0, idEsquemaPago: 0, viveCon: 0,
    fechaNacimiento: '', entidadNacimiento: '', curp: '', dorsal: '', numeroSocio: '',
    contactoEmergencia: '', observaciones: '',
    beca: '', becaCopas: '', becaLigas: '', ingresosMensuales: '',
    idEscuela: 0, escuela: '',
    padre: '', telPadre: '', correoElectronicoPadre: '',
    madre: '', telMadre: '', correoElectronicoMadre: '', telCasa: '',
    calle: '', numExterior: '', numInterior: '', colonia: '',
    codigoPostal: '', municipio: '', estado: '',
    foto: null as string | null,
    status: ACTIVO as number, motivoBaja: '',
};

/** La ficha tal como viaja del servidor a la pantalla al abrir a editar. */
export type JugadorFicha = typeof FICHA_NUEVA & { idJugador: number };
