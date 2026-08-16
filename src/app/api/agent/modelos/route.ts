import { modelosDisponibles, MODEL_POR_DEFECTO } from '@/lib/anthropic';
import { requierePagina } from '@/lib/permisos';
import { CLAVE_AGENTE } from '@/lib/navegacion';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Modelos que el agente puede usar realmente. La lista la decide el servidor:
 * solo aparecen los que tienen su llave configurada en el .env, así que la
 * pantalla nunca ofrece una opción que fallaría al primer mensaje.
 */
export async function GET() {
    const auth = await requierePagina(CLAVE_AGENTE);
    if (!auth.ok) {
        return Response.json({ success: false, error: auth.message }, { status: auth.status });
    }
    return Response.json({
        success: true,
        modelos: modelosDisponibles(),
        porDefecto: MODEL_POR_DEFECTO,
    });
}
