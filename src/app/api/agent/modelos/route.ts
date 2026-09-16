import { obtenerAgente, hlConfigurado, HlClienteError } from '@/lib/hl-cliente';
import { requierePagina } from '@/lib/permisos';
import { CLAVE_AGENTE } from '@/lib/navegacion';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Con qué modelo está corriendo el agente ahora mismo.
 *
 * Antes esto devolvía una LISTA para que el usuario eligiera entre Claude y OpenAI,
 * según qué llaves hubiera en el .env. Ya no se elige aquí: el proveedor y el modelo los
 * decide el agente en el portal de HL Console, y esta ruta solo los informa para que la
 * pantalla diga con qué está hablando. Para cambiarlo se edita el agente en el portal.
 *
 * No devuelve error cuando HL no contesta: la pantalla del chat tiene que abrirse igual,
 * y si de verdad no hay IA el usuario lo sabrá al mandar el primer mensaje, con el
 * mensaje que dé /api/agent. Aquí solo se calla el rótulo.
 */
export async function GET() {
    const auth = await requierePagina(CLAVE_AGENTE);
    if (!auth.ok) {
        return Response.json({ success: false, error: auth.message }, { status: auth.status });
    }

    if (!hlConfigurado()) {
        return Response.json({
            success: true,
            configurado: false,
            error: 'Faltan HL_URL, HL_API_KEY o HL_AGENTE en el .env del servidor.',
        });
    }

    try {
        const agente = await obtenerAgente();
        return Response.json({
            success: true,
            configurado: true,
            agente: agente.nombre,
            proveedor: agente.proveedor,
            modelo: agente.modelo,
        });
    } catch (error) {
        console.error('[agent] no se pudo leer el agente de HL:', error);
        return Response.json({
            success: true,
            configurado: false,
            error: error instanceof HlClienteError ? error.message : 'No se pudo consultar HL Console.',
        });
    }
}
