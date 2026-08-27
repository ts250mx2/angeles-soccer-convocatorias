import { NextResponse } from 'next/server';
import { pool } from '@/lib/db';
import { crearConvocatoria } from '@/lib/convocatorias-crear';
import { fueraDeConvocatorias } from '@/lib/convocatorias-excluidas';

export const dynamic = 'force-dynamic';

/**
 * Alta de VARIAS convocatorias de la misma copa o liga, en una sola pasada.
 *
 * La captura real es "esta copa, estas ocho categorías": los costos, el profesor y las
 * fechas se repiten, y lo único que cambia por renglón es la categoría y su color. Por
 * eso el cuerpo trae los datos del torneo una vez y la lista de renglones aparte, cada
 * uno con lo suyo cuando se sale de lo común.
 *
 * NO es todo o nada, a propósito: si de ocho categorías una ya existía, las otras siete
 * tienen que quedar creadas. Se devuelve el resultado renglón por renglón y la pantalla
 * los marca; abortar la tanda entera por un duplicado obligaría a recapturar todo.
 */

interface RenglonEntrada {
    categoria?: unknown;
    color?: unknown;
    idProfesor?: unknown;
    costoLiga?: unknown;
    costoProfesor?: unknown;
    costoArbitro?: unknown;
    /* Las fechas y el formato del torneo se capturan arriba y se heredan, pero un
       renglón puede traer los suyos: al editar un torneo ya existente, cada categoría
       puede tener fechas distintas y no hay por qué igualarlas al agregar una nueva. */
    fechaInicio?: unknown;
    fechaFin?: unknown;
    cantidadJornadas?: unknown;
    eliminatoria?: unknown;
}

type Estado = 'creada' | 'duplicada' | 'excluida' | 'error';

const texto = (v: unknown): string => String(v ?? '').trim();
const numero = (v: unknown): number => Number(v) || 0;
const idOpcional = (v: unknown): number | null => {
    const n = Number(v);
    return Number.isInteger(n) && n > 0 ? n : null;
};

export async function POST(request: Request) {
    try {
        const cuerpo = await request.json();
        const {
            seasonId, leagueId, fechaInicio, fechaFin,
            cantidadJornadas, eliminatoria, renglones,
        } = cuerpo ?? {};

        if (!seasonId || !leagueId || !fechaInicio || !fechaFin) {
            return NextResponse.json(
                { success: false, message: 'Faltan la temporada, la copa o liga, o las fechas' },
                { status: 400 },
            );
        }
        if (!Array.isArray(renglones) || renglones.length === 0) {
            return NextResponse.json(
                { success: false, message: 'Agrega al menos una categoría' },
                { status: 400 },
            );
        }

        const [ligas] = (await pool.query(
            'SELECT Liga FROM tblLigas WHERE IdLiga = ?',
            [leagueId],
        )) as unknown as [Array<{ Liga: string | null }>, unknown];
        const nombreLiga = texto(ligas[0]?.Liga);

        if (!nombreLiga) {
            return NextResponse.json(
                { success: false, message: 'La copa o liga no existe' },
                { status: 404 },
            );
        }

        /* La liga entera puede estar fuera de este módulo (clinics, INTERASE). Se corta
           aquí y no renglón por renglón: si la liga no se convoca, ninguna categoría
           suya se convoca. */
        if (fueraDeConvocatorias(nombreLiga)) {
            return NextResponse.json(
                {
                    success: false,
                    message: 'Esa copa o liga no se convoca desde este módulo.',
                },
                { status: 409 },
            );
        }

        const resultados: Array<{ categoria: string; color: string; estado: Estado; mensaje?: string }> = [];

        for (const r of renglones as RenglonEntrada[]) {
            const categoria = texto(r.categoria);
            const color = texto(r.color);

            if (!categoria) {
                resultados.push({ categoria, color, estado: 'error', mensaje: 'Sin categoría' });
                continue;
            }
            if (fueraDeConvocatorias(categoria)) {
                resultados.push({
                    categoria, color, estado: 'excluida',
                    mensaje: 'Esa categoría no se convoca desde este módulo',
                });
                continue;
            }

            try {
                /* Misma regla que el alta de uno en uno: la llave es (temporada, liga,
                   categoría, color). Vigente se respeta; eliminada se reemplaza, porque
                   al eliminarla ya se borró su detalle y la nueva arranca limpia. */
                const [existentes] = (await pool.query(
                    'SELECT Status FROM tblConvocatorias WHERE IdTemporada = ? AND IdLiga = ? AND Categoria = ? AND Color = ?',
                    [seasonId, leagueId, categoria, color],
                )) as unknown as [Array<{ Status: number }>, unknown];

                if (existentes.length > 0 && Number(existentes[0].Status) === 0) {
                    resultados.push({
                        categoria, color, estado: 'duplicada',
                        mensaje: 'Ya existe una convocatoria vigente con esa categoría y color',
                    });
                    continue;
                }

                await crearConvocatoria(pool, {
                    seasonId,
                    leagueId,
                    categoria,
                    fechaInicio: texto(r.fechaInicio) || fechaInicio,
                    fechaFin: texto(r.fechaFin) || fechaFin,
                    color,
                    idProfesor: idOpcional(r.idProfesor),
                    costoLiga: numero(r.costoLiga),
                    costoProfesor: numero(r.costoProfesor),
                    costoArbitro: numero(r.costoArbitro),
                    cantidadJornadas: texto(r.cantidadJornadas) || cantidadJornadas,
                    eliminatoria: texto(r.eliminatoria) || eliminatoria,
                });

                resultados.push({ categoria, color, estado: 'creada' });
            } catch (error) {
                console.error('Error creando convocatoria en lote:', categoria, error);
                resultados.push({
                    categoria, color, estado: 'error',
                    mensaje: error instanceof Error ? error.message : 'Error al crear',
                });
            }
        }

        const creadas = resultados.filter((r) => r.estado === 'creada').length;

        return NextResponse.json({
            success: true,
            creadas,
            total: resultados.length,
            resultados,
        });
    } catch (error) {
        console.error('Error en el alta por lote:', error);
        return NextResponse.json(
            {
                success: false,
                message: 'Error al crear las convocatorias',
                error: error instanceof Error ? error.message : 'Unknown error',
            },
            { status: 500 },
        );
    }
}
