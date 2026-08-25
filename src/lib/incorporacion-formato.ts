"use client";

import { jsPDF } from "jspdf";
import { BAJA, type IncorporacionRow } from "@/lib/incorporaciones";

/**
 * El formato de incorporación de UN renglón, listo para imprimir y archivar.
 *
 * Sigue el formato de papel: arriba el escudo y el título; luego la fecha, el profesor
 * y el jugador; después de qué grupo viene y a cuál va; en medio, grande, **el grupo ya
 * incorporado** —toda la plantilla de destino con el jugador nuevo dentro y marcado,
 * que es lo que hay que ver para autorizar—; abajo la justificación y la autorización.
 *
 * Sale en PDF y no por el diálogo del navegador a propósito: es el mismo camino que
 * usan las demás exportaciones de la aplicación, no depende de cómo esté configurada
 * la impresión de cada equipo y deja un archivo que se puede guardar.
 */

/** Lo que el formato necesita saber de cada jugador de la plantilla. */
export interface JugadorFormato {
    IdJugador: number;
    Jugador: string;
}

export interface ListaFormato {
    categoria: string;
    /** Qué corte se pudo imprimir: los inscritos del ciclo o, si no había, los activos. */
    modo: "inscritos" | "activos";
    jugadores: JugadorFormato[];
}

const CLUB = "ANGELES SOCCER ELITE";
const TITULO = "INCORPORACION";
const LOGO = "/logo-ase.png";

const TINTA: [number, number, number] = [24, 32, 46];
const GRIS: [number, number, number] = [113, 121, 134];
const LINEA: [number, number, number] = [30, 41, 59];
const SUAVE: [number, number, number] = [160, 170, 184];
const CABECERA: [number, number, number] = [237, 241, 246];
const AUTORIZA: [number, number, number] = [21, 101, 60];
const CANCELA: [number, number, number] = [176, 20, 55];
/** Fondo del renglón del jugador que se incorpora: el que hay que ver de un golpe. */
const RESALTE: [number, number, number] = [217, 233, 254];
const CUERPO: [number, number, number] = [55, 65, 81];

const fechaCorta = (valor: string | null): string => {
    if (!valor) return "—";
    const [anio, mes, dia] = valor.slice(0, 10).split("-");
    return anio && mes && dia ? `${dia}/${mes}/${anio}` : valor;
};

/** 'YYYY-MM-DD HH:mm' → '24/08/2026 10:15'. La hora es opcional. */
const fechaHora = (valor: string | null): string => {
    if (!valor) return "—";
    const hora = valor.slice(11, 16);
    return `${fechaCorta(valor)}${hora ? ` ${hora}` : ""}`;
};

const safeName = (s: string) => s.replace(/[^\w\sáéíóúñÁÉÍÓÚÑ-]/gi, "").replace(/\s+/g, "_").slice(0, 60);

/**
 * El escudo, en base64 para jsPDF. Si por lo que sea no se puede leer, el formato sale
 * sin él: un papel sin logo se entiende, uno que no se imprime no.
 */
async function leerLogo(): Promise<string | null> {
    try {
        const res = await fetch(LOGO, { cache: "force-cache" });
        if (!res.ok) return null;
        const blob = await res.blob();
        return await new Promise<string | null>((resolve) => {
            const lector = new FileReader();
            lector.onloadend = () => resolve(typeof lector.result === "string" ? lector.result : null);
            lector.onerror = () => resolve(null);
            lector.readAsDataURL(blob);
        });
    } catch {
        return null;
    }
}

export async function imprimirFormatoIncorporacion({
    fila, ciclo, grupo, yaAplicado,
}: {
    fila: IncorporacionRow;
    ciclo: string;
    /** Plantilla del grupo destino: el equipo al que llega. */
    grupo: ListaFormato;
    /** ¿El cambio ya se aplicó en la plantilla? Decide cómo se marca al jugador. */
    yaAplicado: boolean;
}) {
    const doc = new jsPDF({ orientation: "portrait", format: "letter" });
    const ancho = doc.internal.pageSize.getWidth();
    const alto = doc.internal.pageSize.getHeight();
    const margen = 14;
    const util = ancho - margen * 2;
    const cancelada = fila.Status === BAJA;

    /** Caja con su etiqueta chica arriba y el dato dentro: el bloque del formato. */
    const caja = (x: number, y: number, w: number, h: number, etiqueta: string, valor: string, grande = false) => {
        doc.setDrawColor(...LINEA);
        doc.setLineWidth(0.4);
        doc.rect(x, y, w, h);

        doc.setFont("helvetica", "bold");
        doc.setFontSize(6.5);
        doc.setTextColor(...GRIS);
        doc.text(etiqueta, x + 3, y + 5);

        /* El dato se encoge hasta caber en su caja en lugar de cortarse: un nombre a
           medias en un formato que se archiva no vale de nada. */
        doc.setFont("helvetica", grande ? "bold" : "normal");
        doc.setTextColor(...TINTA);
        const texto = valor || "—";
        let tam = grande ? 12.5 : 10.5;
        doc.setFontSize(tam);
        while (doc.getTextWidth(texto) > w - 6 && tam > 6.5) {
            tam -= 0.4;
            doc.setFontSize(tam);
        }
        doc.text(doc.splitTextToSize(texto, w - 6)[0] ?? "—", x + 3, y + h - 4);
    };

    // ── Escudo y título ──
    const logo = await leerLogo();
    if (logo) {
        try {
            doc.addImage(logo, "PNG", margen, 11, 22, 22);
        } catch {
            /* si el escudo no se puede pintar, el formato sigue sin él */
        }
    }

    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(...GRIS);
    doc.text(CLUB, margen + 27, 19);

    doc.setFontSize(22);
    doc.setTextColor(...TINTA);
    doc.text(TITULO, margen + 27, 30, { charSpace: 1.2 });

    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...GRIS);
    doc.text(`Folio ${String(fila.IdIncorporacion).padStart(6, "0")}`, ancho - margen, 19, { align: "right" });
    doc.text(`Ciclo ${ciclo || "—"}`, ancho - margen, 24.5, { align: "right" });
    if (fila.Sede) doc.text(fila.Sede, ancho - margen, 30, { align: "right" });

    doc.setDrawColor(...LINEA);
    doc.setLineWidth(0.6);
    doc.line(margen, 37, ancho - margen, 37);

    // ── Fecha, profesor y jugador ──
    const yDatos = 44;
    const anchoFecha = 46;
    const anchoProfesor = 62;
    caja(margen, yDatos, anchoFecha, 15, "FECHA", fechaCorta(fila.FechaCaptura));
    caja(margen + anchoFecha + 5, yDatos, anchoProfesor, 15, "PROFESOR", fila.Profesor ?? "—");
    const xJugador = margen + anchoFecha + anchoProfesor + 10;
    caja(xJugador, yDatos, ancho - margen - xJugador, 15, "JUGADOR", fila.Jugador ?? "—", true);

    // ── De dónde viene y a dónde va ──
    const yGrupos = yDatos + 21;
    const mitad = (util - 5) / 2;
    caja(margen, yGrupos, mitad, 15, "PROCEDENCIA", fila.Procedencia || "Sin procedencia");
    caja(margen + mitad + 5, yGrupos, mitad, 15, "GRUPO A INCORPORAR", fila.GrupoIncorporar, true);

    // ── El grupo ya incorporado ──
    /* La plantilla de destino CON el jugador dentro. Si todavía no se le movió en el
       sistema de escritorio no viene en la consulta, así que se agrega: el papel tiene
       que mostrar el equipo como va a quedar, que es lo que se autoriza. Que salga como
       "nuevo" o como "incorporado" lo dice el formato (su categoría de hoy) y no esta
       lista, donde un jugador ya movido pero sin inscripción del ciclo tampoco aparece. */
    const yaEnLista = grupo.jugadores.some((j) => j.IdJugador === fila.IdJugador);
    const plantilla: (JugadorFormato & { nuevo: boolean })[] = [
        ...grupo.jugadores.map((j) => ({ ...j, nuevo: j.IdJugador === fila.IdJugador })),
        ...(yaEnLista ? [] : [{ IdJugador: fila.IdJugador, Jugador: fila.Jugador ?? "—", nuevo: true }]),
    ];

    const yCaja = yGrupos + 21;
    const altoCabecera = 9;
    const columnas = plantilla.length > 24 ? 3 : 2;
    const porColumna = Math.max(1, Math.ceil(plantilla.length / columnas));
    const altoRenglon = 5.6;
    const altoCuerpo = Math.max(38, porColumna * altoRenglon + 8);

    doc.setFillColor(...CABECERA);
    doc.setDrawColor(...LINEA);
    doc.setLineWidth(0.4);
    doc.rect(margen, yCaja, util, altoCabecera, "FD");
    doc.rect(margen, yCaja + altoCabecera, util, altoCuerpo);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(...TINTA);
    doc.text(`GRUPO INCORPORADO  ·  ${fila.GrupoIncorporar}`, margen + 3, yCaja + 6);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(...GRIS);
    const corte = grupo.modo === "inscritos" ? "inscritos del ciclo" : "activos, sin inscripcion capturada";
    doc.text(`${plantilla.length} jugador(es) · ${corte}`, ancho - margen - 3, yCaja + 6, { align: "right" });

    const anchoColumna = util / columnas;
    plantilla.forEach((j, i) => {
        const col = Math.floor(i / porColumna);
        const fil = i % porColumna;
        const x = margen + col * anchoColumna;
        const y = yCaja + altoCabecera + 7 + fil * altoRenglon;

        if (j.nuevo) {
            doc.setFillColor(...RESALTE);
            doc.rect(x + 1.5, y - 4, anchoColumna - 3, altoRenglon - 0.6, "F");
        }
        doc.setFont("helvetica", j.nuevo ? "bold" : "normal");
        doc.setFontSize(8);
        doc.setTextColor(...(j.nuevo ? TINTA : CUERPO));
        doc.text(`${i + 1}.`, x + 7, y, { align: "right" });
        const etiqueta = j.nuevo ? `${j.Jugador}  (${yaAplicado ? "INCORPORADO" : "NUEVO"})` : j.Jugador;
        doc.text(doc.splitTextToSize(etiqueta, anchoColumna - 14)[0] ?? "", x + 9, y);
    });

    // ── Justificación ──
    const yTexto = yCaja + altoCabecera + altoCuerpo + 7;
    const altoTexto = 26;
    doc.setDrawColor(...LINEA);
    doc.setLineWidth(0.4);
    doc.rect(margen, yTexto, util, altoTexto);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(6.5);
    doc.setTextColor(...GRIS);
    doc.text("JUSTIFICACION DE LA INCORPORACION", margen + 3, yTexto + 5);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9.5);
    doc.setTextColor(...TINTA);
    doc.text(doc.splitTextToSize(fila.Justificacion || "—", util - 6).slice(0, 4), margen + 3, yTexto + 11);

    // ── Autorización ──
    /* En Times y no en la tipografía del resto del formato: es la parte que se firma, y
       con otra letra se distingue de un vistazo del cuerpo del documento. */
    const yAut = yTexto + altoTexto + 7;
    const anchoAut = 120;
    const xAut = ancho - margen - anchoAut;
    const color = cancelada ? CANCELA : AUTORIZA;

    doc.setDrawColor(...color);
    doc.setLineWidth(0.7);
    doc.rect(xAut, yAut, anchoAut, 20);

    doc.setFont("times", "bold");
    doc.setFontSize(15);
    doc.setTextColor(...color);
    doc.text(cancelada ? "CANCELADA" : "AUTORIZADO", xAut + 6, yAut + 9, { charSpace: 0.8 });

    doc.setFont("times", "normal");
    doc.setFontSize(9.5);
    doc.setTextColor(...TINTA);
    doc.text(fila.Autorizacion ?? "—", xAut + 6, yAut + 16);
    doc.setFontSize(8);
    doc.setTextColor(...GRIS);
    doc.text(
        fechaHora(fila.FechaAutorizacion ?? fila.FechaCaptura),
        xAut + anchoAut - 6, yAut + 16, { align: "right" },
    );

    // Pie: de dónde salió el papel.
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.5);
    doc.setTextColor(...SUAVE);
    doc.text(
        `${CLUB} · Formato de incorporacion · Folio ${String(fila.IdIncorporacion).padStart(6, "0")}`,
        margen, alto - 10,
    );

    doc.save(`Incorporacion_${String(fila.IdIncorporacion).padStart(6, "0")}_${safeName(fila.Jugador ?? "")}.pdf`);
}
