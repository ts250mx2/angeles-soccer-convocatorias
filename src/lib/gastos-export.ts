"use client";

import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import ExcelJS from "exceljs";

export interface SedeEgresos {
    IdSede: number;
    Sede: string;
    Movimientos: number;
    Total: number;
    Efectivo: number;
    Otros: number;
}

export interface FormaPagoEgresos {
    IdFormaPago: number;
    FormaPago: string;
    Movimientos: number;
    Total: number;
}

export interface EgresoRow {
    IdEgreso: number;
    IdSede: number;
    Sede: string;
    /** Ya viene formateada dd/mm/aaaa hh:mm desde la API. */
    Fecha: string;
    Concepto: string;
    PagarA: string;
    Factura: string;
    Recibo: string;
    FormaPago: string;
    Subtotal: number;
    Iva: number;
    Total: number;
}

/** Lo que se ve en la pantalla de Egresos por Sede para el período elegido. */
export interface ResumenEgresos {
    porSede: SedeEgresos[];
    porFormaPago: FormaPagoEgresos[];
    total: number;
    movimientos: number;
}

const BRAND: [number, number, number] = [37, 99, 235];
const FOOT_BG: [number, number, number] = [241, 245, 249];
const FOOT_TEXT: [number, number, number] = [30, 41, 59];
const PIE = "Ángeles Soccer · Egresos";

const MONEY_FMT = '"$"#,##0.00';
const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

export const money = (n: number): string =>
    `$${Number(n ?? 0).toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const stamp = () => new Date().toLocaleString("es-MX");
const safeName = (s: string) =>
    s.replace(/[^\w\sáéíóúñÁÉÍÓÚÑ-]/gi, "").replace(/\s+/g, "_").slice(0, 60);

const suma = <T>(filas: T[], campo: (f: T) => number): number =>
    filas.reduce((s, f) => s + (Number(campo(f)) || 0), 0);

/** Banda azul superior; devuelve la Y donde puede empezar el contenido. */
function pdfHeader(doc: jsPDF, title: string, subtitle: string): number {
    const pageW = doc.internal.pageSize.getWidth();
    const margin = 14;

    doc.setFillColor(...BRAND);
    doc.rect(0, 0, pageW, 26, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(15);
    doc.text(title, margin, 12);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.text(PIE, margin, 19);
    doc.text(stamp(), pageW - margin, 19, { align: "right" });

    doc.setTextColor(30, 41, 59);
    let y = 34;
    if (subtitle) {
        doc.setFont("helvetica", "bold");
        doc.setFontSize(10);
        const lines = doc.splitTextToSize(subtitle, pageW - margin * 2);
        doc.text(lines, margin, y);
        y += lines.length * 5 + 2;
    }
    return y;
}

function pdfFooter(doc: jsPDF) {
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    const margin = 14;
    const pages = doc.getNumberOfPages();
    for (let i = 1; i <= pages; i++) {
        doc.setPage(i);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(8);
        doc.setTextColor(150);
        doc.text(PIE, margin, pageH - 8);
        doc.text(`Página ${i} de ${pages}`, pageW - margin, pageH - 8, { align: "right" });
    }
}

const finalY = (doc: jsPDF): number =>
    (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;

interface XCol {
    header: string;
    width: number;
    money?: boolean;
}

/** Título + subtítulo + encabezados con estilo; deja la hoja lista para addRow. */
function excelHeader(ws: ExcelJS.Worksheet, title: string, subtitle: string, cols: XCol[]) {
    ws.mergeCells(1, 1, 1, cols.length);
    const t = ws.getCell("A1");
    t.value = title;
    t.font = { bold: true, size: 14, color: { argb: "FFFFFFFF" } };
    t.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF2563EB" } };
    t.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
    ws.getRow(1).height = 24;

    ws.mergeCells(2, 1, 2, cols.length);
    const s = ws.getCell("A2");
    s.value = `${subtitle}${subtitle ? " · " : ""}Generado el ${stamp()}`;
    s.font = { size: 9, color: { argb: "FF64748B" } };

    ws.columns = cols.map((c) => (c.money ? { width: c.width, style: { numFmt: MONEY_FMT } } : { width: c.width }));

    const header = ws.getRow(4);
    header.values = cols.map((c) => c.header);
    header.font = { bold: true, color: { argb: "FFFFFFFF" } };
    header.eachCell((cell) => {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF334155" } };
        cell.border = { top: { style: "thin" }, left: { style: "thin" }, bottom: { style: "thin" }, right: { style: "thin" } };
        cell.alignment = { vertical: "middle", horizontal: "center" };
    });
    ws.views = [{ state: "frozen", ySplit: 4 }];
}

const bordear = (row: ExcelJS.Row) =>
    row.eachCell((cell) => {
        cell.border = { top: { style: "thin" }, left: { style: "thin" }, bottom: { style: "thin" }, right: { style: "thin" } };
    });

function excelBody(ws: ExcelJS.Worksheet, filas: (string | number)[][], totales?: (string | number)[]) {
    filas.forEach((f) => bordear(ws.addRow(f)));
    if (!totales) return;
    const row = ws.addRow(totales);
    row.font = { bold: true };
    row.eachCell((cell) => {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF1F5F9" } };
        cell.border = { top: { style: "thin" }, left: { style: "thin" }, bottom: { style: "thin" }, right: { style: "thin" } };
    });
}

async function descargar(wb: ExcelJS.Workbook, nombre: string) {
    const buffer = await wb.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: XLSX_MIME });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${nombre}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
}

/* ────────────────────────── Resumen (la pantalla) ────────────────────────── */

const COLS_SEDE: XCol[] = [
    { header: "Sede", width: 30 },
    { header: "Movimientos", width: 14 },
    { header: "Efectivo", width: 16, money: true },
    { header: "Otras formas", width: 16, money: true },
    { header: "Total", width: 16, money: true },
];

const COLS_FORMA: XCol[] = [
    { header: "Forma de pago", width: 30 },
    { header: "Movimientos", width: 14 },
    { header: "Total", width: 16, money: true },
];

const celdasSede = (s: SedeEgresos) => [s.Sede, s.Movimientos, s.Efectivo, s.Otros, s.Total];
const celdasForma = (f: FormaPagoEgresos) => [f.FormaPago, f.Movimientos, f.Total];

export function exportEgresosResumenToPdf(resumen: ResumenEgresos, periodo: string) {
    const { porSede, porFormaPago, total, movimientos } = resumen;
    const doc = new jsPDF();
    const margin = 14;
    const title = "Egresos por Sede";
    let y = pdfHeader(doc, title, `Período: ${periodo}`);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(71, 85, 105);
    doc.text(
        `Total de egresos: ${money(total)}  ·  ${movimientos.toLocaleString("es-MX")} movimiento(s)  ·  ${porSede.length} sede(s) con gasto`,
        margin, y,
    );
    y += 6;

    autoTable(doc, {
        startY: y,
        head: [COLS_SEDE.map((c) => c.header)],
        body: porSede.map((s) => [s.Sede, String(s.Movimientos), money(s.Efectivo), money(s.Otros), money(s.Total)]),
        theme: "grid",
        styles: { fontSize: 8, cellPadding: 2 },
        headStyles: { fillColor: BRAND, textColor: 255, fontStyle: "bold" },
        alternateRowStyles: { fillColor: [248, 250, 252] },
        columnStyles: { 1: { halign: "center" }, 2: { halign: "right" }, 3: { halign: "right" }, 4: { halign: "right" } },
        foot: [[
            `TOTAL: ${porSede.length} sede(s)`,
            String(suma(porSede, (s) => s.Movimientos)),
            money(suma(porSede, (s) => s.Efectivo)),
            money(suma(porSede, (s) => s.Otros)),
            money(suma(porSede, (s) => s.Total)),
        ]],
        footStyles: { fillColor: FOOT_BG, textColor: FOOT_TEXT, fontStyle: "bold" },
        margin: { left: margin, right: margin },
    });

    if (porFormaPago.length > 0) {
        y = finalY(doc) + 10;
        doc.setFont("helvetica", "bold");
        doc.setFontSize(10);
        doc.setTextColor(30, 41, 59);
        doc.text("Por forma de pago", margin, y);

        autoTable(doc, {
            startY: y + 3,
            head: [COLS_FORMA.map((c) => c.header)],
            body: porFormaPago.map((f) => [f.FormaPago, String(f.Movimientos), money(f.Total)]),
            theme: "grid",
            styles: { fontSize: 8, cellPadding: 2 },
            headStyles: { fillColor: BRAND, textColor: 255, fontStyle: "bold" },
            alternateRowStyles: { fillColor: [248, 250, 252] },
            columnStyles: { 1: { halign: "center" }, 2: { halign: "right" } },
            foot: [[
                "TOTAL",
                String(suma(porFormaPago, (f) => f.Movimientos)),
                money(suma(porFormaPago, (f) => f.Total)),
            ]],
            footStyles: { fillColor: FOOT_BG, textColor: FOOT_TEXT, fontStyle: "bold" },
            margin: { left: margin, right: margin },
        });
    }

    pdfFooter(doc);
    doc.save(`${safeName(title)}_${safeName(periodo)}.pdf`);
}

export async function exportEgresosResumenToExcel(resumen: ResumenEgresos, periodo: string) {
    const { porSede, porFormaPago, total, movimientos } = resumen;
    const wb = new ExcelJS.Workbook();
    const title = "Egresos por Sede";
    const subtitle = `Período: ${periodo}`;

    const wsSede = wb.addWorksheet("Por Sede");
    excelHeader(wsSede, title, subtitle, COLS_SEDE);
    excelBody(
        wsSede,
        porSede.map(celdasSede),
        [
            `TOTAL: ${porSede.length} sede(s)`,
            suma(porSede, (s) => s.Movimientos),
            suma(porSede, (s) => s.Efectivo),
            suma(porSede, (s) => s.Otros),
            suma(porSede, (s) => s.Total),
        ],
    );

    const wsForma = wb.addWorksheet("Por Forma de Pago");
    excelHeader(wsForma, title, subtitle, COLS_FORMA);
    excelBody(
        wsForma,
        porFormaPago.map(celdasForma),
        ["TOTAL", movimientos, total],
    );

    await descargar(wb, `${safeName(title)}_${safeName(periodo)}`);
}

/* ─────────────────────── Detalle (el modal de una sede) ─────────────────────── */

const COLS_DETALLE: XCol[] = [
    { header: "ID", width: 10 },
    { header: "Fecha", width: 18 },
    { header: "Sede", width: 22 },
    { header: "Concepto", width: 42 },
    { header: "Pagar a", width: 26 },
    { header: "Forma de pago", width: 18 },
    { header: "Factura", width: 16 },
    { header: "Recibo", width: 14 },
    { header: "Subtotal", width: 14, money: true },
    { header: "IVA", width: 12, money: true },
    { header: "Total", width: 14, money: true },
];

const celdasDetalle = (e: EgresoRow) => [
    e.IdEgreso, e.Fecha, e.Sede, e.Concepto, e.PagarA,
    e.FormaPago, e.Factura, e.Recibo, e.Subtotal, e.Iva, e.Total,
];

export function exportEgresosDetalleToPdf(filas: EgresoRow[], title: string, subtitle: string) {
    const doc = new jsPDF({ orientation: "landscape" });
    const margin = 14;
    const y = pdfHeader(doc, title, subtitle);

    autoTable(doc, {
        startY: y,
        head: [COLS_DETALLE.map((c) => c.header)],
        body: filas.map((e) =>
            celdasDetalle(e).map((v, i) => (i >= 8 ? money(Number(v)) : String(v))),
        ),
        theme: "grid",
        styles: { fontSize: 7.5, cellPadding: 1.8, overflow: "linebreak" },
        headStyles: { fillColor: BRAND, textColor: 255, fontStyle: "bold" },
        alternateRowStyles: { fillColor: [248, 250, 252] },
        columnStyles: {
            0: { halign: "right", cellWidth: 14 },
            1: { cellWidth: 24 },
            3: { cellWidth: 62 },
            8: { halign: "right" },
            9: { halign: "right" },
            10: { halign: "right" },
        },
        // colSpan: la columna de ID es angosta y partía la palabra a la mitad.
        foot: [[
            { content: `TOTAL: ${filas.length} movimiento(s)`, colSpan: 8 },
            money(suma(filas, (e) => e.Subtotal)),
            money(suma(filas, (e) => e.Iva)),
            money(suma(filas, (e) => e.Total)),
        ]],
        footStyles: { fillColor: FOOT_BG, textColor: FOOT_TEXT, fontStyle: "bold" },
        margin: { left: margin, right: margin },
    });

    pdfFooter(doc);
    doc.save(`${safeName(title)}_${safeName(subtitle)}.pdf`);
}

export async function exportEgresosDetalleToExcel(filas: EgresoRow[], title: string, subtitle: string) {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Egresos");
    excelHeader(ws, title, subtitle, COLS_DETALLE);
    excelBody(
        ws,
        filas.map(celdasDetalle),
        [
            "TOTAL", "", "", "", "", "", "", `${filas.length} mov.`,
            suma(filas, (e) => e.Subtotal),
            suma(filas, (e) => e.Iva),
            suma(filas, (e) => e.Total),
        ],
    );
    await descargar(wb, `${safeName(title)}_${safeName(subtitle)}`);
}
