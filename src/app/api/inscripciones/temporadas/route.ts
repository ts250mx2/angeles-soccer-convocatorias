import { NextResponse } from 'next/server';
import { pool } from '@/lib/db';

export const dynamic = 'force-dynamic';

// Catálogo de temporadas para el selector de inscripciones.
export async function GET() {
    try {
        const [rows] = await pool.query(
            `SELECT IdTemporada, Temporada, FechaInicio, FechaFin, EsActiva
             FROM tblTemporadas
             ORDER BY IdTemporada DESC`
        ) as any[];

        const data = (rows as any[]).map((r) => ({
            IdTemporada: r.IdTemporada,
            Temporada: r.Temporada,
            FechaInicio: r.FechaInicio,
            FechaFin: r.FechaFin,
            EsActiva: Number(r.EsActiva) === 1,
        }));

        const activa = data.find((t) => t.EsActiva) ?? data[0] ?? null;

        return NextResponse.json({
            success: true,
            data,
            temporadaActiva: activa ? activa.IdTemporada : null,
        });
    } catch (error) {
        console.error('Error fetching temporadas:', error);
        return NextResponse.json(
            { success: false, message: 'Error al obtener temporadas' },
            { status: 500 }
        );
    }
}
