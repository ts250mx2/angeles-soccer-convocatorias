"use client";

import jsPDF from "jspdf";
import { presentarPdf } from "@/lib/pdf-preview";
import autoTable from "jspdf-autotable";
import ExcelJS from "exceljs";

export interface MdTable {
    headers: string[];
    rows: string[][];
}

const splitRow = (line: string): string[] =>
    line.replace(/^\s*\|/, "").replace(/\|\s*$/, "").split("|").map((c) => c.trim());

/** Detecta la línea separadora de una tabla markdown: |---|:--:|---| */
const isSeparator = (line: string): boolean => {
    const t = line.trim();
    return t.startsWith("|") && /-/.test(t) && /^\|[\s:|-]+\|?$/.test(t);
};

/** Extrae todas las tablas markdown de la respuesta del agente. */
export function parseMarkdownTables(md: string): MdTable[] {
    const lines = md.split("\n");
    const tables: MdTable[] = [];
    let i = 0;

    while (i < lines.length) {
        const line = lines[i].trim();
        if (line.startsWith("|") && i + 1 < lines.length && isSeparator(lines[i + 1])) {
            const headers = splitRow(line).map(cleanCell);
            const rows: string[][] = [];
            i += 2;
            while (i < lines.length && lines[i].trim().startsWith("|") && !isSeparator(lines[i])) {
                rows.push(splitRow(lines[i]).map(cleanCell));
                i++;
            }
            if (headers.length > 0 && rows.length > 0) tables.push({ headers, rows });
            continue;
        }
        i++;
    }
    return tables;
}

/** Quita el formato markdown de una celda (negritas, código, enlaces). */
export function cleanCell(s: string): string {
    return s
        .replace(/\*\*/g, "")
        .replace(/`/g, "")
        .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
        .trim();
}

/** Convierte "$1,234.50" / "1 234" / "45%" a número. Devuelve null si no es numérico. */
export function toNumber(raw: string): number | null {
    if (!raw) return null;
    const cleaned = raw.replace(/[^0-9.,-]/g, "").replace(/,/g, "");
    if (!cleaned || !/\d/.test(cleaned)) return null;
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : null;
}

export interface ChartData {
    label: string;
    valueLabel: string;
    measure: string;
    points: { label: string; value: number; raw: string }[];
}

/**
 * Decide si una tabla es graficable: necesita ≥2 filas, una primera columna de
 * texto (categorías) y al menos una columna mayormente numérica.
 * Devuelve la serie lista para graficar, o null.
 */
export function toChartData(table: MdTable): ChartData | null {
    if (table.rows.length < 2 || table.headers.length < 2) return null;

    // La primera columna debe ser texto (etiquetas), no números
    const firstColNumeric = table.rows.filter((r) => toNumber(r[0] ?? "") !== null).length;
    if (firstColNumeric > table.rows.length / 2) return null;

    // Busca la primera columna con ≥70% de valores numéricos
    for (let col = 1; col < table.headers.length; col++) {
        const parsed = table.rows.map((r) => toNumber(r[col] ?? ""));
        const okCount = parsed.filter((v) => v !== null).length;
        if (okCount / table.rows.length < 0.7) continue;

        const points = table.rows
            .map((r, i) => ({ label: r[0] ?? "", value: parsed[i] ?? 0, raw: r[col] ?? "" }))
            .filter((p) => p.label);

        if (points.length < 2) continue;
        // Sin variación (todo cero) no aporta nada graficar
        if (points.every((p) => p.value === 0)) continue;

        return {
            label: table.headers[0] || "Categoría",
            valueLabel: table.headers[col] || "Valor",
            measure: table.headers[col] || "Valor",
            points,
        };
    }
    return null;
}

/** jsPDF usa fuentes WinAnsi: los emojis salen como basura, así que se quitan. */
function stripForPdf(s: string): string {
    return s
        .replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{2190}-\u{21FF}\u{2B00}-\u{2BFF}]/gu, "")
        .replace(/\*\*/g, "")
        .replace(/`/g, "")
        .replace(/^#{1,6}\s*/gm, "")
        .replace(/^\s*[-*]\s+/gm, "• ")
        .replace(/[ \t]{2,}/g, " ")
        .trimEnd();
}

const stamp = () => new Date().toLocaleString("es-MX");
const fileStamp = () => new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-");

const MAX_BARS_PDF = 12;

/**
 * Dibuja la gráfica de barras en el PDF con primitivas vectoriales de jsPDF
 * (sin rasterizar), respetando el mismo diseño que en pantalla:
 * barras horizontales de una serie, carril recesivo, extremo redondeado
 * anclado a la base y etiqueta de valor directa.
 */
function drawBarChartPdf(
    doc: jsPDF,
    chart: ChartData,
    startY: number,
    margin: number,
    pageW: number,
    pageH: number,
): number {
    const sorted = [...chart.points].sort((a, b) => b.value - a.value);
    const shown = sorted.slice(0, MAX_BARS_PDF);
    const max = Math.max(...shown.map((p) => Math.abs(p.value)), 0);
    if (max <= 0) return startY;

    let y = startY;
    if (y + 14 > pageH - 18) { doc.addPage(); y = 20; }

    doc.setFont("helvetica", "bold");
    doc.setFontSize(9.5);
    doc.setTextColor(30, 41, 59);
    doc.text(stripForPdf(chart.measure).toUpperCase(), margin, y);
    y += 5;

    const labelW = 52;
    const valueW = 30;
    const trackX = margin + labelW + 3;
    const trackW = pageW - margin - valueW - trackX;
    const rowH = 7;
    const barH = 3.2;

    doc.setFontSize(8.5);
    for (const p of shown) {
        if (y + rowH > pageH - 18) { doc.addPage(); y = 20; }

        // Etiqueta de categoría
        doc.setFont("helvetica", "normal");
        doc.setTextColor(51, 65, 85);
        const label = doc.splitTextToSize(stripForPdf(p.label) || "-", labelW)[0];
        doc.text(label, margin, y + barH);

        // Carril recesivo
        doc.setFillColor(226, 232, 240);
        doc.roundedRect(trackX, y, trackW, barH, barH / 2, barH / 2, "F");

        // Barra (azul de la serie)
        const w = Math.max((Math.abs(p.value) / max) * trackW, 1.2);
        doc.setFillColor(59, 130, 246);
        doc.roundedRect(trackX, y, w, barH, Math.min(barH / 2, w / 2), Math.min(barH / 2, w / 2), "F");

        // Valor (etiqueta directa)
        doc.setFont("helvetica", "bold");
        doc.setTextColor(15, 23, 42);
        doc.text(stripForPdf(p.raw) || String(p.value), pageW - margin, y + barH, { align: "right" });

        y += rowH;
    }

    if (sorted.length > shown.length) {
        doc.setFont("helvetica", "normal");
        doc.setFontSize(7.5);
        doc.setTextColor(120, 130, 145);
        doc.text(
            `Mostrando los ${MAX_BARS_PDF} mayores de ${sorted.length}; la tabla anterior tiene el detalle completo.`,
            margin, y + 2,
        );
        y += 5;
    }

    return y + 4;
}

/**
 * Exporta la respuesta a PDF. Si trae tablas markdown, las renderiza como
 * tablas reales; el texto alrededor se incluye como párrafos.
 */
export function exportAnswerToPdf(content: string, question: string) {
    const doc = new jsPDF();
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    const margin = 14;

    // Encabezado
    doc.setFillColor(30, 58, 138);
    doc.rect(0, 0, pageW, 26, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(15);
    doc.text("Agente Inteligente", margin, 12);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.text("Angeles Soccer", margin, 19);
    doc.text(stamp(), pageW - margin, 19, { align: "right" });

    let y = 34;
    doc.setTextColor(30, 41, 59);

    if (question) {
        doc.setFont("helvetica", "bold");
        doc.setFontSize(10);
        const q = doc.splitTextToSize(stripForPdf(question), pageW - margin * 2);
        doc.text(q, margin, y);
        y += q.length * 5 + 4;
    }

    const tables = parseMarkdownTables(content);
    // Texto fuera de las tablas
    const textOnly = content
        .split("\n")
        .filter((l) => !l.trim().startsWith("|"))
        .join("\n");

    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    for (const para of stripForPdf(textOnly).split(/\n{2,}/)) {
        const clean = para.trim();
        if (!clean) continue;
        const lines = doc.splitTextToSize(clean, pageW - margin * 2);
        if (y + lines.length * 5 > pageH - 16) { doc.addPage(); y = 20; }
        doc.text(lines, margin, y);
        y += lines.length * 5 + 4;
    }

    for (const t of tables) {
        autoTable(doc, {
            startY: y + 2,
            head: [t.headers.map(stripForPdf)],
            body: t.rows.map((r) => r.map(stripForPdf)),
            theme: "grid",
            styles: { fontSize: 9 },
            headStyles: { fillColor: [37, 99, 235], textColor: 255, fontStyle: "bold" },
            margin: { left: margin, right: margin },
        });
        y = (doc as any).lastAutoTable.finalY + 6;

        // Si la tabla es graficable, la gráfica va justo debajo de ella
        const chart = toChartData(t);
        if (chart) {
            y = drawBarChartPdf(doc, chart, y, margin, pageW, pageH);
        }
    }

    doc.setFontSize(8);
    doc.setTextColor(150);
    doc.text("Generado por el Agente Inteligente", margin, pageH - 8);

    presentarPdf(doc, `Agente_${fileStamp()}.pdf`);
}

/** Exporta las tablas de la respuesta a Excel (una hoja por tabla). */
export async function exportTablesToExcel(tables: MdTable[], question: string) {
    const wb = new ExcelJS.Workbook();

    tables.forEach((t, idx) => {
        const ws = wb.addWorksheet(tables.length > 1 ? `Tabla ${idx + 1}` : "Resultado");

        const title = ws.getCell("A1");
        title.value = question ? question.slice(0, 200) : "Resultado del Agente";
        title.font = { bold: true, size: 13, color: { argb: "FF1E293B" } };
        ws.getCell("A2").value = `Generado el ${stamp()}`;
        ws.getCell("A2").font = { size: 9, color: { argb: "FF64748B" } };

        ws.columns = t.headers.map((h) => ({ width: Math.min(Math.max(h.length + 6, 14), 45) }));

        const header = ws.getRow(4);
        header.values = t.headers;
        header.font = { bold: true, color: { argb: "FFFFFFFF" } };
        header.eachCell((cell) => {
            cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF334155" } };
            cell.border = { top: { style: "thin" }, left: { style: "thin" }, bottom: { style: "thin" }, right: { style: "thin" } };
            cell.alignment = { vertical: "middle", horizontal: "center" };
        });

        t.rows.forEach((r) => {
            // Convierte a número lo que sea numérico para que Excel pueda sumar/graficar
            const row = ws.addRow(r.map((cell) => {
                const n = toNumber(cell);
                return n !== null && /^[\s$€]*[\d.,-]+\s*%?$/.test(cell) ? n : cell;
            }));
            row.eachCell((cell) => {
                cell.border = { top: { style: "thin" }, left: { style: "thin" }, bottom: { style: "thin" }, right: { style: "thin" } };
            });
        });
    });

    const buffer = await wb.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `Agente_${fileStamp()}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
}
