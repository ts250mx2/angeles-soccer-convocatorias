import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';

export const anthropic = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
});

export const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

/** Modelos que puede usar el agente. */
export type ModelKey = 'sonnet' | 'terra';

export interface ModelConfig {
    /** Identificador que viaja en el campo `model` de la petición. */
    id: string;
    label: string;
    /** Proveedor: decide el SDK y el protocolo de herramientas. */
    proveedor: 'anthropic' | 'openai';
    /** Nivel de esfuerzo (output_config.effort). Solo aplica a Anthropic. */
    effort: 'low' | 'medium' | 'high' | 'xhigh' | 'max';
    /** Nombre de la variable de entorno con la llave del proveedor. */
    envLlave: 'ANTHROPIC_API_KEY' | 'OPENAI_API_KEY';
    descripcion: string;
}

export const MODELS: Record<ModelKey, ModelConfig> = {
    sonnet: {
        id: process.env.ANTHROPIC_MODEL_SONNET || 'claude-sonnet-5',
        label: 'Sonnet 5',
        proveedor: 'anthropic',
        effort: 'medium',
        envLlave: 'ANTHROPIC_API_KEY',
        descripcion: 'Equilibrado. El de siempre para el día a día.',
    },
    terra: {
        id: process.env.OPENAI_MODEL_TERRA || 'gpt-5.6-terra',
        label: 'GPT-5.6 Terra',
        proveedor: 'openai',
        effort: 'medium',
        envLlave: 'OPENAI_API_KEY',
        descripcion: 'Alternativa de OpenAI, para contrastar respuestas.',
    },
};

export const MODEL_POR_DEFECTO: ModelKey = 'sonnet';

/** Resuelve la clave recibida del cliente; cae al modelo por defecto si no es válida. */
export function resolveModel(key?: string | null): { key: ModelKey; config: ModelConfig } {
    const elegido = (key && key in MODELS ? key : MODEL_POR_DEFECTO) as ModelKey;
    return { key: elegido, config: { ...MODELS[elegido] } };
}

/** Modelos utilizables: los que tienen su llave configurada en el servidor. */
export function modelosDisponibles(): Array<{ key: ModelKey; label: string; descripcion: string }> {
    return (Object.keys(MODELS) as ModelKey[])
        .filter((k) => !!process.env[MODELS[k].envLlave])
        .map((k) => ({ key: k, label: MODELS[k].label, descripcion: MODELS[k].descripcion }));
}
