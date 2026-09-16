import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import { configProxy, obtenerAgente, type AgenteIA } from '@/lib/hl-cliente';

/**
 * El cliente de IA de la aplicación, armado contra HL Console.
 *
 * Sustituye al antiguo `@/lib/anthropic`, que creaba los clientes con las llaves del
 * `.env` (ANTHROPIC_API_KEY / OPENAI_API_KEY) y traía una lista de modelos escrita a
 * mano para que el usuario eligiera. Ya no: el proveedor y el modelo los decide el
 * AGENTE en el portal de HL, y la llave ni siquiera llega a este servidor —las llamadas
 * pasan por el proxy de HL, que la inyecta—. Ver @/lib/hl-cliente.
 *
 * Qué cambia en la práctica:
 *
 *   Para cambiar de modelo (o de proveedor, de Claude a OpenAI y al revés) se edita el
 *   agente en el portal. Esta aplicación lo toma sola al vencer el caché, sin
 *   redespliegue y sin tocar el .env.
 *
 *   El `model` que se le manda al SDK da igual: el proxy lo sustituye por el del agente.
 *   Se manda el que HL reportó para que la bitácora y la pantalla digan lo mismo.
 *
 *   La llave de mentiras ('hl') es obligatoria porque los SDK exigen una; HL pone la
 *   real. Si aquí apareciera una llave de verdad, sería un error de configuración.
 */

/** Los dos proveedores que esta aplicación sabe manejar con su SDK. */
export type ProveedorSoportado = 'claude' | 'openai';

export interface ClienteIA {
    /** Lo que HL dice del agente: nombre, proveedor, modelo y caducidad. */
    agente: AgenteIA;
    proveedor: ProveedorSoportado;
    /** El modelo del agente. Va en la petición aunque el proxy lo vuelva a fijar. */
    modelo: string;
}

export interface ClienteAnthropic extends ClienteIA {
    proveedor: 'claude';
    anthropic: Anthropic;
}

export interface ClienteOpenAI extends ClienteIA {
    proveedor: 'openai';
    openai: OpenAI;
}

/** Error con un mensaje pensado para enseñarse en pantalla, no para el log. */
export class IAConfigError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'IAConfigError';
    }
}

/**
 * HL admite más proveedores de los que esta aplicación sabe llamar (Gemini, Groq,
 * Mistral…). Los compatibles con el API de OpenAI se hablan con su SDK; el resto no se
 * adivina, se avisa, porque fallaría a media conversación con un error del proveedor.
 */
const COMPATIBLES_OPENAI = new Set([
    'openai', 'deepseek', 'groq', 'mistral', 'xai', 'openrouter', 'kimi', 'qwen', 'glm',
]);

function proveedorSoportado(proveedor: string): ProveedorSoportado {
    if (proveedor === 'claude') return 'claude';
    if (COMPATIBLES_OPENAI.has(proveedor)) return 'openai';
    throw new IAConfigError(
        `El agente de HL usa el proveedor "${proveedor}", que esta aplicación todavía no sabe llamar. ` +
        'Cámbialo en el portal a uno de Claude o compatible con OpenAI.',
    );
}

/**
 * El cliente listo para usar, según lo que HL diga del agente en este momento.
 *
 * Se pide en CADA llamada y no se guarda en un módulo: el caché de HL ya evita el viaje
 * de red, y construir el SDK es barato. Guardarlo haría que un cambio de modelo en el
 * portal no surtiera efecto hasta reiniciar el servidor, que es justo lo que se quería
 * evitar.
 */
export async function clienteIA(): Promise<ClienteAnthropic | ClienteOpenAI> {
    const agente = await obtenerAgente();
    const proveedor = proveedorSoportado(agente.proveedor);
    const { baseURL, headers } = configProxy();
    const base: ClienteIA = { agente, proveedor, modelo: agente.modelo };

    if (proveedor === 'claude') {
        return {
            ...base,
            proveedor: 'claude',
            anthropic: new Anthropic({ baseURL, apiKey: 'hl', defaultHeaders: headers }),
        };
    }
    return {
        ...base,
        proveedor: 'openai',
        // El SDK de OpenAI cuelga sus rutas de /v1; el de Anthropic ya las trae.
        openai: new OpenAI({ baseURL: `${baseURL}/v1`, apiKey: 'hl', defaultHeaders: headers }),
    };
}

/**
 * ¿Es el 422 con el que HL avisa de que el agente cambió de proveedor?
 *
 * Las apps cachean proveedor y modelo durante HL_TTL_MIN. Si mientras tanto alguien pasa
 * el agente de Claude a OpenAI en el portal, la llamada saldría con el SDK equivocado;
 * HL no la reenvía y contesta 422 con este encabezado. Lo correcto es tirar el caché,
 * volver a preguntar y repetir con el SDK que toca —no reintentar igual—.
 *
 * Es 422 y no 409 a propósito: los SDK reintentan solos los 409.
 */
export function esProveedorCambiado(error: unknown): boolean {
    const e = error as { status?: number; headers?: unknown } | null;
    if (!e || e.status !== 422) return false;
    const headers = e.headers;
    if (headers instanceof Headers) return headers.get('x-hl-error') === 'PROVEEDOR_CAMBIADO';
    if (headers && typeof headers === 'object') {
        const h = headers as Record<string, unknown>;
        return h['x-hl-error'] === 'PROVEEDOR_CAMBIADO' || h['X-HL-Error'] === 'PROVEEDOR_CAMBIADO';
    }
    return false;
}
