"use client";

import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import ExcelJS from "exceljs";

export interface AdeudoRow {
    IdJugador: number;
    Jugador: string;
    Categoria: string;
    Status: number;
    Beca: string | null;
    IdSede: number;
    SedeNombre: string;
    InscripcionPagada: number;
    /** 1 si la inscripción quedó cubierta por la promoción (pago de la inscripción de
     *  la temporada siguiente en el último mes de esta). */
    EsPromoInscripcion?: number;
    /** Meses pagados como números 1-12, separados por coma. */
    MesesPagados: string;
    Pagado: number;
    Adeudo: number;
    MissingCount: number;
    PagosCount: number;
    /** Beca 100%: no paga nada, nunca tiene adeudo. */
    BecaTotal?: number;
    /** 1 si la inscripción con fecha más cercana al inicio de la temporada está
     *  archivada en OTRA temporada (posible inscripción de esta mal capturada). */
    PosibleInscTempAnterior?: number;
    /** IdPago de esa inscripción sospechosa (para reasignarla). */
    SospIdPago?: number | null;
    /** Fecha en que se pagó, formateada dd/mm/aaaa. */
    SospFecha?: string | null;
    /** IdTemporada bajo la que está archivada esa inscripción. */
    SospIdTemporada?: number | null;
    /** Temporada bajo la que está archivada esa inscripción. */
    SospTempNombre?: string | null;
}

export interface AdeudosConfig {
    seasonId: number;
    temporadaNombre: string;
    startMonth: number;
    endMonth: number;
    hastaMonth: number;
    numMonthsExpected: number;
    mensualidad: number;
    inscripcion: number;
    totalAdeudo: number;
    totalPagado: number;
}

export const MESES_CORTOS = [
    "Ene", "Feb", "Mar", "Abr", "May", "Jun",
    "Jul", "Ago", "Sep", "Oct", "Nov", "Dic",
];

export const money = (n: number): string =>
    `$${Number(n ?? 0).toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export const esBeca100 = (beca: string | null): boolean =>
    beca !== null && beca !== undefined && String(beca).includes("100");

/** Porcentaje de beca normalizado a 0-100. Sin beca / valor inválido => 0. */
export const becaPct = (beca: string | null | undefined): number => {
    const n = parseFloat(String(beca ?? "").trim());
    return isNaN(n) ? 0 : Math.max(0, Math.min(100, n));
};

/** Etiqueta del grupo de beca para el listado agrupado. */
export const becaLabel = (pct: number): string => (pct === 0 ? "Sin beca" : `Beca ${pct}%`);

export const parseMeses = (raw: string | null): number[] =>
    (raw ?? "")
        .split(",")
        .map((m) => parseInt(m.trim(), 10))
        .filter((m) => !isNaN(m));

const stamp = () => new Date().toLocaleString("es-MX");
const safeName = (s: string) => s.replace(/[^\w\sáéíóúñÁÉÍÓÚÑ-]/gi, "").replace(/\s+/g, "_").slice(0, 60);

const BRAND: [number, number, number] = [37, 99, 235];
const FOOT_BG: [number, number, number] = [241, 245, 249];
const FOOT_TEXT: [number, number, number] = [30, 41, 59];

function mesesRange(config: AdeudosConfig): number[] {
    const out: number[] = [];
    for (let m = config.startMonth; m <= config.endMonth; m++) out.push(m);
    return out;
}

/** Nombres de meses pagados / pendientes (hasta el mes exigible) para la exportación. */
function desglose(p: AdeudoRow, config: AdeudosConfig) {
    const pagados = esBeca100(p.Beca) ? mesesRange(config) : parseMeses(p.MesesPagados);
    const cubiertos = pagados.filter((mm) => mm >= config.startMonth && mm <= config.endMonth);
    const pendientes: number[] = [];
    for (let mm = config.startMonth; mm <= config.hastaMonth; mm++) {
        if (!cubiertos.includes(mm)) pendientes.push(mm);
    }
    return {
        pagados: cubiertos.map((mm) => MESES_CORTOS[mm - 1]).join(", ") || "—",
        pendientes: pendientes.map((mm) => MESES_CORTOS[mm - 1]).join(", ") || "—",
    };
}

const COLS = [
    { header: "ID", width: 10 },
    { header: "Jugador", width: 34 },
    { header: "Categoría", width: 14 },
    { header: "Sede", width: 20 },
    { header: "Estatus", width: 11 },
    { header: "Beca", width: 9 },
    { header: "Inscripción", width: 12 },
    { header: "Meses pagados", width: 24 },
    { header: "Meses pendientes", width: 24 },
    { header: "Adeudo", width: 14 },
];

const cells = (p: AdeudoRow, config: AdeudosConfig) => {
    const d = desglose(p, config);
    return [
        p.IdJugador,
        p.Jugador,
        p.Categoria || "—",
        p.SedeNombre || "—",
        p.Status === 0 ? "ACTIVO" : "BAJA",
        p.Beca && String(p.Beca) !== "0" ? String(p.Beca) : "—",
        p.InscripcionPagada || esBeca100(p.Beca) ? "SI" : "NO",
        d.pagados,
        d.pendientes,
        p.Adeudo,
    ];
};

export function exportAdeudosToPdf(
    players: AdeudoRow[], config: AdeudosConfig, title: string, subtitle: string,
) {
    const doc = new jsPDF({ orientation: "landscape" });
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    const margin = 14;

    doc.setFillColor(...BRAND);
    doc.rect(0, 0, pageW, 26, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(15);
    doc.text(title, margin, 12);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.text("Ángeles Soccer · Adeudos", margin, 19);
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

    const totalAdeudo = players.reduce((s, p) => s + (Number(p.Adeudo) || 0), 0);

    autoTable(doc, {
        startY: y,
        head: [COLS.map((c) => c.header)],
        body: players.map((p) => cells(p, config).map((v, i) => (i === 9 ? money(Number(v)) : String(v)))),
        theme: "grid",
        styles: { fontSize: 8, cellPadding: 2 },
        headStyles: { fillColor: BRAND, textColor: 255, fontStyle: "bold" },
        alternateRowStyles: { fillColor: [248, 250, 252] },
        columnStyles: { 0: { halign: "right" }, 6: { halign: "center" }, 9: { halign: "right" } },
        foot: [[`TOTAL: ${players.length} jugador(es)`, "", "", "", "", "", "", "", "Adeudo", money(totalAdeudo)]],
        footStyles: { fillColor: FOOT_BG, textColor: FOOT_TEXT, fontStyle: "bold" },
        margin: { left: margin, right: margin },
    });

    const pages = doc.getNumberOfPages();
    for (let i = 1; i <= pages; i++) {
        doc.setPage(i);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(8);
        doc.setTextColor(150);
        doc.text("Ángeles Soccer · Adeudos", margin, pageH - 8);
        doc.text(`Página ${i} de ${pages}`, pageW - margin, pageH - 8, { align: "right" });
    }

    doc.save(`${safeName(title)}_${safeName(subtitle)}.pdf`);
}

export async function exportAdeudosToExcel(
    players: AdeudoRow[], config: AdeudosConfig, title: string, subtitle: string,
) {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Adeudos");

    ws.mergeCells(1, 1, 1, COLS.length);
    const t = ws.getCell("A1");
    t.value = title;
    t.font = { bold: true, size: 14, color: { argb: "FFFFFFFF" } };
    t.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF2563EB" } };
    t.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
    ws.getRow(1).height = 24;

    ws.mergeCells(2, 1, 2, COLS.length);
    const s = ws.getCell("A2");
    s.value = `${subtitle}${subtitle ? " · " : ""}Generado el ${stamp()}`;
    s.font = { size: 9, color: { argb: "FF64748B" } };

    ws.columns = COLS.map((c, i) =>
        i === 9 ? { width: c.width, style: { numFmt: '"$"#,##0.00' } } : { width: c.width }
    );

    const header = ws.getRow(4);
    header.values = COLS.map((c) => c.header);
    header.font = { bold: true, color: { argb: "FFFFFFFF" } };
    header.eachCell((cell) => {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF334155" } };
        cell.border = { top: { style: "thin" }, left: { style: "thin" }, bottom: { style: "thin" }, right: { style: "thin" } };
        cell.alignment = { vertical: "middle", horizontal: "center" };
    });
    ws.views = [{ state: "frozen", ySplit: 4 }];

    players.forEach((p) => {
        const row = ws.addRow(cells(p, config));
        row.eachCell((cell) => {
            cell.border = { top: { style: "thin" }, left: { style: "thin" }, bottom: { style: "thin" }, right: { style: "thin" } };
        });
    });

    const totalAdeudo = players.reduce((sum, p) => sum + (Number(p.Adeudo) || 0), 0);
    const totalRow = ws.addRow(["TOTAL", "", "", "", "", "", "", "", `${players.length} jugador(es)`, totalAdeudo]);
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
    a.download = `${safeName(title)}_${safeName(subtitle)}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
}
