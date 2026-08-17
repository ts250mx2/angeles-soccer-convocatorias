import { NextResponse } from 'next/server';
import { pool } from '@/lib/db';
import { getSessionUser } from '@/lib/auth';
import { parseFoto } from '@/lib/copas-ligas';

export const dynamic = 'force-dynamic';

/**
 * Sirve la foto de una copa o liga como imagen de verdad.
 *
 * Existe para que los listados no tengan que cargar decenas de imágenes en base64
 * dentro del JSON: así el navegador las pide en paralelo, las cachea y la pantalla abre
 * igual de rápido aunque el catálogo crezca.
 *
 * Basta con tener sesión: la pintan Convocatorias, Pagos de Copas y Ligas y el propio
 * catálogo, y exigir el permiso del catálogo dejaría al entrenador viendo huecos en
 * lugar de escudos. Un escudo de torneo no es un dato reservado; lo reservado son los
 * precios y los pagos, que sí siguen tras su permiso.
 *
 * El caché es `immutable` porque la pantalla pide la imagen con ?v=<FechaAct>: al
 * cambiar la foto cambia el sello, y con él la URL. Es privado para que ningún proxy
 * compartido la guarde.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
    const usuario = await getSessionUser();
    if (!usuario) {
        return NextResponse.json({ success: false, message: 'Sesión no válida' }, { status: 401 });
    }

    try {
        const idLiga = Number((await params).id);
        if (!Number.isInteger(idLiga) || idLiga <= 0) {
            return NextResponse.json({ success: false, message: 'Copa o liga no válida' }, { status: 400 });
        }

        const [rows] = (await pool.query('SELECT Foto FROM tblLigas WHERE IdLiga = ? LIMIT 1', [
            idLiga,
        ])) as [Array<{ Foto: string | null }>, unknown];

        const foto = rows[0]?.Foto;
        if (!foto) {
            return NextResponse.json({ success: false, message: 'Sin foto' }, { status: 404 });
        }

        /* Se vuelve a validar al servir, no solo al guardar: la columna es longtext y el
           sistema de escritorio también escribe en ella, así que lo que hay dentro no
           está garantizado. Sin esto, un texto cualquiera saldría con Content-Type de
           imagen. */
        const partes = parseFoto(foto);
        if (!partes) {
            return NextResponse.json({ success: false, message: 'La foto guardada no es una imagen válida' }, { status: 415 });
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
        console.error('Error al obtener la foto de la copa o liga:', error);
        return NextResponse.json({ success: false, message: 'Error al obtener la foto' }, { status: 500 });
    }
}
