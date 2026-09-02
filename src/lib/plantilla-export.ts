import jsPDF from 'jspdf';
import { presentarPdf } from '@/lib/pdf-preview';
import autoTable from 'jspdf-autotable';
import { etiquetaBeca, type Plantilla, type TonoBeca } from '@/lib/plantilla-equipo';

/**
 * La hoja de plantilla, en PDF y en horizontal: el listado a la izquierda y la cancha a
 * la derecha, como el formato que el club ya usa en papel.
 *
 * La cancha se DIBUJA con las primitivas de jsPDF —rectángulos, líneas y círculos— en
 * vez de fotografiar el HTML. Sale vectorial, así que se ve nítida impresa a cualquier
 * tamaño, no hay que agregar una biblioteca de captura, y sobre todo no depende de que
 * la pantalla esté visible: la hoja se puede generar aunque el navegador tenga la
 * pestaña en segundo plano, que es justo cuando se descarga un lote.
 *
 * Las posiciones vienen en porcentaje, así que pasarlas al papel es una regla de tres
 * contra el rectángulo de la cancha. Es la misma razón por la que se guardan así.
 */

/** Colores de la beca, en RGB, iguales a los de la pantalla. */
const RGB_BECA: Record<TonoBeca, [number, number, number]> = {
    paga: [16, 185, 129],
    parcial: [251, 191, 36],
    total: [244, 63, 94],
};

const VERDE_CANCHA: [number, number, number] = [34, 168, 83];
const VERDE_RAYA: [number, number, number] = [30, 150, 74];

export async function exportarPlantillaPdf(p: Plantilla, temporada = ''): Promise<void> {
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'letter' });
    const anchoHoja = doc.internal.pageSize.getWidth();
    const altoHoja = doc.internal.pageSize.getHeight();
    const MARGEN = 8;

    // ── Membrete ──
    doc.setFillColor(15, 23, 42);
    doc.rect(0, 0, anchoHoja, 18, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(15);
    doc.text('ANGELES', MARGEN, 9);
    doc.setFontSize(7);
    doc.setTextColor(125, 211, 252);
    doc.text('S O C C E R   E L I T E', MARGEN, 14);

    doc.setFontSize(13);
    doc.setTextColor(255, 255, 255);
    doc.text(`ANGELES ${p.equipo}`, anchoHoja - MARGEN, 10, { align: 'right' });
    /* La temporada va en el membrete porque la hoja solo trae a los INSCRITOS en ella:
       sin decirlo, dos impresiones del mismo equipo con distinta gente no se podrían
       distinguir, y la de octubre pasaría por la de agosto. */
    doc.setFontSize(8);
    doc.setTextColor(203, 213, 225);
    doc.text(
        [p.sede, temporada].filter(Boolean).join('  ·  '),
        anchoHoja - MARGEN, 15, { align: 'right' },
    );

    // ── Listado, a la izquierda ──
    const anchoTabla = anchoHoja * 0.42;

    autoTable(doc, {
        startY: 23,
        margin: { left: MARGEN, right: anchoHoja - MARGEN - anchoTabla },
        tableWidth: anchoTabla,
        head: [['E', 'NOMBRE', 'FECHA', 'SEMESTRE', 'COPAS', 'LIGAS']],
        body: p.jugadores.map((j, i) => [
            String(i + 1),
            j.jugador,
            j.fechaNacimiento ?? '',
            etiquetaBeca(j.beca).texto,
            etiquetaBeca(j.becaCopas).texto,
            etiquetaBeca(j.becaLigas).texto,
        ]),
        styles: { fontSize: 6.5, cellPadding: 1.1, lineColor: [148, 163, 184], lineWidth: 0.1 },
        headStyles: { fillColor: [15, 23, 42], textColor: 255, fontSize: 6, fontStyle: 'bold' },
        columnStyles: {
            0: { cellWidth: 6, halign: 'center' },
            2: { cellWidth: 18, halign: 'center' },
            3: { cellWidth: 18, halign: 'center', fontStyle: 'bold' },
            4: { cellWidth: 15, halign: 'center', fontStyle: 'bold' },
            5: { cellWidth: 15, halign: 'center', fontStyle: 'bold' },
        },
        /* Las tres columnas de beca se pintan del color que les toca, que es lo que hace
           legible la hoja de un vistazo: el rojo del 100% salta sin tener que leerla. */
        didParseCell: (datos) => {
            if (datos.section !== 'body' || datos.column.index < 3) return;
            const jugador = p.jugadores[datos.row.index];
            const pct = [jugador.beca, jugador.becaCopas, jugador.becaLigas][datos.column.index - 3];
            const { tono } = etiquetaBeca(pct);
            datos.cell.styles.fillColor = RGB_BECA[tono];
            datos.cell.styles.textColor = tono === 'parcial' ? [15, 23, 42] : [255, 255, 255];
        },
    });

    // ── El pie del listado: cuándo y dónde entrena ──
    const finTabla = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;
    doc.setDrawColor(15, 23, 42);
    doc.setLineWidth(0.4);
    doc.rect(MARGEN, finTabla + 4, anchoTabla, 12);
    doc.setTextColor(15, 23, 42);
    doc.setFontSize(7.5);
    doc.text(p.horario || 'HORARIO SIN CAPTURAR', MARGEN + 2.5, finTabla + 9);
    doc.text(`SEDE ${p.sede || '—'}`.toUpperCase(), MARGEN + 2.5, finTabla + 13.5);

    // ── La cancha, a la derecha ──
    const izq = MARGEN + anchoTabla + 6;
    const arriba = 23;
    const anchoCancha = anchoHoja - izq - MARGEN;
    const altoCancha = altoHoja - arriba - MARGEN - 14;

    dibujaCancha(doc, izq, arriba + 14, anchoCancha, altoCancha);

    // Cuerpo técnico, encima de la cancha
    doc.setFillColor(14, 165, 233);
    doc.roundedRect(izq, arriba, 62, 6, 1, 1, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(7.5);
    doc.text(`DT. ${(p.dt || 'SIN ASIGNAR').toUpperCase()}`, izq + 2, arriba + 4.2);

    doc.setDrawColor(15, 23, 42);
    doc.setFillColor(255, 255, 255);
    doc.roundedRect(izq, arriba + 7, 62, 6, 1, 1, 'FD');
    doc.setTextColor(15, 23, 42);
    doc.text(`AUX. ${(p.auxiliar || '').toUpperCase()}`, izq + 2, arriba + 11.2);

    // Los nombres, en su lugar
    for (const j of p.jugadores) {
        if (j.x === null || j.y === null) continue;
        dibujaNombre(
            doc,
            izq + (j.x / 100) * anchoCancha,
            arriba + 14 + (j.y / 100) * altoCancha,
            `${j.dorsal ? `${j.dorsal} · ` : ''}${nombreCortoPdf(j.jugador)}`,
            j.inscrito,
        );
    }

    /* La leyenda del asterisco solo aparece cuando hay a quién explicarle: una hoja con
       todos inscritos no tiene por qué cargar una nota que no aplica. */
    const sinInscripcion = p.jugadores.filter((j) => j.x !== null && !j.inscrito).length;
    if (sinInscripcion > 0) {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(6.5);
        doc.setTextColor(146, 64, 14);
        doc.text(
            `* ${sinInscripcion} ${sinInscripcion === 1 ? 'jugador sin inscripcion' : 'jugadores sin inscripcion'} en ${temporada || 'la temporada'}`,
            izq,
            altoHoja - MARGEN + 1,
        );
    }

    presentarPdf(doc, `Plantilla_${p.equipo || 'equipo'}.pdf`);
}

/** El césped y sus rayas. */
function dibujaCancha(doc: jsPDF, x: number, y: number, ancho: number, alto: number): void {
    doc.setFillColor(...VERDE_CANCHA);
    doc.roundedRect(x, y, ancho, alto, 2, 2, 'F');

    // Las franjas del corte del pasto, que es lo que hace que se lea como una cancha.
    doc.setFillColor(...VERDE_RAYA);
    const franjas = 8;
    for (let i = 0; i < franjas; i += 2) {
        doc.rect(x, y + (i * alto) / franjas, ancho, alto / franjas, 'F');
    }

    doc.setDrawColor(255, 255, 255);
    doc.setLineWidth(0.5);

    const m = 3;
    doc.rect(x + m, y + m, ancho - 2 * m, alto - 2 * m);
    doc.line(x + m, y + alto / 2, x + ancho - m, y + alto / 2);
    doc.circle(x + ancho / 2, y + alto / 2, ancho * 0.11);

    // Áreas grandes y chicas, arriba y abajo.
    for (const [alturaGrande, anchoRel] of [[0.14, 0.46], [0.06, 0.24]] as const) {
        const a = anchoRel * ancho;
        const h = alturaGrande * alto;
        doc.rect(x + (ancho - a) / 2, y + m, a, h);
        doc.rect(x + (ancho - a) / 2, y + alto - m - h, a, h);
    }
}

/**
 * Un nombre en su recuadro, centrado en el punto.
 *
 * El de quien NO está inscrito sale en ámbar y con un asterisco. La hoja impresa es la
 * que acaba en el pizarrón y en la mano del profe, así que es justo donde el aviso tiene
 * que sobrevivir: en la pantalla siempre se puede preguntar, en el papel no.
 */
function dibujaNombre(doc: jsPDF, cx: number, cy: number, texto: string, inscrito: boolean): void {
    const etiqueta = inscrito ? texto : `* ${texto}`;
    doc.setFontSize(6);
    doc.setFont('helvetica', 'bold');
    const ancho = doc.getTextWidth(etiqueta) + 3;
    const alto = 4.5;

    /* Cada color en su variable y no en un ternario dentro del spread: el ternario da
       una union de tuplas que TypeScript no deja esparcir. */
    const fondo: [number, number, number] = inscrito ? [255, 255, 255] : [254, 243, 199];
    const borde: [number, number, number] = inscrito ? [15, 23, 42] : [217, 119, 6];
    const tinta: [number, number, number] = inscrito ? [15, 23, 42] : [146, 64, 14];

    doc.setFillColor(...fondo);
    doc.setDrawColor(...borde);
    doc.setLineWidth(inscrito ? 0.3 : 0.5);
    doc.roundedRect(cx - ancho / 2, cy - alto / 2, ancho, alto, 0.6, 0.6, 'FD');

    doc.setTextColor(...tinta);
    doc.text(etiqueta, cx, cy + 1.3, { align: 'center' });
}

/** Igual que en la pantalla: en la cancha el nombre completo no cabe. */
const nombreCortoPdf = (completo: string): string =>
    String(completo ?? '').trim().split(/\s+/).slice(0, 3).join(' ').toUpperCase();
