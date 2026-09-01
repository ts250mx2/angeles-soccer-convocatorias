import { NextResponse } from 'next/server';
import { z } from 'zod';
import { pool } from '@/lib/db';
import { verificarTokenFoto } from '@/lib/foto-token';
import { BAJA, MAX_FOTO_JUGADOR } from '@/lib/jugador-form';
import { parseFoto } from '@/lib/copas-ligas';

export const dynamic = 'force-dynamic';

/**
 * El otro lado de la liga que se manda a los papás: la página pública /foto/[token]
 * pregunta aquí de quién es la liga (GET) y entrega la foto tomada (POST).
 *
 * Es pública COMO el preregistro: el token firmado es el permiso (ver
 * @/lib/foto-token), no hay sesión que pedir. Por eso el GET revela lo MÍNIMO para
 * que el papá confirme que está en la liga correcta —nombre de pila con una inicial y
 * la categoría— y jamás la foto ya guardada ni ningún otro dato de la ficha: una liga
 * reenviada a un chat equivocado no debe enseñar nada de un menor.
 *
 * Toda respuesta mala del token es el mismo "liga no válida o vencida", sin
 * distinguir: decir "el jugador existe pero está de baja" ya es contar algo.
 */

const ligaNoValida = () =>
    NextResponse.json(
        { success: false, message: 'Esta liga no es válida o ya venció. Pide una nueva a la academia.' },
        { status: 404 },
    );

/**
 * Nombre de pila y una inicial ("JUAN P."). tblJugadores.Jugador se guarda como
 * NOMBRE(S) APELLIDOS —así lo arma el preregistro—, por eso la primera palabra es el
 * nombre y no un apellido.
 */
function nombreCorto(completo: string | null): string {
    const palabras = String(completo ?? '').trim().split(/\s+/).filter(Boolean);
    if (palabras.length === 0) return 'tu jugador';
    return palabras.length > 1 ? `${palabras[0]} ${palabras[1][0]}.` : palabras[0];
}

export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
    try {
        const idJugador = verificarTokenFoto((await params).token);
        if (!idJugador) return ligaNoValida();

        const [rows] = (await pool.query(
            `SELECT Jugador, Categoria, Status, (Foto IS NOT NULL AND Foto <> '') AS ConFoto
               FROM tblJugadores WHERE IdJugador = ? LIMIT 1`,
            [idJugador],
        )) as [Array<{ Jugador: string | null; Categoria: string | null; Status: number; ConFoto: number }>, unknown];

        const jugador = rows[0];
        if (!jugador || jugador.Status === BAJA) return ligaNoValida();

        return NextResponse.json({
            success: true,
            data: {
                nombre: nombreCorto(jugador.Jugador),
                categoria: jugador.Categoria || null,
                tieneFoto: Boolean(jugador.ConFoto),
            },
        });
    } catch (error) {
        console.error('Error al validar la liga de foto:', error);
        return NextResponse.json({ success: false, message: 'Error al validar la liga' }, { status: 500 });
    }
}

/* La foto que se acepta: el mismo formato y tope con que la guarda la Hoja de Registro
   (data URI, máximo MAX_FOTO_JUGADOR), pero aquí NUNCA vacía: los papás solo pueden
   poner o reemplazar la foto, no quitarla. */
const subidaSchema = z.object({
    foto: z
        .string()
        .min(1, 'Falta la foto.')
        .max(MAX_FOTO_JUGADOR, 'La foto es demasiado grande. Vuelve a tomarla.')
        .refine((v) => parseFoto(v) !== null, 'El formato de la foto no es válido.'),
});

/* El JSON que envuelve al data URI pesa unos cuantos bytes; con este margen sobra. */
const MAX_CUERPO = MAX_FOTO_JUGADOR + 4096;

/**
 * ¿Los bytes empiezan como el formato que la etiqueta dice ser?
 *
 * parseFoto valida la ETIQUETA del data URI, no el contenido: por la página normal eso
 * basta, porque la imagen sale de un canvas. Pero este endpoint es público y se le
 * puede hablar directo, así que aquí —y solo aquí— se comprueba además la firma de los
 * bytes, para no guardar cualquier cosa disfrazada de foto en la ficha de un niño.
 */
function bytesDeImagen(mime: string, bytes: Buffer): boolean {
    const empiezaCon = (...b: number[]) => b.every((v, i) => bytes[i] === v);
    switch (mime) {
        case 'image/png':
            return empiezaCon(0x89, 0x50, 0x4e, 0x47);
        case 'image/jpeg':
            return empiezaCon(0xff, 0xd8, 0xff);
        case 'image/gif':
            return empiezaCon(0x47, 0x49, 0x46, 0x38);
        case 'image/webp': // 'RIFF' + tamaño (4 bytes libres) + 'WEBP'
            return empiezaCon(0x52, 0x49, 0x46, 0x46)
                && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50;
        default:
            return false;
    }
}

export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
    try {
        const idJugador = verificarTokenFoto((await params).token);
        if (!idJugador) return ligaNoValida();

        /* El tamaño se rechaza ANTES de leer el cuerpo: request.json() lo carga entero a
           memoria, y sin este corte una liga filtrada serviría para mandar cuerpos de
           cientos de MB. Sin Content-Length (chunked) también se rechaza: el navegador
           de la página siempre lo manda. */
        const largo = Number(request.headers.get('content-length'));
        if (!Number.isFinite(largo) || largo <= 0 || largo > MAX_CUERPO) {
            return NextResponse.json(
                { success: false, message: 'La foto es demasiado grande. Vuelve a tomarla.' },
                { status: 413 },
            );
        }

        let body: unknown;
        try {
            body = await request.json();
        } catch {
            return NextResponse.json({ success: false, message: 'Petición no válida' }, { status: 400 });
        }

        const parsed = subidaSchema.safeParse(body);
        if (!parsed.success) {
            return NextResponse.json(
                { success: false, message: parsed.error.issues[0]?.message ?? 'Foto no válida' },
                { status: 400 },
            );
        }

        // parseFoto ya validó dentro del schema; aquí solo se vuelve a partir.
        const partes = parseFoto(parsed.data.foto);
        if (!partes || !bytesDeImagen(partes.mime, Buffer.from(partes.base64, 'base64'))) {
            return NextResponse.json(
                { success: false, message: 'El formato de la foto no es válido.' },
                { status: 400 },
            );
        }

        /* Se verifica el jugador ANTES del UPDATE, y no mirando affectedRows: MySQL
           reporta 0 filas cuando el valor nuevo es idéntico al guardado, y ese caso
           (reintento del mismo envío) no es un error. */
        const [rows] = (await pool.query(
            'SELECT Status FROM tblJugadores WHERE IdJugador = ? LIMIT 1',
            [idJugador],
        )) as [Array<{ Status: number }>, unknown];
        if (!rows.length || rows[0].Status === BAJA) return ligaNoValida();

        /* FechaAct se sella también aquí: las pantallas piden la foto con ?v=<FechaAct>
           (ver /api/jugadores/foto), así que sin el sello nuevo seguirían enseñando la
           imagen cacheada de antes. */
        await pool.query(
            'UPDATE tblJugadores SET Foto = ?, FechaAct = NOW() WHERE IdJugador = ?',
            [parsed.data.foto, idJugador],
        );

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Error al recibir la foto del jugador:', error);
        return NextResponse.json({ success: false, message: 'No se pudo guardar la foto. Inténtalo de nuevo.' }, { status: 500 });
    }
}
