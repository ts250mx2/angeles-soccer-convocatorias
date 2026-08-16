import crypto from 'crypto';
import { cookies } from 'next/headers';
import { pool } from '@/lib/db';

/**
 * Sesión de servidor basada en una cookie httpOnly firmada con HMAC-SHA256.
 *
 * El token solo transporta el IdUsuario; el rol NUNCA viaja en la cookie:
 * en cada request se vuelve a leer de la base de datos, de modo que si a un
 * usuario se le cambia el puesto o se da de baja, pierde el acceso de inmediato.
 */

export const SESSION_COOKIE = 'as_session';
const SESSION_DAYS = 7;

function getSecret(): string | null {
    const secret = process.env.AUTH_SECRET;
    if (!secret || secret.length < 16) return null;
    return secret;
}

const b64url = (buf: Buffer) => buf.toString('base64url');

function sign(payload: string, secret: string): string {
    return b64url(crypto.createHmac('sha256', secret).update(payload).digest());
}

export interface SessionPayload {
    uid: number;
    exp: number; // epoch ms
}

/** Genera el token de sesión. Devuelve null si falta AUTH_SECRET. */
export function createSessionToken(idUsuario: number): string | null {
    const secret = getSecret();
    if (!secret) return null;
    const payload: SessionPayload = {
        uid: idUsuario,
        exp: Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000,
    };
    const body = b64url(Buffer.from(JSON.stringify(payload)));
    return `${body}.${sign(body, secret)}`;
}

function verifyToken(token: string): SessionPayload | null {
    const secret = getSecret();
    if (!secret || !token) return null;

    const idx = token.lastIndexOf('.');
    if (idx <= 0) return null;
    const body = token.slice(0, idx);
    const sig = token.slice(idx + 1);

    const expected = sign(body, secret);
    // Comparación en tiempo constante (evita timing attacks)
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;

    try {
        const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as SessionPayload;
        if (!payload?.uid || !payload?.exp || Date.now() > payload.exp) return null;
        return payload;
    } catch {
        return null;
    }
}

export interface SessionUser {
    IdUsuario: number;
    Usuario: string;
    AdminConvocatorias: number;
    /** Perfil del usuario: de él cuelgan los permisos de módulo. */
    IdPuesto: number | null;
    Puesto: string | null;
}

/**
 * Usuario autenticado del request, con el perfil releído de la base de datos.
 * Devuelve null si no hay cookie válida, el usuario ya no existe o está dado de baja.
 */
export async function getSessionUser(): Promise<SessionUser | null> {
    const store = await cookies();
    const token = store.get(SESSION_COOKIE)?.value;
    if (!token) return null;

    const payload = verifyToken(token);
    if (!payload) return null;

    try {
        const [rows] = await pool.query(
            `SELECT A.IdUsuario, A.Usuario, A.IdPuesto, B.Puesto,
                    COALESCE(B.M8, 0) AS AdminConvocatorias
             FROM tblUsuarios A
             INNER JOIN tblPuestos B ON A.IdPuesto = B.IdPuesto
             WHERE A.IdUsuario = ? AND COALESCE(A.Status, 0) = 0
             LIMIT 1`,
            [payload.uid]
        ) as any[];
        if (!rows.length) return null;
        return {
            IdUsuario: rows[0].IdUsuario,
            Usuario: rows[0].Usuario,
            AdminConvocatorias: Number(rows[0].AdminConvocatorias) || 0,
            IdPuesto: rows[0].IdPuesto ?? null,
            Puesto: rows[0].Puesto ?? null,
        };
    } catch {
        return null;
    }
}

/** Igual que getSessionUser pero exige rol de administrador (AdminConvocatorias >= 2). */
export async function requireAdmin(): Promise<
    { ok: true; user: SessionUser } | { ok: false; status: number; message: string }
> {
    if (!getSecret()) {
        return {
            ok: false,
            status: 500,
            message: 'Falta configurar AUTH_SECRET en el archivo .env del servidor.',
        };
    }
    const user = await getSessionUser();
    if (!user) {
        return { ok: false, status: 401, message: 'Sesión no válida o expirada. Inicia sesión de nuevo.' };
    }
    if (user.AdminConvocatorias < 2) {
        return { ok: false, status: 403, message: 'Requiere permisos de administrador.' };
    }
    return { ok: true, user };
}

export const sessionCookieOptions = {
    httpOnly: true,
    sameSite: 'lax' as const,
    path: '/',
    secure: process.env.NODE_ENV === 'production',
    maxAge: SESSION_DAYS * 24 * 60 * 60,
};
