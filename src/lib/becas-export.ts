"use client";

import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import ExcelJS from "exceljs";
import { becaPct } from "@/lib/adeudos-export";

/** Fila del Reporte de Becas, tal como la entrega /api/jugadores/becas. */
export interface BecaRow {
    IdJugador: number;
    Jugador: string;
    Categoria: string;
    Status: number;
    IdSede: number;
    SedeNombre: string;
    /** Descuento en inscripción y mensualidades (0-100). */
    Beca: number | string | null;
    /** Descuento en convocatorias de copas y ligas (0-100). */
    BecaLigas: number | string | null;
    FechaNacimiento: string | null;
    Edad: number | null;
    FechaAlta: string | null;
    TelPadre: string | null;
    TelMadre: string | null;
    CorreoElectronicoPadre: string | null;
    CorreoElectronicoMadre: string | null;
}

/**
 * Tipo de beca: sobre QUÉ se aplica el descuento. Es la pregunta del reporte y no se
 * puede deducir del porcentaje, porque son dos columnas independientes de la ficha del
 * jugador y un becado puede traer una, la otra o las dos.
 */
export type TipoBeca = "mensualidades" | "ligas" | "ambas";

export const ETIQUETA_TIPO: Record<TipoBeca, string> = {
    mensualidades: "Inscripción y mensualidades",
    ligas: "Copas y ligas",
    ambas: "Ambas",
};

/** Etiqueta corta, para donde no cabe la larga (las insignias de la tabla). */
export const ETIQUETA_TIPO_CORTA: Record<TipoBeca, string> = {
    mensualidades: "Mensualidades",
    ligas: "Copas y ligas",
    ambas: "Ambas",
};

export function tipoBeca(b: BecaRow): TipoBeca {
    const mensualidades = becaPct(b.Beca as string) > 0;
    const ligas = becaPct(b.BecaLigas as string) > 0;
    if (mensualidades && ligas) return "ambas";
    return ligas ? "ligas" : "mensualidades";
}

export const telefonosBeca = (b: BecaRow): string =>
    [b.TelPadre, b.TelMadre].map((t) => String(t ?? "").trim()).filter(Boolean).join(" / ");

const porcentaje = (v: number | string | null): string => {
    const pct = becaPct(v as string);
    return pct > 0 ? `${pct}%` : "—";
};

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
    { header: "Tipo de beca", width: 24 },
    { header: "Beca", width: 9 },
    { header: "Beca ligas", width: 11 },
    { header: "Teléfonos", width: 24 },
    { header: "Alta", width: 12 },
    { header: "Estatus", width: 10 },
];

const cells = (b: BecaRow): (string | number)[] => [
    b.IdJugador,
    b.Jugador,
    b.SedeNombre || "—",
    b.Categoria || "—",
    b.Edad ?? "—",
    ETIQUETA_TIPO[tipoBeca(b)],
    porcentaje(b.Beca),
    porcentaje(b.BecaLigas),
    telefonosBeca(b) || "—",
    b.FechaAlta || "—",
    b.Status === 0 ? "ACTIVO" : "BAJA",
];

/** Resumen del pie: el mismo texto en los dos formatos. */
function resumen(rows: BecaRow[]): string {
    const cuenta = (t: TipoBeca) => rows.filter((b) => tipoBeca(b) === t).length;
    const totales = rows.filter((b) => becaPct(b.Beca as string) >= 100).length;
    return `${cuenta("mensualidades")} mensualidades · ${cuenta("ligas")} copas y ligas · ${cuenta("ambas")} ambas · ${totales} con beca del 100%`;
}

export function exportBecasToPdf(rows: BecaRow[], titulo: string, subtitulo: string) {
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
    doc.text("Ángeles Soccer · Reporte de Becas", margin, 19);
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

    autoTable(doc, {
        startY: y,
        head: [COLS.map((c) => c.header)],
        body: rows.map((b) => cells(b).map(String)),
        theme: "grid",
        styles: { fontSize: 7.5, cellPadding: 1.8 },
        headStyles: { fillColor: BRAND, textColor: 255, fontStyle: "bold" },
        alternateRowStyles: { fillColor: [248, 250, 252] },
        columnStyles: {
            0: { halign: "right" }, 4: { halign: "center" },
            6: { halign: "center" }, 7: { halign: "center" }, 10: { halign: "center" },
        },
        foot: [[
            `TOTAL: ${rows.length} becado(s)`, "", "", "", "", resumen(rows), "", "", "", "", "",
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
        doc.text("Ángeles Soccer · Reporte de Becas", margin, pageH - 8);
        doc.text(`Página ${i} de ${pages}`, pageW - margin, pageH - 8, { align: "right" });
    }

    doc.save(`${safeName(titulo)}_${safeName(subtitulo)}.pdf`);
}

export async function exportBecasToExcel(rows: BecaRow[], titulo: string, subtitulo: string) {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Becas");

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

    rows.forEach((b) => {
        const row = ws.addRow(cells(b));
        row.eachCell((cell) => {
            cell.border = { top: { style: "thin" }, left: { style: "thin" }, bottom: { style: "thin" }, right: { style: "thin" } };
        });
    });

    const totalRow = ws.addRow([
        "TOTAL", `${rows.length} becado(s)`, "", "", "", resumen(rows), "", "", "", "", "",
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
