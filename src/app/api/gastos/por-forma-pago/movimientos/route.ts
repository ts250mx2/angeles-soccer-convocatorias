import { NextResponse } from 'next/server';
import { requierePagina } from '@/lib/permisos';
import { movimientosEgreso, enteroOpcional } from '@/lib/gastos-movimientos';

export const dynamic = 'force-dynamic';

/**
 * Tercer nivel: los movimientos uno por uno.
 *
 * Todos los filtros son opcionales: sin forma de pago ni destinatario devuelve todos
 * los gastos del período (es lo que abre el renglón "Total" del grid).
 */
export async function GET(request: Request) {
    const guardia = await requierePagina('/gastos/por-forma-pago');
    if (!guardia.ok) {
        return NextResponse.json({ success: false, message: guardia.message }, { status: guardia.status });
    }

    try {
        const { searchParams } = new URL(request.url);
        const idSede = enteroOpcional(searchParams.get('idSede'));
        const idFormaPago = enteroOpcional(searchParams.get('idFormaPago'));
        if (idSede === null) {
            return NextResponse.json({ success: false, message: 'Sede no válida' }, { status: 400 });
        }
        if (idFormaPago === null) {
            return NextResponse.json({ success: false, message: 'Forma de pago no válida' }, { status: 400 });
        }

        // El destinatario viaja ya normalizado desde el desglose; '' es un grupo real
        // (gastos sin PagarA), así que solo su ausencia significa "todos".
        const destinatarioParam = searchParams.get('destinatario');

        const { data, truncado } = await movimientosEgreso({
            dateFrom: searchParams.get('dateFrom'),
            dateTo: searchParams.get('dateTo'),
            idSede: idSede ?? null,
            idFormaPago: idFormaPago ?? null,
            tipoEgreso: null,
            destinatario: destinatarioParam,
        });

        return NextResponse.json({ success: true, data, truncado }, { headers: { 'Cache-Control': 'no-store' } });
    } catch (error) {
        console.error('Error fetching movimientos de gastos por forma de pago:', error);
        return NextResponse.json(
            { success: false, message: 'Error al obtener los movimientos' },
            { status: 500 },
        );
    }
}
