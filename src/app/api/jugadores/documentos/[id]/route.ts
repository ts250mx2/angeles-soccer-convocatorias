import { NextResponse } from 'next/server';
import { z } from 'zod';
import { pool } from '@/lib/db';
import { CLAVE_LISTA_JUGADORES } from '@/lib/navegacion';
import { requierePagina } from '@/lib/permisos';
import { seVeEnElNavegador } from '@/lib/jugador-documentos';

export const dynamic = 'force-dynamic';

/**
 * Un documento de la carpeta de un jugador: bajarlo, describirlo o borrarlo.
 *
 * Mismo permiso que la carpeta (ver la ruta hermana): son documentos de menores y el id
 * es un entero corrido, así que sin la reja bastaría con contar hasta cien.
 */

interface FilaDocumento {
    Nombre: string;
    TipoMime: string;
    Contenido: Buffer;
}

const idDe = async (params: Promise<{ id: string }>): Promise<number | null> => {
    const id = Number((await params).id);
    return Number.isInteger(id) && id > 0 ? id : null;
};

/**
 * Entrega el archivo.
 *
 * Por omisión se descarga. Con `?ver=1` se abre dentro del navegador, y SOLO si es
 * imagen o PDF: son los dos que sabe pintar, y son los que no ejecutan nada. Cualquier
 * otro se manda como descarga aunque lo pidan en línea.
 *
 * Los tres encabezados de abajo no son adorno:
 *
 *   `nosniff` evita que el navegador adivine el tipo por el contenido. Sin él, un archivo
 *   subido con extensión inocente pero con HTML dentro podría acabar ejecutándose en el
 *   mismo origen que la aplicación, con la sesión de quien lo abrió.
 *
 *   El nombre del archivo va en `filename*` (RFC 5987) y además saneado en `filename`:
 *   los acentos y las comas rompen el encabezado si van tal cual, y unas comillas dentro
 *   del nombre permitirían inventarse encabezados.
 *
 *   `private` en el caché: es el documento de un menor, ningún proxy compartido tiene por
 *   qué guardárselo.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
    const guardia = await requierePagina(CLAVE_LISTA_JUGADORES);
    if (!guardia.ok) {
        return NextResponse.json({ success: false, message: guardia.message }, { status: guardia.status });
    }

    const id = await idDe(params);
    if (id === null) {
        return NextResponse.json({ success: false, message: 'Documento no válido' }, { status: 400 });
    }

    try {
        const [filas] = (await pool.query(
            'SELECT Nombre, TipoMime, Contenido FROM tblJugadoresDocumentos WHERE IdDocumento = ? LIMIT 1',
            [id],
        )) as [FilaDocumento[], unknown];

        const doc = filas[0];
        if (!doc) {
            return NextResponse.json({ success: false, message: 'El documento no existe' }, { status: 404 });
        }

        const quiereVerlo = new URL(request.url).searchParams.get('ver') === '1';
        const enLinea = quiereVerlo && seVeEnElNavegador(doc.TipoMime);

        /* Nombre a prueba de encabezado: sin comillas ni saltos, y con una versión en
           ASCII por si el cliente no entiende `filename*`. */
        const limpio = String(doc.Nombre ?? 'documento').replace(/["\r\n]/g, '').trim() || 'documento';
        const ascii = limpio.replace(/[^\x20-\x7E]/g, '_');
        const bytes = Buffer.isBuffer(doc.Contenido) ? doc.Contenido : Buffer.from(doc.Contenido);

        return new NextResponse(new Uint8Array(bytes), {
            headers: {
                'Content-Type': doc.TipoMime,
                'Content-Length': String(bytes.length),
                'Content-Disposition':
                    `${enLinea ? 'inline' : 'attachment'}; filename="${ascii}"; ` +
                    `filename*=UTF-8''${encodeURIComponent(limpio)}`,
                'X-Content-Type-Options': 'nosniff',
                'Cache-Control': 'private, max-age=0, must-revalidate',
            },
        });
    } catch (error) {
        console.error('Error al obtener el documento del jugador:', error);
        return NextResponse.json(
            { success: false, message: 'Error al obtener el documento' },
            { status: 500 },
        );
    }
}

/* La descripción que se escribe a mano. Vacía = quitarla. */
const descripcionSchema = z.object({
    descripcion: z.string().max(255, 'La descripción es demasiado larga.'),
});

/**
 * Cambia la descripción del documento.
 *
 * Es el mismo campo que llena la descripción automática (ver la ruta `descripcion`), y a
 * propósito: lo que el modelo propone es un borrador que se corrige encima, no un dato
 * aparte que haya que conciliar con el de la persona. Quien escribe último manda.
 */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
    const guardia = await requierePagina(CLAVE_LISTA_JUGADORES);
    if (!guardia.ok) {
        return NextResponse.json({ success: false, message: guardia.message }, { status: guardia.status });
    }

    const id = await idDe(params);
    if (id === null) {
        return NextResponse.json({ success: false, message: 'Documento no válido' }, { status: 400 });
    }

    const parseo = descripcionSchema.safeParse(await request.json().catch(() => null));
    if (!parseo.success) {
        return NextResponse.json(
            { success: false, message: parseo.error.issues[0]?.message ?? 'Datos incompletos.' },
            { status: 400 },
        );
    }
    const descripcion = parseo.data.descripcion.trim();

    try {
        const [res] = (await pool.query(
            'UPDATE tblJugadoresDocumentos SET Descripcion = ? WHERE IdDocumento = ?',
            [descripcion, id],
        )) as [{ affectedRows?: number }, unknown];

        if (!res.affectedRows) {
            return NextResponse.json({ success: false, message: 'El documento no existe' }, { status: 404 });
        }
        return NextResponse.json({ success: true, descripcion });
    } catch (error) {
        console.error('Error al guardar la descripción del documento:', error);
        return NextResponse.json(
            { success: false, message: 'Error al guardar la descripción' },
            { status: 500 },
        );
    }
}

/**
 * Borra el documento, de verdad.
 *
 * No es un Status: el archivo pesa dentro de la base y con él, en cada respaldo. Un
 * documento dado de baja seguiría costando lo mismo. Por eso la pantalla pregunta antes,
 * y por eso el aviso dice que no hay vuelta atrás: no hay copia en disco de donde
 * recuperarlo.
 */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
    const guardia = await requierePagina(CLAVE_LISTA_JUGADORES);
    if (!guardia.ok) {
        return NextResponse.json({ success: false, message: guardia.message }, { status: guardia.status });
    }

    const id = await idDe(params);
    if (id === null) {
        return NextResponse.json({ success: false, message: 'Documento no válido' }, { status: 400 });
    }

    try {
        const [res] = (await pool.query(
            'DELETE FROM tblJugadoresDocumentos WHERE IdDocumento = ?',
            [id],
        )) as [{ affectedRows?: number }, unknown];

        if (!res.affectedRows) {
            return NextResponse.json({ success: false, message: 'El documento no existe' }, { status: 404 });
        }
        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Error al borrar el documento del jugador:', error);
        return NextResponse.json(
            { success: false, message: 'Error al borrar el documento' },
            { status: 500 },
        );
    }
}
