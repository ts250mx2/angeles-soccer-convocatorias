import { NextResponse } from 'next/server';
import { requierePagina } from '@/lib/permisos';
import { movimientosEgreso, enteroOpcional } from '@/lib/gastos-movimientos';

export const dynamic = 'force-dynamic';

/**
 * Tercer nivel: los movimientos uno por uno.
 *
 * Todos los filtros son opcionales: sin tipo ni destinatario devuelve todos los
 * gastos del período (es lo que abre el renglón "Total" del grid).
 */
export async function GET(request: Request) {
    const guardia = await requierePagina('/gastos/por-tipo');
    if (!guardia.ok) {
        return NextResponse.json({ success: false, message: guardia.message }, { status: guardia.status });
    }

    try {
        const { searchParams } = new URL(request.url);
        const idSede = enteroOpcional(searchParams.get('idSede'));
        const tipo = enteroOpcional(searchParams.get('tipo'));
        if (idSede === null) {
            return NextResponse.json({ success: false, message: 'Sede no válida' }, { status: 400 });
        }
        if (tipo === null || (tipo !== undefined && tipo !== 0 && tipo !== 1)) {
            return NextResponse.json({ success: false, message: 'Tipo de gasto no válido' }, { status: 400 });
        }

        // '' es un grupo real (gastos sin PagarA); solo su ausencia significa "todos".
        const destinatarioParam = searchParams.get('destinatario');

        const { data, truncado } = await movimientosEgreso({
            dateFrom: searchParams.get('dateFrom'),
            dateTo: searchParams.get('dateTo'),
            idSede: idSede ?? null,
            idFormaPago: null,
            tipoEgreso: tipo ?? null,
            destinatario: destinatarioParam,
        });

        return NextResponse.json({ success: true, data, truncado }, { headers: { 'Cache-Control': 'no-store' } });
    } catch (error) {
        console.error('Error fetching movimientos de gastos por tipo:', error);
        return NextResponse.json(
            { success: false, message: 'Error al obtener los movimientos' },
            { status: 500 },
        );
    }
}
