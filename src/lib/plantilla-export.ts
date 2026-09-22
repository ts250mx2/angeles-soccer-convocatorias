import jsPDF from 'jspdf';
import { presentarPdf } from '@/lib/pdf-preview';
import autoTable from 'jspdf-autotable';
import { etiquetaBeca, sinAlta, type Plantilla, type TonoBeca } from '@/lib/plantilla-equipo';
import { nombreEquipo } from '@/lib/categoria-equipo';

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
 *
 * ── Los dos avisos, y por qué van escritos y no solo coloreados ──
 *
 * En la hoja caben dos clases de marcados: el que no tiene inscripción pagada (*, ámbar)
 * y el que TODAVÍA NO ESTÁ DADO DE ALTA (**, rojo) porque es un preregistro. Esta hoja
 * es la que acaba impresa y pegada en el pizarrón, muchas veces en blanco y negro, así
 * que el color solo no basta: los dos llevan su símbolo delante del nombre y su renglón
 * de leyenda al pie. En la pantalla siempre se puede preguntar; en el papel, no.
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
    /* CLUB + SEDE + CATEGORIA: el nombre completo del equipo, el mismo que se lee en
       la pantalla. Ver @/lib/categoria-equipo. */
    doc.text(nombreEquipo(p.sede, p.equipo), anchoHoja - MARGEN, 10, { align: 'right' });
    /* La temporada va en el membrete porque es contra la que se mide la inscripción de
       cada jugador, y de ahí salen los asteriscos de la hoja: sin decir cuál es, dos
       impresiones del mismo equipo con distintos marcados no se podrían distinguir, y la
       de octubre pasaría por la de agosto. */
    doc.setFontSize(8);
    doc.setTextColor(203, 213, 225);
    /* Aqui ya solo la temporada: la sede pasó a formar parte del nombre del equipo, en
       el renglon de arriba, y repetirla haria dudar de si son dos cosas distintas. */
    doc.text(temporada, anchoHoja - MARGEN, 15, { align: 'right' });

    // ── Listado, a la izquierda ──
    const anchoTabla = anchoHoja * 0.42;

    autoTable(doc, {
        startY: 23,
        margin: { left: MARGEN, right: anchoHoja - MARGEN - anchoTabla },
        tableWidth: anchoTabla,
        head: [['E', 'NOMBRE', 'FECHA', 'SEMESTRE', 'COPAS', 'LIGAS']],
        /* El asterisco del nombre es el MISMO aviso que la pantalla pone al lado y que
           la cancha pinta en ámbar. Va también en el listado y no solo en el campo: la
           hoja impresa lleva al equipo completo, y quien la lee sin la pantalla enfrente
           tiene que poder ver de quién se trata sin buscarlo entre los recuadros. */
        body: p.jugadores.map((j, i) => [
            String(i + 1),
            sinAlta(j) ? `** ${j.jugador}` : j.inscrito ? j.jugador : `* ${j.jugador}`,
            j.fechaNacimiento ?? '',
            /* El preregistro no tiene ficha, así que no tiene becas que imprimir: las
               tres columnas van vacías en vez de decir "PAGA", que afirmaría que no
               tiene descuento cuando lo que pasa es que nadie se lo ha asignado. */
            sinAlta(j) ? '' : etiquetaBeca(j.beca).texto,
            sinAlta(j) ? '' : etiquetaBeca(j.becaCopas).texto,
            sinAlta(j) ? '' : etiquetaBeca(j.becaLigas).texto,
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
            if (datos.section !== 'body') return;
            const jugador = p.jugadores[datos.row.index];
            /* El renglón del que no está dado de alta va en rojo de punta a punta: es la
               fila entera la que no corresponde a un jugador del sistema. */
            if (sinAlta(jugador)) {
                datos.cell.styles.textColor = [159, 18, 57];
                if (datos.column.index === 1) datos.cell.styles.fontStyle = 'bold';
                return;
            }
            if (datos.column.index < 3) return;
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
            sinAlta(j) ? 'sin-alta' : j.inscrito ? 'normal' : 'sin-inscripcion',
        );
    }

    /* Las leyendas solo aparecen cuando hay a quién explicarles: una hoja sin marcados
       no tiene por qué cargar notas que no aplican. Cuentan a TODOS los marcados, en la
       cancha o en el listado, porque el símbolo sale en los dos.

       La de los preregistros va arriba y en rojo: es la más fuerte de las dos, porque no
       habla de un pago pendiente sino de alguien que el sistema todavía no conoce. */
    const marcados: Array<{ texto: string; color: [number, number, number] }> = [];

    const sinDarDeAlta = p.jugadores.filter(sinAlta).length;
    if (sinDarDeAlta > 0) {
        marcados.push({
            texto: `** ${sinDarDeAlta} ${sinDarDeAlta === 1 ? 'preregistro AUN SIN DAR DE ALTA' : 'preregistros AUN SIN DAR DE ALTA'}: el alta la hace el sistema de escritorio`,
            color: [159, 18, 57],
        });
    }

    const sinInscripcion = p.jugadores.filter((j) => !sinAlta(j) && !j.inscrito).length;
    if (sinInscripcion > 0) {
        marcados.push({
            texto: `* ${sinInscripcion} ${sinInscripcion === 1 ? 'jugador sin inscripcion' : 'jugadores sin inscripcion'} en ${temporada || 'la temporada'}`,
            color: [146, 64, 14],
        });
    }

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.5);
    marcados.forEach(({ texto, color }, i) => {
        doc.setTextColor(...color);
        // De abajo hacia arriba, para que la última quede pegada al borde de la hoja.
        doc.text(texto, izq, altoHoja - MARGEN + 1 - (marcados.length - 1 - i) * 3.2);
    });

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

/** Cómo sale un nombre en la cancha impresa. */
type MarcaNombre = 'normal' | 'sin-inscripcion' | 'sin-alta';

/* Cada estado con sus colores y su símbolo. En una tabla y no en ternarios encadenados
   porque son tres estados por cuatro propiedades: encadenados, agregar el cuarto obliga
   a tocar cuatro expresiones y que las cuatro queden de acuerdo. */
const MARCAS: Record<MarcaNombre, {
    simbolo: string;
    fondo: [number, number, number];
    borde: [number, number, number];
    tinta: [number, number, number];
    grosor: number;
}> = {
    normal: {
        simbolo: '', fondo: [255, 255, 255], borde: [15, 23, 42], tinta: [15, 23, 42], grosor: 0.3,
    },
    'sin-inscripcion': {
        simbolo: '* ', fondo: [254, 243, 199], borde: [217, 119, 6], tinta: [146, 64, 14], grosor: 0.5,
    },
    'sin-alta': {
        simbolo: '** ', fondo: [255, 228, 230], borde: [225, 29, 72], tinta: [159, 18, 57], grosor: 0.7,
    },
};

/**
 * Un nombre en su recuadro, centrado en el punto.
 *
 * El de quien NO está inscrito sale en ámbar con un asterisco, y el del preregistro que
 * todavía NO ESTÁ DADO DE ALTA en rojo con dos. La hoja impresa es la que acaba en el
 * pizarrón y en la mano del profe, así que es justo donde el aviso tiene que sobrevivir:
 * en la pantalla siempre se puede preguntar, en el papel no.
 */
function dibujaNombre(doc: jsPDF, cx: number, cy: number, texto: string, marca: MarcaNombre): void {
    const { simbolo, fondo, borde, tinta, grosor } = MARCAS[marca];
    const etiqueta = `${simbolo}${texto}`;
    doc.setFontSize(6);
    doc.setFont('helvetica', 'bold');
    const ancho = doc.getTextWidth(etiqueta) + 3;
    const alto = 4.5;

    doc.setFillColor(...fondo);
    doc.setDrawColor(...borde);
    doc.setLineWidth(grosor);
    doc.roundedRect(cx - ancho / 2, cy - alto / 2, ancho, alto, 0.6, 0.6, 'FD');

    doc.setTextColor(...tinta);
    doc.text(etiqueta, cx, cy + 1.3, { align: 'center' });
}

/** Igual que en la pantalla: en la cancha el nombre completo no cabe. */
const nombreCortoPdf = (completo: string): string =>
    String(completo ?? '').trim().split(/\s+/).slice(0, 3).join(' ').toUpperCase();
