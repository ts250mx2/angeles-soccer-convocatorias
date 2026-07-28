"use client";

import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

const BRAND: [number, number, number] = [99, 102, 241]; // Violet-500 matching modal accent

const stamp = () => new Date().toLocaleString("es-MX");
const safeName = (s: string) => s.replace(/[^\w\sáéíóúñÁÉÍÓÚÑ-]/gi, "").replace(/\s+/g, "_").slice(0, 60);

export function exportAnalisisToPdf(analisis: string, title: string, subtitle: string) {
    const doc = new jsPDF({ orientation: "portrait" });
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    const margin = 20;
    const maxWidth = pageW - margin * 2;
    
    // Draw Header Banner on the first page or standard headers on subsequent pages
    const drawHeader = (isFirstPage: boolean) => {
        if (isFirstPage) {
            doc.setFillColor(...BRAND);
            doc.rect(0, 0, pageW, 32, "F");
            doc.setTextColor(255, 255, 255);
            doc.setFont("helvetica", "bold");
            doc.setFontSize(15);
            doc.text(title, margin, 12);
            doc.setFont("helvetica", "normal");
            doc.setFontSize(9);
            doc.text("Ángeles Soccer · Análisis Profundo", margin, 19);
            doc.text(stamp(), pageW - margin, 19, { align: "right" });
            
            if (subtitle) {
                doc.text(subtitle, margin, 25);
            }
        } else {
            doc.setFont("helvetica", "normal");
            doc.setFontSize(8);
            doc.setTextColor(100);
            doc.text("Ángeles Soccer · Análisis Profundo", margin, 12);
            doc.text(stamp(), pageW - margin, 12, { align: "right" });
            doc.setDrawColor(220, 225, 230);
            doc.setLineWidth(0.2);
            doc.line(margin, 14, pageW - margin, 14);
        }
    };

    drawHeader(true);

    let y = 42;
    const bottomMargin = 20;
    
    const checkSpace = (neededHeight: number) => {
        if (y + neededHeight > pageH - bottomMargin) {
            doc.addPage();
            drawHeader(false);
            y = 25; // Reset Y coordinate for new page
        }
    };

    // Split markdown into lines
    const rawLines = analisis.split('\n');
    
    // Group lines into paragraphs, lists, and tables
    const blocks: Array<
        | { type: 'heading'; level: number; text: string }
        | { type: 'paragraph'; text: string }
        | { type: 'list-item'; text: string }
        | { type: 'table'; headers: string[]; rows: string[][] }
    > = [];

    let i = 0;
    while (i < rawLines.length) {
        const line = rawLines[i].trim();
        if (!line) {
            i++;
            continue;
        }

        // Table detection
        if (line.startsWith('|')) {
            const tableLines: string[] = [];
            while (i < rawLines.length && rawLines[i].trim().startsWith('|')) {
                tableLines.push(rawLines[i].trim());
                i++;
            }
            if (tableLines.length >= 2) {
                const parseCells = (l: string) => l.split('|')
                    .map(c => c.trim())
                    .filter((_, idx, arr) => idx > 0 && idx < arr.length - 1);
                
                const headers = parseCells(tableLines[0]);
                const rows = tableLines.slice(2).map(parseCells);
                blocks.push({ type: 'table', headers, rows });
            }
            continue;
        }

        // Heading detection
        if (line.startsWith('#')) {
            const match = line.match(/^(#{1,6})\s*(.*)$/);
            if (match) {
                const level = match[1].length;
                const text = match[2];
                blocks.push({ type: 'heading', level, text });
                i++;
                continue;
            }
        }

        // List item detection
        if (line.startsWith('-') || line.startsWith('*')) {
            const text = line.slice(1).trim();
            blocks.push({ type: 'list-item', text });
            i++;
            continue;
        }
        
        const numMatch = line.match(/^(\d+\.)\s*(.*)$/);
        if (numMatch) {
            const text = `${numMatch[1]} ${numMatch[2]}`;
            blocks.push({ type: 'list-item', text });
            i++;
            continue;
        }

        blocks.push({ type: 'paragraph', text: line });
        i++;
    }

    blocks.forEach(block => {
        if (block.type === 'heading') {
            const fontSize = block.level === 1 ? 13 : block.level === 2 ? 11.5 : 10.5;
            doc.setFont("helvetica", "bold");
            doc.setFontSize(fontSize);
            
            checkSpace(12);
            
            y += 4;
            doc.text(block.text, margin, y);
            y += fontSize * 0.5 + 4;
            
        } else if (block.type === 'list-item') {
            doc.setFontSize(9.5);
            const indent = 6;
            
            const segments = block.text.split('**');
            const tokens: { text: string; bold: boolean }[] = [];
            segments.forEach((seg, index) => {
                const isBold = index % 2 === 1;
                const words = seg.split(/(\s+)/);
                words.forEach(w => {
                    if (w) tokens.push({ text: w, bold: isBold });
                });
            });
            
            const itemLines: { text: string; bold: boolean }[][] = [];
            let currentLine: { text: string; bold: boolean }[] = [];
            let currentLineWidth = 0;
            const availableWidth = maxWidth - indent;
            
            tokens.forEach(token => {
                doc.setFont('helvetica', token.bold ? 'bold' : 'normal');
                const tokenWidth = doc.getTextWidth(token.text);
                
                if (currentLineWidth + tokenWidth > availableWidth && currentLine.length > 0) {
                    itemLines.push(currentLine);
                    if (token.text.trim() === '') {
                        currentLine = [];
                        currentLineWidth = 0;
                    } else {
                        currentLine = [token];
                        currentLineWidth = tokenWidth;
                    }
                } else {
                    currentLine.push(token);
                    currentLineWidth += tokenWidth;
                }
            });
            if (currentLine.length > 0) {
                itemLines.push(currentLine);
            }
            
            itemLines.forEach((lineTokens, lineIdx) => {
                checkSpace(5.5);
                
                let currentX = margin + indent;
                if (lineIdx === 0) {
                    doc.setFont('helvetica', 'bold');
                    doc.text('•', margin + 2, y);
                }
                
                lineTokens.forEach(token => {
                    doc.setFont('helvetica', token.bold ? 'bold' : 'normal');
                    doc.text(token.text, currentX, y);
                    currentX += doc.getTextWidth(token.text);
                });
                
                y += 5;
            });
            y += 1.5;
            
        } else if (block.type === 'paragraph') {
            doc.setFontSize(9.5);
            
            const segments = block.text.split('**');
            const tokens: { text: string; bold: boolean }[] = [];
            segments.forEach((seg, index) => {
                const isBold = index % 2 === 1;
                const words = seg.split(/(\s+)/);
                words.forEach(w => {
                    if (w) tokens.push({ text: w, bold: isBold });
                });
            });
            
            const paraLines: { text: string; bold: boolean }[][] = [];
            let currentLine: { text: string; bold: boolean }[] = [];
            let currentLineWidth = 0;
            
            tokens.forEach(token => {
                doc.setFont('helvetica', token.bold ? 'bold' : 'normal');
                const tokenWidth = doc.getTextWidth(token.text);
                
                if (currentLineWidth + tokenWidth > maxWidth && currentLine.length > 0) {
                    paraLines.push(currentLine);
                    if (token.text.trim() === '') {
                        currentLine = [];
                        currentLineWidth = 0;
                    } else {
                        currentLine = [token];
                        currentLineWidth = tokenWidth;
                    }
                } else {
                    currentLine.push(token);
                    currentLineWidth += tokenWidth;
                }
            });
            if (currentLine.length > 0) {
                paraLines.push(currentLine);
            }
            
            paraLines.forEach(lineTokens => {
                checkSpace(5.5);
                
                let currentX = margin;
                lineTokens.forEach(token => {
                    doc.setFont('helvetica', token.bold ? 'bold' : 'normal');
                    doc.text(token.text, currentX, y);
                    currentX += doc.getTextWidth(token.text);
                });
                
                y += 5;
            });
            y += 2.5;
            
        } else if (block.type === 'table') {
            checkSpace(25);
            
            autoTable(doc, {
                startY: y + 2,
                head: [block.headers],
                body: block.rows,
                theme: "grid",
                styles: { fontSize: 8, cellPadding: 2.5 },
                headStyles: { fillColor: BRAND, textColor: 255, fontStyle: "bold" },
                alternateRowStyles: { fillColor: [248, 250, 252] },
                margin: { left: margin, right: margin },
            });
            
            y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 5;
        }
    });

    const pages = doc.getNumberOfPages();
    for (let i = 1; i <= pages; i++) {
        doc.setPage(i);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(8);
        doc.setTextColor(150);
        doc.text("Ángeles Soccer", margin, pageH - 8);
        doc.text(`Página ${i} de ${pages}`, pageW - margin, pageH - 8, { align: "right" });
    }

    doc.save(`Analisis_Profundo_${safeName(subtitle || 'Adeudos')}.pdf`);
}
