"use client";

import { useEffect, useState, useCallback } from "react";
import { useUser, usePuedeVer } from "@/contexts/user-context";
import DashboardLayout from "@/components/DashboardLayout";
import { QRCodeCanvas } from "qrcode.react";
import {
  QrCode, MapPin, RefreshCw, AlertCircle, Copy, Check, Download, ExternalLink, Printer,
} from "lucide-react";

interface Sede {
  IdSede: number;
  Sede: string;
  UUID: string;
  Estado: string | null;
}

export default function QrAccesosPage() {
  const { user } = useUser();
  const puedeVer = usePuedeVer("/qr-accesos");

  const [sedes, setSedes] = useState<Sede[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [origin, setOrigin] = useState("");
  const [copiedId, setCopiedId] = useState<number | null>(null);

  const fetchSedes = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/preregistro/sedes`);
      const json = await res.json();
      if (json.success) setSedes(json.data);
      else setError(json.message ?? "Error al cargar las sedes");
    } catch {
      setError("Error de conexión");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  // Si el perfil no tiene el módulo, DashboardLayout pinta "Sin acceso" en lugar de
  // esta pantalla; aquí solo se evita pedir datos que no se van a mostrar.
  useEffect(() => {
    if (!user || !puedeVer) return;
    fetchSedes();
  }, [user, puedeVer]);

  const linkFor = (uuid: string) => (origin ? `${origin}/preregistro/${uuid}` : "");

  const copyLink = async (sede: Sede) => {
    try {
      await navigator.clipboard.writeText(linkFor(sede.UUID));
      setCopiedId(sede.IdSede);
      setTimeout(() => setCopiedId((c) => (c === sede.IdSede ? null : c)), 1800);
    } catch { /* noop */ }
  };

  const downloadPng = (sede: Sede) => {
    const canvas = document.getElementById(`qr-canvas-${sede.IdSede}`) as HTMLCanvasElement | null;
    if (!canvas) return;
    const url = canvas.toDataURL("image/png");
    const a = document.createElement("a");
    a.href = url;
    a.download = `QR_Preregistro_${sede.Sede.replace(/\s+/g, "_")}.png`;
    a.click();
  };

  return (
    <DashboardLayout>
      <main className="overflow-y-auto flex-1 text-white">

        {/* ── Header ── */}
        <div className="bg-white/5 backdrop-blur-xl border-b border-white/10 px-6 py-4 flex justify-between items-center sticky top-0 z-20 print:hidden">
          <div>
            <h1 className="text-xl font-black flex items-center gap-2">
              <QrCode size={20} className="text-blue-400" />
              QR Accesos
            </h1>
            <p className="text-xs text-blue-300 mt-0.5">Códigos QR de preregistro por sede</p>
          </div>
          <div className="flex items-center gap-3">
            <button onClick={() => window.print()} disabled={sedes.length === 0}
              className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300 hover:text-white text-xs font-bold transition-all disabled:opacity-40" title="Imprimir todos">
              <Printer size={15} /><span className="hidden sm:inline">Imprimir</span>
            </button>
            <button onClick={fetchSedes} disabled={isLoading}
              className="p-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-slate-400 hover:text-white transition-all" title="Actualizar">
              <RefreshCw size={15} className={isLoading ? "animate-spin" : ""} />
            </button>
          </div>
        </div>

        <div className="p-6 md:p-8">

          {isLoading && (
            <div className="flex flex-col items-center justify-center py-28 gap-4">
              <div className="w-14 h-14 rounded-full border-4 border-blue-500/20 border-t-blue-500 animate-spin" />
              <p className="text-sm text-slate-400 font-bold animate-pulse">Cargando QR...</p>
            </div>
          )}

          {!isLoading && error && (
            <div className="flex flex-col items-center justify-center py-24 gap-3 text-rose-400">
              <AlertCircle size={44} className="opacity-60" />
              <p className="text-base font-black">{error}</p>
              <button onClick={fetchSedes} className="mt-2 px-5 py-2 rounded-xl bg-rose-500/10 border border-rose-500/20 text-sm font-bold hover:bg-rose-500/20 transition-all">Reintentar</button>
            </div>
          )}

          {!isLoading && !error && sedes.length === 0 && (
            <div className="flex flex-col items-center justify-center py-24 gap-3 text-slate-500">
              <AlertCircle size={48} className="opacity-20" />
              <p className="text-lg font-black">Sin sedes</p>
            </div>
          )}

          {!isLoading && !error && sedes.length > 0 && (
            <>
              <p className="text-xs text-slate-500 mb-5 print:hidden">
                {sedes.length} sede{sedes.length !== 1 ? "s" : ""} · escanea el QR o comparte el enlace para el preregistro público de jugadores.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
                {sedes.map((sede) => {
                  const link = linkFor(sede.UUID);
                  return (
                    <div key={sede.IdSede} className="bg-white/5 border border-white/10 rounded-3xl p-5 flex flex-col items-center text-center shadow-lg break-inside-avoid">
                      {/* Sede */}
                      <div className="flex items-center gap-2 mb-3">
                        <MapPin size={15} className="text-blue-400" />
                        <h3 className="text-base font-black text-white">{sede.Sede}</h3>
                      </div>
                      {sede.Estado && <p className="text-[10px] text-slate-500 uppercase tracking-widest mb-3 -mt-2">{sede.Estado}</p>}

                      {/* QR */}
                      <div className="bg-white rounded-2xl p-3 shadow-inner">
                        {link ? (
                          <QRCodeCanvas
                            id={`qr-canvas-${sede.IdSede}`}
                            value={link}
                            size={176}
                            marginSize={2}
                            level="M"
                            bgColor="#ffffff"
                            fgColor="#0f172a"
                          />
                        ) : (
                          <div className="w-[176px] h-[176px] flex items-center justify-center text-slate-300">
                            <QrCode size={48} />
                          </div>
                        )}
                      </div>

                      {/* Link */}
                      <p className="mt-3 text-[10px] text-slate-500 font-mono break-all leading-tight max-w-full">{link}</p>

                      {/* Acciones */}
                      <div className="mt-4 flex items-center gap-2 w-full print:hidden">
                        <button onClick={() => copyLink(sede)}
                          className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300 hover:text-white text-xs font-bold transition-all">
                          {copiedId === sede.IdSede ? <><Check size={14} className="text-emerald-400" /> Copiado</> : <><Copy size={14} /> Copiar</>}
                        </button>
                        <button onClick={() => downloadPng(sede)}
                          className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-blue-600/20 hover:bg-blue-600/30 border border-blue-500/30 text-blue-200 text-xs font-bold transition-all">
                          <Download size={14} /> PNG
                        </button>
                        <a href={link || "#"} target="_blank" rel="noopener noreferrer"
                          className="flex items-center justify-center px-3 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-slate-400 hover:text-white transition-all" title="Abrir enlace">
                          <ExternalLink size={14} />
                        </a>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </main>
    </DashboardLayout>
  );
}
