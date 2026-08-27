import { esCopa } from '@/lib/copas-ligas';

/**
 * El resumen de convocatorias, agrupado por copa o liga.
 *
 * La pantalla de Convocatorias lista una tarjeta por **convocatoria**, que en realidad
 * es liga + categoría + color: una misma copa aparece repartida en veinte tarjetas y no
 * hay forma de ver cómo va el torneo completo. Esto junta esas filas por torneo para la
 * portada, y al abrir uno se sigue viendo el detalle de siempre.
 *
 * Dos cosas del agrupado que conviene tener claras:
 *
 *   Las categorías se cuentan DISTINTAS. Una categoría convocada en dos colores son dos
 *   convocatorias pero una sola categoría; por eso el resumen trae las dos cifras.
 *
 *   La utilidad usa la misma fórmula que la tabla y las exportaciones: lo cobrado (o lo
 *   esperado) menos los tres costos del torneo —liga, profesor y árbitro—, que se
 *   capturan por convocatoria y aquí se suman.
 */

/** Lo que el resumen necesita de cada fila de /api/convocatorias/summary. */
export interface FilaResumen {
    IdLiga: number;
    Liga: string;
    Categoria: string;
    Color?: string;
    Cerrada: number;
    /** 'YYYY-MM-DD' o ISO; del torneo se guarda la más temprana de sus categorías. */
    FechaInicio?: string;
    JugadoresConvocados: number;
    Total: number;
    Pagos: number;
    CostoLiga?: number;
    CostoProfesor?: number;
    CostoArbitro?: number;
    IdTipoLiga?: number;
    TieneFoto?: number;
    FotoVersion?: string | null;
}

/** Una categoría dentro de una copa o liga, con sus colores ya sumados. */
export interface CategoriaDeCopa {
    categoria: string;
    /** Cuántas convocatorias (colores) tiene esa categoría en este torneo. */
    grupos: number;
    jugadores: number;
    esperado: number;
    recaudado: number;
    /** Todas sus convocatorias están cerradas. */
    cerrada: boolean;
}

export interface ResumenCopaLiga {
    idLiga: number;
    liga: string;
    esCopa: boolean;
    /** 'YYYY-MM-DD': cuándo arranca lo primero del torneo. Ordena la portada. */
    desde: string | null;
    tieneFoto: boolean;
    fotoVersion: string | null;
    /** Filas del resumen: liga + categoría + color. */
    convocatorias: number;
    abiertas: number;
    categorias: CategoriaDeCopa[];
    jugadores: number;
    esperado: number;
    recaudado: number;
    /** Liga + profesor + árbitro, sumados de todas sus convocatorias. */
    costos: number;
    utilidadEsperada: number;
    utilidadRecaudada: number;
}

const num = (v: number | undefined | null): number => Number(v) || 0;

/* Solo el día: la fecha llega como instante UTC ('2026-08-01T06:00:00.000Z' es el 1 de
   agosto local), así que se corta en seco en lugar de pasarla por Date, que la correría
   un día. Como texto 'YYYY-MM-DD' se compara y se ordena igual de bien. */
const dia = (v: string | undefined): string | null => {
    const d = String(v ?? '').slice(0, 10);
    return /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : null;
};

/** Los tres costos del torneo de una convocatoria. */
export const costosDe = (f: FilaResumen): number =>
    num(f.CostoLiga) + num(f.CostoProfesor) + num(f.CostoArbitro);

export function resumirPorCopaLiga(filas: FilaResumen[]): ResumenCopaLiga[] {
    const porLiga = new Map<number, ResumenCopaLiga & { _cats: Map<string, CategoriaDeCopa> }>();

    for (const f of filas) {
        let r = porLiga.get(f.IdLiga);
        if (!r) {
            r = {
                idLiga: f.IdLiga,
                liga: f.Liga,
                esCopa: esCopa(f.IdTipoLiga),
                desde: null,
                tieneFoto: f.TieneFoto === 1,
                fotoVersion: f.FotoVersion ?? null,
                convocatorias: 0,
                abiertas: 0,
                categorias: [],
                jugadores: 0,
                esperado: 0,
                recaudado: 0,
                costos: 0,
                utilidadEsperada: 0,
                utilidadRecaudada: 0,
                _cats: new Map(),
            };
            porLiga.set(f.IdLiga, r);
        }

        const inicio = dia(f.FechaInicio);
        if (inicio && (r.desde === null || inicio < r.desde)) r.desde = inicio;

        r.convocatorias += 1;
        if (f.Cerrada !== 1) r.abiertas += 1;
        r.jugadores += num(f.JugadoresConvocados);
        r.esperado += num(f.Total);
        r.recaudado += num(f.Pagos);
        r.costos += costosDe(f);

        const clave = f.Categoria || '—';
        const cat = r._cats.get(clave) ?? {
            categoria: clave, grupos: 0, jugadores: 0, esperado: 0, recaudado: 0, cerrada: true,
        };
        cat.grupos += 1;
        cat.jugadores += num(f.JugadoresConvocados);
        cat.esperado += num(f.Total);
        cat.recaudado += num(f.Pagos);
        // La categoría solo está cerrada si TODAS sus convocatorias lo están.
        cat.cerrada = cat.cerrada && f.Cerrada === 1;
        r._cats.set(clave, cat);
    }

    return [...porLiga.values()]
        .map(({ _cats, ...r }) => ({
            ...r,
            categorias: [..._cats.values()].sort((a, b) => a.categoria.localeCompare(b.categoria)),
            utilidadEsperada: r.esperado - r.costos,
            utilidadRecaudada: r.recaudado - r.costos,
        }))
        /* Por cuándo arranca el torneo, del más próximo al más lejano: es el orden en
           que se trabajan. Un torneo sin fecha se va al final, y el nombre desempata. */
        .sort((a, b) => {
            if (a.desde !== b.desde) {
                if (a.desde === null) return 1;
                if (b.desde === null) return -1;
                return a.desde < b.desde ? -1 : 1;
            }
            return a.liga.localeCompare(b.liga);
        });
}

/** Los totales de todas las copas y ligas juntas, para el pie de la portada. */
export function totalesGenerales(resumenes: ResumenCopaLiga[]) {
    return resumenes.reduce(
        (t, r) => ({
            torneos: t.torneos + 1,
            convocatorias: t.convocatorias + r.convocatorias,
            categorias: t.categorias + r.categorias.length,
            jugadores: t.jugadores + r.jugadores,
            esperado: t.esperado + r.esperado,
            recaudado: t.recaudado + r.recaudado,
            utilidadEsperada: t.utilidadEsperada + r.utilidadEsperada,
            utilidadRecaudada: t.utilidadRecaudada + r.utilidadRecaudada,
        }),
        {
            torneos: 0, convocatorias: 0, categorias: 0, jugadores: 0,
            esperado: 0, recaudado: 0, utilidadEsperada: 0, utilidadRecaudada: 0,
        },
    );
}
