/**
 * Preguntas de seguimiento que el agente propone al final de cada respuesta.
 *
 * Viajan dentro del mismo texto, detrás de una marca, porque la respuesta llega
 * como un solo flujo de tokens. Aquí se separan para que la marca NUNCA se vea:
 * ni al final ni a medio escribir mientras está llegando.
 */
export const MARCA_SUGERENCIAS = '[[SUGERENCIAS]]';

/** Máximo que se le muestran al usuario; más satura la conversación. */
const MAX_SUGERENCIAS = 3;

export interface RespuestaPartida {
    /** El texto a renderizar, ya sin la marca ni las sugerencias. */
    texto: string;
    sugerencias: string[];
}

export function separarSugerencias(content: string): RespuestaPartida {
    const i = content.indexOf(MARCA_SUGERENCIAS);
    if (i >= 0) {
        return {
            texto: content.slice(0, i).trimEnd(),
            sugerencias: content
                .slice(i + MARCA_SUGERENCIAS.length)
                .split('||')
                .map((s) => s.trim())
                .filter(Boolean)
                .slice(0, MAX_SUGERENCIAS),
        };
    }

    /* Streaming: la marca llega partida entre tokens ("[", "[[S", "[[SUGERENCIAS]"…).
       Se busca el sufijo más largo del texto que sea un prefijo de la marca y se
       corta ahí, para que ningún estado intermedio la deje asomar. */
    const maxParcial = Math.min(content.length, MARCA_SUGERENCIAS.length - 1);
    for (let n = maxParcial; n > 0; n--) {
        if (MARCA_SUGERENCIAS.startsWith(content.slice(-n))) {
            return { texto: content.slice(0, content.length - n).trimEnd(), sugerencias: [] };
        }
    }

    return { texto: content, sugerencias: [] };
}
