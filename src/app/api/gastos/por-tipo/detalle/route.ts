import { NextResponse } from 'next/server';
import { requierePagina } from '@/lib/permisos';
import { TIPO_EGRESO_CLAVE, filtroFechasEgreso, desglosePorDestinatario } from '@/lib/gastos-reportes';
import { enteroOpcional } from '@/lib/gastos-movimientos';

export const dynamic = 'force-dynamic';

/** Segundo nivel: a quién se le pagó dentro de un tipo de gasto. */
export async function GET(request: Request) {
    const guardia = await requierePagina('/gastos/por-tipo');
    if (!guardia.ok) {
        return NextResponse.json({ success: false, message: guardia.message }, { status: guardia.status });
    }

    try {
        const { searchParams } = new URL(request.url);
        const dateFrom = searchParams.get('dateFrom');
        const dateTo = searchParams.get('dateTo');
        const idSede = enteroOpcional(searchParams.get('idSede'));
        const tipo = enteroOpcional(searchParams.get('tipo'));

        if (idSede === null) {
            return NextResponse.json({ success: false, message: 'Sede no válida' }, { status: 400 });
        }
        // La clave del tipo ya viene normalizada a 0/1 por el resumen.
        if (tipo === null || tipo === undefined || (tipo !== 0 && tipo !== 1)) {
            return NextResponse.json({ success: false, message: 'Tipo de gasto no válido' }, { status: 400 });
        }

        const data = await desglosePorDestinatario(
            filtroFechasEgreso(dateFrom, dateTo),
            { clause: `${TIPO_EGRESO_CLAVE} = ?`, params: [tipo] },
            idSede ?? null,
        );

        return NextResponse.json({ success: true, data }, { headers: { 'Cache-Control': 'no-store' } });
    } catch (error) {
        console.error('Error fetching detalle de gastos por tipo:', error);
        return NextResponse.json(
            { success: false, message: 'Error al obtener el detalle' },
            { status: 500 },
        );
    }
}
