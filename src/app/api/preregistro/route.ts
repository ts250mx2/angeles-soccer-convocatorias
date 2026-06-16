import { NextResponse } from 'next/server';
import { pool } from '@/lib/db';

export const dynamic = 'force-dynamic';

const str = (v: any, max: number): string | null => {
    if (v === undefined || v === null) return null;
    const s = String(v).trim();
    if (!s) return null;
    return s.slice(0, max);
};

// Todas las capturas se guardan en MAYÚSCULAS, excepto los correos electrónicos.
const up = (v: any, max: number): string | null => {
    const s = str(v, max);
    return s ? s.toUpperCase() : null;
};

const isEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);

function calcAge(dobStr: string): number | null {
    const dob = new Date(dobStr);
    if (isNaN(dob.getTime())) return null;
    const today = new Date();
    let age = today.getFullYear() - dob.getFullYear();
    const m = today.getMonth() - dob.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) age--;
    return age;
}

// Guarda un preregistro público en tblJugadoresPre. El IdSede se resuelve del UUID (no se confía en el cliente).
export async function POST(request: Request) {
    try {
        const body = await request.json();

        // 1) Resolver sede por UUID
        const uuid = str(body.uuid, 45);
        if (!uuid) {
            return NextResponse.json({ success: false, message: 'Enlace inválido' }, { status: 400 });
        }
        const [sedeRows] = await pool.query(
            'SELECT IdSede, Sede FROM tblSedes WHERE UUID = ? LIMIT 1',
            [uuid]
        ) as any[];
        if (!sedeRows.length) {
            return NextResponse.json({ success: false, message: 'Enlace de preregistro no válido' }, { status: 404 });
        }
        const idSede = sedeRows[0].IdSede;

        // 2) Validaciones
        const nombre = up(body.Nombre, 145);
        const apPaterno = up(body.ApellidoPaterno, 145);
        const apMaterno = up(body.ApellidoMaterno, 145);
        if (!nombre || !apPaterno) {
            return NextResponse.json({ success: false, message: 'Nombre y Apellido Paterno son obligatorios' }, { status: 400 });
        }

        const fechaNac = str(body.FechaNacimiento, 10);
        if (!fechaNac) {
            return NextResponse.json({ success: false, message: 'La fecha de nacimiento es obligatoria' }, { status: 400 });
        }
        const age = calcAge(fechaNac);
        if (age === null) {
            return NextResponse.json({ success: false, message: 'Fecha de nacimiento inválida' }, { status: 400 });
        }
        if (age < 3 || age > 18) {
            return NextResponse.json({ success: false, message: 'La edad debe estar entre 3 y 18 años' }, { status: 400 });
        }

        const genero = Number(body.Genero);
        if (genero !== 1 && genero !== 2) {
            return NextResponse.json({ success: false, message: 'Selecciona un género válido' }, { status: 400 });
        }
        const generoDesc = genero === 1 ? 'MASCULINO' : 'FEMENINO';

        const curp = body.CURP ? String(body.CURP).trim().toUpperCase().slice(0, 45) : null;

        const cp = str(body.CodigoPostal, 5);
        if (cp && !/^\d{5}$/.test(cp)) {
            return NextResponse.json({ success: false, message: 'El código postal debe tener 5 dígitos' }, { status: 400 });
        }

        const correoPadre = str(body.CorreoElectronicoPadre, 245);
        if (correoPadre && !isEmail(correoPadre)) {
            return NextResponse.json({ success: false, message: 'Correo del padre inválido' }, { status: 400 });
        }
        const correoMadre = str(body.CorreoElectronicoMadre, 245);
        if (correoMadre && !isEmail(correoMadre)) {
            return NextResponse.json({ success: false, message: 'Correo de la madre inválido' }, { status: 400 });
        }

        const jugadorPre = [nombre, apPaterno, apMaterno].filter(Boolean).join(' ').replace(/\s+/g, ' ').slice(0, 245);
        const idEscuela = body.IdEscuela ? Number(body.IdEscuela) : null;

        // 3) Insert
        const [result] = await pool.query(
            `INSERT INTO tblJugadoresPre
              (JugadorPre, Nombre, ApellidoPaterno, ApellidoMaterno, FechaNacimiento, EntidadNacimiento,
               Genero, GeneroDesc, CURP, ContactoEmergencia,
               Padre, TelPadre, CorreoElectronicoPadre, Madre, TelMadre, CorreoElectronicoMadre,
               Calle, NumExterior, NumInterior, Colonia, CodigoPostal, Municipio, Estado,
               Escuela, IdEscuela, IdSede, FechaAlta, FechaAct, Status)
             VALUES (?,?,?,?,?,?, ?,?,?,?, ?,?,?,?,?,?, ?,?,?,?,?,?,?, ?,?,?, NOW(), NOW(), 0)`,
            [
                jugadorPre, nombre, apPaterno, apMaterno, fechaNac, up(body.EntidadNacimiento, 45),
                genero, generoDesc, curp, up(body.ContactoEmergencia, 245),
                up(body.Padre, 245), up(body.TelPadre, 245), correoPadre,
                up(body.Madre, 245), up(body.TelMadre, 245), correoMadre,
                up(body.Calle, 245), up(body.NumExterior, 45), up(body.NumInterior, 45),
                up(body.Colonia, 245), cp, up(body.Municipio, 45), up(body.Estado, 45),
                up(body.Escuela, 245), Number.isFinite(idEscuela as number) ? idEscuela : null, idSede,
            ]
        ) as any[];

        return NextResponse.json({
            success: true,
            message: 'Preregistro guardado correctamente',
            data: { idJugadorPre: result.insertId, sede: sedeRows[0].Sede },
        });
    } catch (error) {
        console.error('Error saving preregistro:', error);
        return NextResponse.json(
            { success: false, message: 'Error al guardar el preregistro', error: error instanceof Error ? error.message : 'Unknown' },
            { status: 500 }
        );
    }
}
