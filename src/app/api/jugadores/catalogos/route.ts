import { NextResponse } from 'next/server';
import { pool } from '@/lib/db';
import { CLAVE_LISTA_JUGADORES } from '@/lib/navegacion';
import { requierePagina } from '@/lib/permisos';

export const dynamic = 'force-dynamic';

/**
 * Los catálogos que la ficha del jugador necesita para abrirse: sedes y estados.
 *
 * Van juntos en una sola respuesta porque se piden a la vez y son listas cortas —una
 * treintena de sedes y treinta y dos estados—; partirlas en dos rutas serían dos viajes
 * para llenar el mismo formulario.
 *
 * Los otros dos catálogos NO viven aquí: los equipos dependen de la sede, el año y el
 * género que se vayan capturando (/api/jugadores/equipos), y las escuelas del estado
 * (/api/preregistro/escuelas). Ninguno de los dos se puede resolver antes de abrir.
 */
export async function GET() {
    const guardia = await requierePagina(CLAVE_LISTA_JUGADORES);
    if (!guardia.ok) {
        return NextResponse.json({ success: false, message: guardia.message }, { status: guardia.status });
    }

    try {
        const [sedes] = await pool.query(
            `SELECT IdSede, Sede, Estado
               FROM tblSedes
              WHERE Status = 0
              ORDER BY Sede ASC`,
        );

        const [estados] = await pool.query(
            'SELECT IdEstado, Estado FROM tblEstados ORDER BY Estado ASC',
        );

        return NextResponse.json({ success: true, data: { sedes, estados } });
    } catch (error) {
        console.error('Error al obtener los catálogos de la ficha:', error);
        return NextResponse.json(
            { success: false, message: 'Error al obtener los catálogos' },
            { status: 500 },
        );
    }
}
