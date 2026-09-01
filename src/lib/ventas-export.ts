"use client";

import jsPDF from "jspdf";
import { presentarPdf } from "@/lib/pdf-preview";
import autoTable from "jspdf-autotable";
import ExcelJS from "exceljs";

/**
 * Exportación del Historial de Ventas a PDF y Excel, con los filtros de la pantalla.
 *
 * REGLA QUE SOSTIENE TODO ESTE ARCHIVO: los agregados (conteos, sumas y el desglose
 * por forma de pago) son SIEMPRE los del período completo y llegan ya calculados en
 * `TotalesPeriodo`; lo único que se acota es el DETALLE, o sea la lista de renglones.
 *
 * No es un detalle de estilo: tanto el listado de la pantalla como el que se pide para
 * exportar vienen topados, así que sumar las filas recibidas produce un documento que
 * reporta menos dinero del que hay y contradice a los indicadores. Ya pasó dos veces.
 * Si algún día se ve un total que no cuadra, revisa que el agregado salga de `t` y no
 * de `filas`; y cuando el detalle vaya recortado, el documento tiene que decirlo.
 */

/**
 * Totales del período COMPLETO, calculados por el servidor sin el tope del listado.
 *
 * Existen porque las filas que se exportan también vienen topadas: si los totales se
 * sacaran de ellas, el documento reportaría menos dinero del que hay y contradiría a
 * la pantalla. Los totales son siempre del período; lo que se acota es el detalle.
 */
export interface TotalesPeriodo {
    ventas: number;
    importe: number;
    formas: { forma: string; movimientos: number; total: number }[];
}

/** Una venta del historial, tal como la devuelve /api/ventas. */
export interface VentaRow {
    IdVenta: number;
    /** 'YYYY-MM-DDTHH:mm:ss' en hora local (la API la manda sin offset). */
    FechaVenta: string;
    IdJugador: number | null;
    Jugador: string;
    ConceptoVenta: string;
    Referencia: string;
    Total: number;
    Sede: string | null;
    FormaPago: string;
    Recibo: string;
}

const BRAND: [number, number, number] = [37, 99, 235];
const FOOT_BG: [number, number, number] = [241, 245, 249];
const FOOT_TEXT: [number, number, number] = [30, 41, 59];
const PIE = "Ángeles Soccer · Ventas";

const MONEY_FMT = '"$"#,##0.00';
const FECHA_FMT = 'dd/mm/yyyy hh:mm';
const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

export const money = (n: number): string =>
    `$${Number(n ?? 0).toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const stamp = () => new Date().toLocaleString("es-MX");
const safeName = (s: string) =>
    s.replace(/[^\w\sáéíóúñÁÉÍÓÚÑ-]/gi, "").replace(/\s+/g, "_").slice(0, 60);

const suma = (filas: VentaRow[]): number =>
    filas.reduce((s, v) => s + (Number(v.Total) || 0), 0);

/** Fecha legible; si el dato viniera corrupto se imprime tal cual en vez de "Invalid Date". */
const fechaHora = (v: string): string => {
    const d = new Date(v);
    if (isNaN(d.getTime())) return String(v ?? "");
    return d.toLocaleString("es-MX", {
        day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
    });
};

/** El folio que la pantalla muestra: recibo si lo hay, si no la referencia. */
const folio = (v: VentaRow): string => v.Recibo || v.Referencia || "—";

/** Misma etiqueta en el detalle y en el resumen: si no, filtrar por ella no encuentra nada. */
const formaPago = (v: VentaRow): string => v.FormaPago?.trim() || "SIN FORMA";

const comprador = (v: VentaRow): string =>
    v.IdJugador ? `${v.Jugador} (#${v.IdJugador})` : `${v.Jugador} (venta externa)`;

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
    /** Formato de fecha para la columna (solo Excel). */
    fecha?: boolean;
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

    ws.columns = cols.map((c) => {
        if (c.money) return { width: c.width, style: { numFmt: MONEY_FMT } };
        if (c.fecha) return { width: c.width, style: { numFmt: FECHA_FMT } };
        return { width: c.width };
    });

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

function excelBody(ws: ExcelJS.Worksheet, filas: (string | number | Date)[][], totales?: (string | number)[]) {
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

/* ────────────────────────── Contenido del reporte ────────────────────────── */

const COLS: XCol[] = [
    { header: "Fecha", width: 18, fecha: true },
    { header: "Comprador", width: 34 },
    { header: "Concepto", width: 40 },
    { header: "Sede", width: 18 },
    { header: "Forma de pago", width: 16 },
    { header: "Folio / Recibo", width: 16 },
    { header: "Total", width: 14, money: true },
];

/** Columnas 2..7, comunes a los dos formatos. La fecha cambia de tipo y va aparte. */
const resto = (v: VentaRow) => [
    comprador(v),
    v.ConceptoVenta ?? "",
    v.Sede ?? "—",
    formaPago(v),
    folio(v),
    Number(v.Total) || 0,
];

/** En el PDF todo es texto ya formateado. */
const celdasPdf = (v: VentaRow) => [fechaHora(v.FechaVenta), ...resto(v)];

/** 'YYYY-MM-DDTHH:mm:ss' (lo que manda la API, ya en hora local y sin offset). */
const FORMATO_API = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?$/;

/**
 * Fecha para la celda de Excel.
 *
 * Va armada con los componentes en UTC a propósito: ExcelJS convierte la Date a
 * número de serie usando UTC, así que si se le pasa `new Date('...T13:00:00')` —que
 * es hora local— la celda termina mostrando 19:00 en un huso -06:00. La hora de
 * pared que queremos ver tiene que viajar en los componentes UTC.
 * Si el texto no trae el formato esperado se devuelve tal cual, como antes.
 */
const fechaExcel = (v: string): Date | string => {
    const m = FORMATO_API.exec(String(v ?? "").trim());
    if (!m) return String(v ?? "");
    return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] ?? 0)));
};

/**
 * En el Excel la fecha va como FECHA de verdad, no como texto: es lo que permite
 * ordenarla, filtrar por rango y agrupar por mes en una tabla dinámica, que es
 * justamente para lo que se pide el Excel y no el PDF.
 */
const celdasExcel = (v: VentaRow): (string | number | Date)[] =>
    [fechaExcel(v.FechaVenta), ...resto(v)];

/**
 * Cuánto entró por cada forma de pago, agrupando las filas recibidas.
 *
 * SOLO para el respaldo de `totalesDe`: cuando el documento se arma sin los totales del
 * servidor. En el camino normal el desglose viene en `TotalesPeriodo.formas`, calculado
 * sobre el período completo; agrupar aquí las filas daría un desglose recortado.
 * (Los KPIs de la pantalla solo nombran tres formas; en el documento salen todas.)
 */
function porFormaPago(filas: VentaRow[]): { forma: string; movimientos: number; total: number }[] {
    const acc = new Map<string, { movimientos: number; total: number }>();
    for (const v of filas) {
        const k = formaPago(v);
        const prev = acc.get(k) ?? { movimientos: 0, total: 0 };
        acc.set(k, { movimientos: prev.movimientos + 1, total: prev.total + (Number(v.Total) || 0) });
    }
    return [...acc.entries()]
        .map(([forma, x]) => ({ forma, ...x }))
        .sort((a, b) => b.total - a.total);
}

/**
 * Totales a imprimir: los del servidor si se recibieron, y si no los de las filas.
 * El respaldo solo aplica cuando quien llama no los tiene (por ejemplo si la recarga
 * falló y se exporta lo que había en pantalla).
 */
const totalesDe = (filas: VentaRow[], totales?: TotalesPeriodo): TotalesPeriodo =>
    totales ?? { ventas: filas.length, importe: suma(filas), formas: porFormaPago(filas) };

const TITULO = "Historial de Ventas";

/**
 * Tope de renglones que se listan en el PDF. Sin él, un rango amplio produce cientos
 * de páginas que nadie abre y congela la pestaña mientras se arman. Los TOTALES del
 * documento siguen siendo los del período completo; lo que se recorta es el listado,
 * y el subtítulo lo dice. Para el detalle exhaustivo está el Excel.
 */
const MAX_FILAS_PDF = 2000;

export function exportVentasToPdf(filas: VentaRow[], subtitle: string, totales?: TotalesPeriodo) {
    const t = totalesDe(filas, totales);
    const listadas = filas.slice(0, MAX_FILAS_PDF);
    // Se compara contra el total del PERÍODO, no contra las filas recibidas: éstas ya
    // pueden venir topadas por la API, y entonces el aviso se quedaría corto.
    const recortado = t.ventas > listadas.length;
    const subtituloFinal = recortado
        ? `${subtitle} · Se listan las ${listadas.length.toLocaleString("es-MX")} ventas más recientes de ${t.ventas.toLocaleString("es-MX")}; los totales sí son del período completo (el Excel trae más detalle)`
        : subtitle;

    // Apaisado: el concepto y el nombre del comprador son largos y en vertical se parten.
    const doc = new jsPDF({ orientation: "landscape" });
    const margin = 14;
    let y = pdfHeader(doc, TITULO, subtituloFinal);

    // Resumen por forma de pago, para leer el documento sin sumar a mano.
    const formas = t.formas;
    if (formas.length > 0) {
        autoTable(doc, {
            startY: y,
            head: [["Forma de pago", "Ventas", "Total"]],
            body: formas.map((f) => [f.forma, String(f.movimientos), money(f.total)]),
            theme: "grid",
            styles: { fontSize: 8, cellPadding: 2 },
            headStyles: { fillColor: BRAND, textColor: 255, fontStyle: "bold" },
            columnStyles: { 1: { halign: "right" }, 2: { halign: "right" } },
            foot: [[
                "TOTAL",
                t.ventas.toLocaleString("es-MX"),
                money(t.importe),
            ]],
            footStyles: { fillColor: FOOT_BG, textColor: FOOT_TEXT, fontStyle: "bold" },
            // Sin esto el pie se repite al final de CADA página y el total general se
            // lee como si fuera el de los renglones de esa hoja.
            showFoot: "lastPage",
            margin: { left: margin, right: margin },
            tableWidth: 110,
        });
        y = finalY(doc) + 8;
    }

    autoTable(doc, {
        startY: y,
        head: [COLS.map((c) => c.header)],
        body: listadas.map((v) => celdasPdf(v).map((c, i) => (i === 6 ? money(Number(c)) : String(c)))),
        theme: "grid",
        styles: { fontSize: 7.5, cellPadding: 1.8, overflow: "linebreak" },
        headStyles: { fillColor: BRAND, textColor: 255, fontStyle: "bold" },
        alternateRowStyles: { fillColor: [248, 250, 252] },
        columnStyles: {
            0: { cellWidth: 26 },
            1: { cellWidth: 58 },
            2: { cellWidth: 70 },
            6: { halign: "right", cellWidth: 24 },
        },
        // colSpan: sin él la palabra TOTAL se parte en la columna angosta de fecha.
        foot: [[
            { content: `TOTAL DEL PERÍODO: ${t.ventas.toLocaleString("es-MX")} venta(s)`, colSpan: 6 },
            money(t.importe),
        ]],
        footStyles: { fillColor: FOOT_BG, textColor: FOOT_TEXT, fontStyle: "bold" },
        showFoot: "lastPage",
        margin: { left: margin, right: margin },
    });

    pdfFooter(doc);
    presentarPdf(doc, `${safeName(TITULO)}_${safeName(subtitle)}.pdf`);
}

export async function exportVentasToExcel(filas: VentaRow[], subtitle: string, totales?: TotalesPeriodo) {
    const t = totalesDe(filas, totales);
    /* La hoja de detalle puede traer menos renglones que el período si la API topó la
       consulta; el renglón de totales es siempre el del período, así que se dice cuál
       es cuál en vez de dejar dos cifras que no cuadran sin explicación. */
    const recortado = t.ventas > filas.length;
    const subtituloDetalle = recortado
        ? `${subtitle} · Se listan ${filas.length.toLocaleString("es-MX")} de ${t.ventas.toLocaleString("es-MX")} ventas; el renglón TOTAL es del período completo`
        : subtitle;

    const wb = new ExcelJS.Workbook();

    const ws = wb.addWorksheet("Ventas");
    excelHeader(ws, TITULO, subtituloDetalle, COLS);
    excelBody(
        ws,
        filas.map(celdasExcel),
        ["TOTAL DEL PERÍODO", `${t.ventas.toLocaleString("es-MX")} venta(s)`, "", "", "", "", t.importe],
    );

    // El desglose va en su propia hoja para no estorbar al filtrar la de ventas.
    const resumen = wb.addWorksheet("Formas de pago");
    const colsResumen: XCol[] = [
        { header: "Forma de pago", width: 26 },
        { header: "Ventas", width: 12 },
        { header: "Total", width: 16, money: true },
    ];
    excelHeader(resumen, "Ventas por forma de pago", subtitle, colsResumen);
    excelBody(
        resumen,
        t.formas.map((f) => [f.forma, f.movimientos, f.total]),
        ["TOTAL", t.ventas, t.importe],
    );

    await descargar(wb, `${safeName(TITULO)}_${safeName(subtitle)}`);
}
