import type { Pool } from 'mysql2/promise';
import {
    ACTIVO, ESQUEMAS_PAGO, GENEROS, TIPOS_JUGADOR,
    anioDeFecha, textoDeCatalogo, type JugadorForm,
} from '@/lib/jugador-form';

/**
 * Escribir la ficha del jugador en tblJugadores.
 *
 * El alta y la edición guardan EXACTAMENTE las mismas columnas, y por eso comparten
 * esta función: el frmCapJugador del escritorio tiene el INSERT y el UPDATE escritos
 * dos veces, y por eso se le coló que el alta guarde la escuela en la columna Estado y
 * que no selle FechaAlta. Con una sola lista de columnas eso no puede pasar.
 *
 * Las columnas van por pares —el índice y su texto— porque así las lee el sistema de
 * escritorio: `Genero` con `GeneroDesc`, `IdTipoJugador` con `TipoJugador`,
 * `IdEsquemaPago` con `EsquemaPago`. El texto NO se acepta del cliente: se deriva aquí
 * del catálogo, para que las dos columnas no puedan contradecirse.
 */

/** Mayúsculas, que es como está capturada la base. Vacío se guarda como NULL. */
const up = (v: string | null | undefined): string | null => {
    const s = String(v ?? '').trim();
    return s ? s.toUpperCase() : null;
};

/** Los correos NO se pasan a mayúsculas: se guardan como se escribieron. */
const tal = (v: string | null | undefined): string | null => {
    const s = String(v ?? '').trim();
    return s || null;
};

/**
 * Las columnas de la ficha, en el orden en que se escriben. Es la única lista: el
 * INSERT arma sus placeholders con ella y el UPDATE su "columna = ?".
 */
function columnasDeFicha(datos: JugadorForm): Array<[string, unknown]> {
    return [
        ['Jugador', up(datos.jugador)],
        ['Categoria', up(datos.categoria)],
        ['IdEquipo', datos.idEquipo],
        ['Coach', up(datos.coach)],
        ['IdSede', datos.idSede],
        ['Sede', up(datos.sede)],

        ['Genero', datos.genero],
        ['GeneroDesc', textoDeCatalogo(GENEROS, datos.genero)],
        ['IdTipoJugador', datos.idTipoJugador],
        ['TipoJugador', textoDeCatalogo(TIPOS_JUGADOR, datos.idTipoJugador)],
        ['IdEsquemaPago', datos.idEsquemaPago],
        ['EsquemaPago', textoDeCatalogo(ESQUEMAS_PAGO, datos.idEsquemaPago)],
        // ViveCon es varchar y guarda el índice como texto, igual que el escritorio.
        ['ViveCon', String(datos.viveCon)],

        ['FechaNacimiento', datos.fechaNacimiento],
        ['AnioNacimiento', anioDeFecha(datos.fechaNacimiento)],
        ['EntidadNacimiento', up(datos.entidadNacimiento)],
        ['CURP', up(datos.curp)],
        ['Dorsal', up(datos.dorsal)],
        ['NumeroSocio', up(datos.numeroSocio)],
        ['ContactoEmergencia', up(datos.contactoEmergencia)],
        ['Observaciones', up(datos.observaciones)],

        ['Beca', datos.beca],
        ['BecaCopas', datos.becaCopas],
        ['BecaLigas', datos.becaLigas],
        ['IngresosMensuales', datos.ingresosMensuales],

        ['IdEscuela', datos.idEscuela || null],
        ['Escuela', up(datos.escuela)],

        ['Padre', up(datos.padre)],
        ['TelPadre', up(datos.telPadre)],
        ['CorreoElectronicoPadre', tal(datos.correoElectronicoPadre)],
        ['Madre', up(datos.madre)],
        ['TelMadre', up(datos.telMadre)],
        ['CorreoElectronicoMadre', tal(datos.correoElectronicoMadre)],
        ['TelCasa', up(datos.telCasa)],

        ['Calle', up(datos.calle)],
        ['NumExterior', up(datos.numExterior)],
        ['NumInterior', up(datos.numInterior)],
        ['Colonia', up(datos.colonia)],
        ['CodigoPostal', up(datos.codigoPostal)],
        ['Municipio', up(datos.municipio)],
        // El estado, en el alta y en la edición. Ver el comentario de arriba.
        ['Estado', up(datos.estado)],

        /* La foto, como data URI. NO pasa por `up`: el base64 distingue mayúsculas de
           minúsculas y pasarlo a mayúsculas lo dejaría ilegible. */
        ['Foto', tal(datos.foto)],
    ];
}

/**
 * Deja constancia de que el jugador pertenece a ese equipo.
 *
 * El escritorio lo hace al elegir la categoría, cuando el jugador nuevo todavía no
 * tiene id: escribe la fila con IdJugador = 0 y la de verdad nunca se crea. Aquí se
 * hace al guardar, que es cuando ya se sabe a quién apuntar.
 *
 * La llave incluye IdLiga, así que la fila "sin liga" es la del 0; REPLACE la deja al
 * día sin duplicarla cuando al jugador se le cambia de equipo y se le regresa.
 */
async function ligaEquipoJugador(pool: Pool, idJugador: number, idEquipo: number): Promise<void> {
    if (!idEquipo) return;
    await pool.query(
        `REPLACE INTO tblEquiposJugadores (IdJugador, IdEquipo, IdLiga, FechaAct)
         VALUES (?, ?, 0, NOW())`,
        [idJugador, idEquipo],
    );
}

/**
 * Alta. Devuelve el IdJugador recién creado.
 *
 * Son dos escrituras y NO se pueden envolver en una transacción: tblJugadores es
 * MyISAM, donde BEGIN y ROLLBACK se aceptan pero no hacen nada. El orden está elegido
 * para que la mitad que puede quedar suelta sea la inofensiva: primero la ficha, que es
 * la que el sistema entero lee, y al final el histórico de equipos, que solo se
 * consulta para saber por dónde ha pasado el jugador. Si falla lo segundo, el jugador
 * queda bien dado de alta y con su equipo en la ficha; volver a guardarla lo repone.
 */
export async function crearJugador(
    pool: Pool,
    datos: JugadorForm,
    idUsuario: number,
    idTemporadaActiva: number | null,
): Promise<number> {
    const columnas = [
        ...columnasDeFicha(datos),
        ['Status', ACTIVO],
        ['IdTemporadaActiva', idTemporadaActiva],
        ['IdUsuarioCreacion', idUsuario],
        ['IdUsuarioActualizacion', idUsuario],
    ] as Array<[string, unknown]>;

    const nombres = columnas.map(([c]) => c);
    const valores = columnas.map(([, v]) => v);

    const [res] = (await pool.query(
        `INSERT INTO tblJugadores (${nombres.join(', ')}, FechaAlta, FechaAct)
         VALUES (${nombres.map(() => '?').join(', ')}, NOW(), NOW())`,
        valores,
    )) as [{ insertId: number }, unknown];

    await ligaEquipoJugador(pool, res.insertId, datos.idEquipo);
    return res.insertId;
}

/**
 * Edición.
 *
 * El status solo se toca si viene en la petición: quien edita la ficha para corregir un
 * teléfono no debería poder reactivar una baja sin darse cuenta. Y el motivo de la baja
 * vive en ObservacionesVenta, que es de donde lo lee la Lista de Jugadores.
 */
export async function actualizarJugador(
    pool: Pool,
    idJugador: number,
    datos: JugadorForm,
    idUsuario: number,
): Promise<void> {
    const columnas = [
        ...columnasDeFicha(datos),
        ['IdUsuarioActualizacion', idUsuario],
        ...(datos.status === undefined ? [] : [['Status', datos.status] as [string, unknown]]),
        ...(datos.status === undefined ? [] : [['ObservacionesVenta', up(datos.motivoBaja)] as [string, unknown]]),
    ] as Array<[string, unknown]>;

    await pool.query(
        `UPDATE tblJugadores
            SET ${columnas.map(([c]) => `${c} = ?`).join(', ')}, FechaAct = NOW()
          WHERE IdJugador = ?`,
        [...columnas.map(([, v]) => v), idJugador],
    );

    await ligaEquipoJugador(pool, idJugador, datos.idEquipo);
}
