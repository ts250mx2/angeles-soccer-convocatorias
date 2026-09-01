"use client";

import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import {
  AlertCircle, Camera, CheckCircle2, ImagePlus, Loader2, RefreshCw,
  Send, Shield, ShieldCheck,
} from "lucide-react";
import { esImagenAceptada, imagenADataUrl } from "@/lib/imagen";
import { MAX_FOTO_JUGADOR } from "@/lib/jugador-form";

/**
 * La página que abre el papá con la liga que le mandó la academia: toma o elige la
 * foto de credencial de su hijo y la manda, sin usuario ni contraseña. El token de la
 * URL es el permiso (ver @/lib/foto-token) y /api/foto-jugador el otro lado.
 *
 * Es pública y móvil, como el preregistro, y enseña lo mínimo: nombre de pila con una
 * inicial y la categoría, nunca la foto ya guardada ni otro dato de la ficha.
 *
 * La cámara se abre con <input capture> y no con getUserMedia como en la Hoja de
 * Registro: en el celular eso levanta la app de cámara nativa —que es lo que el papá
 * ya sabe usar— y además funciona aunque el sitio se sirva sin HTTPS, donde
 * getUserMedia ni aparece.
 *
 * La foto se recorta a cuadrado y se reduce a 640 px AQUÍ, con la misma rutina que la
 * Hoja de Registro (@/lib/imagen): lo que viaja y se guarda pesa decenas de KB, no los
 * varios MB que salen de la cámara.
 */

/** El mismo lado que usa FotoJugador: foto de credencial. */
const MAX_LADO = 640;

interface InfoJugador {
  nombre: string;
  categoria: string | null;
  tieneFoto: boolean;
}

export default function SubirFotoPage() {
  const params = useParams();
  const token = String(params?.token ?? "");

  const [bootLoading, setBootLoading] = useState(true);
  const [linkError, setLinkError] = useState<string | null>(null);
  const [info, setInfo] = useState<InfoJugador | null>(null);

  const [foto, setFoto] = useState<string | null>(null);
  const [procesando, setProcesando] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [enviada, setEnviada] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const inputCamara = useRef<HTMLInputElement>(null);
  const inputGaleria = useRef<HTMLInputElement>(null);

  // ── Boot: ¿de quién es esta liga? ──
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch(`/api/foto-jugador/${token}`);
        const json = await res.json();
        if (!alive) return;
        if (json.success) setInfo(json.data);
        else setLinkError(json.message ?? "Esta liga no es válida o ya venció.");
      } catch {
        if (alive) setLinkError("No se pudo abrir la liga. Revisa tu conexión e inténtalo de nuevo.");
      } finally {
        if (alive) setBootLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [token]);

  const procesar = async (archivo: File | undefined | null) => {
    if (!archivo) return;
    setError(null);

    if (!esImagenAceptada(archivo.type)) {
      setError("Ese archivo no es una foto. Usa la cámara o elige una imagen de tu galería.");
      return;
    }

    setProcesando(true);
    try {
      const dataUrl = await imagenADataUrl(archivo, { maxLado: MAX_LADO, recorte: "cuadrado" });
      if (dataUrl.length > MAX_FOTO_JUGADOR) {
        setError("La foto pesa demasiado. Vuelve a tomarla.");
        return;
      }
      setFoto(dataUrl);
    } catch {
      setError("No se pudo leer la foto. Inténtalo de nuevo.");
    } finally {
      setProcesando(false);
    }
  };

  const enviar = async () => {
    if (!foto || enviando) return;
    setEnviando(true);
    setError(null);
    try {
      const res = await fetch(`/api/foto-jugador/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ foto }),
      });
      const json = await res.json();
      if (json.success) setEnviada(true);
      else setError(json.message ?? "No se pudo enviar la foto. Inténtalo de nuevo.");
    } catch {
      setError("Error de conexión. Revisa tu internet e inténtalo de nuevo.");
    } finally {
      setEnviando(false);
    }
  };

  // ── Pantallas de estado ──
  if (bootLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center gap-3 text-slate-500">
        <Loader2 className="animate-spin text-blue-600" size={36} />
        <p className="text-sm font-semibold">Abriendo la liga...</p>
      </div>
    );
  }

  if (linkError || !info) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center gap-4 p-6 text-center">
        <div className="bg-rose-100 p-4 rounded-2xl"><AlertCircle className="text-rose-500" size={40} /></div>
        <h1 className="text-xl font-black text-slate-800">Liga no válida</h1>
        <p className="text-sm text-slate-500 max-w-xs">
          {linkError ?? "Esta liga no existe o ya venció. Pide una nueva a la academia."}
        </p>
      </div>
    );
  }

  if (enviada) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center gap-4 p-6 text-center">
        <div className="bg-emerald-100 p-4 rounded-2xl"><CheckCircle2 className="text-emerald-600" size={48} /></div>
        <h1 className="text-2xl font-black text-slate-800">¡Foto recibida!</h1>
        <p className="text-sm text-slate-600 max-w-sm">
          La foto de <span className="font-bold">{info.nombre}</span> ya quedó guardada en la academia. ¡Gracias!
        </p>
        <button
          onClick={() => { setFoto(null); setEnviada(false); setError(null); }}
          className="mt-2 inline-flex items-center gap-2 px-5 py-3 rounded-xl border-2 border-blue-600 text-blue-700 bg-white font-bold hover:bg-blue-50 transition"
        >
          <RefreshCw size={16} /> ¿Salió mal? Súbela otra vez
        </button>
      </div>
    );
  }

  // ── Tomar y mandar la foto ──
  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-md mx-auto pb-10">
        <header className="bg-gradient-to-br from-blue-700 to-blue-900 text-white px-5 pt-8 pb-6 rounded-b-3xl shadow-lg">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-white/15 border border-white/20 flex items-center justify-center">
              <Shield size={22} />
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-widest text-blue-200 font-bold">Ángeles Soccer</p>
              <h1 className="text-xl font-black leading-tight">Foto del jugador</h1>
            </div>
          </div>
          <div className="mt-4 text-sm bg-white/10 border border-white/15 rounded-xl px-3 py-2">
            <span className="font-semibold">{info.nombre}</span>
            {info.categoria && <span className="text-blue-200"> · {info.categoria}</span>}
          </div>
        </header>

        <div className="px-4 mt-5 space-y-4">
          {info.tieneFoto && !foto && (
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
              Este jugador ya tiene una foto guardada; la que mandes la va a reemplazar.
            </p>
          )}

          <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
            {/* El recuadro: la foto elegida, o el hueco cuadrado donde va a ir */}
            <div className="relative aspect-square w-full rounded-2xl overflow-hidden border-2 border-dashed border-slate-300 bg-slate-100">
              {foto ? (
                // Vista previa de un data URI recién generado: no pasa por next/image.
                // eslint-disable-next-line @next/next/no-img-element
                <img src={foto} alt={`Foto de ${info.nombre}`} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center gap-2 text-slate-400 p-6 text-center">
                  {procesando ? (
                    <>
                      <Loader2 size={32} className="animate-spin text-blue-600" />
                      <p className="text-xs font-bold text-slate-500">Preparando la foto...</p>
                    </>
                  ) : (
                    <>
                      <Camera size={40} className="opacity-50" />
                      <p className="text-xs font-semibold text-slate-500 leading-snug">
                        De frente y con buena luz, sin gorra ni lentes oscuros: es la foto de su credencial.
                      </p>
                    </>
                  )}
                </div>
              )}
            </div>

            <div className="mt-4 space-y-2">
              {foto ? (
                <>
                  <button
                    type="button"
                    onClick={enviar}
                    disabled={enviando}
                    className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl bg-blue-600 text-white font-black text-base shadow-lg shadow-blue-600/20 hover:bg-blue-700 active:scale-[0.99] transition disabled:opacity-60"
                  >
                    {enviando ? <><Loader2 size={18} className="animate-spin" /> Enviando...</> : <><Send size={18} /> Enviar foto</>}
                  </button>
                  <button
                    type="button"
                    onClick={() => { setFoto(null); setError(null); }}
                    disabled={enviando}
                    className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border-2 border-slate-300 text-slate-600 bg-white font-bold text-sm hover:bg-slate-50 transition disabled:opacity-60"
                  >
                    <RefreshCw size={15} /> Tomar otra
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => inputCamara.current?.click()}
                    disabled={procesando}
                    className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl bg-blue-600 text-white font-black text-base shadow-lg shadow-blue-600/20 hover:bg-blue-700 active:scale-[0.99] transition disabled:opacity-60"
                  >
                    <Camera size={18} /> Tomar la foto
                  </button>
                  <button
                    type="button"
                    onClick={() => inputGaleria.current?.click()}
                    disabled={procesando}
                    className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border-2 border-slate-300 text-slate-600 bg-white font-bold text-sm hover:bg-slate-50 transition disabled:opacity-60"
                  >
                    <ImagePlus size={15} /> Elegir de la galería
                  </button>
                </>
              )}
            </div>

            {error && (
              <p className="mt-3 text-xs text-rose-600 flex items-start gap-1.5 font-medium">
                <AlertCircle size={13} className="flex-shrink-0 mt-0.5" />
                {error}
              </p>
            )}
          </section>

          <p className="text-xs text-slate-400 flex items-center gap-1.5 px-1">
            <ShieldCheck size={13} className="flex-shrink-0" />
            La foto se usa únicamente para la credencial y los formatos de la academia.
          </p>
        </div>
      </div>

      {/* Dos inputs y no uno: `capture` levanta la app de cámara directo, y sin él el
          celular ofrece la galería. Así cada botón hace exactamente lo que dice. */}
      <input
        ref={inputCamara}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          procesar(e.target.files?.[0]);
          // Permite volver a tomar la misma foto si algo salió mal.
          e.target.value = "";
        }}
      />
      <input
        ref={inputGaleria}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          procesar(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
    </div>
  );
}
