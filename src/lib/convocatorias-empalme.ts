/**
 * Empalmes de fechas: el mismo niño convocado a dos torneos que se juegan a la vez.
 *
 * Es el error que nadie ve hasta el sábado por la mañana. Un niño se convoca a la copa
 * de su categoría y también, como invitado, a la de la categoría de arriba; las dos se
 * juegan el mismo fin de semana y no puede estar en las dos. Se cobra dos veces, se
 * cuenta dos veces en la plantilla, y el día del torneo falta en una.
 *
 * ── Por qué solo entre COPAS ──
 *
 * Una liga dura la temporada entera (63 a 152 días, 98 en promedio) y una copa dura un
 * fin de semana (5 días en promedio). Si el aviso saltara con cualquier traslape, cada
 * copa chocaría con la liga de todos sus jugadores: en la temporada actual eso son 38
 * niños marcados, casi todos sin ningún conflicto real —jugar la liga entre semana y
 * una copa el sábado es lo normal—. Acotado a copa contra copa queda 1 niño, y es de
 * verdad: convocado a REY DE REYES en dos categorías, ambas del 27 al 30 de agosto.
 *
 * Un aviso que salta siempre deja de leerse, así que el corte es ese: dos convocatorias
 * de tipo COPA (tblLigas.IdTipoLiga = 2) cuyas fechas se tocan. Cuenta también la MISMA
 * copa en dos categorías o colores distintos, que es justo el caso que se vio.
 *
 * Y es un aviso, no un candado: a veces sí se quiere: el niño juega la mañana en una y
 * la tarde en otra. Quien convoca decide con el dato enfrente.
 *
 * Este archivo NO toca la base: es tipos y texto, y lo comparten el servidor y la
 * pantalla para que digan lo mismo. La consulta vive en `convocatorias-empalme-db.ts`.
 */

/** Una convocatoria que se juega en las mismas fechas que la que se está viendo. */
export interface Empalme {
    idLiga: number;
    liga: string;
    categoria: string;
    color: string;
    /** 'YYYY-MM-DD'. Ya normalizadas: `desde` nunca es posterior a `hasta`. */
    desde: string;
    hasta: string;
    /** Otra convocatoria de la MISMA copa: otra categoría o color del mismo torneo. */
    mismaCopa: boolean;
}

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

/* La fecha se parte como texto, no con Date: llega como 'YYYY-MM-DD' y pasarla por
   `new Date` la interpreta en UTC y la corre un día en horario de México. */
const partes = (dia: string): [number, number] | null => {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dia ?? ''));
    return m ? [Number(m[3]), Number(m[2])] : null;
};

/** '2026-08-27' → '27 ago'. Cadena vacía si la fecha no viene o no se entiende. */
export function fechaCorta(dia: string): string {
    const p = partes(dia);
    return p ? `${p[0]} ${MESES[p[1] - 1] ?? ''}`.trim() : '';
}

/**
 * El periodo en corto: '27–30 ago' cuando es el mismo mes, '30 ago–2 sep' cuando no,
 * y un solo día cuando empieza y termina igual.
 */
export function rangoCorto(desde: string, hasta: string): string {
    const a = partes(desde);
    const b = partes(hasta);
    if (!a || !b) return fechaCorta(desde) || fechaCorta(hasta);
    if (desde === hasta) return fechaCorta(desde);
    if (a[1] === b[1]) return `${a[0]}–${b[0]} ${MESES[b[1] - 1] ?? ''}`.trim();
    return `${fechaCorta(desde)}–${fechaCorta(hasta)}`;
}

/** Cómo se nombra una convocatoria empalmada: 'REY DE REYES · 2015X (27–30 ago)'. */
export function etiquetaEmpalme(e: Empalme): string {
    const color = e.color ? ` ${e.color}` : '';
    return `${e.liga} · ${e.categoria}${color} (${rangoCorto(e.desde, e.hasta)})`;
}

/**
 * El aviso completo, o null si el jugador viene limpio.
 *
 * Lo usan el renglón de la tabla, el `confirm` de antes de convocar y la respuesta del
 * servidor, para que las tres digan exactamente lo mismo.
 */
export function textoEmpalme(empalmes: Empalme[] | undefined | null): string | null {
    const lista = empalmes ?? [];
    if (lista.length === 0) return null;

    const donde = lista.map(etiquetaEmpalme).join('; ');
    return lista.length === 1
        ? `Ya está convocado en ${donde}, que se juega en estas mismas fechas.`
        : `Ya está convocado en ${lista.length} torneos de estas mismas fechas: ${donde}.`;
}
