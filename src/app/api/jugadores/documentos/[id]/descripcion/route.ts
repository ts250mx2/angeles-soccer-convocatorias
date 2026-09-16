import { NextResponse } from 'next/server';
import { pool } from '@/lib/db';
import { CLAVE_LISTA_JUGADORES } from '@/lib/navegacion';
import { requierePagina } from '@/lib/permisos';
import { describeDocumento, hayLlaveDeIa, sePuedeDescribir } from '@/lib/documento-descripcion';

export const dynamic = 'force-dynamic';

/* Leer un PDF de varias páginas se lleva su tiempo, y el valor por omisión de Vercel es
   de diez segundos. Sesenta alcanzan de sobra para un documento de expediente. */
export const maxDuration = 60;

/**
 * Lee el documento y propone una descripción de qué es.
 *
 * Va aparte de la subida —y no dentro de ella— por dos razones. Los archivos quedan
 * guardados en el acto aunque la IA tarde o falle, que es lo que de verdad importa; y
 * así el mismo botón sirve para volver a intentarlo sobre un documento que ya estaba en
 * la carpeta desde antes de que esto existiera.
 *
 * Lo que devuelve es una PROPUESTA que se guarda en el campo de descripción, el mismo que
 * se escribe a mano. Se puede corregir encima o borrar.
 */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
    const guardia = await requierePagina(CLAVE_LISTA_JUGADORES);
    if (!guardia.ok) {
        return NextResponse.json({ success: false, message: guardia.message }, { status: guardia.status });
    }

    const id = Number((await params).id);
    if (!Number.isInteger(id) || id <= 0) {
        return NextResponse.json({ success: false, message: 'Documento no válido' }, { status: 400 });
    }

    if (!hayLlaveDeIa()) {
        return NextResponse.json(
            { success: false, message: 'Falta configurar HL Console en el servidor (HL_URL, HL_API_KEY y HL_AGENTE).' },
            { status: 503 },
        );
    }

    try {
        const [filas] = (await pool.query(
            'SELECT Nombre, TipoMime, Contenido FROM tblJugadoresDocumentos WHERE IdDocumento = ? LIMIT 1',
            [id],
        )) as [Array<{ Nombre: string; TipoMime: string; Contenido: Buffer }>, unknown];

        const doc = filas[0];
        if (!doc) {
            return NextResponse.json({ success: false, message: 'El documento no existe' }, { status: 404 });
        }

        if (!sePuedeDescribir(doc.TipoMime)) {
            return NextResponse.json(
                {
                    success: false,
                    message: 'Este tipo de archivo no se puede leer (HEIC y los Office viejos quedan fuera). Escribe la descripción a mano.',
                },
                { status: 415 },
            );
        }

        const bytes = Buffer.isBuffer(doc.Contenido) ? doc.Contenido : Buffer.from(doc.Contenido);
        const descripcion = await describeDocumento(bytes, doc.TipoMime, doc.Nombre);

        if (!descripcion) {
            return NextResponse.json(
                {
                    success: false,
                    message: 'No se pudo distinguir qué es el documento. Escribe la descripción a mano.',
                },
                { status: 422 },
            );
        }

        await pool.query(
            'UPDATE tblJugadoresDocumentos SET Descripcion = ? WHERE IdDocumento = ?',
            [descripcion, id],
        );

        return NextResponse.json({ success: true, descripcion });
    } catch (error) {
        console.error('Error al describir el documento:', error);
        return NextResponse.json(
            { success: false, message: 'Error al leer el documento con la IA' },
            { status: 500 },
        );
    }
}
