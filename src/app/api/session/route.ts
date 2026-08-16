import { NextResponse } from 'next/server';
import { getSesionConPermisos } from '@/lib/permisos';

/**
 * Sesión vigente: quién es el usuario y qué módulos tiene concedidos.
 *
 * El cliente guarda una copia en localStorage para pintar rápido, pero al arrancar
 * pregunta aquí: si un administrador cambió los permisos del perfil, el menú se
 * corrige sin esperar a que el usuario vuelva a entrar.
 */
export async function GET() {
    try {
        const sesion = await getSesionConPermisos();
        if (!sesion) {
            return NextResponse.json(
                { success: false, message: 'Sesión no válida' },
                { status: 401 }
            );
        }

        return NextResponse.json({
            success: true,
            user: {
                IdUsuario: sesion.user.IdUsuario,
                Usuario: sesion.user.Usuario,
                IdPuesto: sesion.user.IdPuesto,
                Puesto: sesion.user.Puesto,
                AdminConvocatorias: sesion.user.AdminConvocatorias,
            },
            paginas: [...sesion.paginas],
        });
    } catch (error) {
        console.error('Error al leer la sesión:', error);
        return NextResponse.json(
            { success: false, message: 'Error al leer la sesión' },
            { status: 500 }
        );
    }
}
