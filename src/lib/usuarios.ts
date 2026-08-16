import { z } from 'zod';
import { pool } from '@/lib/db';

/**
 * Reglas de alta y edición de usuarios, compartidas por las dos rutas de la API.
 *
 * tblUsuarios es a la vez el directorio del personal y la tabla de acceso: la mayoría
 * de las filas son profesores sin credenciales, que solo existen para asignarlos a una
 * convocatoria. Por eso Login y Contraseña son OPCIONALES; solo quien va a entrar al
 * sistema los necesita.
 */

export const camposUsuario = {
    usuario: z.string().trim().min(3, 'El nombre debe tener al menos 3 caracteres').max(245),
    login: z.string().trim().max(45),
    idPuesto: z.number().int().positive('Selecciona un perfil'),
    idSede: z.number().int().nullable(),
    correo: z.string().trim().max(245),
    telefonos: z.string().trim().max(45),
    status: z.number().int().min(0).max(2),
};

/** Un login sin contraseña dejaría una cuenta abierta con solo teclear el usuario. */
export function validaCredenciales(login: string, passwd: string): string | null {
    if (login && !passwd) return 'Si defines un usuario de acceso, la contraseña es obligatoria.';
    if (!login && passwd) return 'Para poner contraseña hace falta un usuario de acceso.';
    if (login && login.length < 3) return 'El usuario de acceso debe tener al menos 3 caracteres.';
    if (passwd && passwd.length < 4) return 'La contraseña debe tener al menos 4 caracteres.';
    return null;
}

/** El login debe ser único entre quienes sí tienen credenciales. */
export async function loginOcupado(login: string, exceptoIdUsuario = 0): Promise<boolean> {
    if (!login) return false;
    const [rows] = (await pool.query(
        'SELECT IdUsuario FROM tblUsuarios WHERE Login = ? AND IdUsuario <> ? LIMIT 1',
        [login, exceptoIdUsuario],
    )) as [{ IdUsuario: number }[], unknown];
    return rows.length > 0;
}

export async function existePerfil(idPuesto: number): Promise<boolean> {
    const [rows] = (await pool.query('SELECT IdPuesto FROM tblPuestos WHERE IdPuesto = ? LIMIT 1', [
        idPuesto,
    ])) as [{ IdPuesto: number }[], unknown];
    return rows.length > 0;
}
