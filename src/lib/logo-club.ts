"use client";

/**
 * El escudo del club, en base64, para los documentos que se generan en el navegador.
 *
 * jsPDF necesita la imagen como data URI, así que se lee de /public una vez y se
 * guarda: un corte o un formato se imprimen varias veces seguidas y no tiene sentido
 * volver a pedirla en cada uno.
 *
 * Si por lo que sea no se puede leer, devuelve null y el documento sale sin escudo: un
 * papel sin logo se entiende, uno que no se genera no.
 */

const LOGO = "/logo-ase.png";

/** `undefined` = todavía no se ha intentado; `null` = se intentó y no se pudo. */
let memoria: string | null | undefined;

export async function leerLogoClub(): Promise<string | null> {
    if (memoria !== undefined) return memoria;

    try {
        const res = await fetch(LOGO, { cache: "force-cache" });
        if (!res.ok) {
            memoria = null;
            return null;
        }
        const blob = await res.blob();
        memoria = await new Promise<string | null>((resolve) => {
            const lector = new FileReader();
            lector.onloadend = () => resolve(typeof lector.result === "string" ? lector.result : null);
            lector.onerror = () => resolve(null);
            lector.readAsDataURL(blob);
        });
    } catch {
        memoria = null;
    }
    return memoria;
}
