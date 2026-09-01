"use client";

import jsPDF from "jspdf";
import { presentarPdf } from "@/lib/pdf-preview";
import autoTable from "jspdf-autotable";
import ExcelJS from "exceljs";
import {
    BANDAS_LEALTAD, aniosDeCiclos, bandaDe, etiquetaAnios, etiquetaCiclo,
} from "@/lib/lealtad";

/** Fila del Reporte de Lealtad, tal como la entrega /api/jugadores/lealtad. */
export interface LealtadRow {
    IdJugador: number;
    Jugador: string;
    Categoria: string;
    Status: number;
    IdSede: number;
    SedeNombre: string;
    FechaNacimiento: string | null;
    Edad: number | null;
    FechaAlta: string | null;
    TelPadre: string | null;
    TelMadre: string | null;
    /** Tiene foto en su ficha; la imagen se pide aparte a /api/jugadores/foto. */
    TieneFoto: number;
    /** Sello que rompe el caché cuando la foto cambia (tblJugadores.FechaAct). */
    FotoVersion: string | null;
    /** Inscrito en la TEMPORADA ACTIVA, con la regla de la pantalla de Inscripciones. */
    Inscrito: number;
    /** Clinics / clinics futsal: no manejan inscripción, su columna dice N/A. */
    Exento: number;
    /** Semestres de inscripción pagados. 0 = sin registro. */
    Ciclos: number | string | null;
    /** Primer y último ciclo, codificados como en @/lib/lealtad. 0 si no hay. */
    Desde: number | string | null;
    Hasta: number | string | null;
}

/** SÍ / NO / N/A de la inscripción en la temporada activa, para pantalla y exportes. */
export const inscritoLabel = (r: LealtadRow): 'SÍ' | 'NO' | 'N/A' =>
    r.Exento === 1 ? 'N/A' : r.Inscrito === 1 ? 'SÍ' : 'NO';

export const ciclos = (r: LealtadRow): number => Number(r.Ciclos) || 0;

/**
 * Se fue y volvió: entre su primer ciclo y el último hay más semestres que los que
 * pagó. Es lo que distingue al que lleva cuatro años seguidos del que lleva cuatro
 * años en el calendario pero solo dos de escuela.
 */
export function tieneHueco(r: LealtadRow): boolean {
    const n = ciclos(r);
    if (n <= 1) return false;
    const lapso = (Number(r.Hasta) || 0) - (Number(r.Desde) || 0) + 1;
    return lapso > n;
}

export const telefonosLealtad = (r: LealtadRow): string =>
    [r.TelPadre, r.TelMadre].map((t) => String(t ?? "").trim()).filter(Boolean).join(" / ");

const stamp = () => new Date().toLocaleString("es-MX");
const safeName = (s: string) => s.replace(/[^\w\sáéíóúñÁÉÍÓÚÑ-]/gi, "").replace(/\s+/g, "_").slice(0, 60);

const BRAND: [number, number, number] = [37, 99, 235];
const FOOT_BG: [number, number, number] = [241, 245, 249];
const FOOT_TEXT: [number, number, number] = [30, 41, 59];

const COLS = [
    { header: "ID", width: 9 },
    { header: "Jugador", width: 34 },
    { header: "Sede", width: 20 },
    { header: "Categoría", width: 13 },
    { header: "Edad", width: 7 },
    { header: "Inscrito", width: 9 },
    { header: "Años", width: 10 },
    { header: "Ciclos", width: 8 },
    { header: "Desde", width: 15 },
    { header: "Hasta", width: 15 },
    { header: "Continuidad", width: 14 },
    { header: "Teléfonos", width: 24 },
    { header: "Estatus", width: 10 },
];

const cells = (r: LealtadRow): (string | number)[] => {
    const n = ciclos(r);
    return [
        r.IdJugador,
        r.Jugador,
        r.SedeNombre || "—",
        r.Categoria || "—",
        r.Edad ?? "—",
        inscritoLabel(r),
        etiquetaAnios(n),
        n || "—",
        etiquetaCiclo(Number(r.Desde)) || "—",
        etiquetaCiclo(Number(r.Hasta)) || "—",
        n === 0 ? "—" : tieneHueco(r) ? "Regresó" : "Seguido",
        telefonosLealtad(r) || "—",
        r.Status === 0 ? "ACTIVO" : "BAJA",
    ];
};

/**
 * Resumen del pie. El promedio se saca solo sobre quien TIENE historial: meter a los
 * que no tienen ninguna inscripción registrada lo hundiría, y no porque se hayan ido
 * pronto sino porque de ellos no se sabe.
 */
function resumen(rows: LealtadRow[]): string {
    const conHistorial = rows.filter((r) => ciclos(r) > 0);
    const promedio = conHistorial.length
        ? conHistorial.reduce((s, r) => s + aniosDeCiclos(ciclos(r)), 0) / conHistorial.length
        : 0;
    const veteranos = conHistorial.filter((r) => ciclos(r) >= 6).length;
    const sinRegistro = rows.length - conHistorial.length;
    return `${conHistorial.length} con historial · promedio ${promedio.toFixed(1)} años · ` +
        `${veteranos} de 3 años o más · ${sinRegistro} sin registro`;
}

/** El reparto por tramo, para el pie del PDF. */
function reparto(rows: LealtadRow[]): string {
    return BANDAS_LEALTAD
        .map((b) => `${b.etiqueta}: ${rows.filter((r) => bandaDe(ciclos(r)) === b.clave).length}`)
        .join("  ·  ");
}

export function exportLealtadToPdf(rows: LealtadRow[], titulo: string, subtitulo: string) {
    const doc = new jsPDF({ orientation: "landscape" });
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    const margin = 14;

    doc.setFillColor(...BRAND);
    doc.rect(0, 0, pageW, 26, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(15);
    doc.text(titulo, margin, 12);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.text("Ángeles Soccer · Lealtad (permanencia en la escuela)", margin, 19);
    doc.text(stamp(), pageW - margin, 19, { align: "right" });

    doc.setTextColor(30, 41, 59);
    let y = 34;
    if (subtitulo) {
        doc.setFont("helvetica", "bold");
        doc.setFontSize(10);
        const lines = doc.splitTextToSize(subtitulo, pageW - margin * 2);
        doc.text(lines, margin, y);
        y += lines.length * 5 + 2;
    }
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.text(reparto(rows), margin, y);
    y += 6;

    autoTable(doc, {
        startY: y,
        head: [COLS.map((c) => c.header)],
        body: rows.map((r) => cells(r).map(String)),
        theme: "grid",
        styles: { fontSize: 7.5, cellPadding: 1.8 },
        headStyles: { fillColor: BRAND, textColor: 255, fontStyle: "bold" },
        alternateRowStyles: { fillColor: [248, 250, 252] },
        columnStyles: {
            0: { halign: "right" }, 4: { halign: "center" }, 5: { halign: "center" },
            6: { halign: "center", fontStyle: "bold" }, 7: { halign: "center" },
            8: { halign: "center" }, 9: { halign: "center" }, 10: { halign: "center" },
            12: { halign: "center" },
        },
        foot: [[
            `TOTAL: ${rows.length} alumno(s)`, "", "", "", "", "", resumen(rows), "", "", "", "", "", "",
        ]],
        footStyles: { fillColor: FOOT_BG, textColor: FOOT_TEXT, fontStyle: "bold" },
        margin: { left: margin, right: margin },
    });

    const pages = doc.getNumberOfPages();
    for (let i = 1; i <= pages; i++) {
        doc.setPage(i);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(8);
        doc.setTextColor(150);
        doc.text("Ángeles Soccer · Lealtad", margin, pageH - 8);
        doc.text(`Página ${i} de ${pages}`, pageW - margin, pageH - 8, { align: "right" });
    }

    presentarPdf(doc, `${safeName(titulo)}_${safeName(subtitulo)}.pdf`);
}

export async function exportLealtadToExcel(rows: LealtadRow[], titulo: string, subtitulo: string) {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Lealtad");

    ws.mergeCells(1, 1, 1, COLS.length);
    const t = ws.getCell("A1");
    t.value = titulo;
    t.font = { bold: true, size: 14, color: { argb: "FFFFFFFF" } };
    t.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF2563EB" } };
    t.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
    ws.getRow(1).height = 24;

    ws.mergeCells(2, 1, 2, COLS.length);
    const s = ws.getCell("A2");
    s.value = `${subtitulo}${subtitulo ? " · " : ""}Generado el ${stamp()}`;
    s.font = { size: 9, color: { argb: "FF64748B" } };

    ws.columns = COLS.map((c) => ({ width: c.width }));

    const header = ws.getRow(4);
    header.values = COLS.map((c) => c.header);
    header.font = { bold: true, color: { argb: "FFFFFFFF" } };
    header.eachCell((cell) => {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF334155" } };
        cell.border = { top: { style: "thin" }, left: { style: "thin" }, bottom: { style: "thin" }, right: { style: "thin" } };
        cell.alignment = { vertical: "middle", horizontal: "center" };
    });
    ws.views = [{ state: "frozen", ySplit: 4 }];

    rows.forEach((r) => {
        const row = ws.addRow(cells(r));
        row.eachCell((cell) => {
            cell.border = { top: { style: "thin" }, left: { style: "thin" }, bottom: { style: "thin" }, right: { style: "thin" } };
        });
    });

    const totalRow = ws.addRow([
        "TOTAL", `${rows.length} alumno(s)`, "", "", "", "", resumen(rows), "", "", "", "", "", "",
    ]);
    totalRow.font = { bold: true };
    totalRow.eachCell((cell) => {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF1F5F9" } };
        cell.border = { top: { style: "thin" }, left: { style: "thin" }, bottom: { style: "thin" }, right: { style: "thin" } };
    });

    const buffer = await wb.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${safeName(titulo)}_${safeName(subtitulo)}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
}
