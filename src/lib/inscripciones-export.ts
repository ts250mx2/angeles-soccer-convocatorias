"use client";

import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import ExcelJS from "exceljs";
import { MESES_ANTICIPO_SOSPECHOSO } from "@/lib/temporada";

export { MESES_ANTICIPO_SOSPECHOSO };

export interface PlayerRow {
    IdJugador: number;
    Jugador: string;
    Categoria: string;
    Status: number;
    Beca: string | null;
    IdSede: number;
    SedeNombre: string;
    FechaInscripcion: string | null;
    /** Códigos Anio*100+Mes de las mensualidades cubiertas, separados por coma */
    MesesPagados: string;
    InscripcionPagada: number;
    /** Mensualidades cobradas 3+ meses antes de que iniciara la temporada */
    PagosAnticipados: number;
}

export interface MesTemporada {
    codigo: number;
    mes: number;
    anio: number;
}

export interface PlayersConfig {
    meses: MesTemporada[];
    mesActual: number | null;
}

export const MESES_CORTOS = [
    "Ene", "Feb", "Mar", "Abr", "May", "Jun",
    "Jul", "Ago", "Sep", "Oct", "Nov", "Dic",
];

/** Beca del 100%: cubre inscripción y mensualidades, igual que en adeudos. */
export const esBeca100 = (beca: string | null): boolean =>
    beca !== null && beca !== undefined && String(beca).includes("100");

export const parseMesesPagados = (raw: string | null): number[] =>
    (raw ?? "")
        .split(",")
        .map((m) => parseInt(m.trim(), 10))
        .filter((m) => !isNaN(m));

export const esPagoAnticipado = (p: PagoRow): boolean =>
    p.MesesAntesDeTemporada !== null && p.MesesAntesDeTemporada >= MESES_ANTICIPO_SOSPECHOSO;

export interface PagoRow {
    IdPago: number;
    /** Ya viene formateada por MySQL como "dd/mm/aaaa hh:mm" en hora local. */
    FechaPago: string;
    FechaOrden: string;
    /** Meses entre la fecha de pago y el inicio de la temporada; null sin temporada. */
    MesesAntesDeTemporada: number | null;
    Pago: number;
    Mes: number | null;
    Anio: number | null;
    Recibo: string | null;
    Referencia: string | null;
    Producto: string;
    IdTipoProducto: number | null;
    TipoProducto: string;
    FormaPago: string;
    SedePago: string;
    Temporada: string;
}

export const MESES = [
    "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
    "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

const BRAND: [number, number, number] = [37, 99, 235];
const FOOT_BG: [number, number, number] = [241, 245, 249];
const FOOT_TEXT: [number, number, number] = [30, 41, 59];

export const money = (n: number): string =>
    `$${Number(n ?? 0).toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/**
 * Las fechas llegan ya formateadas en hora local desde MySQL (DATE_FORMAT), así que
 * aquí NO se vuelven a parsear: reconstruirlas con `new Date` las desplazaría otra vez
 * por el huso horario. Solo se cubre el caso nulo.
 */
export const fecha = (raw: string | null | undefined): string => raw || "—";

export const mesLabel = (mes: number | null, anio: number | null): string => {
    if (!mes || mes < 1 || mes > 12) return "—";
    return anio ? `${MESES[mes - 1]} ${anio}` : MESES[mes - 1];
};

const stamp = () => new Date().toLocaleString("es-MX");
const safeName = (s: string) => s.replace(/[^\w\sáéíóúñÁÉÍÓÚÑ-]/gi, "").replace(/\s+/g, "_").slice(0, 60);

/** Encabezado con la barra de marca; devuelve la Y donde puede empezar el contenido. */
function pdfHeader(doc: jsPDF, title: string, subtitle?: string): number {
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
    doc.text("Ángeles Soccer", margin, 19);
    doc.text(stamp(), pageW - margin, 19, { align: "right" });

    doc.setTextColor(30, 41, 59);
    if (!subtitle) return 34;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    const lines = doc.splitTextToSize(subtitle, pageW - margin * 2);
    doc.text(lines, margin, 34);
    return 34 + lines.length * 5 + 2;
}

function pdfFooter(doc: jsPDF) {
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    const pages = doc.getNumberOfPages();
    for (let i = 1; i <= pages; i++) {
        doc.setPage(i);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(8);
        doc.setTextColor(150);
        doc.text("Ángeles Soccer · Inscripciones", 14, pageH - 8);
        doc.text(`Página ${i} de ${pages}`, pageW - 14, pageH - 8, { align: "right" });
    }
}

// ── Excel: encabezado de marca reutilizable ──
interface XCol { header: string; width: number; money?: boolean; }

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

    ws.columns = cols.map((c) =>
        c.money ? { width: c.width, style: { numFmt: '"$"#,##0.00' } } : { width: c.width }
    );

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

function excelBody(ws: ExcelJS.Worksheet, rows: (string | number | null)[][]) {
    rows.forEach((r) => {
        const row = ws.addRow(r);
        row.eachCell((cell) => {
            cell.border = { top: { style: "thin" }, left: { style: "thin" }, bottom: { style: "thin" }, right: { style: "thin" } };
        });
    });
}

async function downloadWorkbook(wb: ExcelJS.Workbook, filename: string) {
    const buffer = await wb.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
}

// ══ Lista de jugadores ══

/* Las columnas de meses solo aparecen cuando hay temporada: sin ella no hay
   rango que desglosar. */
const playerCols = (config?: PlayersConfig): XCol[] => {
    const base: XCol[] = [
        { header: "ID", width: 10 },
        { header: "Jugador", width: 38 },
        { header: "Categoría", width: 16 },
        { header: "Sede", width: 24 },
        { header: "Estatus", width: 12 },
        { header: "Beca", width: 10 },
        { header: "Inscripción", width: 12 },
        { header: "Fecha de inscripción", width: 20 },
    ];
    if (!config?.meses.length) return base;
    return [
        ...base,
        { header: "Meses pagados", width: 26 },
        { header: "Meses pendientes", width: 26 },
        { header: "Pagos anticipados", width: 16 },
    ];
};

const nombresMeses = (codigos: number[], meses: MesTemporada[]): string =>
    meses.filter((m) => codigos.includes(m.codigo)).map((m) => MESES_CORTOS[m.mes - 1]).join(", ") || "—";

const playerCells = (p: PlayerRow, config?: PlayersConfig) => {
    const beca100 = esBeca100(p.Beca);
    const base = [
        p.IdJugador,
        p.Jugador,
        p.Categoria || "—",
        p.SedeNombre || "—",
        p.Status === 0 ? "ACTIVO" : "BAJA",
        p.Beca && String(p.Beca) !== "0" ? String(p.Beca) : "—",
        p.InscripcionPagada || beca100 ? "SI" : "NO",
        fecha(p.FechaInscripcion),
    ];
    if (!config?.meses.length) return base;

    const pagados = parseMesesPagados(p.MesesPagados);
    // La beca del 100% cubre todo, así que no deja meses pendientes.
    const cubiertos = beca100 ? config.meses.map((m) => m.codigo) : pagados;
    const pendientes = config.meses.map((m) => m.codigo).filter((c) => !cubiertos.includes(c));

    return [
        ...base,
        nombresMeses(cubiertos, config.meses),
        nombresMeses(pendientes, config.meses),
        p.PagosAnticipados > 0 ? String(p.PagosAnticipados) : "—",
    ];
};

export function exportPlayersToPdf(
    players: PlayerRow[], title: string, subtitle: string, config?: PlayersConfig,
) {
    const cols = playerCols(config);
    // Con el desglose de meses la tabla ya no cabe en vertical.
    const doc = new jsPDF({ orientation: cols.length > 8 ? "landscape" : "portrait" });
    const y = pdfHeader(doc, title, subtitle);

    autoTable(doc, {
        startY: y,
        head: [cols.map((c) => c.header)],
        body: players.map((p) => playerCells(p, config).map(String)),
        theme: "grid",
        styles: { fontSize: 8, cellPadding: 2 },
        headStyles: { fillColor: BRAND, textColor: 255, fontStyle: "bold" },
        alternateRowStyles: { fillColor: [248, 250, 252] },
        columnStyles: { 0: { halign: "right", cellWidth: 14 }, 6: { halign: "center" }, 7: { halign: "center" } },
        foot: [[`TOTAL: ${players.length} jugador(es)`, ...cols.slice(1).map(() => "")]],
        footStyles: { fillColor: FOOT_BG, textColor: FOOT_TEXT, fontStyle: "bold" },
        margin: { left: 14, right: 14 },
    });

    pdfFooter(doc);
    doc.save(`${safeName(title)}_${safeName(subtitle)}.pdf`);
}

// ══ Movimientos (pagos) de todos los jugadores del listado ══

export interface MovimientoRow {
    IdJugador: number;
    Jugador: string;
    Categoria: string;
    Beca: string | null;
    StatusJugador: number;
    SedeNombre: string;
    IdPago: number;
    Recibo: string | null;
    Referencia: string | null;
    FechaPago: string;
    FechaOrden: string;
    Pago: number;
    Mes: number | null;
    Anio: number | null;
    Producto: string;
    IdTipoProducto: number | null;
    TipoProducto: string;
    FormaPago: string;
    SedePago: string;
    Temporada: string;
}

const MOV_COLS: XCol[] = [
    { header: "ID", width: 9 },
    { header: "Jugador", width: 34 },
    { header: "Categoría", width: 14 },
    { header: "Sede", width: 20 },
    { header: "Beca", width: 8 },
    { header: "Recibo", width: 12 },
    { header: "Fecha", width: 17 },
    { header: "Concepto", width: 32 },
    { header: "Tipo", width: 22 },
    { header: "Mes", width: 16 },
    { header: "Forma de pago", width: 16 },
    { header: "Sede de cobro", width: 20 },
    { header: "Importe", width: 14, money: true },
];

const BORDER = {
    top: { style: "thin" as const }, left: { style: "thin" as const },
    bottom: { style: "thin" as const }, right: { style: "thin" as const },
};

/**
 * Campos del listado en pantalla que necesita el Excel de movimientos. Se declara
 * aparte (y no como PlayerRow) porque lo consumen dos módulos: el listado de
 * inscripciones y el de adeudos, cuyas filas traen columnas distintas.
 */
export interface MovimientosPlayer {
    IdJugador: number;
    Jugador: string;
    Categoria: string;
    Status: number;
    Beca: string | null;
    SedeNombre: string;
    InscripcionPagada: number;
}

/**
 * Excel de movimientos: un renglón por pago, agrupado por jugador con subtotal,
 * más una hoja resumen con el total por jugador.
 */
export async function exportMovimientosToExcel(
    movimientos: MovimientoRow[],
    players: MovimientosPlayer[],
    title: string,
    subtitle: string,
) {
    const wb = new ExcelJS.Workbook();

    // ── Hoja 1: detalle agrupado por jugador ──
    const ws = wb.addWorksheet("Movimientos");
    excelHeader(ws, title, subtitle, MOV_COLS);

    // Se respeta el orden del listado en pantalla y se incluyen los jugadores
    // sin movimientos, para que el archivo no los omita en silencio.
    const porJugador = new Map<number, MovimientoRow[]>();
    for (const m of movimientos) {
        const arr = porJugador.get(m.IdJugador);
        if (arr) arr.push(m);
        else porJugador.set(m.IdJugador, [m]);
    }

    let granTotal = 0;
    const resumen: { p: MovimientosPlayer; movs: number; total: number }[] = [];

    for (const p of players) {
        const movs = porJugador.get(p.IdJugador) ?? [];
        const subtotal = movs.reduce((s, m) => s + (Number(m.Pago) || 0), 0);
        granTotal += subtotal;
        resumen.push({ p, movs: movs.length, total: subtotal });

        if (movs.length === 0) {
            const row = ws.addRow([
                p.IdJugador, p.Jugador, p.Categoria || "—", p.SedeNombre || "—",
                p.Beca && String(p.Beca) !== "0" ? String(p.Beca) : "—",
                "—", "—", "SIN MOVIMIENTOS", "—", "—", "—", "—", 0,
            ]);
            row.eachCell((cell) => {
                cell.border = BORDER;
                cell.font = { italic: true, color: { argb: "FF94A3B8" } };
            });
            continue;
        }

        for (const m of movs) {
            const row = ws.addRow([
                m.IdJugador,
                m.Jugador,
                m.Categoria || "—",
                m.SedeNombre || "—",
                m.Beca && String(m.Beca) !== "0" ? String(m.Beca) : "—",
                m.Recibo ?? String(m.IdPago),
                fecha(m.FechaPago),
                m.Producto,
                m.TipoProducto,
                mesLabel(m.Mes, m.Anio),
                m.FormaPago,
                m.SedePago,
                Number(m.Pago) || 0,
            ]);
            row.eachCell((cell) => { cell.border = BORDER; });
        }

        // Subtotal del jugador
        const sub = ws.addRow(["", "", "", "", "", "", "", "", "", "", "", `Subtotal ${p.Jugador}`, subtotal]);
        sub.font = { bold: true };
        sub.eachCell((cell) => {
            cell.border = BORDER;
            cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF8FAFC" } };
        });
    }

    const tot = ws.addRow(["", "", "", "", "", "", "", "", "", "", "", "TOTAL GENERAL", granTotal]);
    tot.font = { bold: true, size: 12 };
    tot.eachCell((cell) => {
        cell.border = BORDER;
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE2E8F0" } };
    });

    // ── Hoja 2: resumen por jugador ──
    const RES_COLS: XCol[] = [
        { header: "ID", width: 9 },
        { header: "Jugador", width: 34 },
        { header: "Categoría", width: 14 },
        { header: "Sede", width: 20 },
        { header: "Estatus", width: 11 },
        { header: "Beca", width: 8 },
        { header: "Inscripción", width: 12 },
        { header: "Movimientos", width: 13 },
        { header: "Total pagado", width: 15, money: true },
    ];
    const ws2 = wb.addWorksheet("Resumen");
    excelHeader(ws2, `${title} · resumen por jugador`, subtitle, RES_COLS);

    resumen.forEach(({ p, movs, total }) => {
        const row = ws2.addRow([
            p.IdJugador,
            p.Jugador,
            p.Categoria || "—",
            p.SedeNombre || "—",
            p.Status === 0 ? "ACTIVO" : "BAJA",
            p.Beca && String(p.Beca) !== "0" ? String(p.Beca) : "—",
            p.InscripcionPagada || esBeca100(p.Beca) ? "SI" : "NO",
            movs,
            total,
        ]);
        row.eachCell((cell) => { cell.border = BORDER; });
    });

    const tot2 = ws2.addRow([
        `TOTAL: ${resumen.length} jugador(es)`, "", "", "", "", "", "",
        resumen.reduce((s, r) => s + r.movs, 0),
        granTotal,
    ]);
    tot2.font = { bold: true };
    tot2.eachCell((cell) => {
        cell.border = BORDER;
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE2E8F0" } };
    });

    await downloadWorkbook(wb, `Movimientos_${safeName(title)}_${safeName(subtitle)}.xlsx`);
}

export async function exportPlayersToExcel(
    players: PlayerRow[], title: string, subtitle: string, config?: PlayersConfig,
) {
    const cols = playerCols(config);
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Jugadores");
    excelHeader(ws, title, subtitle, cols);
    excelBody(ws, players.map((p) => playerCells(p, config)));

    const totalRow = ws.addRow([`TOTAL: ${players.length} jugador(es)`]);
    totalRow.font = { bold: true };
    ws.mergeCells(totalRow.number, 1, totalRow.number, cols.length);

    await downloadWorkbook(wb, `${safeName(title)}_${safeName(subtitle)}.xlsx`);
}

// ══ Pagos de un jugador ══

const PAGO_COLS: XCol[] = [
    { header: "Recibo", width: 14 },
    { header: "Fecha", width: 18 },
    { header: "Concepto", width: 34 },
    { header: "Tipo", width: 22 },
    { header: "Mes", width: 16 },
    { header: "Forma de pago", width: 16 },
    { header: "Sede", width: 22 },
    { header: "Importe", width: 14, money: true },
];

const pagoCells = (p: PagoRow) => [
    p.Recibo ?? String(p.IdPago),
    fecha(p.FechaPago),
    p.Producto,
    p.TipoProducto,
    mesLabel(p.Mes, p.Anio),
    p.FormaPago,
    p.SedePago,
    Number(p.Pago ?? 0),
];

export function exportPagosToPdf(pagos: PagoRow[], jugador: string, subtitle: string, total: number) {
    const doc = new jsPDF({ orientation: "landscape" });
    const y = pdfHeader(doc, `Pagos de ${jugador}`, subtitle);

    autoTable(doc, {
        startY: y,
        head: [PAGO_COLS.map((c) => c.header)],
        body: pagos.map((p) => {
            const cells = pagoCells(p);
            return [...cells.slice(0, 7).map(String), money(Number(cells[7]))];
        }),
        theme: "grid",
        styles: { fontSize: 8, cellPadding: 2 },
        headStyles: { fillColor: BRAND, textColor: 255, fontStyle: "bold" },
        alternateRowStyles: { fillColor: [248, 250, 252] },
        columnStyles: { 7: { halign: "right" } },
        foot: [["TOTAL", "", "", "", "", "", `${pagos.length} pago(s)`, money(total)]],
        footStyles: { fillColor: FOOT_BG, textColor: FOOT_TEXT, fontStyle: "bold" },
        margin: { left: 14, right: 14 },
    });

    pdfFooter(doc);
    doc.save(`Pagos_${safeName(jugador)}.pdf`);
}

export async function exportPagosToExcel(pagos: PagoRow[], jugador: string, subtitle: string, total: number) {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Pagos");
    excelHeader(ws, `Pagos de ${jugador}`, subtitle, PAGO_COLS);
    excelBody(ws, pagos.map(pagoCells));

    const totalRow = ws.addRow(["TOTAL", "", "", "", "", "", `${pagos.length} pago(s)`, total]);
    totalRow.font = { bold: true };
    totalRow.eachCell((cell) => {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF1F5F9" } };
        cell.border = { top: { style: "thin" }, left: { style: "thin" }, bottom: { style: "thin" }, right: { style: "thin" } };
    });

    await downloadWorkbook(wb, `Pagos_${safeName(jugador)}.xlsx`);
}
