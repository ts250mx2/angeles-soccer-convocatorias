/**
 * La Plantilla de un equipo: quiénes lo forman y dónde se para cada uno en la cancha.
 *
 * Reproduce la hoja que el club ya usa en papel: a la izquierda el listado con las becas
 * de cada jugador —las tres van por separado, porque mensualidades, copas y ligas se
 * cobran y se becan por separado—, a la derecha la cancha con los nombres colocados, y al
 * pie el horario y el nombre del equipo.
 *
 * Las coordenadas viven en PORCENTAJE de la cancha (0 a 100), nunca en píxeles. La hoja
 * se ve en pantallas de distinto ancho y además se exporta a PDF con otras medidas: en
 * píxeles, un acomodo hecho en un monitor grande saldría con los jugadores fuera del
 * campo en cualquier otro lado. Ver migrations/020-plantilla-equipos.sql.
 *
 * Y = 0 es la portería de arriba —donde va el portero— y Y = 100 la de abajo, que es
 * como está orientada la cancha en la hoja de papel.
 */

/** Un jugador del equipo, con lo que la hoja necesita de él. */
export interface JugadorPlantilla {
    idJugador: number;
    jugador: string;
    /** 'dd/mm/aaaa', como se lee en la hoja. */
    fechaNacimiento: string | null;
    dorsal: string | null;
    /** Beca de mensualidades, 0 a 100. */
    beca: number;
    /** Beca de copas, 0 a 100. Es OTRA distinta a la de mensualidades y a la de ligas. */
    becaCopas: number;
    /** Beca de ligas, 0 a 100. Es OTRA distinta a la de mensualidades y a la de copas. */
    becaLigas: number;
    /** Dónde está colocado, o null si todavía no se le da lugar en la cancha. */
    x: number | null;
    y: number | null;
    /**
     * Está inscrito en la temporada elegida, con la MISMA regla que Inscripciones y la
     * Lista de Jugadores: pagó su inscripción o, si es portero, arrancó con una
     * mensualidad. Depende de la temporada, así que el mismo jugador cambia de pestaña
     * al cambiarla.
     */
    inscrito: boolean;
    /**
     * Meses vencidos sin pagar en la temporada, con la MISMA regla que Adeudos por Sede.
     * 0 si está al corriente o si el modelo de mensualidad no le aplica.
     *
     * Solo cuenta el adeudo de quien SÍ está inscrito: a quien no lo está, lo que le
     * falta es la inscripción, y eso ya lo dice `inscrito`. Es el mismo criterio de la
     * Lista de Jugadores, para que las dos pantallas no den cifras distintas del mismo
     * niño.
     */
    mesesDebe: number;
    /** Tiene foto cargada en su ficha. La imagen se pide a /api/jugadores/foto/<id>. */
    tieneFoto: boolean;
    /** Sello para romper el caché del navegador cuando la foto cambia. */
    fotoVersion: string | null;
}

/** URL de la foto del jugador, o null si no tiene. */
export const urlFotoJugador = (j: Pick<JugadorPlantilla, 'idJugador' | 'tieneFoto' | 'fotoVersion'>): string | null =>
    j.tieneFoto ? `/api/jugadores/foto/${j.idJugador}?v=${j.fotoVersion ?? '0'}` : null;

/** Iniciales para el hueco de quien todavía no tiene foto. */
export const inicialesDe = (nombre: string): string =>
    String(nombre ?? '')
        .trim()
        .split(/\s+/)
        .slice(0, 2)
        .map((p) => p[0] ?? '')
        .join('')
        .toUpperCase();

export interface Plantilla {
    idEquipo: number;
    equipo: string;
    sede: string;
    /** Del catálogo: tblEquipos.IdEntrenador. */
    idEntrenador: number | null;
    dt: string | null;
    idAuxiliar: number | null;
    auxiliar: string | null;
    /** 'MARTES Y JUEVES DE 18:00 A 19:30', armado con los días del equipo. */
    horario: string;
    jugadores: JugadorPlantilla[];
}

/* ── Traer a un jugador de otro equipo ── */

/** Un jugador de otro equipo, como se ofrece en el buscador de transferencias. */
export interface Candidato {
    idJugador: number;
    jugador: string;
    anioNacimiento: number | null;
    /** 1 hombre, 2 mujer; 0 o null si no está capturado. */
    genero: number | null;
    /** De dónde viene: puede no tener equipo asignado. */
    equipoActual: string | null;
    categoriaActual: string | null;
    sedeActual: string | null;
}

/** El equipo al que se le quiere traer, con lo que define quién le cuadra. */
export interface DestinoTransferencia {
    equipo: string;
    anioInicio: number | null;
    anioFin: number | null;
    /** 1 varonil, 2 femenil, 3 mixto. */
    genero: number | null;
}

/**
 * Lo que hay que advertir antes de traer a este jugador, o vacío si le cuadra.
 *
 * Es un AVISO, no un veto: hay razones legítimas para subir a un niño de categoría —el
 * que destaca juega con los grandes— y quien arma el equipo las conoce. Lo que no puede
 * pasar es que se haga por equivocación y nadie se entere hasta el día del partido, que
 * es cuando el año mal puesto se convierte en una alineación indebida.
 *
 * Se revisan dos cosas, y la segunda no está de adorno: el selector de equipos de la
 * ficha del jugador SOLO ofrece equipos del año y el género que le tocan, así que traer
 * a alguien desde aquí se salta esa reja. Sin este aviso, la transferencia sería la
 * única puerta del sistema por la que se puede meter a una niña a un equipo varonil sin
 * que nada lo diga.
 *
 * Hoy la base está limpia en esto —1 jugador fuera de rango de 1,925, y ninguno con el
 * género cambiado—, así que un aviso que aparezca significa algo de verdad.
 */
export function advertenciasTransferencia(
    c: Pick<Candidato, 'anioNacimiento' | 'genero'>,
    destino: DestinoTransferencia,
): string[] {
    const avisos: string[] = [];

    const desde = Number(destino.anioInicio) || 0;
    const hasta = Number(destino.anioFin) || 0;
    const anio = Number(c.anioNacimiento) || 0;

    if (anio > 0 && desde > 0 && hasta > 0 && (anio < desde || anio > hasta)) {
        const rango = desde === hasta ? `${desde}` : `${desde}-${hasta}`;
        avisos.push(
            anio > hasta
                ? `Es ${anio} y ${destino.equipo} es de ${rango}: va a jugar con niños mayores.`
                : `Es ${anio} y ${destino.equipo} es de ${rango}: va a jugar con niños menores.`,
        );
    }

    const generoEquipo = Number(destino.genero) || 0;
    const generoJugador = Number(c.genero) || 0;
    // 3 es mixto y le entra cualquiera; 0 es "sin capturar" y no se inventa nada.
    if (generoEquipo === 1 || generoEquipo === 2) {
        if (generoJugador > 0 && generoJugador !== generoEquipo) {
            avisos.push(
                `${destino.equipo} es ${generoEquipo === 2 ? 'femenil' : 'varonil'} y el jugador está capturado como ${generoJugador === 2 ? 'mujer' : 'hombre'}.`,
            );
        }
    }

    return avisos;
}

/* ── La beca, como se pinta en la hoja ── */

export type TonoBeca = 'paga' | 'parcial' | 'total';

export interface EtiquetaBeca {
    texto: string;
    tono: TonoBeca;
}

/**
 * Cómo se lee una beca en la columna.
 *
 * Sin beca el jugador PAGA, que es el caso verde y el más común; con beca del 100% no
 * paga nada, y es el que hay que ver de lejos. Entre medias se escribe el porcentaje
 * tal cual, porque la mitad de una colegiatura no es lo mismo que el 20%.
 */
export function etiquetaBeca(pct: number): EtiquetaBeca {
    const n = Number(pct) || 0;
    if (n <= 0) return { texto: 'PAGA', tono: 'paga' };
    if (n >= 100) return { texto: '100%', tono: 'total' };
    // Sin decimales de más: 50 se lee '50%' y 12.5 se lee '12.5%'.
    return { texto: `${Number(n.toFixed(2))}%`, tono: 'parcial' };
}

/** Los colores de cada tono, en el mismo orden que la hoja de papel: verde, ámbar, rojo. */
export const COLOR_BECA: Record<TonoBeca, string> = {
    paga: 'bg-emerald-500 text-white',
    parcial: 'bg-amber-400 text-slate-900',
    total: 'bg-rose-500 text-white',
};

/* ── El acomodo automático ── */

/**
 * Reparte a los jugadores por la cancha, de atrás hacia adelante.
 *
 * Es el punto de partida de un equipo que nunca se ha acomodado: colocar quince
 * nombres uno por uno arrastrando, desde la nada, es un trabajo que nadie quiere
 * empezar. Esto los deja en líneas parejas y de ahí se mueve lo que haga falta.
 *
 * No pretende ser una formación táctica: el portero solo, y el resto repartido en
 * líneas de a cuatro. Quien arma el equipo sabe mejor que nadie dónde va cada uno; lo
 * que aquí importa es que ya estén todos sobre el campo y a la vista.
 */
export function acomodoPorOmision(cuantos: number): Array<{ x: number; y: number }> {
    if (cuantos <= 0) return [];

    /* El portero pegado a su portería. El resto arranca a media cancha propia y avanza
       hacia el ataque sin llegar al fondo: dejar aire arriba y abajo evita que un
       nombre quede montado en la línea de meta. */
    const puestos: Array<{ x: number; y: number }> = [{ x: 50, y: 8 }];

    const decampo = cuantos - 1;
    if (decampo > 0) {
        const POR_LINEA = 4;
        const lineas = Math.ceil(decampo / POR_LINEA);
        let colocados = 0;

        for (let linea = 0; linea < lineas; linea++) {
            const enEsta = Math.min(POR_LINEA, decampo - colocados);
            // Las líneas se reparten entre el 28% y el 82% del campo.
            const y = lineas === 1 ? 55 : 28 + (linea * 54) / (lineas - 1);

            for (let i = 0; i < enEsta; i++) {
                // Repartidos a lo ancho, con la misma separación entre bandas.
                const x = ((i + 1) * 100) / (enEsta + 1);
                puestos.push({ x: Math.round(x), y: Math.round(y) });
            }
            colocados += enEsta;
        }
    }
    return puestos;
}

/** Deja una coordenada dentro de la cancha, con margen para que el nombre no se salga. */
export const acota = (v: number, margen = 3): number =>
    Math.min(100 - margen, Math.max(margen, Math.round(v * 100) / 100));

/* ── El horario del pie de la hoja ── */

/** Los días del equipo, en el orden de la semana y con el nombre que se imprime. */
export const DIAS_SEMANA = [
    ['LunesStr', 'LUNES'],
    ['MartesStr', 'MARTES'],
    ['MiercolesStr', 'MIÉRCOLES'],
    ['JuevesStr', 'JUEVES'],
    ['ViernesStr', 'VIERNES'],
    ['SabadoStr', 'SÁBADO'],
    ['DomingoStr', 'DOMINGO'],
] as const;

/**
 * El renglón del horario: 'MARTES Y JUEVES DE 18:00 A 19:30'.
 *
 * Los días vienen uno por columna en tblEquipos, cada uno con su rango de horas. Cuando
 * todos los días entrenan a la misma hora —que es lo normal— se juntan en una sola frase
 * en vez de repetir el horario en cada uno; si difieren, se escribe cada día con el suyo,
 * porque ahí el detalle sí importa.
 */
export function horarioDeEquipo(dias: Array<{ dia: string; horas: string }>): string {
    const conHoras = dias.filter((d) => d.horas.trim() !== '');
    if (conHoras.length === 0) return '';

    const horas = [...new Set(conHoras.map((d) => rangoDeHoras(d.horas)))];
    if (horas.length === 1) {
        return `${listaEnEspanol(conHoras.map((d) => d.dia))} DE ${horas[0]}`;
    }
    return conHoras.map((d) => `${d.dia} DE ${rangoDeHoras(d.horas)}`).join(', ');
}

/**
 * '18:00 - 19:30' se lee 'DE 18:00 A 19:30'.
 *
 * En la base el rango viene con guion, que es cómodo para capturar pero se lee mal en
 * una frase: "DE 18:00 - 19:30" hace tropezar. Se cambia solo el guion que separa dos
 * horas, para no tocar un texto que diga otra cosa.
 */
const rangoDeHoras = (horas: string): string =>
    horas.trim().toUpperCase().replace(/^(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})$/, '$1 A $2');

/** 'MARTES Y JUEVES', 'LUNES, MIÉRCOLES Y VIERNES'. */
function listaEnEspanol(partes: string[]): string {
    if (partes.length <= 1) return partes[0] ?? '';
    return `${partes.slice(0, -1).join(', ')} Y ${partes[partes.length - 1]}`;
}
