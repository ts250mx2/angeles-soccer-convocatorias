import { partirCategoria } from '@/lib/categoria-equipo';

/**
 * Elegir un equipo en tres pasos: sede → categoría (el año) → letra.
 *
 * Es el orden en que el club piensa en sus grupos. El nombre del equipo trae el año y la
 * letra pegados ('2018X', '2012FC'), pero NO la sede, y la misma categoría existe en
 * varias: hay un '2018A' en GANTE y otro '2018A SLT' en Saltillo, y '2015X' aparece en
 * tres campus. Sin el primer paso, el desplegable de letras mezcla equipos de sedes
 * distintas y hay que leer el sufijo de cada uno para saber cuál es el propio.
 *
 * Vive aquí y no en cada pantalla porque la Plantilla y la Asistencia son las dos hojas
 * del MISMO equipo y comparten hasta la selección recordada: si cada una dedujera sus
 * listas por su cuenta, bastaría con que una ordenara distinto para que el mismo equipo
 * apareciera en otro lugar según por dónde se entrara.
 */

/**
 * Lo MÍNIMO que estas funciones necesitan de un equipo.
 *
 * Las que devuelven equipos son genéricas sobre este mínimo para no recortar el tipo del
 * que llama: la Plantilla trae además `Jugadores` y lo pinta en la opción, y con un
 * `EquipoSeleccionable[]` de vuelta ese campo se perdería.
 */
export interface EquipoSeleccionable {
    IdEquipo: number;
    Equipo: string;
    IdSede: number | null;
    Sede: string | null;
}

export interface OpcionSedeEquipo {
    idSede: number;
    sede: string;
}

/**
 * Las sedes que tienen equipos en la lista, sin repetir y por nombre.
 *
 * Se sacan de los propios equipos y no del catálogo de sedes: la lista ya viene acotada
 * a los que tienen gente inscrita en la temporada, así que ofrecer una sede sin equipos
 * sería ofrecer un callejón sin salida.
 */
export function sedesDeEquipos(lista: EquipoSeleccionable[]): OpcionSedeEquipo[] {
    const porId = new Map<number, string>();
    for (const e of lista) {
        const id = Number(e.IdSede) || 0;
        if (id > 0 && !porId.has(id)) porId.set(id, String(e.Sede ?? '').trim() || `Sede ${id}`);
    }
    return [...porId.entries()]
        .map(([idSede, sede]) => ({ idSede, sede }))
        .sort((a, b) => a.sede.localeCompare(b.sede));
}

/** Los equipos de una sede. Sin sede elegida, ninguno: el paso uno manda. */
export const equiposDeSede = <T extends EquipoSeleccionable>(
    lista: T[],
    idSede: number | null,
): T[] => (idSede ? lista.filter((e) => Number(e.IdSede) === idSede) : []);

/**
 * Los años de categoría que hay en esa sede, del más reciente al más viejo.
 *
 * Del más reciente primero porque las categorías nuevas son las numerosas: los equipos de
 * 2019 en adelante son los que más gente tienen, y los de 2008 casi ninguna.
 */
export const aniosDeSede = (lista: EquipoSeleccionable[], idSede: number | null): string[] =>
    [
        ...new Set(
            equiposDeSede(lista, idSede)
                .map((e) => partirCategoria(e.Equipo).anio)
                .filter(Boolean),
        ),
    ].sort((a, b) => b.localeCompare(a));

/** Los equipos de esa sede y ese año: las letras del tercer desplegable. */
export const letrasDe = <T extends EquipoSeleccionable>(
    lista: T[],
    idSede: number | null,
    anio: string,
): T[] =>
    anio ? equiposDeSede(lista, idSede).filter((e) => partirCategoria(e.Equipo).anio === anio) : [];

/** Lo que se pinta como letra: '2018X' en la sede GANTE se lee 'X'. */
export const letraDe = (e: EquipoSeleccionable): string =>
    partirCategoria(e.Equipo).equipo || e.Equipo;

/**
 * Qué hay que soltar de la selección para que deje de apuntar a algo que ya no existe.
 *
 * Al cambiar de temporada la lista se encoge y lo elegido puede haber desaparecido. Se
 * devuelve el primer paso que ya no vale, porque soltarlo arrastra a los de abajo: una
 * sede que se fue deja sin sentido su año y su letra. Un desplegable que muestra algo que
 * no está entre sus opciones se ve en blanco y no hay forma de saber qué se está mirando.
 */
export function seleccionHuerfana(
    lista: EquipoSeleccionable[],
    idSede: number | null,
    anio: string,
    idEquipo: number | null,
): 'sede' | 'anio' | 'equipo' | null {
    if (idSede && !sedesDeEquipos(lista).some((s) => s.idSede === idSede)) return 'sede';
    if (anio && !aniosDeSede(lista, idSede).includes(anio)) return 'anio';
    if (idEquipo && !letrasDe(lista, idSede, anio).some((e) => e.IdEquipo === idEquipo)) {
        return 'equipo';
    }
    return null;
}
