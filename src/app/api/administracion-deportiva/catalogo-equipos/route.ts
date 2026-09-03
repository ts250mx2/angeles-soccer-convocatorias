import { NextResponse } from 'next/server';
import { pool } from '@/lib/db';
import { CLAVE_EQUIPOS } from '@/lib/navegacion';
import { requierePagina } from '@/lib/permisos';

export const dynamic = 'force-dynamic';

const DIAS = [
    'LunesStr', 'MartesStr', 'MiercolesStr', 'JuevesStr',
    'ViernesStr', 'SabadoStr', 'DomingoStr',
] as const;

type AltaEquipo = {
    idEquipo?: unknown;
    anioInicio?: unknown;
    anioFin?: unknown;
    serie?: unknown;
    idSede?: unknown;
    idEntrenador?: unknown;
    idTipoEquipo?: unknown;
    genero?: unknown;
    cupo?: unknown;
    esSelectivo?: unknown;
    esCompetencia?: unknown;
    idLiga?: unknown;
    horarios?: unknown;
};

function entero(valor: unknown): number {
    if (typeof valor === 'number') return Number.isInteger(valor) ? valor : NaN;
    if (typeof valor === 'string' && /^-?\d+$/.test(valor)) return Number(valor);
    return NaN;
}

function horarioValido(valor: unknown): valor is string {
    if (valor === '') return true;
    if (typeof valor !== 'string') return false;
    const m = /^(\d{2}):(\d{2}) - (\d{2}):(\d{2})$/.exec(valor);
    if (!m) return false;
    const inicio = Number(m[1]) * 60 + Number(m[2]);
    const fin = Number(m[3]) * 60 + Number(m[4]);
    return Number(m[1]) < 24 && Number(m[2]) < 60
        && Number(m[3]) < 24 && Number(m[4]) < 60 && fin > inicio;
}

export async function GET() {
    const guardia = await requierePagina(CLAVE_EQUIPOS);
    if (!guardia.ok) {
        return NextResponse.json({ success: false, message: guardia.message }, { status: guardia.status });
    }

    try {
        const [equipos, sedes, entrenadores, tipos, ligas] = await Promise.all([
            pool.query(
                `SELECT E.IdEquipo, E.Equipo, E.AnioInicio, E.AnioFin, E.Serie,
                        E.IdSede, S.Sede, E.IdEntrenador, U.Usuario AS Coach,
                        E.IdTipoEquipo, T.TipoEquipo, E.Genero, COALESCE(E.Cupo, 0) AS Cupo,
                        COALESCE(E.EsSelectivo, 0) AS EsSelectivo,
                        COALESCE(E.EsCompetencia, 0) AS EsCompetencia,
                        COALESCE(E.IdLiga, 0) AS IdLiga, L.Liga,
                        E.LunesStr, E.MartesStr, E.MiercolesStr, E.JuevesStr,
                        E.ViernesStr, E.SabadoStr, E.DomingoStr,
                        COALESCE(J.Jugadores, 0) AS Jugadores
                   FROM tblEquipos E
                   LEFT JOIN tblSedes S ON S.IdSede = E.IdSede
                   LEFT JOIN tblUsuarios U ON U.IdUsuario = E.IdEntrenador
                   LEFT JOIN tblTiposEquipos T ON T.IdTipoEquipo = E.IdTipoEquipo
                   LEFT JOIN tblLigas L ON L.IdLiga = E.IdLiga
                   LEFT JOIN (
                       SELECT IdEquipo, COUNT(*) AS Jugadores
                         FROM tblJugadores
                        WHERE Status = 0 AND IdEquipo IS NOT NULL
                        GROUP BY IdEquipo
                   ) J ON J.IdEquipo = E.IdEquipo
                  WHERE E.Status = 0 AND COALESCE(TRIM(E.Equipo), '') <> ''
                  ORDER BY COALESCE(S.Sede, 'ZZZ'), E.AnioInicio DESC, E.Equipo ASC`,
            ),
            pool.query('SELECT IdSede, Sede FROM tblSedes WHERE Status = 0 ORDER BY Sede'),
            pool.query('SELECT IdUsuario, Usuario FROM tblUsuarios WHERE Status = 0 ORDER BY Usuario'),
            pool.query('SELECT IdTipoEquipo, TipoEquipo FROM tblTiposEquipos WHERE Status = 0 ORDER BY TipoEquipo'),
            pool.query('SELECT IdLiga, Liga FROM tblLigas WHERE Status = 0 ORDER BY Liga'),
        ]);

        return NextResponse.json({
            success: true,
            data: {
                equipos: equipos[0], sedes: sedes[0], entrenadores: entrenadores[0],
                tipos: tipos[0], ligas: ligas[0],
            },
        });
    } catch (error) {
        console.error('Error al cargar el catalogo de equipos:', error);
        return NextResponse.json({ success: false, message: 'No se pudo cargar el catálogo de equipos.' }, { status: 500 });
    }
}

async function guardarEquipo(request: Request, editando: boolean) {
    const guardia = await requierePagina(CLAVE_EQUIPOS);
    if (!guardia.ok) {
        return NextResponse.json({ success: false, message: guardia.message }, { status: guardia.status });
    }

    let body: AltaEquipo;
    try {
        body = await request.json() as AltaEquipo;
    } catch {
        return NextResponse.json({ success: false, message: 'Los datos del equipo no son válidos.' }, { status: 400 });
    }

    const anioInicio = entero(body.anioInicio);
    const idEquipo = editando ? entero(body.idEquipo) : 0;
    const anioFin = entero(body.anioFin);
    const serie = String(body.serie ?? '').trim().toUpperCase();
    const idSede = entero(body.idSede);
    const idEntrenador = entero(body.idEntrenador);
    const idTipoEquipo = entero(body.idTipoEquipo);
    const genero = entero(body.genero);
    const cupo = entero(body.cupo);
    const esCompetencia = body.esCompetencia === true;
    const esSelectivo = body.esSelectivo === true;
    const idLiga = esCompetencia ? entero(body.idLiga) : 0;
    const horariosEntrada = body.horarios && typeof body.horarios === 'object'
        ? body.horarios as Record<string, unknown>
        : {};
    const horarios = DIAS.map((dia) => String(horariosEntrada[dia] ?? ''));
    const anioMaximo = new Date().getFullYear() + 5;

    if (editando && (!Number.isInteger(idEquipo) || idEquipo <= 0)) {
        return NextResponse.json({ success: false, message: 'El equipo que quieres editar no es válido.' }, { status: 400 });
    }

    if (!Number.isInteger(anioInicio) || anioInicio < 1900 || anioInicio > anioMaximo
        || !Number.isInteger(anioFin) || anioFin < anioInicio || anioFin > anioMaximo) {
        return NextResponse.json({ success: false, message: 'Revisa el rango de años de la categoría.' }, { status: 400 });
    }
    if (!serie || serie.length > 10) {
        return NextResponse.json({ success: false, message: 'Captura una serie de hasta 10 caracteres.' }, { status: 400 });
    }
    if ((!esCompetencia && (!Number.isInteger(idSede) || idSede <= 0))
        || !Number.isInteger(idEntrenador) || idEntrenador <= 0
        || !Number.isInteger(idTipoEquipo) || idTipoEquipo <= 0
        || ![1, 2, 3].includes(genero)
        || !Number.isInteger(cupo) || cupo < 0
        || (esCompetencia && (!Number.isInteger(idLiga) || idLiga <= 0))) {
        return NextResponse.json({ success: false, message: 'Completa los campos obligatorios del equipo.' }, { status: 400 });
    }
    if (!horarios.every(horarioValido)) {
        return NextResponse.json({ success: false, message: 'La hora final debe ser posterior a la inicial.' }, { status: 400 });
    }

    const sedeGuardada = Number.isInteger(idSede) && idSede > 0 ? idSede : 0;
    const equipo = `${anioInicio}${anioFin !== anioInicio ? `-${anioFin}` : ''}${serie}`;
    const conexion = await pool.getConnection();
    try {
        await conexion.beginTransaction();
        const [catalogos] = (await conexion.query(
            `SELECT
                EXISTS(SELECT 1 FROM tblSedes WHERE IdSede = ? AND Status = 0) AS sede,
                EXISTS(SELECT 1 FROM tblUsuarios WHERE IdUsuario = ? AND Status = 0) AS entrenador,
                EXISTS(SELECT 1 FROM tblTiposEquipos WHERE IdTipoEquipo = ? AND Status = 0) AS tipo,
                ${esCompetencia ? 'EXISTS(SELECT 1 FROM tblLigas WHERE IdLiga = ? AND Status = 0)' : '1'} AS liga`,
            esCompetencia
                ? [sedeGuardada, idEntrenador, idTipoEquipo, idLiga]
                : [sedeGuardada, idEntrenador, idTipoEquipo],
        )) as [{ sede: number; entrenador: number; tipo: number; liga: number }[], unknown];
        const refs = catalogos[0];
        if ((!esCompetencia && !refs.sede) || !refs.entrenador || !refs.tipo || !refs.liga) {
            await conexion.rollback();
            return NextResponse.json({ success: false, message: 'Uno de los catálogos seleccionados ya no está vigente.' }, { status: 400 });
        }

        const [duplicados] = (await conexion.query(
            `SELECT IdEquipo FROM tblEquipos
              WHERE UPPER(TRIM(Equipo)) = UPPER(?) AND IdSede = ? AND Status = 0
                AND IdEquipo <> ? LIMIT 1`,
            [equipo, sedeGuardada, idEquipo],
        )) as [{ IdEquipo: number }[], unknown];
        if (duplicados.length > 0) {
            await conexion.rollback();
            return NextResponse.json({ success: false, message: `${equipo} ya existe en esta sede.` }, { status: 409 });
        }

        let idGuardado = idEquipo;
        if (editando) {
            const [resultado] = await conexion.query(
                `UPDATE tblEquipos
                    SET Equipo = ?, AnioInicio = ?, AnioFin = ?, Serie = ?, IdSede = ?,
                        IdEntrenador = ?, IdTipoEquipo = ?, Genero = ?, Cupo = ?, EsSelectivo = ?,
                        LunesStr = ?, MartesStr = ?, MiercolesStr = ?, JuevesStr = ?,
                        ViernesStr = ?, SabadoStr = ?, DomingoStr = ?, IdLiga = ?,
                        FechaAct = NOW(), EsCompetencia = ?
                  WHERE IdEquipo = ? AND Status = 0`,
                [equipo, anioInicio, anioFin, serie, sedeGuardada, idEntrenador, idTipoEquipo,
                    genero, cupo, esSelectivo ? 1 : 0, ...horarios, idLiga,
                    esCompetencia ? 1 : 0, idEquipo],
            );
            if ((resultado as { affectedRows: number }).affectedRows === 0) {
                await conexion.rollback();
                return NextResponse.json({ success: false, message: 'El equipo ya no está vigente.' }, { status: 404 });
            }
        } else {
            const [resultado] = await conexion.query(
                `INSERT INTO tblEquipos
                    (Equipo, AnioInicio, AnioFin, Serie, IdSede, IdEntrenador, IdTipoEquipo,
                     Genero, Cupo, EsSelectivo, LunesStr, MartesStr, MiercolesStr,
                     JuevesStr, ViernesStr, SabadoStr, DomingoStr, IdLiga, FechaAct, Status, EsCompetencia)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), 0, ?)`,
                [equipo, anioInicio, anioFin, serie, sedeGuardada, idEntrenador, idTipoEquipo,
                    genero, cupo, esSelectivo ? 1 : 0, ...horarios, idLiga, esCompetencia ? 1 : 0],
            );
            idGuardado = (resultado as { insertId: number }).insertId;
        }
        await conexion.commit();
        return NextResponse.json({
            success: true,
            data: { idEquipo: idGuardado, equipo },
            message: editando ? `Cambios de ${equipo} guardados.` : `Equipo ${equipo} creado.`,
        }, { status: editando ? 200 : 201 });
    } catch (error) {
        await conexion.rollback();
        console.error('Error al crear el equipo:', error);
        return NextResponse.json({ success: false, message: 'No se pudo guardar el equipo.' }, { status: 500 });
    } finally {
        conexion.release();
    }
}

export async function POST(request: Request) {
    return guardarEquipo(request, false);
}

export async function PUT(request: Request) {
    return guardarEquipo(request, true);
}
