/**
 * SQL Sandbox — validador de solo lectura (MySQL).
 *
 * Primera línea de defensa para que el agente solo pueda CONSULTAR datos,
 * nunca modificarlos. Idealmente se complementa con un usuario MySQL con
 * permisos SELECT únicamente.
 *
 * Rechaza:
 *  - DML de escritura: INSERT, UPDATE, DELETE, REPLACE, MERGE, TRUNCATE
 *  - DDL: CREATE, ALTER, DROP, RENAME
 *  - DCL: GRANT, REVOKE
 *  - Procedural / peligroso: CALL, EXEC, HANDLER, LOAD, INTO OUTFILE/DUMPFILE
 *  - Múltiples statements (uno por consulta)
 */

const FORBIDDEN_KEYWORDS = [
    'INSERT', 'UPDATE', 'DELETE', 'REPLACE', 'MERGE', 'TRUNCATE',
    'CREATE', 'ALTER', 'DROP', 'RENAME',
    'GRANT', 'REVOKE',
    'CALL', 'EXEC', 'EXECUTE', 'HANDLER', 'LOAD', 'LOCK', 'UNLOCK',
    'SET', 'USE', 'PREPARE', 'DEALLOCATE',
];

const FORBIDDEN_PATTERNS: Array<{ pattern: RegExp; reason: string }> = [
    { pattern: /\bINTO\s+(OUTFILE|DUMPFILE)\b/i, reason: 'Escritura a archivo no permitida' },
    { pattern: /\bLOAD_FILE\s*\(/i, reason: 'Lectura de archivos no permitida' },
    { pattern: /;\s*\S/, reason: 'Múltiples statements en una consulta no permitidos' },
];

export interface SqlValidationResult {
    valid: boolean;
    reason?: string;
    sanitized?: string;
}

export function validateReadOnlySql(sql: string): SqlValidationResult {
    if (!sql || typeof sql !== 'string') {
        return { valid: false, reason: 'SQL vacío o inválido' };
    }

    const trimmed = sql.trim();
    if (trimmed.length === 0) {
        return { valid: false, reason: 'SQL vacío' };
    }

    // Solo statements que arranquen con SELECT o WITH (CTE)
    const startsWithReadOp = /^(\s*WITH\b|\s*SELECT\b|\s*\(\s*SELECT\b)/i.test(trimmed);
    if (!startsWithReadOp) {
        return { valid: false, reason: 'Solo se permiten consultas de lectura (SELECT o WITH)' };
    }

    // Remueve strings y comentarios para no dar falsos positivos sobre literales
    const stripped = trimmed
        .replace(/'(?:[^']|'')*'/g, "''")
        .replace(/"(?:[^"]|"")*"/g, '""')
        .replace(/`[^`]*`/g, '``')
        .replace(/--[^\n]*/g, '')
        .replace(/#[^\n]*/g, '')
        .replace(/\/\*[\s\S]*?\*\//g, '');

    const upper = stripped.toUpperCase();
    for (const kw of FORBIDDEN_KEYWORDS) {
        if (new RegExp(`\\b${kw}\\b`).test(upper)) {
            return {
                valid: false,
                reason: `Operación prohibida: ${kw}. Este agente solo puede consultar datos, no modificarlos.`,
            };
        }
    }

    for (const { pattern, reason } of FORBIDDEN_PATTERNS) {
        if (pattern.test(stripped)) {
            return { valid: false, reason };
        }
    }

    const sanitized = trimmed.replace(/;\s*$/, '');
    return { valid: true, sanitized };
}

export function assertReadOnly(sql: string): string {
    const result = validateReadOnlySql(sql);
    if (!result.valid) {
        throw new Error(`SQL bloqueado por el sandbox: ${result.reason}`);
    }
    return result.sanitized!;
}
