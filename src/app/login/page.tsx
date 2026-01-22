'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { User, Lock, Loader2, ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';

import { useUser } from '@/contexts/user-context';

export default function LoginPage() {
    const router = useRouter();
    const { setUser } = useUser();
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [formData, setFormData] = useState({
        login: '',
        password: '',
    });

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError('');

        try {
            const res = await fetch('/api/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(formData),
            });

            const data = await res.json();

            if (data.success) {
                // Set user in context
                setUser(data.user);
                // Redirect to dashboard/home on success
                router.push('/');
            } else {
                setError(data.message || 'Error al iniciar sesión');
            }
        } catch (err) {
            setError('Error de conexión');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen w-full flex items-center justify-center bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 relative overflow-hidden">
            {/* Decorative background elements */}
            <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none">
                <div className="absolute -top-[50%] -left-[20%] w-[100%] h-[100%] rounded-full bg-blue-500/10 blur-3xl animate-pulse" />
                <div className="absolute top-[20%] right-[10%] w-[50%] h-[50%] rounded-full bg-purple-500/10 blur-3xl animate-pulse delay-1000" />
            </div>

            <div className="w-full max-w-md p-8 relative z-10">
                <div className="bg-white/10 backdrop-blur-xl border border-white/20 rounded-2xl shadow-2xl p-8 transform transition-all hover:scale-[1.01]">
                    <div className="mb-8 text-center">
                        <h1 className="text-3xl font-bold text-white mb-2 tracking-tight">
                            Angeles Soccer
                        </h1>
                        <p className="text-blue-200 text-sm">
                            Sistema de Gestión y Convocatorias
                        </p>
                    </div>

                    <form onSubmit={handleSubmit} className="space-y-6">
                        <div className="space-y-2">
                            <label className="text-xs font-semibold text-blue-200 uppercase tracking-wider ml-1">
                                Usuario
                            </label>
                            <div className="relative group">
                                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-blue-300 group-focus-within:text-white transition-colors">
                                    <User size={18} />
                                </div>
                                <input
                                    type="text"
                                    value={formData.login}
                                    onChange={(e) => setFormData({ ...formData, login: e.target.value })}
                                    className="w-full bg-slate-800/50 border border-slate-600 focus:border-blue-400 text-white placeholder-slate-400 rounded-lg pl-10 pr-4 py-3 outline-none transition-all duration-200 focus:ring-2 focus:ring-blue-500/20"
                                    placeholder="Ingrese su usuario"
                                    required
                                />
                            </div>
                        </div>

                        <div className="space-y-2">
                            <label className="text-xs font-semibold text-blue-200 uppercase tracking-wider ml-1">
                                Contraseña
                            </label>
                            <div className="relative group">
                                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-blue-300 group-focus-within:text-white transition-colors">
                                    <Lock size={18} />
                                </div>
                                <input
                                    type="password"
                                    value={formData.password}
                                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                                    className="w-full bg-slate-800/50 border border-slate-600 focus:border-blue-400 text-white placeholder-slate-400 rounded-lg pl-10 pr-4 py-3 outline-none transition-all duration-200 focus:ring-2 focus:ring-blue-500/20"
                                    placeholder="••••••••"
                                    required
                                />
                            </div>
                        </div>

                        {error && (
                            <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-200 text-sm flex items-center animate-in fade-in slide-in-from-top-2">
                                <span className="mr-2">⚠️</span>
                                {error}
                            </div>
                        )}

                        <button
                            type="submit"
                            disabled={loading}
                            className="w-full bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 text-white font-semibold py-3.5 rounded-lg shadow-lg shadow-blue-500/30 transition-all duration-200 transform active:scale-[0.98] flex items-center justify-center group disabled:opacity-70 disabled:cursor-not-allowed"
                        >
                            {loading ? (
                                <Loader2 className="animate-spin mr-2" size={20} />
                            ) : (
                                <>
                                    Iniciar Sesión
                                    <ArrowRight className="ml-2 group-hover:translate-x-1 transition-transform" size={18} />
                                </>
                            )}
                        </button>
                    </form>
                </div>

                <p className="text-center text-slate-500 text-xs mt-6">
                    © {new Date().getFullYear()} Angeles Soccer. Todos los derechos reservados.
                </p>
            </div>
        </div>
    );
}
