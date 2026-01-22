'use client';

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';

// Define the shape of the user object based on standard DB fields or requirements
export interface User {
    IdUsuario: number | string;
    Usuario: string;
    login?: string;
    AdminConvocatorias?: number;
    // Add other fields as needed
}

interface UserContextType {
    user: User | null;
    setUser: (user: User | null) => void;
    season: string | null;
    seasonId: string | number | null;
    setSeason: (season: string | null, seasonId: string | number | null) => void;
    isInitialized: boolean;
}

const UserContext = createContext<UserContextType | undefined>(undefined);

export function UserProvider({ children }: { children: ReactNode }) {
    const [user, setUser] = useState<User | null>(null);
    const [season, setSeasonState] = useState<string | null>(null);
    const [seasonId, setSeasonId] = useState<string | number | null>(null);
    const [isInitialized, setIsInitialized] = useState(false);

    const setSeason = (newSeason: string | null, newSeasonId: string | number | null) => {
        setSeasonState(newSeason);
        setSeasonId(newSeasonId);
    };

    // Load from localStorage on mount
    useEffect(() => {
        const storedUser = localStorage.getItem('user');
        const storedSeason = localStorage.getItem('season');
        const storedSeasonId = localStorage.getItem('seasonId');

        if (storedUser) {
            try {
                setUser(JSON.parse(storedUser));
            } catch (error) {
                console.error("Failed to parse user from localStorage", error);
                localStorage.removeItem('user');
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

    // Save to localStorage when user changes
    useEffect(() => {
        if (!isInitialized) return;
        if (user) {
            localStorage.setItem('user', JSON.stringify(user));
        } else {
            localStorage.removeItem('user');
        }
    }, [user, isInitialized]);

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
