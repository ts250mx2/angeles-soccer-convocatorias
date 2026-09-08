import { NextResponse } from 'next/server';
import { pool } from '@/lib/db';
import { CLAVE_LISTA_JUGADORES } from '@/lib/navegacion';
import { requierePagina } from '@/lib/permisos';
import { getSessionUser } from '@/lib/auth';
import {
    MAX_DOCUMENTOS_POR_JUGADOR,
    formatoDeArchivo,
    motivoRechazo,
    type DocumentoJugador,
} from '@/lib/jugador-documentos';

export const dynamic = 'force-dynamic';

/**
 * La carpeta de documentos de un jugador: listarla y agregarle archivos.
 *
 * Los archivos viven en la base (tblJugadoresDocumentos.Contenido), ver
 * migrations/028-documentos-jugador.sql. La descarga y el borrado de uno concreto están
 * en la ruta hermana `[id]`.
 *
 * Va tras el módulo de la Lista de Jugadores, que es de donde se abre la ficha: son
 * documentos de menores —actas, CURP, la credencial del papá— y basta con tener sesión
 * para pedir cualquier IdJugador. El mismo criterio de la foto (ver
 * /api/jugadores/foto/[id]), solo que aquí es un módulo y no una lista de ellos: la
 * carpeta se ve en un solo lugar.
 */

interface FilaDocumento {
    IdDocumento: number;
    IdJugador: number;
    Nombre: string;
    Descripcion: string | null;
    TipoMime: string;
    Bytes: number;
    Fecha: string | null;
    Usuario: string | null;
}

const aDocumento = (f: FilaDocumento): DocumentoJugador => ({
    idDocumento: Number(f.IdDocumento),
    idJugador: Number(f.IdJugador),
    nombre: String(f.Nombre ?? ''),
    descripcion: String(f.Descripcion ?? ''),
    tipoMime: String(f.TipoMime ?? ''),
    bytes: Number(f.Bytes) || 0,
    fecha: String(f.Fecha ?? ''),
    usuario: f.Usuario ? String(f.Usuario) : null,
});

/** Los documentos del jugador, del más nuevo al más viejo. */
export async function GET(request: Request) {
    const guardia = await requierePagina(CLAVE_LISTA_JUGADORES);
    if (!guardia.ok) {
        return NextResponse.json({ success: false, message: guardia.message }, { status: guardia.status });
    }

    const idJugador = Number(new URL(request.url).searchParams.get('idJugador'));
    if (!Number.isInteger(idJugador) || idJugador <= 0) {
        return NextResponse.json({ success: false, message: 'Jugador no válido' }, { status: 400 });
    }

    try {
        /* Contenido NO va en el SELECT, y es lo que hace que listar sea barato: InnoDB
           guarda el blob fuera de la página del renglón y solo lo lee si se lo piden.
           Con él dentro, abrir la ficha se traería los diez archivos del niño. */
        const [filas] = (await pool.query(
            `SELECT D.IdDocumento, D.IdJugador, D.Nombre, D.Descripcion, D.TipoMime, D.Bytes,
                    DATE_FORMAT(D.FechaAlta, '%d/%m/%Y') AS Fecha,
                    U.Usuario
               FROM tblJugadoresDocumentos D
               LEFT JOIN tblUsuarios U ON U.IdUsuario = D.IdUsuario
              WHERE D.IdJugador = ?
              ORDER BY D.FechaAlta DESC, D.IdDocumento DESC`,
            [idJugador],
        )) as [FilaDocumento[], unknown];

        return NextResponse.json({ success: true, data: filas.map(aDocumento) });
    } catch (error) {
        console.error('Error al listar los documentos del jugador:', error);
        return NextResponse.json(
            { success: false, message: 'Error al obtener los documentos' },
            { status: 500 },
        );
    }
}

/**
 * Agrega un documento a la carpeta.
 *
 * Llega como multipart y no como JSON con el archivo en base64, que es como se guarda la
 * foto: base64 infla un tercio, y un PDF de 10 MB viajaría como 13 MB de texto que
 * además hay que decodificar en memoria. Multipart manda los bytes tal cual.
 *
 * Se sube de uno en uno aunque la pantalla deje soltar varios: así un archivo rechazado
 * —pesa de más, no es de los tipos— no tumba a los que sí eran buenos, y la pantalla
 * puede decir exactamente cuál falló.
 */
export async function POST(request: Request) {
    const guardia = await requierePagina(CLAVE_LISTA_JUGADORES);
    if (!guardia.ok) {
        return NextResponse.json({ success: false, message: guardia.message }, { status: guardia.status });
    }

    try {
        const form = await request.formData().catch(() => null);
        if (!form) {
            return NextResponse.json({ success: false, message: 'No llegó ningún archivo.' }, { status: 400 });
        }

        const idJugador = Number(form.get('idJugador'));
        if (!Number.isInteger(idJugador) || idJugador <= 0) {
            return NextResponse.json({ success: false, message: 'Jugador no válido' }, { status: 400 });
        }

        const archivo = form.get('archivo');
        if (!(archivo instanceof File)) {
            return NextResponse.json({ success: false, message: 'No llegó ningún archivo.' }, { status: 400 });
        }

        /* La MISMA comprobación que ya hizo la pantalla. No sobra: a esta ruta se le
           puede hablar sin pasar por ella. */
        const rechazo = motivoRechazo(archivo.name, archivo.size);
        if (rechazo) {
            return NextResponse.json({ success: false, message: rechazo }, { status: 400 });
        }
        const formato = formatoDeArchivo(archivo.name)!;

        /* El jugador tiene que existir: la tabla no puede tener llave foránea contra
           tblJugadores porque esa es MyISAM, así que el huérfano se evita aquí. */
        const [existe] = (await pool.query(
            'SELECT IdJugador FROM tblJugadores WHERE IdJugador = ? LIMIT 1',
            [idJugador],
        )) as [Array<{ IdJugador: number }>, unknown];
        if (existe.length === 0) {
            return NextResponse.json({ success: false, message: 'El jugador no existe' }, { status: 404 });
        }

        const [cuantos] = (await pool.query(
            'SELECT COUNT(*) AS n FROM tblJugadoresDocumentos WHERE IdJugador = ?',
            [idJugador],
        )) as [Array<{ n: number }>, unknown];
        if (Number(cuantos[0]?.n ?? 0) >= MAX_DOCUMENTOS_POR_JUGADOR) {
            return NextResponse.json(
                {
                    success: false,
                    message: `Este jugador ya tiene ${MAX_DOCUMENTOS_POR_JUGADOR} documentos. Borra alguno para subir otro.`,
                },
                { status: 409 },
            );
        }

        const descripcion = String(form.get('descripcion') ?? '').trim().slice(0, 255);
        const bytes = Buffer.from(await archivo.arrayBuffer());
        const usuario = await getSessionUser();

        /* El MIME que se guarda es el de la tabla de formatos, NO el que declaró el
           navegador: es lo que después decide con qué encabezado se sirve, y dejar entrar
           ahí una cadena del cliente sería dejarle elegir cómo lo interpreta el navegador
           de quien lo descargue. */
        const [res] = (await pool.query(
            `INSERT INTO tblJugadoresDocumentos
                (IdJugador, Nombre, Descripcion, TipoMime, Bytes, Contenido, IdUsuario, FechaAlta)
             VALUES (?, ?, ?, ?, ?, ?, ?, NOW())`,
            [
                idJugador,
                archivo.name.slice(0, 255),
                descripcion,
                formato.mime,
                bytes.length,
                bytes,
                usuario?.IdUsuario ?? null,
            ],
        )) as [{ insertId: number }, unknown];

        return NextResponse.json({ success: true, idDocumento: res.insertId });
    } catch (error) {
        console.error('Error al guardar el documento del jugador:', error);
        return NextResponse.json(
            { success: false, message: 'Error al guardar el documento' },
            { status: 500 },
        );
    }
}
