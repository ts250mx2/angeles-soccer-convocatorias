"use client";

import { useState } from "react";
import { AlertCircle, Check, Copy, Loader2, MessageCircle, Send } from "lucide-react";

/**
 * "Pedir a los papás": genera la liga con la que el papá sube la foto del jugador
 * desde su celular (ver /foto/[token] y @/lib/foto-token) y la deja lista para
 * repartir.
 *
 * Vive junto al recuadro de la foto en la Hoja de Registro, que es donde uno se da
 * cuenta de que falta. Si la ficha tiene el teléfono del padre o de la madre, el botón
 * de WhatsApp abre el chat DIRECTO con ese número y el mensaje ya escrito; si no,
 * queda el de compartir sin destinatario y el de copiar la liga.
 *
 * La URL se arma con window.location.origin, igual que los QR de preregistro: el
 * servidor firma el token, pero el dominio con el que se comparte lo conoce el
 * navegador.
 */

interface Liga {
  url: string;
  /** Vencimiento ya legible, 'dd/mm/aaaa'. */
  vence: string;
}

/**
 * El número en el formato que exige wa.me: dígitos con lada de país, sin '+'. Los
 * teléfonos de la base son mexicanos de 10 dígitos capturados de mil maneras; a esos
 * se les antepone 52. Si no se le entiende, null: mejor sin botón que un chat ajeno.
 */
function numeroWhatsApp(tel: string | null | undefined): string | null {
  const digitos = String(tel ?? "").replace(/\D/g, "");
  if (digitos.length === 10) return `52${digitos}`;
  if (digitos.length === 12 && digitos.startsWith("52")) return digitos;
  if (digitos.length === 13 && digitos.startsWith("521")) return digitos;
  return null;
}

export default function PedirFotoJugador({
  idJugador,
  nombre,
  telPadre,
  telMadre,
}: {
  idJugador: number;
  /** Nombre completo de la ficha; al mensaje va solo el de pila. */
  nombre: string;
  telPadre?: string | null;
  telMadre?: string | null;
}) {
  const [liga, setLiga] = useState<Liga | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiado, setCopiado] = useState(false);

  const generar = async () => {
    if (cargando) return;
    setCargando(true);
    setError(null);
    try {
      const res = await fetch(`/api/jugadores/liga-foto/${idJugador}`, { cache: "no-store" });
      const json = await res.json();
      if (json.success) {
        setLiga({
          url: `${window.location.origin}/foto/${json.data.token}`,
          vence: new Date(json.data.vence).toLocaleDateString("es-MX"),
        });
      } else {
        setError(json.message ?? "No se pudo generar la liga.");
      }
    } catch {
      setError("Error de conexión al generar la liga.");
    } finally {
      setCargando(false);
    }
  };

  const copiar = async () => {
    if (!liga) return;
    try {
      await navigator.clipboard.writeText(liga.url);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 1800);
    } catch {
      /* Sin clipboard (sitio en HTTP): la liga queda visible abajo para copiarla a mano. */
    }
  };

  const nombrePila = nombre.trim().split(/\s+/)[0] || "su jugador";
  const mensaje = (l: Liga) =>
    `Hola 👋, le saludamos de Ángeles Soccer. ¿Nos ayuda con la foto de credencial de ${nombrePila}? ` +
    `Abra esta liga en su celular, tome la foto y listo (vence el ${l.vence}): ${l.url}`;

  const waDirecto = (tel: string | null | undefined, l: Liga): string | null => {
    const numero = numeroWhatsApp(tel);
    return numero ? `https://wa.me/${numero}?text=${encodeURIComponent(mensaje(l))}` : null;
  };

  if (!liga) {
    return (
      <div className="mt-2">
        <button
          type="button"
          onClick={generar}
          disabled={cargando}
          className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-600/15 hover:bg-emerald-600/25 border border-emerald-500/30 text-emerald-300 text-[11px] font-bold transition-colors disabled:opacity-50"
        >
          {cargando ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}
          Pedir a los papás
        </button>
        {error && (
          <p className="mt-1.5 text-[10px] text-rose-300 flex items-start gap-1 leading-snug">
            <AlertCircle size={11} className="flex-shrink-0 mt-0.5" />
            {error}
          </p>
        )}
      </div>
    );
  }

  const waPadre = waDirecto(telPadre, liga);
  const waMadre = waDirecto(telMadre, liga);
  const waCls =
    "flex-1 flex items-center justify-center gap-1 px-2 py-2 rounded-lg bg-emerald-600/20 hover:bg-emerald-600/35 border border-emerald-500/30 text-emerald-200 text-[10px] font-black transition-colors";

  return (
    <div className="mt-2 rounded-xl border border-emerald-500/25 bg-emerald-500/[0.06] p-2.5 space-y-2">
      <div className="flex gap-1.5">
        {waPadre && (
          <a href={waPadre} target="_blank" rel="noopener noreferrer" className={waCls}>
            <MessageCircle size={11} /> Papá
          </a>
        )}
        {waMadre && (
          <a href={waMadre} target="_blank" rel="noopener noreferrer" className={waCls}>
            <MessageCircle size={11} /> Mamá
          </a>
        )}
        {!waPadre && !waMadre && (
          <a
            href={`https://wa.me/?text=${encodeURIComponent(mensaje(liga))}`}
            target="_blank"
            rel="noopener noreferrer"
            className={waCls}
          >
            <MessageCircle size={11} /> WhatsApp
          </a>
        )}
        <button
          type="button"
          onClick={copiar}
          title="Copiar la liga"
          className="flex items-center justify-center px-2.5 py-2 rounded-lg bg-white/10 hover:bg-white/20 border border-white/10 text-slate-200 transition-colors"
        >
          {copiado ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
        </button>
      </div>

      {/* Visible y seleccionable a propósito: en HTTP el portapapeles no funciona. */}
      <p className="text-[9px] text-slate-500 font-mono break-all leading-tight select-all">{liga.url}</p>

      <p className="text-[9px] text-slate-500 leading-snug">
        El papá abre la liga, toma la foto y la ficha se actualiza sola. Vence el {liga.vence}.
      </p>
    </div>
  );
}
