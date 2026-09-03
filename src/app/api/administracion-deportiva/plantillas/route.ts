import { NextResponse } from 'next/server';
import { z } from 'zod';
import { pool } from '@/lib/db';
import { CLAVE_PLANTILLAS } from '@/lib/navegacion';
import { requierePagina } from '@/lib/permisos';
import { DIAS_SEMANA, horarioDeEquipo, type JugadorPlantilla, type Plantilla } from '@/lib/plantilla-equipo';
import { inscritoEnTemporada } from '@/lib/jugador-filtros';
import { loadSeasonAndPrevious } from '@/lib/adeudos-db';
import { jugadoresConAdeudo } from '@/lib/adeudos-jugadores';
import { JUGADORES_DE_TEMPORADA_SQL, MENSUALIDADES_EN_TEMPORADA_SQL } from '@/lib/temporada';

export const dynamic = 'force-dynamic';

/**
 * La plantilla de UN equipo: su gente, dónde está parado cada quien y el cuerpo técnico.
 *
 * Las posiciones viven en tblEquiposPlantilla y la pertenencia al equipo en
 * tblJugadores.IdEquipo. Son dos cosas distintas a propósito: quién está en el equipo lo
 * decide la ficha del jugador, y aquí solo se decide dónde se para. Por eso el GET parte
 * de los jugadores y trae la posición con LEFT JOIN: quien no tiene fila sale sin
 * colocar, que es exactamente lo que hay que mostrar.
 */

interface FilaJugador {
    IdJugador: number;
    Jugador: string | null;
    FechaNacimiento: string | null;
    Dorsal: string | null;
    Beca: number | null;
    BecaCopas: number | null;
    BecaLigas: number | null;
    X: string | number | null;
    Y: string | number | null;
    Inscrito: number;
    TieneFoto: number;
    FotoVersion: string | null;
}

interface FilaEquipo {
    IdEquipo: number;
    Equipo: string | null;
    Sede: string | null;
    DT: string | null;
    IdEntrenador: number | null;
    IdAuxiliar: number | null;
    Auxiliar: string | null;
    [dia: string]: unknown;
}

const num = (v: unknown): number => Number(v) || 0;

export async function GET(request: Request) {
    const guardia = await requierePagina(CLAVE_PLANTILLAS);
    if (!guardia.ok) {
        return NextResponse.json({ success: false, message: guardia.message }, { status: guardia.status });
    }

    try {
        const params = new URL(request.url).searchParams;
        const idEquipo = Number(params.get('idEquipo'));
        const temporadaId = Number(params.get('temporadaId'));
        if (!Number.isInteger(idEquipo) || idEquipo <= 0) {
            return NextResponse.json({ success: false, message: 'Selecciona un equipo.' }, { status: 400 });
        }
        if (!Number.isInteger(temporadaId) || temporadaId <= 0) {
            return NextResponse.json({ success: false, message: 'Selecciona una temporada.' }, { status: 400 });
        }

        const columnasDias = DIAS_SEMANA.map(([col]) => `E.${col}`).join(', ');
        const [equipos] = (await pool.query(
            `SELECT E.IdEquipo, E.Equipo, S.Sede,
                    DT.Usuario  AS DT,
                    E.IdEntrenador,
                    E.IdAuxiliar,
                    AUX.Usuario AS Auxiliar,
                    ${columnasDias}
               FROM tblEquipos E
               LEFT JOIN tblSedes S    ON S.IdSede = E.IdSede
               LEFT JOIN tblUsuarios DT  ON DT.IdUsuario = E.IdEntrenador
               LEFT JOIN tblUsuarios AUX ON AUX.IdUsuario = E.IdAuxiliar
              WHERE E.IdEquipo = ?`,
            [idEquipo],
        )) as [FilaEquipo[], unknown];

        if (equipos.length === 0) {
            return NextResponse.json({ success: false, message: 'El equipo no existe' }, { status: 404 });
        }
        const e = equipos[0];

        /* Quién está inscrito EN LA TEMPORADA ELEGIDA, con la MISMA regla que la
           pantalla de Inscripciones y la Lista de Jugadores (`inscritoEnTemporada`):
           pagó su inscripción o, si es portero, arrancó la temporada con una
           mensualidad. Copiar aquí una regla propia haría que la Plantilla contara
           inscritos distintos que el resto del sistema, que es justo lo que nadie
           puede explicar después.

           Se marcan, NO se filtran en el SQL: la pantalla enseña al equipo completo en
           una sola lista y le pone un aviso a quien no está inscrito. Y hay una razón de
           fondo para traerlos a todos — ver el comentario del POST sobre las posiciones
           que se conservan. */
        const [filas] = (await pool.query(
            `SELECT J.IdJugador, J.Jugador,
                    DATE_FORMAT(J.FechaNacimiento, '%d/%m/%Y') AS FechaNacimiento,
                    J.Dorsal,
                    COALESCE(J.Beca, 0)      AS Beca,
                    COALESCE(J.BecaCopas, 0) AS BecaCopas,
                    COALESCE(J.BecaLigas, 0) AS BecaLigas,
                    PL.X, PL.Y,
                    CASE WHEN ${inscritoEnTemporada('SD')} THEN 1 ELSE 0 END AS Inscrito,
                    /* La foto NO viaja aquí: una plantilla de 74 jugadores arrastraría
                       varios MB de base64 antes de pintar el primer nombre. Solo va si
                       la hay y cuándo cambió; la imagen la pide el navegador a
                       /api/jugadores/foto, que sí se cachea. */
                    CASE WHEN J.Foto IS NOT NULL AND J.Foto <> '' THEN 1 ELSE 0 END AS TieneFoto,
                    DATE_FORMAT(J.FechaAct, '%Y%m%d%H%i%s') AS FotoVersion
               FROM tblJugadores J
               LEFT JOIN tblSedes SD ON SD.IdSede = J.IdSede
               LEFT JOIN tblEquiposPlantilla PL
                      ON PL.IdEquipo = ? AND PL.IdJugador = J.IdJugador
               LEFT JOIN (
                   SELECT DISTINCT IdJugador FROM (${JUGADORES_DE_TEMPORADA_SQL}) I
               ) INS ON INS.IdJugador = J.IdJugador
               LEFT JOIN (
                   SELECT DISTINCT IdJugador FROM (${MENSUALIDADES_EN_TEMPORADA_SQL}) M
               ) MEN ON MEN.IdJugador = J.IdJugador
              WHERE J.IdEquipo = ? AND J.Status = 0
              ORDER BY J.Jugador ASC`,
            // Un parametro por subconsulta, en el orden en que aparecen: PL, INS, MEN.
            [idEquipo, temporadaId, temporadaId, idEquipo],
        )) as [FilaJugador[], unknown];

        /* El adeudo con la regla completa de Adeudos por Sede, acotada a los jugadores
           de este equipo: sin acotar, la consulta recorre tblPagos entera. Es la MISMA
           función que usan la Lista de Jugadores y Convocatorias, para que del mismo
           niño ninguna pantalla diga algo distinto. */
        const temporadas = await loadSeasonAndPrevious(String(temporadaId));
        const deudores = temporadas
            ? await jugadoresConAdeudo(temporadas.actual, filas.map((f) => Number(f.IdJugador)))
            : new Map();

        const jugadores: JugadorPlantilla[] = filas.map((f) => ({
            idJugador: Number(f.IdJugador),
            jugador: String(f.Jugador ?? '').trim(),
            fechaNacimiento: f.FechaNacimiento,
            dorsal: String(f.Dorsal ?? '').trim() || null,
            beca: num(f.Beca),
            becaCopas: num(f.BecaCopas),
            becaLigas: num(f.BecaLigas),
            /* DECIMAL llega de mysql2 como cadena; sin convertirlo, el acomodo se
               compararía como texto y '9' quedaría después de '80'. */
            x: f.X === null ? null : num(f.X),
            y: f.Y === null ? null : num(f.Y),
            inscrito: Number(f.Inscrito) === 1,
            /* Solo cuentan los meses de quien SÍ se inscribió: a quien no, lo que le
               falta es la inscripción, y eso se informa aparte. */
            mesesDebe: deudores.get(Number(f.IdJugador))?.inscrito
                ? deudores.get(Number(f.IdJugador)).mesesDebe
                : 0,
            tieneFoto: Number(f.TieneFoto) === 1,
            fotoVersion: f.FotoVersion,
        }));

        const plantilla: Plantilla = {
            idEquipo: Number(e.IdEquipo),
            equipo: String(e.Equipo ?? '').trim(),
            sede: String(e.Sede ?? '').trim(),
            idEntrenador: e.IdEntrenador === null ? null : Number(e.IdEntrenador),
            dt: String(e.DT ?? '').trim() || null,
            idAuxiliar: e.IdAuxiliar === null ? null : Number(e.IdAuxiliar),
            auxiliar: String(e.Auxiliar ?? '').trim() || null,
            horario: horarioDeEquipo(
                DIAS_SEMANA.map(([col, nombre]) => ({ dia: nombre, horas: String(e[col] ?? '') })),
            ),
            jugadores,
        };

        return NextResponse.json({ success: true, data: plantilla });
    } catch (error) {
        console.error('Error al obtener la plantilla del equipo:', error);
        return NextResponse.json(
            { success: false, message: 'Error al obtener la plantilla del equipo' },
            { status: 500 },
        );
    }
}

/* Una posición: el jugador y su punto en la cancha, en porcentaje. */
const posicionSchema = z.object({
    idJugador: z.coerce.number().int().positive(),
    x: z.coerce.number().min(0).max(100),
    y: z.coerce.number().min(0).max(100),
});

const guardarSchema = z.object({
    idEquipo: z.coerce.number().int().positive(),
    /**
     * SOLO los colocados. Quien no venga en la lista se queda sin lugar en la cancha.
     *
     * OJO: la pantalla manda aquí también a los colocados que NO están inscritos en la
     * temporada elegida, aunque no los esté pintando. Ver el comentario de abajo.
     */
    posiciones: z.array(posicionSchema).max(60),
    /** El auxiliar técnico. `null` lo quita. */
    idAuxiliar: z.coerce.number().int().positive().nullable().optional(),
    /** El director técnico. `null` lo quita. */
    idEntrenador: z.coerce.number().int().positive().nullable().optional(),
});

/**
 * Guarda el acomodo completo del equipo.
 *
 * Se manda la plantilla ENTERA y se reemplaza, en vez de mandar un movimiento por
 * jugador: acomodar es arrastrar diez o quince nombres seguidos, y una petición por
 * arrastre convertiría un acomodo en una tormenta de escrituras que además se pueden
 * cruzar entre sí y dejar la cancha a medias. Así, lo que se ve en pantalla al apretar
 * Guardar es exactamente lo que queda.
 *
 * Por eso el DELETE va primero: quien fue sacado de la cancha tiene que perder su fila,
 * y eso no se puede expresar con un INSERT. tblEquiposPlantilla es MyISAM, así que no
 * hay transacción que lo envuelva; el hueco entre el DELETE y el INSERT es de
 * milisegundos y lo peor que puede pasar es que alguien que consulte justo en medio vea
 * la cancha vacía y tenga que recargar. Nada se pierde: lo que se está escribiendo es
 * justo lo que el navegador acaba de mandar.
 *
 * Y de ahí sale una regla que la pantalla tiene que respetar: como esto REEMPLAZA el
 * acomodo completo, el navegador manda TODAS las posiciones que tiene en la mano, sin
 * recortar por inscripción ni por nada. Si mandara solo una parte, guardar borraría en
 * silencio el lugar de los demás —un acomodo perdido sin que nadie lo haya pedido—. Las
 * posiciones son del EQUIPO, no de la temporada.
 */
export async function POST(request: Request) {
    const guardia = await requierePagina(CLAVE_PLANTILLAS);
    if (!guardia.ok) {
        return NextResponse.json({ success: false, message: guardia.message }, { status: guardia.status });
    }

    try {
        const datos = guardarSchema.parse(await request.json());

        /* Solo se colocan jugadores que HOY son de ese equipo. Sin esta comprobación,
           una pantalla abierta desde antes podría dejar en la cancha a alguien que ya
           se cambió de grupo, y esa fila no se vería en ningún lado para corregirla. */
        const [suyos] = (await pool.query(
            'SELECT IdJugador FROM tblJugadores WHERE IdEquipo = ? AND Status = 0',
            [datos.idEquipo],
        )) as [Array<{ IdJugador: number }>, unknown];
        const permitidos = new Set(suyos.map((j) => Number(j.IdJugador)));

        const validas = datos.posiciones.filter((p) => permitidos.has(p.idJugador));
        const ajenos = datos.posiciones.length - validas.length;

        await pool.query('DELETE FROM tblEquiposPlantilla WHERE IdEquipo = ?', [datos.idEquipo]);

        if (validas.length > 0) {
            await pool.query(
                `INSERT INTO tblEquiposPlantilla (IdEquipo, IdJugador, X, Y, FechaAct) VALUES ?`,
                [validas.map((p) => [datos.idEquipo, p.idJugador, p.x, p.y, new Date()])],
            );
        }

        if (datos.idAuxiliar !== undefined) {
            await pool.query('UPDATE tblEquipos SET IdAuxiliar = ? WHERE IdEquipo = ?', [
                datos.idAuxiliar,
                datos.idEquipo,
            ]);
        }

        /* El DT del equipo, y con él el entrenador que traen escrito sus jugadores.
           
           tblJugadores.Coach es una COPIA del nombre del entrenador, y no un adorno: es
           lo que la ficha del jugador muestra como "Entrenador" y lo que sale en el
           listado de pagos de Inscripciones. El sistema de escritorio la escribe al
           elegirle equipo al jugador y ya no la vuelve a tocar, así que al cambiar de DT
           allá la copia se queda vieja: hoy 445 de los 1,927 jugadores con equipo traen
           un entrenador distinto al de su propio equipo.
           
           Aquí se propaga a los jugadores de ESE equipo, que es el mismo valor que
           escribiría la ficha. Cambiar el DT y que su gente siga diciendo el nombre del
           anterior es justo la clase de desajuste que después nadie sabe explicar. */
        let entrenadorPropagado = 0;
        if (datos.idEntrenador !== undefined) {
            await pool.query('UPDATE tblEquipos SET IdEntrenador = ? WHERE IdEquipo = ?', [
                datos.idEntrenador,
                datos.idEquipo,
            ]);

            const [res] = (await pool.query(
                `UPDATE tblJugadores J
                    LEFT JOIN tblUsuarios U ON U.IdUsuario = ?
                    SET J.Coach = U.Usuario, J.FechaAct = NOW()
                  WHERE J.IdEquipo = ? AND J.Status = 0`,
                [datos.idEntrenador, datos.idEquipo],
            )) as [{ affectedRows: number }, unknown];
            entrenadorPropagado = Number(res.affectedRows) || 0;
        }

        return NextResponse.json({
            success: true,
            colocados: validas.length,
            ajenos,
            entrenadorPropagado,
        });
    } catch (error) {
        if (error instanceof z.ZodError) {
            return NextResponse.json({ success: false, message: error.issues[0].message }, { status: 400 });
        }
        console.error('Error al guardar la plantilla del equipo:', error);
        return NextResponse.json(
            { success: false, message: 'Error al guardar la plantilla del equipo' },
            { status: 500 },
        );
    }
}
