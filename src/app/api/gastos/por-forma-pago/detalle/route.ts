import { NextResponse } from 'next/server';
import { requierePagina } from '@/lib/permisos';
import { filtroFechasEgreso, desglosePorDestinatario } from '@/lib/gastos-reportes';
import { enteroOpcional } from '@/lib/gastos-movimientos';

export const dynamic = 'force-dynamic';

/** Segundo nivel: a quién se le pagó con una forma de pago concreta. */
export async function GET(request: Request) {
    const guardia = await requierePagina('/gastos/por-forma-pago');
    if (!guardia.ok) {
        return NextResponse.json({ success: false, message: guardia.message }, { status: guardia.status });
    }

    try {
        const { searchParams } = new URL(request.url);
        const dateFrom = searchParams.get('dateFrom');
        const dateTo = searchParams.get('dateTo');
        const idSede = enteroOpcional(searchParams.get('idSede'));
        const idFormaPago = enteroOpcional(searchParams.get('idFormaPago'));

        if (idSede === null) {
            return NextResponse.json({ success: false, message: 'Sede no válida' }, { status: 400 });
        }
        if (idFormaPago === null || idFormaPago === undefined) {
            return NextResponse.json({ success: false, message: 'Forma de pago no válida' }, { status: 400 });
        }

        const data = await desglosePorDestinatario(
            filtroFechasEgreso(dateFrom, dateTo),
            { clause: 'COALESCE(E.IdFormaPago, 1) = ?', params: [idFormaPago] },
            idSede ?? null,
        );

        return NextResponse.json({ success: true, data }, { headers: { 'Cache-Control': 'no-store' } });
    } catch (error) {
        console.error('Error fetching detalle de gastos por forma de pago:', error);
        return NextResponse.json(
            { success: false, message: 'Error al obtener el detalle' },
            { status: 500 },
        );
    }
}
