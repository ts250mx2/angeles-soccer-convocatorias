"use client";

import jsPDF from "jspdf";
import { presentarPdf } from "@/lib/pdf-preview";
import autoTable from "jspdf-autotable";
import { TEXTO_MARCA, etiquetaMes, type DiaClase, type Marca } from "@/lib/asistencia";

/**
 * La hoja de asistencia en PDF, calcada de la que el club usa en papel.
 *
 * Vertical y no horizontal como la Plantilla: la hoja es una lista de nombres larga y
 * pocas columnas, y en horizontal cabrían diez alumnos por página. Es además el formato
 * en el que ya está impresa y el que la gente reconoce.
 *
 * Sale en dos versiones y la diferencia es una sola: si se pintan las marcas o no.
 *
 *   - En BLANCO, para llevarla a la cancha y llenarla a mano. Es el uso que la hoja
 *     tiene hoy, y no desaparece porque el sistema ya pueda capturar: en la cancha no
 *     siempre hay señal, y una tabla en la mano no se queda sin pila.
 *   - CON LO CAPTURADO, para archivarla o revisarla.
 *
 * Los renglones VACÍOS del final no son un descuido del formato: son para escribir al
 * que llegó después de imprimir. En la hoja de la foto hay tres nombres a mano debajo de
 * los diez impresos, y sin esos renglones no habría dónde ponerlos.
 */

export interface AlumnoHoja {
    idJugador: number;
    jugador: string;
    /** Lo que va en la columna OBSERVACION (BECA). Vacío si no tiene beca. */
    observacion: string;
    /** Tiene foto en su ficha; la imagen la sirve /api/jugadores/foto. */
    tieneFoto?: boolean;
    /** Sello para romper el caché del navegador cuando la foto cambia. */
    fotoVersion?: string | null;
    /** Meses de mensualidad vencidos sin pagar. 0 en quien está al corriente. */
    mesesDebe?: number;
    /** false = no se ha inscrito en la temporada; su pendiente es la inscripción. */
    inscrito?: boolean;
}

export interface HojaAsistencia {
    equipo: string;
    sede: string;
    profesor: string;
    auxiliar: string;
    horario: string;
    anio: number;
    mes: number;
    dias: DiaClase[];
    alumnos: AlumnoHoja[];
}

/** Renglones en blanco al final, para los que lleguen después de imprimir. */
const RENGLONES_LIBRES = 5;

const safeName = (s: string) => s.replace(/[^\w\sáéíóúñÁÉÍÓÚÑ-]/gi, "").replace(/\s+/g, "_").slice(0, 60);

const TINTA: [number, number, number] = [15, 23, 42];
const RAYA: [number, number, number] = [100, 116, 139];
const VERDE: [number, number, number] = [16, 185, 129];
const ROJO: [number, number, number] = [244, 63, 94];

export function exportarAsistenciaPdf(
    hoja: HojaAsistencia,
    marcas: Map<string, Marca>,
    { conMarcas }: { conMarcas: boolean },
): void {
    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "letter" });
    const anchoHoja = doc.internal.pageSize.getWidth();
    const altoHoja = doc.internal.pageSize.getHeight();
    const MARGEN = 12;

    // ── Encabezado, centrado como en el papel ──
    doc.setTextColor(...TINTA);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(17);
    doc.text((hoja.sede || "SIN SEDE").toUpperCase(), anchoHoja / 2, 16, { align: "center" });

    doc.setFontSize(13);
    doc.text(`CATEGORIA: ${hoja.equipo.toUpperCase()}`, anchoHoja / 2, 23, { align: "center" });
    doc.text(hoja.horario || "HORARIO SIN CAPTURAR", anchoHoja / 2, 29.5, { align: "center" });
    doc.text(`PROF: ${(hoja.profesor || "SIN ASIGNAR").toUpperCase()}`, anchoHoja / 2, 36, { align: "center" });

    doc.setFontSize(11);
    doc.text(etiquetaMes(hoja.anio, hoja.mes), anchoHoja / 2, 44, { align: "center" });

    // ── La tabla ──
    const renglones = [
        ...hoja.alumnos.map((a, i) => [
            String(i + 1),
            a.jugador.toUpperCase(),
            a.observacion,
            ...hoja.dias.map((d) =>
                conMarcas ? (TEXTO_MARCA[marcas.get(`${a.idJugador}|${d.fecha}`) as Marca] ?? "") : "",
            ),
        ]),
        ...Array.from({ length: RENGLONES_LIBRES }, (_, i) => [
            String(hoja.alumnos.length + i + 1),
            "",
            "",
            ...hoja.dias.map(() => ""),
        ]),
    ];

    /* Las columnas de días se reparten el ancho que sobra. Con muchos días el nombre no
       puede achicarse sin volverse ilegible, así que el que cede es el ancho por día,
       con un piso: por debajo de 7 mm no cabe una palomita a mano. */
    const anchoTabla = anchoHoja - MARGEN * 2;
    const anchoDia = Math.max(7, Math.min(11, (anchoTabla - 8 - 62 - 34) / Math.max(1, hoja.dias.length)));

    autoTable(doc, {
        startY: 48,
        margin: { left: MARGEN, right: MARGEN },
        tableWidth: anchoTabla,
        head: [["", "NOMBRE DEL ALUMNO", "OBSERVACION (BECA)", ...hoja.dias.map((d) => d.etiqueta)]],
        body: renglones,
        theme: "grid",
        styles: {
            fontSize: 8,
            cellPadding: { top: 1.9, bottom: 1.9, left: 1.4, right: 1.4 },
            lineColor: RAYA,
            lineWidth: 0.15,
            textColor: TINTA,
        },
        headStyles: {
            fillColor: [226, 232, 240],
            textColor: TINTA,
            fontSize: 7,
            fontStyle: "bold",
            halign: "center",
        },
        columnStyles: {
            0: { cellWidth: 8, halign: "center", fontSize: 7, textColor: RAYA },
            1: { cellWidth: 62 },
            2: { cellWidth: 34, fontSize: 6.5, textColor: RAYA },
        },
        didParseCell: (datos) => {
            // Las columnas de días van centradas y anchas iguales.
            if (datos.column.index >= 3) {
                datos.cell.styles.cellWidth = anchoDia;
                datos.cell.styles.halign = "center";
                datos.cell.styles.fontStyle = "bold";
                datos.cell.styles.fontSize = 9;
                if (datos.section === "body") {
                    // Verde la palomita, rojo la F: la hoja se lee de un vistazo.
                    const texto = String(datos.cell.raw ?? "");
                    if (texto === TEXTO_MARCA.A) datos.cell.styles.textColor = VERDE;
                    else if (texto === TEXTO_MARCA.F) datos.cell.styles.textColor = ROJO;
                }
            }
            // Los renglones libres van más altos: se escriben a mano.
            if (datos.section === "body" && datos.row.index >= hoja.alumnos.length) {
                datos.cell.styles.minCellHeight = 7;
            }
        },
    });

    // ── El recuadro de OBSERVACIONES del pie ──
    const finTabla = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;
    const alto = 22;
    const y = Math.min(finTabla + 6, altoHoja - MARGEN - alto);
    doc.setDrawColor(...TINTA);
    doc.setLineWidth(0.3);
    doc.rect(MARGEN, y, anchoTabla, alto);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.text("OBSERVACIONES", MARGEN + 2, y + 5);
    // Renglones para escribir dentro del recuadro.
    doc.setDrawColor(...RAYA);
    doc.setLineWidth(0.1);
    for (let i = 1; i <= 3; i++) {
        const ry = y + 5 + i * 4.2;
        if (ry < y + alto - 1) doc.line(MARGEN + 2, ry, MARGEN + anchoTabla - 2, ry);
    }

    const nombre = `Asistencia_${safeName(hoja.equipo)}_${safeName(etiquetaMes(hoja.anio, hoja.mes))}`;
    presentarPdf(doc, `${nombre}.pdf`);
}
