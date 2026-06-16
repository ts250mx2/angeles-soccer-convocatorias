import { NextResponse } from 'next/server';
import { pool } from '@/lib/db';

export const dynamic = 'force-dynamic';

// Normaliza un nombre de estado (mayúsculas, sin acentos) para emparejar SEPOMEX con tblEstados.
function norm(s: string): string {
    return (s || '')
        .toUpperCase()
        .replace(/[ÁÀÂÄ]/g, 'A')
        .replace(/[ÉÈÊË]/g, 'E')
        .replace(/[ÍÌÎÏ]/g, 'I')
        .replace(/[ÓÒÔÖ]/g, 'O')
        .replace(/[ÚÙÛÜ]/g, 'U')
        .replace(/Ñ/g, 'N')
        .trim();
}

// SEPOMEX usa nombres largos; los mapeamos al catálogo tblEstados / tblEscuelas.
const ALIAS: Record<string, string> = {
    'COAHUILA DE ZARAGOZA': 'COAHUILA',
    'CIUDAD DE MEXICO': 'DISTRITO FEDERAL',
    'MEXICO': 'ESTADO DE MEXICO',
    'MICHOACAN DE OCAMPO': 'MICHOACAN',
    'VERACRUZ DE IGNACIO DE LA LLAVE': 'VERACRUZ',
    'BAJA CALIFORNIA': 'BAJA CALIFORNIA NORTE',
};

// Autollenado por código postal desde tblCodigosPostales (catálogo SEPOMEX local).
export async function GET(
    _request: Request,
    { params }: { params: Promise<{ cp: string }> }
) {
    try {
        const { cp } = await params;
        if (!/^\d{5}$/.test(cp ?? '')) {
            return NextResponse.json({ success: false, message: 'Código postal inválido' }, { status: 400 });
        }

        const [rows] = await pool.query(
            'SELECT Colonia, TipoAsentamiento, Municipio, Estado, Ciudad FROM tblCodigosPostales WHERE CodigoPostal = ? ORDER BY Colonia',
            [cp]
        ) as any[];

        if (!rows.length) {
            return NextResponse.json({ success: false, message: 'Código postal no encontrado' }, { status: 404 });
        }

        // Mapear el estado SEPOMEX al nombre canónico de tblEstados (para que coincida con tblEscuelas)
        const [estRows] = await pool.query('SELECT Estado FROM tblEstados') as any[];
        const normToCanon = new Map<string, string>(estRows.map((r: any) => [norm(r.Estado), r.Estado]));
        const estadoSepomex = rows[0].Estado as string;
        const n = norm(estadoSepomex);
        const estado = ALIAS[n] ?? normToCanon.get(n) ?? estadoSepomex;

        const colonias = [...new Set(rows.map((r: any) => r.Colonia).filter(Boolean))].sort((a: any, b: any) =>
            String(a).localeCompare(String(b), 'es')
        );

        return NextResponse.json({
            success: true,
            data: {
                codigoPostal: cp,
                estado,
                estadoSepomex,
                municipio: rows[0].Municipio,
                ciudad: rows[0].Ciudad,
                colonias,
            },
        });
    } catch (error) {
        console.error('Error fetching CP:', error);
        return NextResponse.json(
            { success: false, message: 'Error al consultar el código postal', error: error instanceof Error ? error.message : 'Unknown' },
            { status: 500 }
        );
    }
}
