"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Download, ExternalLink, Printer, X } from "lucide-react";
import { cerrarPdf, leePdf, leePdfServidor, suscribePdf } from "@/lib/pdf-preview";

/**
 * La presentación preliminar de los PDF: se ve el documento y de ahí se decide.
 *
 * Va montado UNA sola vez en el layout raíz y escucha el almacén de `@/lib/pdf-preview`;
 * las pantallas no lo montan ni saben que existe. Está en el layout raíz y no en
 * DashboardLayout porque así cubre también cualquier pantalla que no pase por él.
 *
 * El documento se pinta en un `<iframe>` con el visor de PDF del propio navegador. No se
 * incrusta una biblioteca para dibujarlo: el visor nativo ya sabe hacer zoom, buscar y
 * pasar páginas, y pesa cero.
 *
 * Imprimir se hace sobre la ventana del iframe. Es lo que funciona en Chrome, Edge y
 * Firefox, pero no en todos los navegadores —Safari es el caso conocido—, así que si
 * falla se abre el documento en otra pestaña, que es de donde siempre se puede imprimir.
 * Por eso el botón de abrir en pestaña está a la vista y no escondido: es la salida
 * cuando lo demás no responde.
 */
export default function VistaPreviaPdf() {
  const doc = useSyncExternalStore(suscribePdf, leePdf, leePdfServidor);
  const iframe = useRef<HTMLIFrameElement>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  // El aviso es de cada documento: al abrir otro no debe arrastrarse el anterior.
  useEffect(() => { setAviso(null); }, [doc?.url]);

  useEffect(() => {
    if (!doc) return;
    const alTeclear = (e: KeyboardEvent) => { if (e.key === "Escape") cerrarPdf(); };
    document.addEventListener("keydown", alTeclear);
    return () => document.removeEventListener("keydown", alTeclear);
  }, [doc]);

  if (!doc) return null;

  const abrirEnPestania = () => window.open(doc.url, "_blank", "noopener,noreferrer");

  const imprimir = () => {
    const ventana = iframe.current?.contentWindow;
    try {
      if (!ventana) throw new Error("sin ventana");
      ventana.focus();
      ventana.print();
    } catch {
      setAviso("Este navegador no deja imprimir desde aquí. Se abrió en otra pestaña: imprime desde ahí.");
      abrirEnPestania();
    }
  };

  return (
    <div className="fixed inset-0 z-[200] flex flex-col bg-black/80 backdrop-blur-md p-3 md:p-6">
      <div className="w-full max-w-6xl mx-auto flex-1 min-h-0 flex flex-col bg-[#0f172a] border border-white/15 rounded-3xl shadow-2xl overflow-hidden">
        {/* Barra de acciones */}
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 md:px-6 py-3 border-b border-white/10 flex-shrink-0">
          <div className="min-w-0">
            <p className="text-[10px] font-black text-blue-300 uppercase tracking-[0.15em]">
              Presentación preliminar
            </p>
            <p className="text-sm font-bold text-white truncate">{doc.nombre}</p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={imprimir}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-black transition-colors shadow-sm"
            >
              <Printer size={14} /> Imprimir
            </button>
            {/* Guardar es un enlace de descarga con el nombre de siempre: es lo que hacía
                `doc.save`, y así el archivo se llama igual que antes de este cambio. */}
            <a
              href={doc.url}
              download={doc.nombre}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black transition-colors shadow-sm"
            >
              <Download size={14} /> Guardar
            </a>
            <button
              onClick={abrirEnPestania}
              title="Abrir en otra pestaña"
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-slate-200 text-xs font-bold transition-colors"
            >
              <ExternalLink size={14} />
              <span className="hidden sm:inline">Pestaña</span>
            </button>
            <button
              onClick={cerrarPdf}
              title="Cerrar (Esc)"
              className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-white/10 transition-all"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {aviso && (
          <p className="px-4 md:px-6 py-2 text-[11px] font-bold text-amber-200 bg-amber-500/10 border-b border-amber-500/25 flex-shrink-0">
            {aviso}
          </p>
        )}

        {/* El documento. `flex-1 min-h-0` es lo que le da altura real dentro del flex;
            sin min-h-0 el iframe crecería y se saldría del recuadro. */}
        <div className="flex-1 min-h-0 bg-slate-950">
          <iframe
            ref={iframe}
            src={doc.url}
            title={doc.nombre}
            className="w-full h-full border-0"
          />
        </div>
      </div>
    </div>
  );
}
