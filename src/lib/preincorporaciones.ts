import { z } from 'zod';
import { VIGENTE, BAJA } from '@/lib/copas-ligas';

/**
 * Preinscripciones de incorporación: reglas compartidas entre el formulario público y
 * el servidor.
 *
 * El formulario lo llena el interesado desde el QR, sin cuenta. Por eso pide lo mínimo
 * para poder devolver la llamada —nombre, año, teléfono, equipo y un comentario— y nada
 * más: cada campo de más es gente que abandona el formulario.
 *
 * El equipo es la LETRA del grupo (A, B, C, D, X) y va como texto abierto a propósito:
 * las letras en uso cambian y un catálogo cerrado obligaría a mantenerlo al día para
 * que nadie se quede sin poder contestar.
 *
 * A diferencia del preregistro de jugadores, aquí NO hay sede ni enlace por sede: el
 * QR de incorporaciones es uno solo para toda la academia. Quien contesta el formulario
 * todavía no pertenece a ninguna sede, así que preguntarla sería inventarse un dato.
 */

export { VIGENTE, BAJA };

/**
 * Rango de años aceptado. Es a propósito amplio: en la academia hay categorías de
 * adultos (1990-2000VEGAS), así que acotarlo a edad infantil dejaría fuera altas
 * legítimas. Solo ataja el dedo torpe y el año imposible.
 */
export const ANIO_MINIMO = 1950;
export const anioMaximo = (): number => new Date().getFullYear();

const textoMayusculas = (max: number) =>
    z.string().trim().max(max).transform((v) => v.toUpperCase());

export const crearPreincorporacionSchema = z.object({
    /* Nombre y equipo van en MAYÚSCULAS, como todo lo que se captura en el sistema:
       así empatan con los nombres que ya existen en la base al buscarlos después.
       Los comentarios se respetan tal cual: son prosa, y en mayúsculas se leen a gritos. */
    jugador: textoMayusculas(245).refine((v) => v.length >= 3, 'Escribe el nombre del jugador'),
    anioNacimiento: z
        .number({ message: 'El año de nacimiento debe ser un número' })
        .int()
        .min(ANIO_MINIMO, 'El año de nacimiento no es válido')
        .max(anioMaximo(), 'El año de nacimiento no puede ser futuro'),
    telefono: z.string().trim().max(45).refine((v) => v.replace(/\D/g, '').length >= 10, 'El teléfono debe tener 10 dígitos'),
    equipo: textoMayusculas(145).optional().default(''),
    comentarios: z.string().trim().max(500).optional().default(''),
});

export type CrearPreincorporacion = z.infer<typeof crearPreincorporacionSchema>;

/** Fila de la lista que ve la administración. */
export interface PreincorporacionRow {
    IdIncorporacionPre: number;
    Jugador: string;
    AnioNacimiento: number | null;
    /** Edad aproximada: del año, no de la fecha exacta, que no se pide. */
    Edad: number | null;
    Telefono: string | null;
    Equipo: string | null;
    Comentarios: string | null;
    /** > 0 cuando ya se capturó el formato a partir de este contacto. */
    IdIncorporacion: number;
    Status: number;
    /** 'YYYY-MM-DD HH:mm'. */
    FechaAlta: string | null;
}
