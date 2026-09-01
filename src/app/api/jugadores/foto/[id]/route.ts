import { NextResponse } from 'next/server';
import { pool } from '@/lib/db';
import { CLAVES_VEN_FOTO_JUGADOR } from '@/lib/navegacion';
import { requiereAlgunaPagina } from '@/lib/permisos';
import { parseFoto } from '@/lib/copas-ligas';
import { z } from 'zod';
import { MAX_FOTO_JUGADOR } from '@/lib/jugador-form';

export const dynamic = 'force-dynamic';

/**
 * Sirve la foto de un jugador como imagen de verdad.
 *
 * Existe por la misma razón que la de las copas y ligas: sin ella, una plantilla de 74
 * jugadores tendría que arrastrar 74 data URIs dentro del JSON —hasta 120 KB cada uno,
 * varios MB en total— antes de pintar el primer nombre. Así el navegador las pide en
 * paralelo, las cachea, y la pantalla abre igual de rápido tenga el equipo trece
 * jugadores o setenta.
 *
 * A DIFERENCIA de la foto de un torneo, ésta SÍ va tras permiso. El escudo de una copa
 * no es un dato reservado; la cara de un menor de edad sí, y basta con tener sesión para
 * pedir cualquier IdJugador. Se aceptan los módulos que la pintan, que están enumerados
 * en CLAVES_VEN_FOTO_JUGADOR: exigir uno solo dejaría a los demás viendo huecos.
 *
 * El caché es `immutable` porque la pantalla pide la imagen con ?v=<FechaAct>: al cambiar
 * la foto cambia el sello, y con él la URL. Privado, para que ningún proxy compartido
 * guarde la foto de un niño.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
    const guardia = await requiereAlgunaPagina(CLAVES_VEN_FOTO_JUGADOR);
    if (!guardia.ok) {
        return NextResponse.json({ success: false, message: guardia.message }, { status: guardia.status });
    }

    try {
        const idJugador = Number((await params).id);
        if (!Number.isInteger(idJugador) || idJugador <= 0) {
            return NextResponse.json({ success: false, message: 'Jugador no válido' }, { status: 400 });
        }

        const [rows] = (await pool.query(
            'SELECT Foto FROM tblJugadores WHERE IdJugador = ? LIMIT 1',
            [idJugador],
        )) as [Array<{ Foto: string | null }>, unknown];

        const foto = rows[0]?.Foto;
        if (!foto) {
            return NextResponse.json({ success: false, message: 'Sin foto' }, { status: 404 });
        }

        /* Se vuelve a validar al servir, no solo al guardar: la columna es longtext y el
           sistema de escritorio también puede escribir en ella, así que lo que hay dentro
           no está garantizado. Sin esto, un texto cualquiera saldría con Content-Type de
           imagen. */
        const partes = parseFoto(foto);
        if (!partes) {
            return NextResponse.json(
                { success: false, message: 'La foto guardada no es una imagen válida' },
                { status: 415 },
            );
        }

        const bytes = Buffer.from(partes.base64, 'base64');
        return new NextResponse(new Uint8Array(bytes), {
            headers: {
                'Content-Type': partes.mime,
                'Content-Length': String(bytes.length),
                'Cache-Control': 'private, max-age=31536000, immutable',
            },
        });
    } catch (error) {
        console.error('Error al obtener la foto del jugador:', error);
        return NextResponse.json({ success: false, message: 'Error al obtener la foto' }, { status: 500 });
    }
}

/* La foto que llega desde dentro de la aplicación. Cadena vacía = quitarla, que es lo
   que la liga pública NO permite: ahí los papás solo pueden poner o reemplazar. */
const guardarSchema = z.object({
    foto: z
        .string()
        .max(MAX_FOTO_JUGADOR, 'La foto es demasiado grande.')
        .refine((v) => v === '' || parseFoto(v) !== null, 'El formato de la foto no es válido.'),
});

/**
 * Guarda (o quita) la foto de un jugador.
 *
 * Existe para poder tomarla en el momento en que alguien tiene al niño enfrente —al
 * pasar lista, al revisar la plantilla— sin obligarlo a abrir la Hoja de Registro
 * completa ni a mandarle la liga al papá. Escribe SOLO la columna de la foto: una ficha
 * parcial mandada por error no puede borrar el domicilio ni el teléfono.
 *
 * Pide los mismos módulos que ver la foto (CLAVES_VEN_FOTO_JUGADOR) y no el de la Lista
 * de Jugadores: quien pasa lista en la cancha es justo quien puede tomarla, y exigirle
 * el módulo de la ficha lo dejaría viendo el hueco sin poder llenarlo.
 *
 * A diferencia del endpoint público por token, aquí NO se comprueba la firma de los
 * bytes: esto va tras sesión y permiso, y la imagen sale del canvas de la propia
 * pantalla. La reja de aquélla es que cualquiera con la liga puede hablarle.
 */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
    const guardia = await requiereAlgunaPagina(CLAVES_VEN_FOTO_JUGADOR);
    if (!guardia.ok) {
        return NextResponse.json({ success: false, message: guardia.message }, { status: guardia.status });
    }

    try {
        const idJugador = Number((await params).id);
        if (!Number.isInteger(idJugador) || idJugador <= 0) {
            return NextResponse.json({ success: false, message: 'Jugador no válido' }, { status: 400 });
        }

        const parseo = guardarSchema.safeParse(await request.json().catch(() => null));
        if (!parseo.success) {
            return NextResponse.json(
                { success: false, message: parseo.error.issues[0]?.message ?? 'Datos incompletos.' },
                { status: 400 },
            );
        }
        const foto = parseo.data.foto;

        const [existe] = (await pool.query(
            'SELECT IdJugador FROM tblJugadores WHERE IdJugador = ? LIMIT 1',
            [idJugador],
        )) as [Array<{ IdJugador: number }>, unknown];
        if (existe.length === 0) {
            return NextResponse.json({ success: false, message: 'El jugador no existe' }, { status: 404 });
        }

        /* FechaAct se toca siempre: es el sello con el que las pantallas rompen el caché
           de la imagen (ver el GET de arriba). Sin actualizarlo, la foto nueva no se
           vería hasta que el navegador soltara la vieja por su cuenta. */
        await pool.query(
            'UPDATE tblJugadores SET Foto = ?, FechaAct = NOW() WHERE IdJugador = ?',
            [foto === '' ? null : foto, idJugador],
        );

        const [sello] = (await pool.query(
            "SELECT DATE_FORMAT(FechaAct, '%Y%m%d%H%i%s') AS FotoVersion FROM tblJugadores WHERE IdJugador = ?",
            [idJugador],
        )) as [Array<{ FotoVersion: string | null }>, unknown];

        return NextResponse.json({
            success: true,
            tieneFoto: foto !== '',
            fotoVersion: sello[0]?.FotoVersion ?? null,
        });
    } catch (error) {
        console.error('Error al guardar la foto del jugador:', error);
        return NextResponse.json({ success: false, message: 'Error al guardar la foto' }, { status: 500 });
    }
}
