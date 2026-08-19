import { z } from 'zod';
import { VIGENTE, BAJA } from '@/lib/copas-ligas';

/**
 * Formato de incorporación: reglas compartidas entre el servidor y la pantalla.
 *
 * Es la versión en sistema del formato que se llenaba en Excel. Una incorporación
 * responde a: **este jugador pasa de este grupo a este otro, lo propone este profesor,
 * por esta razón, y alguien lo autoriza.**
 *
 * Dos cosas que conviene tener claras:
 *
 *   No mueve al jugador. La pantalla deja constancia autorizada del cambio; la
 *   categoría del jugador se sigue cambiando en el sistema de escritorio. Si esta
 *   pantalla lo moviera, una captura administrativa cambiaría de golpe convocatorias,
 *   adeudos y reportes.
 *
 *   La procedencia se congela. Se copia de la categoría que el jugador tiene al
 *   capturar, porque en cuanto el cambio se aplique su categoría será la nueva y el
 *   formato dejaría de decir de dónde vino.
 */

export { VIGENTE, BAJA };

/**
 * Quién firma las incorporaciones. Se resuelve por nombre contra tblUsuarios y el
 * nombre se guarda con el registro, para que la firma no cambie después.
 *
 * Está aquí y no en la base porque hoy es una sola persona; el día que sean varias,
 * esto se convierte en un catálogo y el resto del código no se entera.
 */
export const AUTORIZANTE = 'JUAN ANTONIO GALLARDO BUENO';

/** tblPuestos.IdPuesto del perfil ENTRENADOR: son los profesores del formato. */
export const PUESTO_ENTRENADOR = 1;

const textoSchema = (max: number) => z.string().trim().max(max);

const fechaSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'La fecha no es válida');

export const crearIncorporacionSchema = z.object({
    temporadaId: z.number().int().positive(),
    fecha: fechaSchema,
    idProfesor: z.number().int().positive({ message: 'Elige el profesor' }),
    idJugador: z.number().int().positive({ message: 'Elige el jugador' }),
    /* Texto libre y no una clave del catálogo: un grupo recién creado todavía no tiene
       jugadores, así que no aparecería en la lista y no habría forma de capturarlo. */
    grupoIncorporar: textoSchema(45).min(1, 'Indica el grupo a incorporar'),
    justificacion: textoSchema(500).optional().default(''),
});

export const actualizarIncorporacionSchema = z.object({
    fecha: fechaSchema.optional(),
    grupoIncorporar: textoSchema(45).min(1).optional(),
    justificacion: textoSchema(500).optional(),
    status: z.union([z.literal(VIGENTE), z.literal(BAJA)]).optional(),
});

export type CrearIncorporacion = z.infer<typeof crearIncorporacionSchema>;

/** Una fila del formato, con lo necesario para leerla completa. */
export interface IncorporacionRow {
    IdIncorporacion: number;
    IdTemporada: number;
    Temporada: string | null;
    /** 'YYYY-MM-DD'. */
    FechaCaptura: string;
    IdProfesor: number | null;
    Profesor: string | null;
    IdJugador: number;
    Jugador: string | null;
    Sede: string | null;
    /** Categoría de la que venía, congelada al capturar. */
    Procedencia: string | null;
    /** Categoría a la que se incorpora. */
    GrupoIncorporar: string;
    Justificacion: string | null;
    /** Nombre de quien autorizó, tal como se firmó. */
    Autorizacion: string | null;
    /** 'YYYY-MM-DD HH:mm'. */
    FechaAutorizacion: string | null;
    Status: number;
    Usuario: string | null;
    /** La categoría que el jugador tiene HOY: delata si el cambio ya se aplicó. */
    CategoriaActual: string | null;
}

export interface OpcionProfesor {
    IdUsuario: number;
    Usuario: string;
}

export interface OpcionTemporada {
    IdTemporada: number;
    Temporada: string;
    EsActiva: boolean;
}

/** Jugador ofrecido en el buscador. Trae su categoría: es la procedencia. */
export interface JugadorBuscado {
    IdJugador: number;
    Jugador: string;
    Categoria: string | null;
    Sede: string | null;
}

/** ¿El cambio ya se aplicó en la plantilla? Sirve para marcar la fila como cumplida. */
export const yaAplicada = (fila: IncorporacionRow): boolean =>
    Boolean(fila.CategoriaActual) && fila.CategoriaActual === fila.GrupoIncorporar;
