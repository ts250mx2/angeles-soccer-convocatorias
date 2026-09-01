"use client";

import jsPDF from "jspdf";
import { presentarPdf } from "@/lib/pdf-preview";
import autoTable from "jspdf-autotable";
import ExcelJS from "exceljs";
import { partirCategoria } from '@/lib/categoria-equipo';
import { becaPct } from "@/lib/adeudos-export";

/** Fila de la Lista de Jugadores, tal como la entrega /api/jugadores. */
export interface JugadorListaRow {
    IdJugador: number;
    Jugador: string;
    Categoria: string;
    Status: number;
    /** Normalizada por la API: '0' = sin beca. */
    Beca: string;
    IdSede: number;
    SedeNombre: string;
    /** Tiene foto en su ficha; la imagen la sirve /api/jugadores/foto. */
    TieneFoto?: number;
    /** Sello para romper el caché del navegador cuando la foto cambia. */
    FotoVersion?: string | null;
    FechaNacimiento: string | null;
    Edad: number | null;
    FechaAlta: string | null;
    TelPadre: string | null;
    TelMadre: string | null;
    CorreoElectronicoPadre: string | null;
    CorreoElectronicoMadre: string | null;
    /** Por qué se dio de baja (tblJugadores.ObservacionesVenta). Solo se lee en bajas. */
    MotivoBaja: string | null;
    /** Fecha del primer pago de inscripción en la temporada consultada. */
    FechaInscripcion: string | null;
    Inscrito: number;
    /** Sede de clinics o venta al público: el modelo inscripción/mensualidad no aplica. */
    Exento: number;
    /**
     * 1 si el jugador entra en el padrón que cuenta la pantalla de Inscripciones (sede
     * no clinics, no venta al público y no mal capturado en una sede de keepers). El
     * indicador de inscritos se apoya en esto para dar el MISMO número que aquélla.
     */
    EnPadronInscritos: number;
    MesesDebe: number;
}

export type EstadoPago = "adeudo" | "sin-inscripcion" | "al-corriente" | "exento";

/**
 * Situación de pago del jugador en la temporada, derivada de los campos de la API.
 * La beca del 100% cuenta como inscrito (no paga inscripción), igual que en Adeudos.
 */
export function estadoPago(j: JugadorListaRow): EstadoPago {
    if (j.MesesDebe > 0) return "adeudo";
    if (j.Exento === 1) return "exento";
    if (j.Inscrito === 0 && becaPct(j.Beca) < 100) return "sin-inscripcion";
    return "al-corriente";
}

export const ETIQUETA_ESTADO: Record<EstadoPago, string> = {
    adeudo: "Con adeudo",
    "sin-inscripcion": "Sin inscripción",
    "al-corriente": "Al corriente",
    exento: "No aplica",
};

export function etiquetaAdeudo(j: JugadorListaRow): string {
    const estado = estadoPago(j);
    if (estado === "adeudo") return j.MesesDebe === 1 ? "1 mes" : `${j.MesesDebe} meses`;
    return ETIQUETA_ESTADO[estado];
}

export const telefonos = (j: JugadorListaRow): string =>
    [j.TelPadre, j.TelMadre].map((t) => String(t ?? "").trim()).filter(Boolean).join(" / ");

const stamp = () => new Date().toLocaleString("es-MX");
const safeName = (s: string) => s.replace(/[^\w\sáéíóúñÁÉÍÓÚÑ-]/gi, "").replace(/\s+/g, "_").slice(0, 60);

const BRAND: [number, number, number] = [37, 99, 235];
const FOOT_BG: [number, number, number] = [241, 245, 249];
const FOOT_TEXT: [number, number, number] = [30, 41, 59];

/** ¿Hay alguna baja en el listado? Decide si vale la pena la columna del motivo. */
const hayBajas = (rows: JugadorListaRow[]): boolean => rows.some((j) => j.Status === 2);

const COLS = [
    { header: "ID", width: 9 },
    { header: "Jugador", width: 34 },
    { header: "Sede", width: 20 },
    { header: "Categoría", width: 11 },
    { header: "Equipo", width: 13 },
    { header: "Nacimiento", width: 13 },
    { header: "Edad", width: 7 },
    { header: "Teléfonos", width: 24 },
    { header: "Beca", width: 10 },
    { header: "Inscripción", width: 13 },
    { header: "Adeudo", width: 15 },
    { header: "Estatus", width: 10 },
];

/* El motivo de baja va al final y solo cuando el listado trae bajas: en el corte
   normal (activos) sería una columna vacía en todos los renglones. */
const MOTIVO_COL = { header: "Motivo de baja", width: 46 };
const columnas = (conMotivo: boolean) => (conMotivo ? [...COLS, MOTIVO_COL] : COLS);

const cells = (j: JugadorListaRow, conMotivo = false): (string | number)[] => [
    j.IdJugador,
    j.Jugador,
    j.SedeNombre || "—",
    partirCategoria(j.Categoria).anio || "—",
    partirCategoria(j.Categoria).equipo || "—",
    j.FechaNacimiento || "—",
    j.Edad ?? "—",
    telefonos(j) || "—",
    becaPct(j.Beca) > 0 ? `${becaPct(j.Beca)}%` : "—",
    j.Inscrito === 1 || becaPct(j.Beca) >= 100 ? "SI" : j.Exento === 1 ? "N/A" : "NO",
    etiquetaAdeudo(j),
    j.Status === 0 ? "ACTIVO" : "BAJA",
    // El motivo solo se afirma de una baja: en un activo el campo es otra cosa.
    ...(conMotivo ? [j.Status === 2 ? j.MotivoBaja || "—" : "—"] : []),
];

export function exportJugadoresToPdf(rows: JugadorListaRow[], titulo: string, subtitulo: string) {
    const conMotivo = hayBajas(rows);
    const cols = columnas(conMotivo);
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
    doc.text("Ángeles Soccer · Lista de Jugadores", margin, 19);
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

    const conAdeudo = rows.filter((j) => estadoPago(j) === "adeudo").length;
    const sinInscripcion = rows.filter((j) => estadoPago(j) === "sin-inscripcion").length;

    autoTable(doc, {
        startY: y,
        head: [cols.map((c) => c.header)],
        body: rows.map((j) => cells(j, conMotivo).map(String)),
        theme: "grid",
        styles: { fontSize: 7.5, cellPadding: 1.8 },
        headStyles: { fillColor: BRAND, textColor: 255, fontStyle: "bold" },
        alternateRowStyles: { fillColor: [248, 250, 252] },
        columnStyles: { 0: { halign: "right" }, 5: { halign: "center" }, 8: { halign: "center" }, 10: { halign: "center" } },
        foot: [[
            `TOTAL: ${rows.length} jugador(es)`, "", "", "", "", "", "",
            "", "", `${conAdeudo} con adeudo · ${sinInscripcion} sin inscripción`, "",
            ...(conMotivo ? [""] : []),
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
        doc.text("Ángeles Soccer · Lista de Jugadores", margin, pageH - 8);
        doc.text(`Página ${i} de ${pages}`, pageW - margin, pageH - 8, { align: "right" });
    }

    presentarPdf(doc, `${safeName(titulo)}_${safeName(subtitulo)}.pdf`);
}

export async function exportJugadoresToExcel(rows: JugadorListaRow[], titulo: string, subtitulo: string) {
    const conMotivo = hayBajas(rows);
    const cols = columnas(conMotivo);
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Jugadores");

    ws.mergeCells(1, 1, 1, cols.length);
    const t = ws.getCell("A1");
    t.value = titulo;
    t.font = { bold: true, size: 14, color: { argb: "FFFFFFFF" } };
    t.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF2563EB" } };
    t.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
    ws.getRow(1).height = 24;

    ws.mergeCells(2, 1, 2, cols.length);
    const s = ws.getCell("A2");
    s.value = `${subtitulo}${subtitulo ? " · " : ""}Generado el ${stamp()}`;
    s.font = { size: 9, color: { argb: "FF64748B" } };

    ws.columns = cols.map((c) => ({ width: c.width }));

    const header = ws.getRow(4);
    header.values = cols.map((c) => c.header);
    header.font = { bold: true, color: { argb: "FFFFFFFF" } };
    header.eachCell((cell) => {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF334155" } };
        cell.border = { top: { style: "thin" }, left: { style: "thin" }, bottom: { style: "thin" }, right: { style: "thin" } };
        cell.alignment = { vertical: "middle", horizontal: "center" };
    });
    ws.views = [{ state: "frozen", ySplit: 4 }];

    rows.forEach((j) => {
        const row = ws.addRow(cells(j, conMotivo));
        row.eachCell((cell) => {
            cell.border = { top: { style: "thin" }, left: { style: "thin" }, bottom: { style: "thin" }, right: { style: "thin" } };
        });
    });

    const conAdeudo = rows.filter((j) => estadoPago(j) === "adeudo").length;
    const sinInscripcion = rows.filter((j) => estadoPago(j) === "sin-inscripcion").length;
    const totalRow = ws.addRow([
        "TOTAL", `${rows.length} jugador(es)`, "", "", "", "", "", "", "",
        `${conAdeudo} con adeudo · ${sinInscripcion} sin inscripción`, "",
        ...(conMotivo ? [""] : []),
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
