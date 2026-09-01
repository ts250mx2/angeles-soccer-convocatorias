import { TIPO_PRODUCTO_INSCRIPCION } from '@/lib/temporada';

/**
 * Lealtad: cuánto tiempo lleva cada alumno en la escuela.
 *
 * La permanencia se mide por las INSCRIPCIONES que ha pagado, que es lo único que el
 * club cobra una vez por semestre a todo el mundo: mientras siga reinscribiéndose,
 * sigue aquí. La ficha del jugador no sirve para esto —FechaAlta se mueve cuando se
 * recaptura a alguien— y las mensualidades tampoco, porque un mes suelto no dice si el
 * niño se quedó el semestre.
 *
 * ── De dónde sale el ciclo, y por qué NO de tblPagos.IdTemporada ──
 *
 * La tentación es agrupar los pagos por su IdTemporada. No funciona: el sistema de
 * escritorio archiva la inscripción de agosto-diciembre bajo la temporada de
 * enero-julio del mismo año. Los 1,041 pagos de 'INSCRIPCION AGOSTO-DIC.2023' están
 * guardados en 'ENERO - JULIO 2023', y las temporadas de agosto (1, 4, 6, 8) no tienen
 * un solo pago de inscripción. Contar por IdTemporada daría la mitad de los ciclos.
 *
 * El dato bueno está en el NOMBRE DEL PRODUCTO, que sí nombra su propio semestre:
 * 'INSCRIPCION AGOSTO DICIEMBRE 2022', 'INSCRIPCION ENERO JULIO 2023',
 * 'INSCRIPCION AGOSTO-DIC.2023', 'INSCRIPCION AG-DIC. 2025'... Son nueve, uno por
 * semestre desde agosto de 2022, y de ahí se leen el año y el semestre.
 *
 * ── Lo que se deja fuera ──
 *
 * `IdTipoProducto = 2` no es "inscripción": es un cajón donde también viven los boletos
 * de la posada, los chaquetines, las clínicas, el libro y el saldo a favor. Por eso no
 * basta el tipo y se pide además que el producto se llame INSCRIPCION y traiga un año.
 * Eso deja fuera 'INSC. PORTERO ASE' y 'INSCRIPCION FUTSAL', que son inscripciones de
 * verdad pero de otro programa y sin semestre en el nombre: no se pueden colocar en la
 * línea del tiempo, y meterlas como si fueran un ciclo inventaría permanencia.
 */

/**
 * El ciclo escolar como un número que se puede ordenar y restar: `año * 2` más 1 si es
 * el semestre de agosto. Así AGO-DIC 2023 (4047) va justo después de ENE-JUL 2023
 * (4046), y la diferencia entre dos ciclos son semestres.
 */
export const cicloDe = (anio: number, esAgosto: boolean): number => anio * 2 + (esAgosto ? 1 : 0);

export const anioDeCiclo = (ciclo: number): number => Math.floor(ciclo / 2);

export const esCicloDeAgosto = (ciclo: number): boolean => ciclo % 2 === 1;

/** 'AGO-DIC 2023'. Cadena vacía si no hay ciclo. */
export const etiquetaCiclo = (ciclo: number | null | undefined): string => {
    const n = Number(ciclo) || 0;
    if (n <= 0) return '';
    return `${esCicloDeAgosto(n) ? 'AGO-DIC' : 'ENE-JUL'} ${anioDeCiclo(n)}`;
};

/**
 * Los ciclos de inscripción de cada jugador, un renglón por pago.
 *
 * Se usa como tabla derivada y NO lleva parámetros: el catálogo de ciclos se deduce de
 * los propios productos, así que un semestre nuevo entra solo en cuanto se le cobra a
 * alguien, sin tocar código.
 */
export const CICLOS_INSCRIPCION_SQL = `
    SELECT A.IdJugador,
           CAST(REGEXP_SUBSTR(B.Producto, '20[0-9]{2}') AS UNSIGNED) * 2
             + CASE WHEN UPPER(B.Producto) LIKE '%AG%' THEN 1 ELSE 0 END AS Ciclo
    FROM tblPagos A
    INNER JOIN tblProductos B ON B.IdProducto = A.IdProducto
    WHERE A.Status = 0
      AND A.IdJugador IS NOT NULL
      AND B.IdTipoProducto = ${TIPO_PRODUCTO_INSCRIPCION}
      AND UPPER(B.Producto) LIKE 'INSCRIPCION%'
      AND REGEXP_SUBSTR(B.Producto, '20[0-9]{2}') <> ''
`;

/* ── De ciclos a años ── */

/**
 * Los años que lleva en la escuela: dos ciclos son un año.
 *
 * Se cuentan los ciclos PAGADOS, no el tiempo transcurrido desde el primero. La
 * diferencia importa en los que se fueron y volvieron: quien se inscribió en 2023,
 * desapareció dos años y regresó este agosto lleva un año en la escuela, no tres. El
 * lapso de punta a punta se muestra aparte (`Desde` y `Hasta`) para que ese caso se
 * pueda ver, pero el número de la columna Años no lo infla.
 */
export const aniosDeCiclos = (ciclos: number): number => (Number(ciclos) || 0) / 2;

/** '2 años', '1 año', 'medio año'. Los medios se escriben con ½, que es como se dicen. */
export function etiquetaAnios(ciclos: number): string {
    const n = Number(ciclos) || 0;
    if (n <= 0) return 'Sin registro';
    const enteros = Math.floor(n / 2);
    const medio = n % 2 === 1;
    if (enteros === 0) return 'medio año';
    const texto = medio ? `${enteros}½` : `${enteros}`;
    return `${texto} ${enteros === 1 && !medio ? 'año' : 'años'}`;
}

/* ── Las bandas del reparto ── */

/**
 * Los tramos de permanencia, del más nuevo al más antiguo.
 *
 * Son años CUMPLIDOS, así que el de tres ciclos (año y medio) cae en "1 año": lo que la
 * gráfica contesta es "cuántos llevan al menos tanto", y redondear hacia arriba haría
 * parecer veterano a quien lleva dos semestres. El tope es 4+ porque el registro
 * empieza en agosto de 2022 y nadie puede tener más.
 */
export const BANDAS_LEALTAD = [
    { clave: '4', etiqueta: '4 años o más', minCiclos: 8 },
    { clave: '3', etiqueta: '3 años', minCiclos: 6 },
    { clave: '2', etiqueta: '2 años', minCiclos: 4 },
    { clave: '1', etiqueta: '1 año', minCiclos: 2 },
    { clave: '0', etiqueta: 'Menos de 1 año', minCiclos: 1 },
] as const;

export type BandaLealtad = (typeof BANDAS_LEALTAD)[number]['clave'];

/** En qué tramo cae, o null si no tiene ninguna inscripción registrada. */
export function bandaDe(ciclos: number): BandaLealtad | null {
    const n = Number(ciclos) || 0;
    if (n <= 0) return null;
    return (BANDAS_LEALTAD.find((b) => n >= b.minCiclos)?.clave ?? '0') as BandaLealtad;
}

/**
 * Rampa ordinal de un solo tono, de más antiguo a más nuevo.
 *
 * La permanencia es una escala ORDENADA, no categorías sueltas, así que lleva un tono
 * con escalones y no cinco colores distintos. Más claro = más años, porque sobre el
 * fondo oscuro de la aplicación lo claro es lo que se lee como "más".
 *
 * Son los pasos 100/200/300/400/500 del azul de la aplicación, los mismos de los que
 * sale la rampa de Becas. Validados contra el fondo #0f172a con el validador del skill
 * de dataviz en modo ordinal: tono único (3° de dispersión), luminosidad monótona,
 * saltos de ΔL ≥ 0.06 y el escalón más oscuro a 3.31:1 del fondo.
 */
export const RAMPA_LEALTAD: Record<BandaLealtad, string> = {
    '4': '#cde2fb',
    '3': '#9ec5f4',
    '2': '#6da7ec',
    '1': '#3987e5',
    '0': '#256abf',
};
