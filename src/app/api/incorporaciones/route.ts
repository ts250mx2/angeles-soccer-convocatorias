import { NextResponse } from 'next/server';
import { z } from 'zod';
import { pool } from '@/lib/db';
import { CLAVE_INCORPORACIONES } from '@/lib/navegacion';
import { requierePagina } from '@/lib/permisos';
import { VIGENTE } from '@/lib/copas-ligas';
import {
    AUTORIZANTE, PUESTO_ENTRENADOR, crearIncorporacionSchema,
    type IncorporacionRow, type OpcionProfesor, type OpcionTemporada,
} from '@/lib/incorporaciones';

export const dynamic = 'force-dynamic';

/**
 * Formato de incorporación. Ver @/lib/incorporaciones para qué registra y por qué no
 * mueve al jugador de categoría.
 */

/** Mientras no se aplique la migración, la pantalla lo dice en vez de tronar. */
const faltaLaTabla = (error: unknown): boolean =>
    (error as { code?: string })?.code === 'ER_NO_SUCH_TABLE';

const MENSAJE_SIN_TABLA = 'Falta aplicar migrations/011-incorporaciones.sql en la base de datos.';

export async function GET(request: Request) {
    const guardia = await requierePagina(CLAVE_INCORPORACIONES);
    if (!guardia.ok) {
        return NextResponse.json({ success: false, message: guardia.message }, { status: guardia.status });
    }

    try {
        const { searchParams } = new URL(request.url);
        const temporadaId = Number(searchParams.get('temporadaId')) || null;

        const [temporadas] = (await pool.query(
            `SELECT IdTemporada, Temporada, COALESCE(EsActiva, 0) AS EsActiva
             FROM tblTemporadas ORDER BY IdTemporada DESC`,
        )) as [Array<{ IdTemporada: number; Temporada: string; EsActiva: number }>, unknown];

        const activa = temporadas.find((t) => Number(t.EsActiva) === 1)?.IdTemporada
            ?? temporadas[0]?.IdTemporada ?? null;
        const temporada = temporadaId ?? activa;

        /* Profesores y categorías viajan completos: son 186 y 331, caben de sobra en la
           respuesta y así los buscadores de la pantalla filtran al teclear sin ir al
           servidor en cada letra. Los jugadores no: esos son miles y se buscan aparte. */
        const [profesores] = (await pool.query(
            `SELECT IdUsuario, Usuario FROM tblUsuarios
             WHERE COALESCE(Status, 0) = 0 AND IdPuesto = ${PUESTO_ENTRENADOR}
             ORDER BY Usuario ASC`,
        )) as [OpcionProfesor[], unknown];

        const [categorias] = (await pool.query(
            `SELECT DISTINCT Categoria FROM tblJugadores
             WHERE Categoria IS NOT NULL AND Categoria <> ''
             ORDER BY Categoria ASC`,
        )) as [Array<{ Categoria: string }>, unknown];

        const [data] = (await pool.query(
            `SELECT I.IdIncorporacion, I.IdTemporada, T.Temporada,
                    DATE_FORMAT(I.FechaCaptura, '%Y-%m-%d') AS FechaCaptura,
                    I.IdProfesor, P.Usuario AS Profesor,
                    I.IdJugador, J.Jugador, J.Sede,
                    I.Procedencia, I.GrupoIncorporar, I.Justificacion,
                    I.Autorizacion,
                    DATE_FORMAT(I.FechaAutorizacion, '%Y-%m-%d %H:%i') AS FechaAutorizacion,
                    I.Status, A.Usuario,
                    J.Categoria AS CategoriaActual
             FROM tblIncorporaciones I
             LEFT JOIN tblTemporadas T ON T.IdTemporada = I.IdTemporada
             LEFT JOIN tblUsuarios   P ON P.IdUsuario   = I.IdProfesor
             LEFT JOIN tblUsuarios   A ON A.IdUsuario   = I.IdUsuarioAlta
             LEFT JOIN tblJugadores  J ON J.IdJugador   = I.IdJugador
             WHERE I.IdTemporada = ?
             ORDER BY I.FechaCaptura DESC, I.IdIncorporacion DESC`,
            [temporada],
        )) as [IncorporacionRow[], unknown];

        const opcionesTemporada: OpcionTemporada[] = temporadas.map((t) => ({
            IdTemporada: t.IdTemporada,
            Temporada: t.Temporada,
            EsActiva: Number(t.EsActiva) === 1,
        }));

        return NextResponse.json(
            {
                success: true,
                data,
                profesores,
                categorias: categorias.map((c) => c.Categoria),
                temporadas: opcionesTemporada,
                temporada,
                autorizante: AUTORIZANTE,
            },
            { headers: { 'Cache-Control': 'no-store' } },
        );
    } catch (error) {
        if (faltaLaTabla(error)) {
            return NextResponse.json({ success: false, message: MENSAJE_SIN_TABLA }, { status: 503 });
        }
        console.error('Error al obtener las incorporaciones:', error);
        return NextResponse.json({ success: false, message: 'Error al obtener las incorporaciones' }, { status: 500 });
    }
}

/** Una incorporación: una fila del formato. */
export async function POST(request: Request) {
    const guardia = await requierePagina(CLAVE_INCORPORACIONES);
    if (!guardia.ok) {
        return NextResponse.json({ success: false, message: guardia.message }, { status: guardia.status });
    }

    try {
        const datos = crearIncorporacionSchema.parse(await request.json());

        const [temporada] = (await pool.query(
            'SELECT IdTemporada FROM tblTemporadas WHERE IdTemporada = ? LIMIT 1',
            [datos.temporadaId],
        )) as [Array<{ IdTemporada: number }>, unknown];
        if (temporada.length === 0) {
            return NextResponse.json({ success: false, message: 'El ciclo no existe' }, { status: 400 });
        }

        const [profesor] = (await pool.query(
            'SELECT IdUsuario FROM tblUsuarios WHERE IdUsuario = ? LIMIT 1',
            [datos.idProfesor],
        )) as [Array<{ IdUsuario: number }>, unknown];
        if (profesor.length === 0) {
            return NextResponse.json({ success: false, message: 'El profesor no existe' }, { status: 400 });
        }

        /* La procedencia sale de la base, no de la petición: es la categoría real del
           jugador en este momento, y el formato debe conservarla aunque el cambio se
           aplique después. */
        const [jugador] = (await pool.query(
            'SELECT IdJugador, Categoria FROM tblJugadores WHERE IdJugador = ? LIMIT 1',
            [datos.idJugador],
        )) as [Array<{ IdJugador: number; Categoria: string | null }>, unknown];
        if (jugador.length === 0) {
            return NextResponse.json({ success: false, message: 'El jugador no existe' }, { status: 400 });
        }

        const grupo = datos.grupoIncorporar.toUpperCase();
        if ((jugador[0].Categoria ?? '').toUpperCase() === grupo) {
            return NextResponse.json(
                { success: false, message: 'El jugador ya está en ese grupo: la incorporación no cambiaría nada.' },
                { status: 409 },
            );
        }

        /* Firma: se resuelve el autorizante por nombre y se guarda TAMBIÉN el nombre. Si
           mañana ese usuario se renombra o se da de baja, el formato ya firmado sigue
           diciendo quién lo autorizó. */
        const [autoriza] = (await pool.query(
            'SELECT IdUsuario, Usuario FROM tblUsuarios WHERE Usuario = ? LIMIT 1',
            [AUTORIZANTE],
        )) as [Array<{ IdUsuario: number; Usuario: string }>, unknown];

        const [res] = (await pool.query(
            `INSERT INTO tblIncorporaciones
                (IdTemporada, FechaCaptura, IdProfesor, IdJugador, Procedencia, GrupoIncorporar,
                 Justificacion, IdUsuarioAutoriza, Autorizacion, FechaAutorizacion,
                 Status, IdUsuarioAlta, FechaAlta, FechaAct)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), ${VIGENTE}, ?, NOW(), NOW())`,
            [
                datos.temporadaId, datos.fecha, datos.idProfesor, datos.idJugador,
                jugador[0].Categoria, grupo, datos.justificacion || null,
                autoriza[0]?.IdUsuario ?? null, autoriza[0]?.Usuario ?? AUTORIZANTE,
                guardia.user.IdUsuario,
            ],
        )) as [{ insertId: number }, unknown];

        return NextResponse.json({ success: true, idIncorporacion: res.insertId });
    } catch (error) {
        if (error instanceof z.ZodError) {
            return NextResponse.json({ success: false, message: error.issues[0].message }, { status: 400 });
        }
        if (faltaLaTabla(error)) {
            return NextResponse.json({ success: false, message: MENSAJE_SIN_TABLA }, { status: 503 });
        }
        console.error('Error al crear la incorporación:', error);
        return NextResponse.json({ success: false, message: 'Error al guardar la incorporación' }, { status: 500 });
    }
}
