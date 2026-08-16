import { pool } from '@/lib/db';
import { getSessionUser, type SessionUser } from '@/lib/auth';
import {
    CLAVES_VALIDAS,
    PAGINAS,
    claveDeRuta,
} from '@/lib/navegacion';

/**
 * Permisos de módulo por perfil.
 *
 * Qué puede ver un usuario se decide por su PUESTO (perfil), no por el usuario: la
 * lista de módulos vive en tblPerfilPaginas y se lee de la base en cada request, igual
 * que el rol. Así, quitarle un módulo a un perfil surte efecto de inmediato sin
 * esperar a que sus usuarios vuelvan a entrar.
 */

/** Regla anterior a tblPerfilPaginas, por si la migración todavía no se aplicó. */
function paginasHeredadas(adminConvocatorias: number): Set<string> {
    const esAdmin = adminConvocatorias >= 2;
    return new Set(PAGINAS.filter((p) => !p.adminOnly || esAdmin).map((p) => p.clave));
}

function esTablaInexistente(error: unknown): boolean {
    return (error as { code?: string })?.code === 'ER_NO_SUCH_TABLE';
}

/**
 * Módulos concedidos a un perfil. Un perfil sin filas no ve nada: la ausencia de
 * permiso es una respuesta válida, no un error.
 */
export async function paginasDePuesto(
    idPuesto: number | null,
    adminConvocatorias = 0,
): Promise<Set<string>> {
    if (!idPuesto) return new Set();
    try {
        const [rows] = (await pool.query(
            'SELECT Pagina FROM tblPerfilPaginas WHERE IdPuesto = ?',
            [idPuesto],
        )) as [{ Pagina: string }[], unknown];
        return new Set(rows.map((r) => r.Pagina).filter((p) => CLAVES_VALIDAS.has(p)));
    } catch (error) {
        if (esTablaInexistente(error)) {
            console.warn('[permisos] Falta tblPerfilPaginas: aplica migrations/002-perfiles-paginas.sql.');
            return paginasHeredadas(adminConvocatorias);
        }
        throw error;
    }
}

/** Todos los permisos, agrupados por perfil. Para la pantalla de Perfiles. */
export async function paginasPorPuesto(): Promise<Record<number, string[]>> {
    try {
        const [rows] = (await pool.query(
            'SELECT IdPuesto, Pagina FROM tblPerfilPaginas',
        )) as [{ IdPuesto: number; Pagina: string }[], unknown];

        return rows.reduce<Record<number, string[]>>((acc, { IdPuesto, Pagina }) => {
            if (!CLAVES_VALIDAS.has(Pagina)) return acc;
            return { ...acc, [IdPuesto]: [...(acc[IdPuesto] ?? []), Pagina] };
        }, {});
    } catch (error) {
        if (esTablaInexistente(error)) return {};
        throw error;
    }
}

/**
 * Reemplaza la lista de módulos de un perfil. Borrar e insertar dentro de una
 * transacción evita que un fallo a media escritura deje al perfil sin accesos.
 */
export async function guardarPaginasDePuesto(idPuesto: number, paginas: string[]): Promise<void> {
    const validas = [...new Set(paginas)].filter((p) => CLAVES_VALIDAS.has(p));
    const conexion = await pool.getConnection();
    try {
        await conexion.beginTransaction();
        await conexion.query('DELETE FROM tblPerfilPaginas WHERE IdPuesto = ?', [idPuesto]);
        if (validas.length > 0) {
            await conexion.query('INSERT INTO tblPerfilPaginas (IdPuesto, Pagina) VALUES ?', [
                validas.map((p) => [idPuesto, p]),
            ]);
        }
        await conexion.commit();
    } catch (error) {
        await conexion.rollback();
        throw error;
    } finally {
        conexion.release();
    }
}

export interface SesionConPermisos {
    user: SessionUser;
    paginas: Set<string>;
}

/** Usuario autenticado junto con los módulos de su perfil. */
export async function getSesionConPermisos(): Promise<SesionConPermisos | null> {
    const user = await getSessionUser();
    if (!user) return null;
    return { user, paginas: await paginasDePuesto(user.IdPuesto, user.AdminConvocatorias) };
}

export type ResultadoGuardia =
    | { ok: true; user: SessionUser; paginas: Set<string> }
    | { ok: false; status: number; message: string };

/**
 * Exige que el usuario tenga concedido un módulo. Es la reja de verdad: la que aplica
 * el menú es comodidad para el usuario, esta es la que protege los datos.
 */
export async function requierePagina(clave: string): Promise<ResultadoGuardia> {
    const sesion = await getSesionConPermisos();
    if (!sesion) {
        return { ok: false, status: 401, message: 'Sesión no válida o expirada. Inicia sesión de nuevo.' };
    }
    if (!sesion.paginas.has(clave)) {
        return { ok: false, status: 403, message: 'No tienes acceso a este módulo.' };
    }
    return { ok: true, user: sesion.user, paginas: sesion.paginas };
}

/** Igual que requierePagina, pero a partir de una ruta cualquiera de la aplicación. */
export async function requiereRuta(ruta: string): Promise<ResultadoGuardia> {
    const clave = claveDeRuta(ruta);
    if (!clave) {
        return { ok: false, status: 404, message: 'Módulo desconocido.' };
    }
    return requierePagina(clave);
}
