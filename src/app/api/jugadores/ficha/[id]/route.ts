import { NextResponse } from 'next/server';
import { z } from 'zod';
import { pool } from '@/lib/db';
import { CLAVE_LISTA_JUGADORES } from '@/lib/navegacion';
import { requierePagina } from '@/lib/permisos';
import { ACTIVO, BAJA, FICHA_NUEVA, jugadorSchema } from '@/lib/jugador-form';
import { actualizarJugador } from '@/lib/jugador-guardar';

export const dynamic = 'force-dynamic';

/**
 * La ficha completa de un jugador: la que se abre a editar.
 *
 * El listado de /api/jugadores trae lo justo para pintar la tabla; aquí se traen los
 * cuarenta y tantos campos de la ficha, y solo del jugador que se va a editar. Traerlos
 * en el listado engordaría cuatro mil filas para que se usen en una.
 */

interface FilaFicha {
    IdJugador: number;
    Jugador: string | null;
    Categoria: string | null;
    IdEquipo: number | null;
    Coach: string | null;
    IdSede: number | null;
    Sede: string | null;
    SedeNombre: string | null;
    Genero: number | null;
    IdTipoJugador: number | null;
    IdEsquemaPago: number | null;
    ViveCon: string | null;
    FechaNacimiento: string | null;
    EntidadNacimiento: string | null;
    CURP: string | null;
    Dorsal: string | null;
    NumeroSocio: string | null;
    ContactoEmergencia: string | null;
    Observaciones: string | null;
    Beca: number | null;
    BecaCopas: number | null;
    BecaLigas: number | null;
    IngresosMensuales: number | null;
    IdEscuela: number | null;
    Escuela: string | null;
    NivelEducativo: string | null;
    Padre: string | null;
    TelPadre: string | null;
    CorreoElectronicoPadre: string | null;
    Madre: string | null;
    TelMadre: string | null;
    CorreoElectronicoMadre: string | null;
    TelCasa: string | null;
    Calle: string | null;
    NumExterior: string | null;
    NumInterior: string | null;
    Colonia: string | null;
    CodigoPostal: string | null;
    Municipio: string | null;
    Estado: string | null;
    Foto: string | null;
    Status: number | null;
    MotivoBaja: string | null;
}

/** Los mismos campos que captura el formulario, ni uno mas. */
type Ficha = typeof FICHA_NUEVA;

const txt = (v: unknown): string => String(v ?? '').trim();
/* Los números de la ficha se mandan como texto para que el campo pueda quedar vacío:
   un 0 escrito en la caja de beca no es lo mismo que no haber capturado beca. */
const num = (v: unknown): string => (v === null || v === undefined ? '' : String(v));

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
    const guardia = await requierePagina(CLAVE_LISTA_JUGADORES);
    if (!guardia.ok) {
        return NextResponse.json({ success: false, message: guardia.message }, { status: guardia.status });
    }

    try {
        const { id } = await params;
        const idJugador = Number(id);
        if (!Number.isInteger(idJugador) || idJugador <= 0) {
            return NextResponse.json({ success: false, message: 'Jugador no válido' }, { status: 400 });
        }

        const [filas] = (await pool.query(
            `SELECT J.IdJugador, J.Jugador, J.Categoria, J.IdEquipo, J.Coach, J.IdSede, J.Sede,
                    SD.Sede AS SedeNombre,
                    J.Genero, J.IdTipoJugador, J.IdEsquemaPago, J.ViveCon,
                    DATE_FORMAT(J.FechaNacimiento, '%Y-%m-%d') AS FechaNacimiento,
                    J.EntidadNacimiento, J.CURP, J.Dorsal, J.NumeroSocio,
                    J.ContactoEmergencia, J.Observaciones,
                    J.Beca, J.BecaCopas, J.BecaLigas, J.IngresosMensuales,
                    J.IdEscuela, J.Escuela, ES.NivelEducativo,
                    J.Padre, J.TelPadre, J.CorreoElectronicoPadre,
                    J.Madre, J.TelMadre, J.CorreoElectronicoMadre, J.TelCasa,
                    J.Calle, J.NumExterior, J.NumInterior, J.Colonia,
                    J.CodigoPostal, J.Municipio, J.Estado,
                    J.Foto,
                    J.Status,
                    NULLIF(TRIM(COALESCE(J.ObservacionesVenta, '')), '') AS MotivoBaja
               FROM tblJugadores J
               LEFT JOIN tblSedes SD ON SD.IdSede = J.IdSede
               LEFT JOIN tblEscuelas ES ON ES.IdEscuela = J.IdEscuela
              WHERE J.IdJugador = ?`,
            [idJugador],
        )) as [FilaFicha[], unknown];

        if (filas.length === 0) {
            return NextResponse.json({ success: false, message: 'El jugador no existe' }, { status: 404 });
        }

        const f = filas[0];
        /* La ficha viaja aparte del id y del nivel escolar, y no todo revuelto en un
           mismo objeto: la pantalla la carga tal cual en el formulario, y cualquier
           campo de más terminaría de vuelta en el PUT como si fuera capturable. El nivel
           escolar es del catálogo de escuelas, no del jugador; se manda solo para
           mostrarlo. */
        const ficha: Ficha = {
            jugador: txt(f.Jugador),
            categoria: txt(f.Categoria),
            idEquipo: Number(f.IdEquipo) || 0,
            coach: txt(f.Coach),
            /* La sede se muestra con el nombre del catálogo, no con la copia que quedó
               congelada en la ficha: si a una sede le cambiaron el nombre, la copia está
               vieja y volver a guardarla la propagaría. */
            idSede: Number(f.IdSede) || 0,
            sede: txt(f.SedeNombre) || txt(f.Sede),

            genero: Number(f.Genero) || 0,
            idTipoJugador: Number(f.IdTipoJugador) || 0,
            idEsquemaPago: Number(f.IdEsquemaPago) || 0,
            viveCon: Number(txt(f.ViveCon)) || 0,

            fechaNacimiento: txt(f.FechaNacimiento),
            entidadNacimiento: txt(f.EntidadNacimiento),
            curp: txt(f.CURP),
            dorsal: txt(f.Dorsal),
            numeroSocio: txt(f.NumeroSocio),
            contactoEmergencia: txt(f.ContactoEmergencia),
            observaciones: txt(f.Observaciones),

            beca: num(f.Beca),
            becaCopas: num(f.BecaCopas),
            becaLigas: num(f.BecaLigas),
            ingresosMensuales: num(f.IngresosMensuales),

            idEscuela: Number(f.IdEscuela) || 0,
            escuela: txt(f.Escuela),

            padre: txt(f.Padre),
            telPadre: txt(f.TelPadre),
            correoElectronicoPadre: txt(f.CorreoElectronicoPadre),
            madre: txt(f.Madre),
            telMadre: txt(f.TelMadre),
            correoElectronicoMadre: txt(f.CorreoElectronicoMadre),
            telCasa: txt(f.TelCasa),

            calle: txt(f.Calle),
            numExterior: txt(f.NumExterior),
            numInterior: txt(f.NumInterior),
            colonia: txt(f.Colonia),
            codigoPostal: txt(f.CodigoPostal),
            municipio: txt(f.Municipio),
            estado: txt(f.Estado),

            /* La foto viaja dentro de la ficha, y no por una ruta aparte como el escudo
               de las copas y ligas. Ahí son 55 escudos en un mismo listado y mandarlos
               todos engordaría la respuesta; aquí es una sola foto de un solo jugador,
               que además hay que poder editar y volver a mandar. */
            foto: txt(f.Foto) || null,

            status: Number(f.Status) === BAJA ? BAJA : ACTIVO,
            motivoBaja: txt(f.MotivoBaja),
        };

        return NextResponse.json({
            success: true,
            data: { idJugador: Number(f.IdJugador), nivelEducativo: txt(f.NivelEducativo), ficha },
        });
    } catch (error) {
        console.error('Error al obtener la ficha del jugador:', error);
        return NextResponse.json(
            { success: false, message: 'Error al obtener la ficha del jugador' },
            { status: 500 },
        );
    }
}

/** Guarda los cambios de la ficha. Ver `actualizarJugador` para qué columnas toca. */
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
    const guardia = await requierePagina(CLAVE_LISTA_JUGADORES);
    if (!guardia.ok) {
        return NextResponse.json({ success: false, message: guardia.message }, { status: guardia.status });
    }

    try {
        const { id } = await params;
        const idJugador = Number(id);
        if (!Number.isInteger(idJugador) || idJugador <= 0) {
            return NextResponse.json({ success: false, message: 'Jugador no válido' }, { status: 400 });
        }

        const [existe] = (await pool.query(
            'SELECT IdJugador FROM tblJugadores WHERE IdJugador = ? LIMIT 1',
            [idJugador],
        )) as [Array<{ IdJugador: number }>, unknown];
        if (existe.length === 0) {
            return NextResponse.json({ success: false, message: 'El jugador no existe' }, { status: 404 });
        }

        const datos = jugadorSchema.parse(await request.json());
        await actualizarJugador(pool, idJugador, datos, guardia.user.IdUsuario);

        return NextResponse.json({ success: true });
    } catch (error) {
        if (error instanceof z.ZodError) {
            return NextResponse.json({ success: false, message: error.issues[0].message }, { status: 400 });
        }
        console.error('Error al guardar la ficha del jugador:', error);
        return NextResponse.json(
            { success: false, message: 'Error al guardar la ficha del jugador' },
            { status: 500 },
        );
    }
}
