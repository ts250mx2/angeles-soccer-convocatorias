"use client";

import { useState } from "react";
import { QRCodeCanvas } from "qrcode.react";
import { X, Copy, Check, Download, ExternalLink, Printer, QrCode } from "lucide-react";

/**
 * Código QR del formulario público de preinscripción.
 *
 * Es UNO SOLO para toda la academia, a diferencia del preregistro de jugadores, que
 * tiene un código por sede porque de él saca a qué sede pertenece el alta. Aquí quien
 * contesta todavía no pertenece a ninguna, así que el enlace es fijo (/preincorporacion)
 * y no hay nada que resolver ni que validar.
 */
export default function QrPreincorporacion({ onClose }: { onClose: () => void }) {
    /* El QR necesita la URL absoluta para ser escaneable, y el origen solo existe en el
       navegador. Se lee al montar y no en un efecto: este modal solo se monta al pulsar
       el botón, así que nunca corre en el servidor. El guardia es por si eso cambiara. */
    const [origin] = useState(() => (typeof window === "undefined" ? "" : window.location.origin));
    const [copiado, setCopiado] = useState(false);

    const enlace = origin ? `${origin}/preincorporacion` : "";

    const copiar = async () => {
        try {
            await navigator.clipboard.writeText(enlace);
            setCopiado(true);
            setTimeout(() => setCopiado(false), 1800);
        } catch {
            /* sin portapapeles (http o permiso denegado): el enlace queda a la vista */
        }
    };

    const descargar = () => {
        const canvas = document.getElementById("qr-preincorporacion") as HTMLCanvasElement | null;
        if (!canvas) return;
        const a = document.createElement("a");
        a.href = canvas.toDataURL("image/png");
        a.download = "QR_Preincorporacion.png";
        a.click();
    };

    return (
        <div
            className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-[130] p-4 print:static print:bg-white print:p-0"
            onClick={onClose}
        >
            <div
                className="bg-slate-900 border border-white/15 rounded-2xl w-full max-w-md shadow-2xl print:border-0 print:bg-white print:max-w-none"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="border-b border-white/10 px-6 py-4 flex items-center justify-between print:hidden">
                    <div>
                        <h3 className="text-base font-black text-white flex items-center gap-2">
                            <QrCode size={17} className="text-blue-400" />
                            QR de preinscripción
                        </h3>
                        <p className="text-[11px] text-slate-500 mt-0.5">
                            Uno solo para toda la academia. No pide sede.
                        </p>
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => window.print()}
                            title="Imprimir"
                            className="p-2 rounded-lg bg-white/5 border border-white/15 text-slate-300 hover:bg-white/10 transition-colors"
                        >
                            <Printer size={15} />
                        </button>
                        <button onClick={onClose} className="p-1.5 rounded-lg text-slate-500 hover:text-white hover:bg-white/10 transition-colors">
                            <X size={18} />
                        </button>
                    </div>
                </div>

                <div className="p-6 flex flex-col items-center gap-4">
                    <div className="bg-white rounded-2xl p-5 flex flex-col items-center gap-3">
                        <p className="text-sm font-black text-slate-900 text-center leading-tight">
                            ÁNGELES SOCCER
                            <span className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mt-0.5">
                                Quiero incorporarme
                            </span>
                        </p>
                        <QRCodeCanvas
                            id="qr-preincorporacion"
                            value={enlace}
                            size={232}
                            marginSize={2}
                            level="M"
                            bgColor="#ffffff"
                            fgColor="#0f172a"
                        />
                        <p className="text-[10px] text-slate-500 text-center max-w-[240px] break-all">{enlace}</p>
                    </div>

                    <div className="flex items-center gap-2 print:hidden">
                        <button
                            onClick={copiar}
                            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white/5 border border-white/15 text-slate-300 hover:bg-white/10 text-xs font-bold transition-colors"
                        >
                            {copiado ? <Check size={13} className="text-emerald-400" /> : <Copy size={13} />}
                            {copiado ? "Copiado" : "Copiar enlace"}
                        </button>
                        <button
                            onClick={descargar}
                            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white/5 border border-white/15 text-slate-300 hover:bg-white/10 text-xs font-bold transition-colors"
                        >
                            <Download size={13} /> PNG
                        </button>
                        <a
                            href={enlace}
                            target="_blank"
                            rel="noopener noreferrer"
                            title="Abrir el formulario"
                            className="p-2 rounded-lg bg-white/5 border border-white/15 text-slate-300 hover:bg-white/10 transition-colors"
                        >
                            <ExternalLink size={13} />
                        </a>
                    </div>
                </div>
            </div>
        </div>
    );
}
