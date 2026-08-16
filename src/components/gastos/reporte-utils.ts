import ExcelJS from "exceljs";

/**
 * Utilidades compartidas por los reportes de gastos (por forma de pago y por tipo).
 * Son las mismas piezas que usa Ventas por Forma de Pago; viven aquí para que las dos
 * pantallas de gastos no las repitan.
 */

export type Period = "today" | "yesterday" | "week" | "month" | "custom";

export const PERIODS: { key: Period; label: string }[] = [
  { key: "today", label: "Hoy" },
  { key: "yesterday", label: "Ayer" },
  { key: "week", label: "Semana" },
  { key: "month", label: "Mes" },
];

/** Paleta del treemap: cada grupo un color, cicla si hay muchos. */
const PALETTE = ["#f43f5e", "#f59e0b", "#a855f7", "#3b82f6", "#06b6d4", "#10b981", "#84cc16", "#ec4899", "#14b8a6", "#f97316", "#8b5cf6", "#eab308"];
export const colorFor = (idx: number) => PALETTE[idx % PALETTE.length];

export const fmt = (n: number) =>
  new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 0 }).format(n || 0);
export const fmt2 = (n: number) =>
  new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(n || 0);

const pad = (n: number) => String(n).padStart(2, "0");

/** Convierte un período rápido en un rango de fechas (hora local). */
export function periodRange(p: Period): { from: string; to: string } {
  const now = new Date();
  const d = (dt: Date) => `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
  if (p === "today") return { from: d(now), to: d(now) };
  if (p === "yesterday") { const y = new Date(now); y.setDate(y.getDate() - 1); return { from: d(y), to: d(y) }; }
  if (p === "week") { const off = (now.getDay() + 6) % 7; const mon = new Date(now); mon.setDate(now.getDate() - off); return { from: d(mon), to: d(now) }; }
  const first = new Date(now.getFullYear(), now.getMonth(), 1);
  return { from: d(first), to: d(now) };
}

export const sanitize = (s: string) => (s || "").replace(/[^\w-]+/g, "_").slice(0, 60);

/** La fecha llega sin offset (hora local del servidor); se muestra tal cual. */
export const fmtFechaHora = (v: string) => {
  if (!v) return "";
  const d = new Date(v);
  if (isNaN(d.getTime())) return String(v);
  return d.toLocaleString("es-MX", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
};

export interface XCol { header: string; key: string; width: number; money?: boolean }

export async function downloadExcel(
  sheet: string,
  title: string,
  cols: XCol[],
  data: Record<string, unknown>[],
  filename: string,
) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(sheet);
  const t = ws.getCell("A1");
  t.value = title;
  t.font = { bold: true, size: 14, color: { argb: "FF1E293B" } };
  ws.columns = cols.map((c) =>
    c.money ? { key: c.key, width: c.width, style: { numFmt: '"$"#,##0.00' } } : { key: c.key, width: c.width }
  );
  const header = ws.getRow(3);
  header.values = cols.map((c) => c.header);
  header.font = { bold: true, color: { argb: "FFFFFFFF" } };
  header.eachCell((cell) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF334155" } };
    cell.border = { top: { style: "thin" }, left: { style: "thin" }, bottom: { style: "thin" }, right: { style: "thin" } };
    cell.alignment = { vertical: "middle", horizontal: "center" };
  });
  data.forEach((r) => {
    const row = ws.addRow(cols.map((c) => r[c.key]));
    row.eachCell((cell) => { cell.border = { top: { style: "thin" }, left: { style: "thin" }, bottom: { style: "thin" }, right: { style: "thin" } }; });
  });
  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

/* ── Treemap squarificado: rectángulos proporcionales al Total ── */

export interface TreeRect<T> { x: number; y: number; w: number; h: number; data: T }

export function squarify<T>(items: { value: number; data: T }[], width: number, height: number): TreeRect<T>[] {
  const valid = items.filter((i) => i.value > 0);
  const total = valid.reduce((s, i) => s + i.value, 0);
  if (total <= 0 || width <= 0 || height <= 0) return [];
  const scale = (width * height) / total;
  const nodes = valid.map((i) => ({ area: i.value * scale, data: i.data }));

  const result: TreeRect<T>[] = [];
  let x = 0, y = 0, w = width, h = height;
  let row: { area: number; data: T }[] = [];
  let i = 0;

  const worst = (r: typeof row, len: number) => {
    if (r.length === 0 || len <= 0) return Infinity;
    let sum = 0, mn = Infinity, mx = 0;
    for (const it of r) { sum += it.area; if (it.area < mn) mn = it.area; if (it.area > mx) mx = it.area; }
    const s2 = sum * sum, l2 = len * len;
    return Math.max((l2 * mx) / s2, s2 / (l2 * mn));
  };

  const layoutRow = (r: typeof row) => {
    const len = Math.min(w, h);
    const rowArea = r.reduce((s, it) => s + it.area, 0);
    const thickness = rowArea / len;
    if (w >= h) {
      let oy = y;
      for (const it of r) { const rh = it.area / thickness; result.push({ x, y: oy, w: thickness, h: rh, data: it.data }); oy += rh; }
      x += thickness; w -= thickness;
    } else {
      let ox = x;
      for (const it of r) { const rw = it.area / thickness; result.push({ x: ox, y, w: rw, h: thickness, data: it.data }); ox += rw; }
      y += thickness; h -= thickness;
    }
  };

  while (i < nodes.length) {
    const len = Math.min(w, h);
    const next = nodes[i];
    if (row.length === 0 || worst(row, len) >= worst([...row, next], len)) { row.push(next); i++; }
    else { layoutRow(row); row = []; }
  }
  if (row.length) layoutRow(row);
  return result;
}
