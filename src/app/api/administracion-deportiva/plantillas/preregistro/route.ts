import { NextResponse } from 'next/server';
import { pool } from '@/lib/db';
import { CLAVE_PLANTILLAS } from '@/lib/navegacion';
import { requierePagina } from '@/lib/permisos';
import { insertaPreregistro } from '@/lib/preregistro-alta';
import { validaPreregistro } from '@/lib/preregistro';

export const dynamic = 'force-dynamic';

/**
 * Preregistro capturado desde la Plantilla de Equipos.
 *
 * Es la MISMA fila de tblJugadoresPre que llena el QR público, capturada por el otro
 * lado del mostrador: la recepción de la sede con el niño y su mamá enfrente. Se guarda
 * aquí y no como jugador porque el alta formal la sigue haciendo el sistema de
 * escritorio; esta pantalla solo deja el dato listo para esa alta, sin obligar a la
 * familia a sacar el teléfono y escanear un QR que ya tienen resuelto en persona.
 *
 * La diferencia con la puerta pública es el DESTINO. Allá la sede sale del UUID y no hay
 * equipo; aquí las dos cosas salen del EQUIPO ELEGIDO y se resuelven en el servidor:
 * el navegador manda un IdEquipo, no una sede y una categoría sueltas. Así no puede
 * llegar un preregistro con la categoría de un equipo y la sede de otro, que es
 * exactamente lo que nadie podría explicar después viendo la tabla.
 *
 * La categoría se guarda como la escribe tblJugadores.Categoria —el nombre completo del
 * equipo, '2018X'— y no como el año suelto: es el valor que el escritorio ya espera
 * encontrar cuando convierte el preregistro en jugador.
 */

interface FilaEquipo {
    IdEquipo: number;
    Equipo: string | null;
    IdSede: number | null;
    Sede: string | null;
}

export async function POST(request: Request) {
    const guardia = await requierePagina(CLAVE_PLANTILLAS);
    if (!guardia.ok) {
        return NextResponse.json({ success: false, message: guardia.message }, { status: guardia.status });
    }

    try {
        const body = await request.json();

        const idEquipo = Number(body?.idEquipo);
        if (!Number.isInteger(idEquipo) || idEquipo <= 0) {
            return NextResponse.json({ success: false, message: 'Selecciona un equipo.' }, { status: 400 });
        }

        const [equipos] = (await pool.query(
            `SELECT E.IdEquipo, E.Equipo, E.IdSede, S.Sede
               FROM tblEquipos E
               LEFT JOIN tblSedes S ON S.IdSede = E.IdSede
              WHERE E.IdEquipo = ?`,
            [idEquipo],
        )) as [FilaEquipo[], unknown];

        if (equipos.length === 0) {
            return NextResponse.json({ success: false, message: 'El equipo no existe' }, { status: 404 });
        }
        const equipo = equipos[0];
        /* Un preregistro sin sede se pierde: el reporte se lee por sede y el alta del
           escritorio arranca de ahí. Antes que guardarlo huérfano, se dice cuál es el
           problema, que se arregla en el catálogo de equipos. */
        if (!equipo.IdSede) {
            return NextResponse.json(
                { success: false, message: `El equipo ${equipo.Equipo ?? idEquipo} no tiene sede en el catálogo. Asígnasela antes de capturar preregistros.` },
                { status: 400 },
            );
        }

        /* Recortado, que es como lo busca la hoja del equipo al listar sus preregistros
           (`WHERE P.Categoria = ?` con el nombre del equipo ya recortado). Guardarlo con
           un espacio de mas lo dejaria fuera de su propia plantilla. */
        const categoria = String(equipo.Equipo ?? '').trim() || null;

        const validacion = validaPreregistro(body);
        if (!validacion.ok) {
            return NextResponse.json({ success: false, message: validacion.message }, { status: 400 });
        }

        const idJugadorPre = await insertaPreregistro(validacion.valores, {
            idSede: equipo.IdSede,
            categoria,
        });

        return NextResponse.json({
            success: true,
            message: 'Preregistro guardado correctamente',
            data: {
                idJugadorPre,
                jugador: validacion.valores.jugadorPre,
                sede: equipo.Sede,
                categoria,
            },
        });
    } catch (error) {
        console.error('Error al guardar el preregistro desde la plantilla:', error);
        return NextResponse.json(
            { success: false, message: 'Error al guardar el preregistro' },
            { status: 500 },
        );
    }
}
