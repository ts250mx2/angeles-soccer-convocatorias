import crypto from 'crypto';

/**
 * La liga con la que un papá sube la foto de su hijo sin tener usuario del sistema.
 *
 * Es un token firmado con HMAC-SHA256 sobre el mismo AUTH_SECRET de la sesión (ver
 * @/lib/auth), pero con un propósito propio mezclado en la firma: así un token de foto
 * jamás valida como cookie de sesión ni al revés, aunque compartan el secreto.
 *
 * Adentro solo viajan el IdJugador y el vencimiento. NO hay tabla de tokens: la firma
 * prueba que la liga la generó el sistema, y el vencimiento la acota. Eso también
 * significa que la liga no se quema al usarse: mientras esté vigente, el papá puede
 * volver a subir la foto si la primera salió borrosa, que en la práctica es lo que se
 * quiere. Quien necesite matar una liga antes de tiempo puede rotar AUTH_SECRET, al
 * costo de tirar también las sesiones.
 */

const PROPOSITO = 'foto-jugador:';

/** Días que vive la liga. Corto a propósito: es la cara de un menor la que abre. */
export const DIAS_VIGENCIA_FOTO = 7;

/* El mismo criterio que @/lib/auth: sin un secreto de al menos 16 caracteres no se
   firma nada. Se copia en vez de exportarse de allá para no ensanchar la superficie
   del módulo de sesión. */
function getSecret(): string | null {
    const secret = process.env.AUTH_SECRET;
    if (!secret || secret.length < 16) return null;
    return secret;
}

const b64url = (buf: Buffer) => buf.toString('base64url');

function firma(body: string, secret: string): string {
    return b64url(crypto.createHmac('sha256', secret).update(PROPOSITO + body).digest());
}

interface PayloadFoto {
    /** IdJugador al que la liga da derecho a subirle foto. */
    j: number;
    /** Vencimiento, epoch ms. */
    exp: number;
}

/**
 * Genera la liga para un jugador. Devuelve el token (va en la URL, es base64url y un
 * punto: no necesita escaparse) y su vencimiento, o null si falta AUTH_SECRET.
 */
export function crearTokenFoto(idJugador: number): { token: string; vence: number } | null {
    const secret = getSecret();
    if (!secret) return null;
    const payload: PayloadFoto = {
        j: idJugador,
        exp: Date.now() + DIAS_VIGENCIA_FOTO * 24 * 60 * 60 * 1000,
    };
    const body = b64url(Buffer.from(JSON.stringify(payload)));
    return { token: `${body}.${firma(body, secret)}`, vence: payload.exp };
}

/** El IdJugador de un token vigente y bien firmado; null para todo lo demás. */
export function verificarTokenFoto(token: string): number | null {
    const secret = getSecret();
    if (!secret || !token) return null;

    const idx = token.lastIndexOf('.');
    if (idx <= 0) return null;
    const body = token.slice(0, idx);
    const sig = token.slice(idx + 1);

    // Comparación en tiempo constante, igual que la cookie de sesión.
    const a = Buffer.from(sig);
    const b = Buffer.from(firma(body, secret));
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;

    try {
        const payload = JSON.parse(Buffer.from(body, 'base64url').toString()) as PayloadFoto;
        if (!Number.isInteger(payload.j) || payload.j <= 0) return null;
        if (typeof payload.exp !== 'number' || Date.now() > payload.exp) return null;
        return payload.j;
    } catch {
        return null;
    }
}
