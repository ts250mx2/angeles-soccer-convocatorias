'use client';

import React, { createContext, useCallback, useContext, useMemo, useState, useEffect, ReactNode } from 'react';

// Define the shape of the user object based on standard DB fields or requirements
export interface User {
    IdUsuario: number | string;
    Usuario: string;
    login?: string;
    AdminConvocatorias?: number;
    /** Perfil del usuario: de él cuelgan los permisos de módulo. */
    IdPuesto?: number | null;
    Puesto?: string | null;
    IdSede?: number | null;
}

interface UserContextType {
    user: User | null;
    setUser: (user: User | null) => void;
    /**
     * Módulos que el perfil del usuario tiene concedidos (claves de src/lib/navegacion).
     * `null` mientras no se sabe todavía, para no pintar un menú vacío al arrancar.
     */
    paginas: string[] | null;
    /** Guarda usuario y permisos de una sola vez (lo que devuelve el login). */
    setSesion: (user: User | null, paginas: string[] | null) => void;
    /** El servidor ya confirmó (o negó) la sesión: los permisos son definitivos. */
    sesionVerificada: boolean;
    season: string | null;
    seasonId: string | number | null;
    setSeason: (season: string | null, seasonId: string | number | null) => void;
    isInitialized: boolean;
}

const UserContext = createContext<UserContextType | undefined>(undefined);

const CLAVE_USUARIO = 'user';
const CLAVE_PAGINAS = 'paginas';

export function UserProvider({ children }: { children: ReactNode }) {
    const [user, setUser] = useState<User | null>(null);
    const [paginas, setPaginas] = useState<string[] | null>(null);
    /** El servidor ya contestó (con permisos o con 401): deja de haber "todavía no sé". */
    const [sesionVerificada, setSesionVerificada] = useState(false);
    const [season, setSeasonState] = useState<string | null>(null);
    const [seasonId, setSeasonId] = useState<string | number | null>(null);
    const [isInitialized, setIsInitialized] = useState(false);

    const setSeason = (newSeason: string | null, newSeasonId: string | number | null) => {
        setSeasonState(newSeason);
        setSeasonId(newSeasonId);
    };

    const setSesion = useCallback((nuevoUsuario: User | null, nuevasPaginas: string[] | null) => {
        setUser(nuevoUsuario);
        setPaginas(nuevasPaginas);
    }, []);

    // Load from localStorage on mount
    useEffect(() => {
        const storedUser = localStorage.getItem(CLAVE_USUARIO);
        const storedPaginas = localStorage.getItem(CLAVE_PAGINAS);
        const storedSeason = localStorage.getItem('season');
        const storedSeasonId = localStorage.getItem('seasonId');

        if (storedUser) {
            try {
                setUser(JSON.parse(storedUser));
            } catch (error) {
                console.error("Failed to parse user from localStorage", error);
                localStorage.removeItem(CLAVE_USUARIO);
            }
        }

        if (storedPaginas) {
            try {
                const lista = JSON.parse(storedPaginas);
                if (Array.isArray(lista)) setPaginas(lista);
            } catch {
                localStorage.removeItem(CLAVE_PAGINAS);
            }
        }

        if (storedSeason) {
            setSeasonState(storedSeason);
        }
        if (storedSeasonId) {
            setSeasonId(storedSeasonId);
        }
        setIsInitialized(true);
    }, []);

    /*
     * El servidor manda sobre lo guardado en el navegador: si un administrador cambió el
     * perfil o sus permisos, se corrigen al cargar sin esperar a que el usuario vuelva a
     * entrar. Si no hay cookie válida (401) se deja lo local tal cual: la sesión de
     * cookie es opcional y las pantallas siguen funcionando con lo que ya había.
     */
    useEffect(() => {
        if (!isInitialized) return;
        const controlador = new AbortController();

        fetch('/api/session', { signal: controlador.signal })
            .then((res) => (res.ok ? res.json() : null))
            .then((json) => {
                if (json?.success) {
                    setUser(json.user);
                    setPaginas(Array.isArray(json.paginas) ? json.paginas : []);
                }
                setSesionVerificada(true);
            })
            .catch((error) => {
                /* sin conexión: se conserva lo que había en el navegador */
                if (error?.name !== 'AbortError') setSesionVerificada(true);
            });

        return () => controlador.abort();
    }, [isInitialized]);

    // Save to localStorage when user changes
    useEffect(() => {
        if (!isInitialized) return;
        if (user) {
            localStorage.setItem(CLAVE_USUARIO, JSON.stringify(user));
        } else {
            localStorage.removeItem(CLAVE_USUARIO);
        }
    }, [user, isInitialized]);

    useEffect(() => {
        if (!isInitialized) return;
        if (paginas) {
            localStorage.setItem(CLAVE_PAGINAS, JSON.stringify(paginas));
        } else {
            localStorage.removeItem(CLAVE_PAGINAS);
        }
    }, [paginas, isInitialized]);

    // Save to localStorage when season changes
    useEffect(() => {
        if (!isInitialized) return;
        if (season) {
            localStorage.setItem('season', season);
        } else {
            localStorage.removeItem('season');
        }
        if (seasonId) {
            localStorage.setItem('seasonId', String(seasonId));
        } else {
            localStorage.removeItem('seasonId');
        }
    }, [season, seasonId, isInitialized]);

    const value = {
        user,
        setUser,
        paginas,
        setSesion,
        sesionVerificada,
        season,
        seasonId,
        setSeason,
        isInitialized,
    };

    return <UserContext.Provider value={value}>{children}</UserContext.Provider>;
}

export function useUser() {
    const context = useContext(UserContext);
    if (context === undefined) {
        throw new Error('useUser must be used within a UserProvider');
    }
    return context;
}

/**
 * Permisos del usuario como conjunto, listos para consultar.
 *
 * Mientras el arranque no termina se devuelve `null` en `cargando` para que las
 * pantallas no decidan "no tiene acceso" antes de tiempo.
 */
/**
 * ¿El usuario puede ver este módulo?
 *
 * Devuelve `false` mientras los permisos no se conocen, para que una pantalla no
 * dispare sus peticiones antes de saber si le corresponde verla. Quien lo use como
 * condición de un efecto debe ponerlo en las dependencias: pasa de false a true en
 * cuanto llega la respuesta de /api/session.
 */
export function usePuedeVer(clave: string): boolean {
    const { paginas, cargando } = usePermisos();
    return !cargando && paginas.has(clave);
}

export function usePermisos(): { paginas: ReadonlySet<string>; cargando: boolean } {
    const { paginas, isInitialized, sesionVerificada } = useUser();
    // Memorizado porque el conjunto se usa como dependencia de otros useMemo: uno nuevo
    // en cada render los invalidaría siempre.
    const conjunto = useMemo(() => new Set(paginas ?? []), [paginas]);
    return {
        paginas: conjunto,
        cargando: !isInitialized || (paginas === null && !sesionVerificada),
    };
}
