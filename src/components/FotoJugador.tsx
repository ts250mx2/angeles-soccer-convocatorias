"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AlertCircle, Camera, Check, ImagePlus, Loader2, RefreshCw, Trash2, User } from "lucide-react";
import { FORMATOS_IMAGEN, dibujaADataUrl, esImagenAceptada, imagenADataUrl } from "@/lib/imagen";
import { MAX_FOTO_JUGADOR } from "@/lib/jugador-form";

/**
 * La foto del jugador, por las cuatro vías por las que llega en la práctica: tomarla
 * con la cámara, arrastrar el archivo, pegarlo con Ctrl+V o buscarlo en el disco.
 *
 * La cámara es la que manda en el mostrador —el niño está enfrente— y las otras tres
 * son para cuando la foto ya existe: la mandó el papá por WhatsApp, está en una carpeta
 * o se copió de otra pantalla.
 *
 * Se recorta a cuadrado y se reduce a 640 px antes de salir del navegador. Es foto de
 * credencial: encuadra la cara, y así pesa decenas de KB en vez de varios MB, que
 * importa porque se guarda dentro de la base (tblJugadores.Foto).
 */

/** Lado de la foto ya recortada. 640 px se ve bien impresa en la hoja y pesa poco. */
const MAX_LADO = 640;

/** La cámara se pide de frente: es un retrato, no una foto del entorno. */
const RESTRICCIONES: MediaStreamConstraints = {
  video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 1280 } },
  audio: false,
};

export default function FotoJugador({
  valor,
  onChange,
  alt,
}: {
  /** Data URI de la foto, o null si el jugador no tiene. */
  valor: string | null;
  onChange: (dataUrl: string | null) => void;
  alt: string;
}) {
  const [arrastrando, setArrastrando] = useState(false);
  const [procesando, setProcesando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [camaraActiva, setCamaraActiva] = useState(false);
  const [abriendoCamara, setAbriendoCamara] = useState(false);

  const inputArchivo = useRef<HTMLInputElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);

  /* Apagar la cámara es obligatorio, no cortesía: mientras el stream siga vivo el foco
     del equipo se queda encendido, y la gente cree que se le está grabando. Se llama al
     tomar la foto, al cancelar y al desmontar el componente. */
  const apagarCamara = useCallback(() => {
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
    if (video.current) video.current.srcObject = null;
    setCamaraActiva(false);
  }, []);

  useEffect(() => apagarCamara, [apagarCamara]);

  const guarda = useCallback(
    (dataUrl: string) => {
      if (dataUrl.length > MAX_FOTO_JUGADOR) {
        setError("La foto sigue pesando demasiado. Prueba con otra.");
        return;
      }
      setError(null);
      onChange(dataUrl);
    },
    [onChange],
  );

  const procesar = useCallback(
    async (archivo: Blob | undefined | null) => {
      if (!archivo) return;
      setError(null);

      if (!esImagenAceptada(archivo.type)) {
        setError("Ese archivo no es una imagen PNG, JPG, WEBP o GIF.");
        return;
      }

      setProcesando(true);
      try {
        guarda(await imagenADataUrl(archivo, { maxLado: MAX_LADO, recorte: "cuadrado" }));
      } catch {
        setError("No se pudo leer la imagen.");
      } finally {
        setProcesando(false);
      }
    },
    [guarda],
  );

  /* El pegado se escucha en la ventana, no en el recuadro: quien copia una foto aprieta
     Ctrl+V donde tenga el cursor. Se apaga mientras la cámara está encendida, para que
     un pegado accidental no tape la toma que se está encuadrando. */
  useEffect(() => {
    if (camaraActiva) return;
    const alPegar = (e: ClipboardEvent) => {
      const imagen = Array.from(e.clipboardData?.items ?? []).find((i) => i.type.startsWith("image/"));
      if (!imagen) return;
      e.preventDefault();
      procesar(imagen.getAsFile());
    };
    window.addEventListener("paste", alPegar);
    return () => window.removeEventListener("paste", alPegar);
  }, [procesar, camaraActiva]);

  const encenderCamara = async () => {
    setError(null);
    setAbriendoCamara(true);
    try {
      /* Sin getUserMedia no hay cámara que pedir. Pasa en HTTP: el navegador solo la
         ofrece en HTTPS o en localhost, así que conviene decir por qué y no dejar el
         botón fallando en silencio. */
      if (!navigator.mediaDevices?.getUserMedia) {
        setError("Este navegador no da acceso a la cámara. Suele faltar HTTPS en el sitio.");
        return;
      }
      const s = await navigator.mediaDevices.getUserMedia(RESTRICCIONES);
      stream.current = s;
      setCamaraActiva(true);
      /* El <video> aparece con `camaraActiva`, así que todavía no existe en este punto:
         se le asigna el stream en el efecto de abajo, ya montado. */
    } catch (e) {
      const nombre = (e as DOMException)?.name;
      setError(
        nombre === "NotAllowedError"
          ? "No se dio permiso para usar la cámara. Habilítalo en el candado de la barra de direcciones."
          : nombre === "NotFoundError"
            ? "No se encontró ninguna cámara conectada."
            : "No se pudo abrir la cámara.",
      );
    } finally {
      setAbriendoCamara(false);
    }
  };

  useEffect(() => {
    if (camaraActiva && video.current && stream.current) {
      video.current.srcObject = stream.current;
    }
  }, [camaraActiva]);

  const tomarFoto = () => {
    const v = video.current;
    if (!v || !v.videoWidth) return;
    try {
      guarda(dibujaADataUrl(v, v.videoWidth, v.videoHeight, { maxLado: MAX_LADO, recorte: "cuadrado" }));
      apagarCamara();
    } catch {
      setError("No se pudo tomar la foto.");
    }
  };

  const abrirSelector = () => inputArchivo.current?.click();

  return (
    <div className="w-full">
      <div
        onDragOver={(e) => { e.preventDefault(); setArrastrando(true); }}
        onDragLeave={() => setArrastrando(false)}
        onDrop={(e) => {
          e.preventDefault();
          setArrastrando(false);
          procesar(e.dataTransfer.files?.[0]);
        }}
        className={`relative aspect-square w-full rounded-2xl border-2 overflow-hidden transition-all ${
          arrastrando
            ? "border-blue-400 border-dashed bg-blue-500/10"
            : valor || camaraActiva
              ? "border-white/20 bg-slate-950/40"
              : "border-white/15 border-dashed bg-white/[0.03] hover:border-white/30"
        }`}
      >
        {camaraActiva ? (
          <>
            {/* Espejo, como se mira uno en el espejo: sin invertir, la gente mueve la
                cabeza al lado contrario tratando de encuadrarse. Solo la vista previa;
                la foto se guarda en su orientación real. */}
            <video
              ref={video}
              autoPlay
              playsInline
              muted
              className="w-full h-full object-cover scale-x-[-1]"
            />
            <div className="absolute inset-x-0 bottom-0 flex justify-center gap-2 p-2.5 bg-gradient-to-t from-black/85 to-transparent">
              <button
                type="button"
                onClick={tomarFoto}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-[11px] font-black transition-colors"
              >
                <Check size={13} strokeWidth={3} /> Tomar
              </button>
              <button
                type="button"
                onClick={apagarCamara}
                className="px-3 py-2 rounded-lg bg-white/15 hover:bg-white/25 text-white text-[11px] font-bold transition-colors"
              >
                Cancelar
              </button>
            </div>
          </>
        ) : valor ? (
          <>
            {/* Puede ser un data URI recién tomado o el que vino de la base, así que no
                pasa por next/image. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={valor} alt={alt} className="w-full h-full object-cover" />
            <div className="absolute inset-x-0 bottom-0 flex justify-center gap-1.5 p-2 bg-gradient-to-t from-black/85 to-transparent">
              <button
                type="button"
                onClick={encenderCamara}
                title="Volver a tomarla con la cámara"
                className="p-2 rounded-lg bg-white/15 hover:bg-white/25 text-white transition-colors"
              >
                <RefreshCw size={13} />
              </button>
              <button
                type="button"
                onClick={abrirSelector}
                className="px-3 py-2 rounded-lg bg-white/15 hover:bg-white/25 text-white text-[11px] font-bold transition-colors"
              >
                Cambiar
              </button>
              <button
                type="button"
                onClick={() => { setError(null); onChange(null); }}
                className="p-2 rounded-lg bg-rose-600/80 hover:bg-rose-600 text-white transition-colors"
                title="Quitar la foto"
              >
                <Trash2 size={13} />
              </button>
            </div>
          </>
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center gap-3 p-4 text-center">
            {procesando || abriendoCamara ? (
              <>
                <Loader2 size={28} className="animate-spin text-blue-400" />
                <p className="text-[11px] font-bold text-slate-400">
                  {abriendoCamara ? "Abriendo la cámara..." : "Procesando la foto..."}
                </p>
              </>
            ) : (
              <>
                <User size={34} className="text-slate-600" />
                <div className="flex flex-col gap-1.5 w-full">
                  <button
                    type="button"
                    onClick={encenderCamara}
                    className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-[11px] font-black transition-colors"
                  >
                    <Camera size={13} /> Tomar con la cámara
                  </button>
                  <button
                    type="button"
                    onClick={abrirSelector}
                    className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-slate-200 text-[11px] font-bold transition-colors"
                  >
                    <ImagePlus size={13} /> Subir archivo
                  </button>
                </div>
                <p className="text-[10px] text-slate-500 leading-snug">
                  o arrástrala aquí, o pégala con Ctrl+V
                </p>
              </>
            )}
          </div>
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
        accept={FORMATOS_IMAGEN.join(",")}
        className="hidden"
        onChange={(e) => {
          procesar(e.target.files?.[0]);
          // Permite volver a elegir el mismo archivo si algo salió mal.
          e.target.value = "";
        }}
      />

      {error && (
        <p className="mt-2 text-[10px] text-rose-300 flex items-start gap-1.5 leading-snug">
          <AlertCircle size={11} className="flex-shrink-0 mt-0.5" />
          {error}
        </p>
      )}
    </div>
  );
}
