import { pool } from '@/lib/db';
import type { ValoresPreregistro } from '@/lib/preregistro';

/**
 * El alta de un preregistro en `tblJugadoresPre`. Solo servidor: abre conexión.
 *
 * Las reglas de qué se acepta viven en `@/lib/preregistro`, que es puro y lo comparte el
 * navegador. Aquí solo queda escribir, y el motivo de que sea UNA sola función es la
 * forma de la tabla: son veintitantas columnas en un INSERT posicional, y la segunda
 * copia de esa lista se desalinea con la primera en cuanto alguien agregue una columna
 * —el teléfono del padre acabaría en el correo de la madre sin que nada falle—.
 *
 * El DESTINO va aparte de los datos porque no lo captura nadie: el formulario público lo
 * saca del UUID de la sede y la captura interna del equipo elegido. Nunca del cuerpo de
 * la petición, que es lo único que un navegador puede inventarse.
 */

export interface DestinoPreregistro {
    idSede: number;
    /**
     * El equipo al que se apunta, escrito como lo guarda `tblJugadores.Categoria`
     * ('2018X', '2013SUR'): así el alta formal del escritorio ya encuentra puesta la
     * categoría. El formulario público no tiene ninguno y manda null: quien llega por el
     * QR todavía no está asignado a un equipo.
     */
    categoria: string | null;
}

/** Escribe el preregistro y devuelve su folio. `Status = 0`: recién llegado, sin atender. */
export async function insertaPreregistro(
    valores: ValoresPreregistro,
    destino: DestinoPreregistro,
): Promise<number> {
    const [resultado] = (await pool.query(
        `INSERT INTO tblJugadoresPre
          (JugadorPre, Categoria, Nombre, ApellidoPaterno, ApellidoMaterno, FechaNacimiento, EntidadNacimiento,
           Genero, GeneroDesc, CURP, ContactoEmergencia,
           Padre, TelPadre, CorreoElectronicoPadre, Madre, TelMadre, CorreoElectronicoMadre,
           Calle, NumExterior, NumInterior, Colonia, CodigoPostal, Municipio, Estado,
           Escuela, IdEscuela, Observaciones, IdSede, FechaAlta, FechaAct, Status)
         VALUES (?,?,?,?,?,?,?, ?,?,?,?, ?,?,?,?,?,?, ?,?,?,?,?,?,?, ?,?,?,?, NOW(), NOW(), 0)`,
        [
            valores.jugadorPre, destino.categoria, valores.nombre, valores.apellidoPaterno,
            valores.apellidoMaterno, valores.fechaNacimiento, valores.entidadNacimiento,
            valores.genero, valores.generoDesc, valores.curp, valores.contactoEmergencia,
            valores.padre, valores.telPadre, valores.correoPadre,
            valores.madre, valores.telMadre, valores.correoMadre,
            valores.calle, valores.numExterior, valores.numInterior,
            valores.colonia, valores.codigoPostal, valores.municipio, valores.estado,
            valores.escuela, valores.idEscuela, valores.observaciones, destino.idSede,
        ],
    )) as [{ insertId: number }, unknown];

    return resultado.insertId;
}
