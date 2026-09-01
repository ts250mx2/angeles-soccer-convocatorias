import { NextResponse } from 'next/server';
import { z } from 'zod';
import { pool } from '@/lib/db';
import { CLAVE_ASISTENCIA } from '@/lib/navegacion';
import { requierePagina } from '@/lib/permisos';
import { getSessionUser } from '@/lib/auth';
import { DIAS_SEMANA, horarioDeEquipo, etiquetaBeca } from '@/lib/plantilla-equipo';
import { inscritoEnTemporada } from '@/lib/jugador-filtros';
import { JUGADORES_DE_TEMPORADA_SQL, MENSUALIDADES_EN_TEMPORADA_SQL } from '@/lib/temporada';
import { diasDelMes, type Marca } from '@/lib/asistencia';
import { loadSeasonAndPrevious } from '@/lib/adeudos-db';
import { jugadoresConAdeudo } from '@/lib/adeudos-jugadores';

export const dynamic = 'force-dynamic';

/**
 * La hoja de asistencia de un equipo en un mes.
 *
 * El GET arma la hoja completa —encabezado, columnas de los días y alumnos con lo que ya
 * esté marcado— y el POST guarda el mes entero de un golpe.
 *
 * Se manda TODO el mes junto y no una marca por petición porque pasar lista son quince
 * toques seguidos: una petición por toque sería una tormenta de escrituras que además se
 * cruzan entre sí. Es el mismo trato que la Plantilla le da al acomodo.
 *
 * Los alumnos son los INSCRITOS en la temporada elegida, con la MISMA regla de
 * Inscripciones, de la Lista de Jugadores y de la Plantilla. Que sea la misma regla es lo
 * que hace que el equipo tenga los mismos nombres en las tres pantallas.
 */

interface FilaEquipo {
    IdEquipo: number;
    Equipo: string | null;
    Sede: string | null;
    Profesor: string | null;
    Auxiliar: string | null;
    [dia: string]: unknown;
}

interface FilaAlumno {
    IdJugador: number;
    Jugador: string | null;
    Beca: number | null;
    BecaCopas: number | null;
    BecaLigas: number | null;
    TieneFoto: number;
    FotoVersion: string | null;
}

const num = (v: unknown): number => Number(v) || 0;

/** El mes se pide como año y mes por separado: es lo que eligen los dos selectores. */
const periodo = (params: URLSearchParams) => ({
    idEquipo: Number(params.get('idEquipo')),
    temporadaId: Number(params.get('temporadaId')),
    anio: Number(params.get('anio')),
    mes: Number(params.get('mes')),
});

const periodoValido = (p: ReturnType<typeof periodo>): string | null => {
    if (!Number.isInteger(p.idEquipo) || p.idEquipo <= 0) return 'Selecciona un equipo.';
    if (!Number.isInteger(p.temporadaId) || p.temporadaId <= 0) return 'Selecciona una temporada.';
    if (!Number.isInteger(p.anio) || p.anio < 2000 || p.anio > 2100) return 'El año no es válido.';
    if (!Number.isInteger(p.mes) || p.mes < 1 || p.mes > 12) return 'El mes no es válido.';
    return null;
};

export async function GET(request: Request) {
    const guardia = await requierePagina(CLAVE_ASISTENCIA);
    if (!guardia.ok) {
        return NextResponse.json({ success: false, message: guardia.message }, { status: guardia.status });
    }

    const p = periodo(new URL(request.url).searchParams);
    const mal = periodoValido(p);
    if (mal) return NextResponse.json({ success: false, message: mal }, { status: 400 });

    try {
        const columnasDias = DIAS_SEMANA.map(([col]) => `E.${col}`).join(', ');
        const [equipos] = (await pool.query(
            `SELECT E.IdEquipo, E.Equipo, S.Sede,
                    PROF.Usuario AS Profesor,
                    AUX.Usuario  AS Auxiliar,
                    ${columnasDias}
               FROM tblEquipos E
               LEFT JOIN tblSedes S      ON S.IdSede    = E.IdSede
               LEFT JOIN tblUsuarios PROF ON PROF.IdUsuario = E.IdEntrenador
               LEFT JOIN tblUsuarios AUX  ON AUX.IdUsuario  = E.IdAuxiliar
              WHERE E.IdEquipo = ?`,
            [p.idEquipo],
        )) as [FilaEquipo[], unknown];

        if (equipos.length === 0) {
            return NextResponse.json({ success: false, message: 'El equipo no existe' }, { status: 404 });
        }
        const e = equipos[0];

        /* Los alumnos de la hoja: los inscritos en la temporada. La beca va con ellos
           porque la hoja de papel tiene una columna 'OBSERVACION (BECA)' donde se
           escribe a mano; aquí sale ya impresa cuando el alumno tiene alguna. */
        const [alumnos] = (await pool.query(
            `SELECT J.IdJugador, J.Jugador,
                    COALESCE(J.Beca, 0)      AS Beca,
                    COALESCE(J.BecaCopas, 0) AS BecaCopas,
                    COALESCE(J.BecaLigas, 0) AS BecaLigas,
                    -- La cara del alumno: reconocerlo es mas rapido que leer el nombre
                    -- cuando se pasa lista en la cancha. La imagen la sirve
                    -- /api/jugadores/foto; aqui solo viaja si la hay y cuando cambio.
                    CASE WHEN J.Foto IS NOT NULL AND J.Foto <> '' THEN 1 ELSE 0 END AS TieneFoto,
                    DATE_FORMAT(J.FechaAct, '%Y%m%d%H%i%s') AS FotoVersion
               FROM tblJugadores J
               LEFT JOIN tblSedes SD ON SD.IdSede = J.IdSede
               LEFT JOIN (
                   SELECT DISTINCT IdJugador FROM (${JUGADORES_DE_TEMPORADA_SQL}) I
               ) INS ON INS.IdJugador = J.IdJugador
               LEFT JOIN (
                   SELECT DISTINCT IdJugador FROM (${MENSUALIDADES_EN_TEMPORADA_SQL}) M
               ) MEN ON MEN.IdJugador = J.IdJugador
              WHERE J.IdEquipo = ? AND J.Status = 0
                AND ${inscritoEnTemporada('SD')}
              ORDER BY J.Jugador ASC`,
            // Un parametro por subconsulta, en el orden en que aparecen: INS, MEN.
            [p.temporadaId, p.temporadaId, p.idEquipo],
        )) as [FilaAlumno[], unknown];

        /* El adeudo de cada alumno, con la MISMA funcion que Adeudos por Sede y la
           Lista de Jugadores. Se pide acotado a los alumnos de esta hoja
           (`soloJugadores`): sin acotar, la consulta barre tblPagos entera y la hoja de
           un equipo de quince tardaria lo mismo que el reporte de todo el club.

           Quien pasa lista necesita saberlo AHI: es el momento en que tiene al nino
           enfrente, y es cuando se puede recordar el pago sin perseguir a nadie. */
        const temporadas = await loadSeasonAndPrevious(String(p.temporadaId));
        const deudores = temporadas
            ? await jugadoresConAdeudo(temporadas.actual, alumnos.map((a) => Number(a.IdJugador)))
            : new Map();

        const dias = diasDelMes(e, p.anio, p.mes);

        /* Las marcas del mes. Se acota por el rango de fechas y no por los días que
           calculó `diasDelMes`: si al equipo le cambiaron el horario después de pasar
           lista, lo capturado en un día que ya no es de clase seguiría en la base, y
           traerlo es lo que permite darse cuenta en vez de perderlo en silencio. */
        const primero = `${p.anio}-${String(p.mes).padStart(2, '0')}-01`;
        const [marcas] = (await pool.query(
            `SELECT IdJugador, DATE_FORMAT(Fecha, '%Y-%m-%d') AS Fecha, Marca
               FROM tblAsistenciaClases
              WHERE IdEquipo = ?
                AND Fecha >= ?
                AND Fecha < DATE_ADD(?, INTERVAL 1 MONTH)`,
            [p.idEquipo, primero, primero],
        )) as [Array<{ IdJugador: number; Fecha: string; Marca: string }>, unknown];

        return NextResponse.json({
            success: true,
            data: {
                idEquipo: Number(e.IdEquipo),
                equipo: String(e.Equipo ?? '').trim(),
                sede: String(e.Sede ?? '').trim(),
                profesor: String(e.Profesor ?? '').trim(),
                auxiliar: String(e.Auxiliar ?? '').trim(),
                horario: horarioDeEquipo(
                    DIAS_SEMANA.map(([col, nombre]) => ({
                        dia: nombre,
                        horas: String(e[col] ?? '').trim(),
                    })),
                ),
                anio: p.anio,
                mes: p.mes,
                dias,
                alumnos: alumnos.map((a) => {
                    const deudor = deudores.get(Number(a.IdJugador));
                    return {
                    idJugador: Number(a.IdJugador),
                    jugador: String(a.Jugador ?? '').trim(),
                    tieneFoto: Number(a.TieneFoto) === 1,
                    fotoVersion: a.FotoVersion,
                    /* Meses vencidos sin pagar. A quien no se ha inscrito no se le
                       cuentan meses —su pendiente es la inscripcion— y eso se dice
                       aparte con `inscrito`, igual que en la Lista de Jugadores. */
                    mesesDebe: deudor?.inscrito ? deudor.mesesDebe : 0,
                    inscrito: deudor ? deudor.inscrito : true,
                    /* La observación impresa: la beca que tenga, dicha corta. Si no
                       tiene ninguna va vacía, para que quede el espacio en blanco donde
                       el profe escribe a mano ("clase prueba" y demás). */
                    observacion: observacionDeBeca(a),
                    };
                }),
                marcas: marcas.map((m) => ({
                    idJugador: Number(m.IdJugador),
                    fecha: m.Fecha,
                    marca: m.Marca as Marca,
                })),
            },
        });
    } catch (error) {
        console.error('Error al obtener la asistencia:', error);
        return NextResponse.json(
            { success: false, message: 'Error al obtener la hoja de asistencia' },
            { status: 500 },
        );
    }
}

/** 'BECA 50%', 'BECA 100% · COPAS 50%'. Vacío si no tiene ninguna. */
function observacionDeBeca(a: FilaAlumno): string {
    const partes = ([
        ['BECA', num(a.Beca)],
        ['COPAS', num(a.BecaCopas)],
        ['LIGAS', num(a.BecaLigas)],
    ] as const)
        .filter(([, pct]) => pct > 0)
        .map(([nombre, pct]) => `${nombre} ${etiquetaBeca(pct).texto}`);
    return partes.join(' · ');
}

/* ── Guardar el mes ── */

const marcaSchema = z.object({
    idJugador: z.coerce.number().int().positive(),
    fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'La fecha debe venir como AAAA-MM-DD.'),
    marca: z.enum(['A', 'F']),
});

const cuerpoSchema = z.object({
    idEquipo: z.coerce.number().int().positive(),
    anio: z.coerce.number().int().min(2000).max(2100),
    mes: z.coerce.number().int().min(1).max(12),
    /* Solo las marcas puestas. Una celda sin marca NO viaja: "sin registrar" es la
       ausencia del renglón, y el borrado del mes de abajo es lo que la hace efectiva. */
    marcas: z.array(marcaSchema).max(2000),
});

/**
 * Reemplaza la asistencia del equipo en ese mes.
 *
 * Se borra el mes y se reescribe lo que llegó, todo dentro de una transacción. Es la
 * única forma de que DESMARCAR funcione: si solo se insertara lo marcado, quitar una
 * palomita en la pantalla dejaría el renglón viejo en la base y al recargar reaparecería.
 *
 * El borrado se acota al mes y al equipo, así que no toca lo capturado en otros meses ni
 * la hoja de otro equipo del mismo alumno.
 */
export async function POST(request: Request) {
    const guardia = await requierePagina(CLAVE_ASISTENCIA);
    if (!guardia.ok) {
        return NextResponse.json({ success: false, message: guardia.message }, { status: guardia.status });
    }

    const parseo = cuerpoSchema.safeParse(await request.json().catch(() => null));
    if (!parseo.success) {
        return NextResponse.json(
            { success: false, message: parseo.error.issues[0]?.message ?? 'Datos incompletos.' },
            { status: 400 },
        );
    }
    const { idEquipo, anio, mes, marcas } = parseo.data;

    /* Las fechas tienen que caer en el mes que se dice estar guardando. Sin esta reja,
       un cuerpo mal armado borraría agosto y escribiría en septiembre. */
    const prefijo = `${anio}-${String(mes).padStart(2, '0')}-`;
    if (marcas.some((m) => !m.fecha.startsWith(prefijo))) {
        return NextResponse.json(
            { success: false, message: 'Hay marcas de un mes distinto al que se está guardando.' },
            { status: 400 },
        );
    }

    const usuario = await getSessionUser();
    const primero = `${prefijo}01`;
    const conexion = await pool.getConnection();
    try {
        await conexion.beginTransaction();
        await conexion.query(
            `DELETE FROM tblAsistenciaClases
              WHERE IdEquipo = ? AND Fecha >= ? AND Fecha < DATE_ADD(?, INTERVAL 1 MONTH)`,
            [idEquipo, primero, primero],
        );
        if (marcas.length > 0) {
            await conexion.query(
                `INSERT INTO tblAsistenciaClases
                    (IdEquipo, IdJugador, Fecha, Marca, IdUsuario, FechaAct)
                 VALUES ?`,
                [marcas.map((m) => [idEquipo, m.idJugador, m.fecha, m.marca, usuario?.IdUsuario ?? null, new Date()])],
            );
        }
        await conexion.commit();
        return NextResponse.json({ success: true, guardadas: marcas.length });
    } catch (error) {
        await conexion.rollback();
        console.error('Error al guardar la asistencia:', error);
        return NextResponse.json(
            { success: false, message: 'Error al guardar la asistencia' },
            { status: 500 },
        );
    } finally {
        conexion.release();
    }
}
