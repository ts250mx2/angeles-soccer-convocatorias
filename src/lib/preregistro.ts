/**
 * Las reglas de un preregistro de jugador, sin base de datos de por medio.
 *
 * Hay DOS puertas para la misma fila de `tblJugadoresPre`: el formulario público del QR
 * de la sede (`/preregistro/<uuid>`, sin login, lo llena la familia) y la captura desde
 * Plantilla de Equipos, que hace la recepción con el niño enfrente. Las dos tienen que
 * aceptar y rechazar lo mismo: si una admitiera una edad o un correo que la otra no, el
 * mismo dato entraría o no según por dónde se capturó, y después nadie sabría explicar
 * por qué hay preregistros de veinte años.
 *
 * Este archivo NO toca la base a propósito: así lo puede importar también el navegador,
 * que necesita los mismos límites para avisar ANTES de mandar. El alta en sí vive en
 * `@/lib/preregistro-alta`, que sí abre conexión y por eso solo corre en el servidor.
 *
 * Lo que NO se decide aquí es el DESTINO: la sede sale del UUID o del equipo elegido, y
 * la categoría solo existe en la captura interna. Ninguna de las dos se toma del cuerpo
 * de la petición; ver `@/lib/preregistro-alta`.
 */

/** Edad mínima y máxima que acepta un preregistro. Fuera de ahí no es un niño de la academia. */
export const EDAD_MINIMA = 3;
export const EDAD_MAXIMA = 18;

export const esCorreo = (valor: string): boolean => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(valor);

/** Los campos que capturan las dos puertas. Todo llega como texto y sin confiar en nada. */
export interface CamposPreregistro {
    Nombre?: unknown;
    ApellidoPaterno?: unknown;
    ApellidoMaterno?: unknown;
    FechaNacimiento?: unknown;
    EntidadNacimiento?: unknown;
    Genero?: unknown;
    CURP?: unknown;
    ContactoEmergencia?: unknown;
    Padre?: unknown;
    TelPadre?: unknown;
    CorreoElectronicoPadre?: unknown;
    Madre?: unknown;
    TelMadre?: unknown;
    CorreoElectronicoMadre?: unknown;
    Calle?: unknown;
    NumExterior?: unknown;
    NumInterior?: unknown;
    Colonia?: unknown;
    CodigoPostal?: unknown;
    Municipio?: unknown;
    Estado?: unknown;
    Escuela?: unknown;
    IdEscuela?: unknown;
    Observaciones?: unknown;
}

/** El preregistro ya normalizado, listo para escribirse tal cual. */
export interface ValoresPreregistro {
    jugadorPre: string;
    nombre: string;
    apellidoPaterno: string;
    apellidoMaterno: string | null;
    /** 'YYYY-MM-DD': un día del calendario, no un instante. */
    fechaNacimiento: string;
    entidadNacimiento: string | null;
    genero: number;
    generoDesc: string;
    curp: string | null;
    contactoEmergencia: string | null;
    padre: string | null;
    telPadre: string | null;
    correoPadre: string | null;
    madre: string | null;
    telMadre: string | null;
    correoMadre: string | null;
    calle: string | null;
    numExterior: string | null;
    numInterior: string | null;
    colonia: string | null;
    codigoPostal: string | null;
    municipio: string | null;
    estado: string | null;
    escuela: string | null;
    idEscuela: number | null;
    observaciones: string | null;
}

export type Validacion =
    | { ok: false; message: string }
    | { ok: true; valores: ValoresPreregistro };

/** Texto recortado a lo que aguanta la columna. Vacío cuenta como ausente. */
const str = (valor: unknown, max: number): string | null => {
    if (valor === undefined || valor === null) return null;
    const s = String(valor).trim();
    return s ? s.slice(0, max) : null;
};

/* Todas las capturas se guardan en MAYÚSCULAS, excepto los correos electrónicos: así
   están los nombres en el resto de la base y así los compara el cruce con la plantilla. */
const up = (valor: unknown, max: number): string | null => {
    const s = str(valor, max);
    return s ? s.toUpperCase() : null;
};

/** Años cumplidos a día de hoy, o null si la fecha no se entiende. */
export function calculaEdad(fecha: string): number | null {
    const nacimiento = new Date(fecha);
    if (isNaN(nacimiento.getTime())) return null;
    const hoy = new Date();
    let edad = hoy.getFullYear() - nacimiento.getFullYear();
    const meses = hoy.getMonth() - nacimiento.getMonth();
    if (meses < 0 || (meses === 0 && hoy.getDate() < nacimiento.getDate())) edad--;
    return edad;
}

const dosDigitos = (n: number): string => String(n).padStart(2, '0');

const aTexto = (d: Date): string =>
    `${d.getFullYear()}-${dosDigitos(d.getMonth() + 1)}-${dosDigitos(d.getDate())}`;

/**
 * El rango que aceptan los campos de fecha del formulario, para que el calendario ni
 * siquiera ofrezca un día que el servidor va a rechazar.
 */
export function limitesNacimiento(hoy = new Date()): { min: string; max: string } {
    return {
        min: aTexto(new Date(hoy.getFullYear() - (EDAD_MAXIMA + 1), hoy.getMonth(), hoy.getDate() + 1)),
        max: aTexto(new Date(hoy.getFullYear() - EDAD_MINIMA, hoy.getMonth(), hoy.getDate())),
    };
}

/**
 * Valida y normaliza lo capturado. Devuelve el primer problema encontrado, con el texto
 * que se le enseña a quien captura: son mensajes de pantalla, no códigos de error.
 */
export function validaPreregistro(campos: CamposPreregistro): Validacion {
    const nombre = up(campos.Nombre, 145);
    const apellidoPaterno = up(campos.ApellidoPaterno, 145);
    if (!nombre || !apellidoPaterno) {
        return { ok: false, message: 'Nombre y Apellido Paterno son obligatorios' };
    }

    const fechaNacimiento = str(campos.FechaNacimiento, 10);
    if (!fechaNacimiento) {
        return { ok: false, message: 'La fecha de nacimiento es obligatoria' };
    }
    const edad = calculaEdad(fechaNacimiento);
    if (edad === null) {
        return { ok: false, message: 'Fecha de nacimiento inválida' };
    }
    if (edad < EDAD_MINIMA || edad > EDAD_MAXIMA) {
        return { ok: false, message: `La edad debe estar entre ${EDAD_MINIMA} y ${EDAD_MAXIMA} años` };
    }

    const genero = Number(campos.Genero);
    if (genero !== 1 && genero !== 2) {
        return { ok: false, message: 'Selecciona un género válido' };
    }

    const codigoPostal = str(campos.CodigoPostal, 5);
    if (codigoPostal && !/^\d{5}$/.test(codigoPostal)) {
        return { ok: false, message: 'El código postal debe tener 5 dígitos' };
    }

    const correoPadre = str(campos.CorreoElectronicoPadre, 245);
    if (correoPadre && !esCorreo(correoPadre)) {
        return { ok: false, message: 'Correo del padre inválido' };
    }
    const correoMadre = str(campos.CorreoElectronicoMadre, 245);
    if (correoMadre && !esCorreo(correoMadre)) {
        return { ok: false, message: 'Correo de la madre inválido' };
    }

    const apellidoMaterno = up(campos.ApellidoMaterno, 145);
    /* El nombre completo va también en su propia columna porque es como lo lee el sistema
       de escritorio y como lo cruza el reporte contra la plantilla. */
    const jugadorPre = [nombre, apellidoPaterno, apellidoMaterno]
        .filter(Boolean)
        .join(' ')
        .replace(/\s+/g, ' ')
        .slice(0, 245);

    const idEscuela = campos.IdEscuela ? Number(campos.IdEscuela) : null;

    return {
        ok: true,
        valores: {
            jugadorPre,
            nombre,
            apellidoPaterno,
            apellidoMaterno,
            fechaNacimiento,
            entidadNacimiento: up(campos.EntidadNacimiento, 45),
            genero,
            generoDesc: genero === 1 ? 'MASCULINO' : 'FEMENINO',
            curp: up(campos.CURP, 45),
            contactoEmergencia: up(campos.ContactoEmergencia, 245),
            padre: up(campos.Padre, 245),
            telPadre: up(campos.TelPadre, 245),
            correoPadre,
            madre: up(campos.Madre, 245),
            telMadre: up(campos.TelMadre, 245),
            correoMadre,
            calle: up(campos.Calle, 245),
            numExterior: up(campos.NumExterior, 45),
            numInterior: up(campos.NumInterior, 45),
            colonia: up(campos.Colonia, 245),
            codigoPostal,
            municipio: up(campos.Municipio, 45),
            estado: up(campos.Estado, 45),
            escuela: up(campos.Escuela, 245),
            idEscuela: Number.isFinite(idEscuela as number) && (idEscuela as number) > 0 ? idEscuela : null,
            observaciones: up(campos.Observaciones, 2500),
        },
    };
}
