"use client";

import { useCallback, useEffect, useRef, useState } from 'react';
import { Brain, X, RefreshCw, AlertTriangle, Sparkles, Download } from 'lucide-react';
import AgentMarkdown from '@/components/AgentMarkdown';
import { exportAnalisisToPdf } from '@/lib/analisis-export';

interface TemporadaLite {
    temporadaNombre?: string;
}

interface Props {
    open: boolean;
    onClose: () => void;
    /** Resumen por sede tal cual lo tiene la página (se envía al backend). */
    sedes: unknown[];
    actual: TemporadaLite | null;
    anterior: TemporadaLite | null;
}

/**
 * Modal de "Análisis Profundo": envía los adeudos (temporada anterior y actual)
 * a Claude Opus 5 y muestra el análisis en markdown. El análisis se genera al
 * abrir el modal; el botón "Regenerar" lo vuelve a solicitar.
 */
export default function AnalisisProfundoModal({ open, onClose, sedes, actual, anterior }: Props) {
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [analisis, setAnalisis] = useState<string | null>(null);

    // Leemos los datos vía ref para que la petición solo se dispare al abrir o al
    // pulsar "Regenerar", no cada vez que el resumen de sedes se refresca de fondo.
    const dataRef = useRef({ sedes, actual, anterior });
    dataRef.current = { sedes, actual, anterior };
    const abortRef = useRef<AbortController | null>(null);

    const runAnalysis = useCallback(async () => {
        abortRef.current?.abort();
        const controller = new AbortController();
        abortRef.current = controller;

        setIsLoading(true);
        setError(null);
        setAnalisis(null);

        try {
            const { sedes: s, actual: a, anterior: p } = dataRef.current;
            const res = await fetch('/api/adeudos/analisis', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ sedes: s, actual: a, anterior: p }),
                signal: controller.signal,
            });
            const json = await res.json();
            if (json.success) {
                setAnalisis(json.analisis);
            } else {
                setError(json.message || 'No se pudo generar el análisis.');
            }
        } catch (e) {
            if ((e as Error)?.name === 'AbortError') return;
            setError('No se pudo conectar con el servicio de análisis.');
        } finally {
            if (!controller.signal.aborted) setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        if (!open) return;
        runAnalysis();
        return () => abortRef.current?.abort();
    }, [open, runAnalysis]);

    // Cerrar con Escape.
    useEffect(() => {
        if (!open) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [open, onClose]);

    if (!open) return null;

    const temporadas = [anterior?.temporadaNombre, actual?.temporadaNombre]
        .filter(Boolean)
        .join(' → ');

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
            onClick={onClose}
        >
            <div
                className="w-full max-w-3xl max-h-[85vh] bg-slate-900 border border-white/10 rounded-2xl shadow-2xl flex flex-col overflow-hidden"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex items-start justify-between gap-4 px-5 py-4 border-b border-white/10 bg-gradient-to-r from-violet-600/15 via-fuchsia-600/10 to-transparent">
                    <div className="flex items-center gap-3 min-w-0">
                        <div className="p-2 rounded-xl bg-violet-500/15 border border-violet-500/25">
                            <Brain size={20} className="text-violet-300" />
                        </div>
                        <div className="min-w-0">
                            <h2 className="text-base font-black text-white flex items-center gap-2">
                                Análisis Profundo
                                <span className="inline-flex items-center gap-1 text-[9px] font-black uppercase tracking-widest text-violet-200 bg-violet-500/20 border border-violet-400/30 rounded-full px-2 py-0.5">
                                    <Sparkles size={10} /> Opus 5
                                </span>
                            </h2>
                            {temporadas && (
                                <p className="text-[11px] text-slate-400 truncate">{temporadas}</p>
                            )}
                        </div>
                    </div>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                        {analisis && !isLoading && (
                            <button
                                type="button"
                                onClick={() => exportAnalisisToPdf(analisis, "Análisis Profundo de Adeudos", temporadas)}
                                title="Exportar a PDF"
                                className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
                            >
                                <Download size={16} />
                            </button>
                        )}
                        <button
                            type="button"
                            onClick={runAnalysis}
                            disabled={isLoading}
                            title="Regenerar análisis"
                            className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                            <RefreshCw size={16} className={isLoading ? 'animate-spin' : ''} />
                        </button>
                        <button
                            type="button"
                            onClick={onClose}
                            title="Cerrar"
                            className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
                        >
                            <X size={18} />
                        </button>
                    </div>
                </div>

                {/* Body */}
                <div className="flex-1 overflow-y-auto px-5 py-4">
                    {isLoading ? (
                        <div className="flex flex-col items-center justify-center py-20 text-center">
                            <div className="relative mb-5">
                                <div className="absolute inset-0 rounded-full bg-violet-500/30 blur-xl animate-pulse" />
                                <div className="relative p-4 rounded-2xl bg-violet-500/10 border border-violet-500/25">
                                    <Brain size={32} className="text-violet-300 animate-pulse" />
                                </div>
                            </div>
                            <p className="text-sm font-black text-white">Analizando con Opus 5…</p>
                            <p className="text-xs text-slate-400 mt-1 max-w-xs">
                                Revisando los adeudos de ambas temporadas. Esto puede tardar un minuto o un poco más.
                            </p>
                        </div>
                    ) : error ? (
                        <div className="flex flex-col items-center justify-center py-16 text-center">
                            <div className="p-3 rounded-2xl bg-rose-500/10 border border-rose-500/25 mb-4">
                                <AlertTriangle size={28} className="text-rose-400" />
                            </div>
                            <p className="text-sm font-black text-rose-300">No se pudo generar el análisis</p>
                            <p className="text-xs text-slate-400 mt-1 max-w-sm">{error}</p>
                            <button
                                type="button"
                                onClick={runAnalysis}
                                className="mt-5 inline-flex items-center gap-2 text-xs font-black uppercase tracking-wider text-white bg-violet-600 hover:bg-violet-500 px-4 py-2 rounded-xl transition-colors"
                            >
                                <RefreshCw size={14} /> Reintentar
                            </button>
                        </div>
                    ) : analisis ? (
                        <AgentMarkdown content={analisis} />
                    ) : null}
                </div>

                {/* Footer */}
                <div className="px-5 py-3 border-t border-white/10 bg-white/[0.02]">
                    <p className="text-[10px] text-slate-500 leading-relaxed">
                        Análisis generado por IA (Claude Opus 5) a partir de los adeudos mostrados. Revísalo antes de tomar decisiones.
                    </p>
                </div>
            </div>
        </div>
    );
}
