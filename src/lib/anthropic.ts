import Anthropic from '@anthropic-ai/sdk';

export const anthropic = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
});

/** Modelo único del agente: Claude Sonnet 5. */
export type ModelKey = 'sonnet';

interface ModelConfig {
    id: string;
    label: string;
    /** Nivel de esfuerzo (output_config.effort) */
    effort: 'low' | 'medium' | 'high' | 'xhigh' | 'max';
}

export const MODELS: Record<ModelKey, ModelConfig> = {
    sonnet: {
        id: process.env.ANTHROPIC_MODEL_SONNET || 'claude-sonnet-5',
        label: 'Sonnet 5',
        effort: 'medium',
    },
};

export function resolveModel(_key?: string | null): { key: ModelKey; config: ModelConfig } {
    return { key: 'sonnet', config: { ...MODELS.sonnet } };
}
