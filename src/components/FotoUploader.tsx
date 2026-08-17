"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ImagePlus, Trash2, Loader2, AlertCircle } from "lucide-react";
import { FORMATOS_FOTO, MAX_FOTO_BASE64 } from "@/lib/copas-ligas";

/**
 * Carga de una imagen por las tres vías que la gente intenta: arrastrarla, pegarla con
 * Ctrl+V o elegir el archivo.
 *
 * La imagen se reduce en el navegador ANTES de mandarla. Sin ese paso, la foto que sale
 * de un celular pesa varios MB, y como se guarda en la base (tblLigas.Foto) cada
 * consulta del catálogo la arrastraría. Un escudo de 512 px basta de sobra para lo que
 * la pantalla muestra.
 */

/** Lado mayor al que se reduce la imagen. */
const MAX_LADO = 512;

/** Calidad de la recompresión. 0.9 no se nota a la vista y baja mucho el peso. */
const CALIDAD = 0.9;

/**
 * Reduce la imagen y la devuelve como data URI.
 *
 * Se pide WEBP porque conserva la transparencia (los escudos suelen tener fondo
 * transparente) y pesa menos que PNG. Si el navegador no sabe escribirlo, `toDataURL`
 * devuelve PNG por su cuenta: los dos están entre los formatos aceptados, así que no
 * hay que detectar nada.
 */
async function imagenADataUrl(archivo: Blob): Promise<string> {
    const url = URL.createObjectURL(archivo);
    try {
        const img = await new Promise<HTMLImageElement>((resolve, reject) => {
            const el = new Image();
            el.onload = () => resolve(el);
            el.onerror = () => reject(new Error("No se pudo leer la imagen"));
            el.src = url;
        });

        const escala = Math.min(1, MAX_LADO / Math.max(img.width, img.height));
        const ancho = Math.max(1, Math.round(img.width * escala));
        const alto = Math.max(1, Math.round(img.height * escala));

        const canvas = document.createElement("canvas");
        canvas.width = ancho;
        canvas.height = alto;
        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("No se pudo procesar la imagen");
        ctx.drawImage(img, 0, 0, ancho, alto);

        return canvas.toDataURL("image/webp", CALIDAD);
    } finally {
        URL.revokeObjectURL(url);
    }
}

export default function FotoUploader({
    valor,
    onChange,
    alt,
}: {
    /** Data URI de una imagen nueva, URL de la ya guardada, o null si no hay. */
    valor: string | null;
    onChange: (dataUrl: string | null) => void;
    alt: string;
}) {
    const [arrastrando, setArrastrando] = useState(false);
    const [procesando, setProcesando] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const inputArchivo = useRef<HTMLInputElement>(null);

    const procesar = useCallback(
        async (archivo: Blob | undefined | null) => {
            if (!archivo) return;
            setError(null);

            if (!(FORMATOS_FOTO as readonly string[]).includes(archivo.type)) {
                setError("Ese archivo no es una imagen PNG, JPG, WEBP o GIF.");
                return;
            }

            setProcesando(true);
            try {
                const dataUrl = await imagenADataUrl(archivo);
                if (dataUrl.length > MAX_FOTO_BASE64) {
                    setError("La imagen sigue siendo demasiado grande. Prueba con otra.");
                    return;
                }
                onChange(dataUrl);
            } catch {
                setError("No se pudo leer la imagen.");
            } finally {
                setProcesando(false);
            }
        },
        [onChange],
    );

    /* El pegado se escucha en la ventana y no en el recuadro: quien copia un escudo
       aprieta Ctrl+V donde tenga el cursor, no necesariamente encima del recuadro. */
    useEffect(() => {
        const alPegar = (e: ClipboardEvent) => {
            const imagen = Array.from(e.clipboardData?.items ?? []).find((i) =>
                i.type.startsWith("image/"),
            );
            if (!imagen) return;
            e.preventDefault();
            procesar(imagen.getAsFile());
        };
        window.addEventListener("paste", alPegar);
        return () => window.removeEventListener("paste", alPegar);
    }, [procesar]);

    const abrirSelector = () => inputArchivo.current?.click();

    return (
        <div>
            <div
                onDragOver={(e) => {
                    e.preventDefault();
                    setArrastrando(true);
                }}
                onDragLeave={() => setArrastrando(false)}
                onDrop={(e) => {
                    e.preventDefault();
                    setArrastrando(false);
                    procesar(e.dataTransfer.files?.[0]);
                }}
                className={`relative rounded-2xl border-2 border-dashed transition-all overflow-hidden ${
                    arrastrando
                        ? "border-blue-400 bg-blue-500/10"
                        : "border-white/15 bg-white/[0.03] hover:border-white/30"
                }`}
            >
                {valor ? (
                    <div className="relative">
                        {/* Imagen del catálogo: puede ser un data URI recién elegido o la
                            ruta de la ya guardada, así que no pasa por next/image. */}
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                            src={valor}
                            alt={alt}
                            className="w-full h-44 object-contain bg-slate-950/40"
                        />
                        <div className="absolute inset-x-0 bottom-0 flex justify-center gap-2 p-2 bg-gradient-to-t from-black/80 to-transparent">
                            <button
                                type="button"
                                onClick={abrirSelector}
                                className="px-3 py-1.5 rounded-lg bg-white/15 hover:bg-white/25 text-white text-[11px] font-bold transition-colors"
                            >
                                Cambiar
                            </button>
                            <button
                                type="button"
                                onClick={() => {
                                    setError(null);
                                    onChange(null);
                                }}
                                className="px-3 py-1.5 rounded-lg bg-rose-600/80 hover:bg-rose-600 text-white text-[11px] font-bold transition-colors inline-flex items-center gap-1"
                            >
                                <Trash2 size={11} /> Quitar
                            </button>
                        </div>
                    </div>
                ) : (
                    <button
                        type="button"
                        onClick={abrirSelector}
                        className="w-full h-44 flex flex-col items-center justify-center gap-2 text-slate-400 hover:text-slate-200 transition-colors"
                    >
                        {procesando ? (
                            <Loader2 size={26} className="animate-spin text-blue-400" />
                        ) : (
                            <ImagePlus size={26} className="opacity-70" />
                        )}
                        <p className="text-xs font-bold">
                            {procesando ? "Procesando imagen..." : "Arrastra la imagen aquí"}
                        </p>
                        <p className="text-[10px] opacity-70">
                            o pégala con Ctrl+V, o haz clic para elegir el archivo
                        </p>
                    </button>
                )}

                {procesando && valor && (
                    <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                        <Loader2 size={26} className="animate-spin text-blue-400" />
                    </div>
                )}
            </div>

            <input
                ref={inputArchivo}
                type="file"
                accept={FORMATOS_FOTO.join(",")}
                className="hidden"
                onChange={(e) => {
                    procesar(e.target.files?.[0]);
                    // Permite volver a elegir el mismo archivo si algo salió mal.
                    e.target.value = "";
                }}
            />

            {error && (
                <p className="mt-2 text-[11px] text-rose-300 flex items-center gap-1.5">
                    <AlertCircle size={12} className="flex-shrink-0" />
                    {error}
                </p>
            )}
        </div>
    );
}
