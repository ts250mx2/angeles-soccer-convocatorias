import { DIAS_SEMANA } from '@/lib/plantilla-equipo';

/**
 * La hoja de asistencia de un equipo: quién vino a cada entrenamiento del mes.
 *
 * Reproduce la hoja que el club llena en papel —encabezado con la sede, la categoría, el
 * horario y el profe; un renglón por alumno; una columna por día de entrenamiento del
 * mes— y le agrega poder capturarla, que es lo que el papel no puede.
 *
 * ── Las columnas no son los días del mes ──
 *
 * Son solo los días en que ESE equipo entrena. El 2023C entrena lunes y miércoles, así
 * que en agosto tiene nueve columnas y no treinta y uno. Los días salen de tblEquipos
 * (LunesStr, MartesStr, ...): la columna trae el rango de horas cuando hay clase y queda
 * vacía cuando no. Es el mismo dato del que la Plantilla arma su renglón de horario.
 *
 * ── Las tres marcas ──
 *
 * Vino ('A'), faltó ('F') y sin registrar (nada). La tercera no es un adorno: es la
 * diferencia entre "ese día no vino" y "ese día nadie pasó lista", y sin ella el
 * porcentaje de asistencia no significa nada, porque un día no capturado se leería como
 * que faltó el equipo entero. Ver migrations/024-asistencia-clases.sql.
 */

export type Marca = 'A' | 'F';

/** Un día de entrenamiento del mes: una columna de la hoja. */
export interface DiaClase {
    /** 'AAAA-MM-DD'. Es la llave de la marca y viaja así al servidor. */
    fecha: string;
    /** Día del mes, 1 a 31. */
    dia: number;
    /** 0 domingo … 6 sábado, como Date.getDay(). */
    diaSemana: number;
    /** 'L17', 'M19'. La inicial del día más el número, como en la hoja de papel. */
    etiqueta: string;
    /** '16:30 - 17:30', para el encabezado de la columna al pasar el mouse. */
    horas: string;
}

/* El orden de DIAS_SEMANA es lunes a domingo; getDay() cuenta desde el domingo. */
const DIA_SEMANA_DE_INDICE = [1, 2, 3, 4, 5, 6, 0];

/**
 * Las iniciales de los días, y por qué no son siempre una letra.
 *
 * La hoja de papel escribe 'L17' y 'M19' para un equipo de lunes y miércoles, y ahí la M
 * no se presta a nada. Pero martes y miércoles empiezan igual, y hay 10 equipos que
 * entrenan los dos: en esos, dos columnas 'M' serían indistinguibles justo en el
 * documento donde alguien firma que el niño vino.
 *
 * Así que la inicial se decide POR EQUIPO: una letra cuando basta —y entonces la hoja
 * sale idéntica a la de papel— y dos solo en los equipos donde haría falta.
 */
const INICIAL_CORTA = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];
const INICIAL_LARGA = ['LU', 'MA', 'MI', 'JU', 'VI', 'SA', 'DO'];

/** Los días de la semana que entrena el equipo, como índices de DIAS_SEMANA (0 = lunes). */
export function diasQueEntrena(equipo: Record<string, unknown>): number[] {
    return DIAS_SEMANA.map(([columna], i) => (String(equipo[columna] ?? '').trim() !== '' ? i : -1))
        .filter((i) => i >= 0);
}

/**
 * Las columnas de la hoja: los días de entrenamiento del equipo dentro del mes.
 *
 * `mes` es 1 a 12. Se arma con fechas locales y se formatea a mano en vez de con
 * `toISOString`, que convierte a UTC: en México eso corre la fecha un día hacia atrás y
 * la hoja saldría con las columnas del mes equivocado.
 */
export function diasDelMes(
    equipo: Record<string, unknown>,
    anio: number,
    mes: number,
): DiaClase[] {
    const indices = diasQueEntrena(equipo);
    if (indices.length === 0) return [];

    // Dos letras solo si el equipo entrena martes Y miércoles (los únicos que chocan).
    const choca = indices.includes(1) && indices.includes(2);
    const inicial = choca ? INICIAL_LARGA : INICIAL_CORTA;

    const quiereDiaSemana = new Set(indices.map((i) => DIA_SEMANA_DE_INDICE[i]));
    const horasPorDiaSemana = new Map(
        indices.map((i) => [DIA_SEMANA_DE_INDICE[i], String(equipo[DIAS_SEMANA[i][0]] ?? '').trim()]),
    );
    const inicialPorDiaSemana = new Map(indices.map((i) => [DIA_SEMANA_DE_INDICE[i], inicial[i]]));

    const out: DiaClase[] = [];
    const ultimo = new Date(anio, mes, 0).getDate();
    for (let dia = 1; dia <= ultimo; dia++) {
        const diaSemana = new Date(anio, mes - 1, dia).getDay();
        if (!quiereDiaSemana.has(diaSemana)) continue;
        out.push({
            fecha: `${anio}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`,
            dia,
            diaSemana,
            etiqueta: `${inicialPorDiaSemana.get(diaSemana)}${dia}`,
            horas: horasPorDiaSemana.get(diaSemana) ?? '',
        });
    }
    return out;
}

/* ── El mes que se está viendo ── */

export const MESES = [
    'ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO',
    'JULIO', 'AGOSTO', 'SEPTIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE',
] as const;

/** "AGOSTO '26", como lo escribe la hoja de papel. */
export const etiquetaMes = (anio: number, mes: number): string =>
    `${MESES[mes - 1]} '${String(anio).slice(-2)}`;

/* ── Lo que se cuenta al pie ── */

export interface ResumenAsistencia {
    asistencias: number;
    faltas: number;
    /** Asistencias entre lo registrado, 0 a 100. `null` si no hay nada capturado. */
    porcentaje: number | null;
}

/**
 * El porcentaje se calcula SOLO sobre lo registrado: asistencias entre asistencias más
 * faltas. Las celdas vacías no cuentan en ningún lado, ni arriba ni abajo de la
 * división. Meterlas como faltas castigaría al equipo por los días que el profe no
 * capturó, y meterlas como asistencias los regalaría.
 */
export function resumenDe(marcas: Iterable<Marca>): ResumenAsistencia {
    let asistencias = 0;
    let faltas = 0;
    for (const m of marcas) {
        if (m === 'A') asistencias += 1;
        else if (m === 'F') faltas += 1;
    }
    const registradas = asistencias + faltas;
    return {
        asistencias,
        faltas,
        porcentaje: registradas === 0 ? null : (asistencias / registradas) * 100,
    };
}

/** Verde si vino, rojo si faltó. Los mismos tonos que el resto de la aplicación. */
export const COLOR_MARCA: Record<Marca, string> = {
    A: 'bg-emerald-500 text-white',
    F: 'bg-rose-500 text-white',
};

/** Lo que se pinta en la celda. La hoja de papel usa palomita y F. */
export const TEXTO_MARCA: Record<Marca, string> = { A: '✓', F: 'F' };

/** Ciclo de la celda al tocarla: sin marca → vino → faltó → sin marca. */
export const siguienteMarca = (actual: Marca | null): Marca | null =>
    actual === null ? 'A' : actual === 'A' ? 'F' : null;
