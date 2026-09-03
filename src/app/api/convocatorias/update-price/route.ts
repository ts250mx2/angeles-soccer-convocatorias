import { NextResponse } from 'next/server';
import { pool } from '@/lib/db';
import {
    esAjusteManual,
    fijaPrecioManual,
    liberaPrecioManual,
    precioDelSistema,
    preciosManualesDisponibles,
} from '@/lib/convocatorias-precios';

/**
 * Cambia el precio de un jugador dentro de una convocatoria.
 *
 * Además de guardarlo, decide si es un AJUSTE que hay que proteger: si el importe difiere
 * del que pondría el sistema (producto de la liga, con la beca solo si ya se le aplicó
 * con el botón), se marca y a partir de ahí ningún automatismo lo vuelve a mover. Si es exactamente el del sistema, se borra
 * la marca y el jugador regresa al precio automático: esa es la forma de deshacer un
 * ajuste sin una pantalla aparte.
 */
export async function POST(request: Request) {
    try {
        const { seasonId, leagueId, playerId, categoria, color, precio } = await request.json();

        // El color es OPCIONAL: hay convocatorias sin color. Ver /api/convocatorias/remove.
        if (!seasonId || !leagueId || !playerId || !categoria || precio === undefined) {
            return NextResponse.json({ success: false, message: 'Faltan parámetros requeridos' }, { status: 400 });
        }
        const colorParam = color ?? '';
        const importe = Number(precio);
        if (!Number.isFinite(importe) || importe < 0) {
            return NextResponse.json({ success: false, message: 'El precio no es válido' }, { status: 400 });
        }

        await pool.query(
            `UPDATE tblDetalleConvocatorias SET Precio = ?
             WHERE IdJugador = ? AND IdTemporada = ? AND IdLiga = ? AND Categoria = ?
               AND COALESCE(Color, '') = ?`,
            [importe, playerId, seasonId, leagueId, categoria, colorParam]
        );

        const clave = { idJugador: playerId, seasonId, leagueId, categoria, color: colorParam };
        const sistema = await precioDelSistema(pool, clave);
        const manual = esAjusteManual(importe, sistema);

        if (await preciosManualesDisponibles(pool)) {
            await (manual ? fijaPrecioManual(pool, clave) : liberaPrecioManual(pool, clave));
        }

        return NextResponse.json({ success: true, manual, precioSistema: sistema });
    } catch (error) {
        console.error('Error updating price:', error);
        return NextResponse.json(
            { success: false, message: 'Error updating price' },
            { status: 500 }
        );
    }
}
