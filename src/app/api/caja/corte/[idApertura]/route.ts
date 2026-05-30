import { NextResponse } from 'next/server';
import { pool } from '@/lib/db';

// Read-only reproduction of frmCorteCajaCaptura Form_Load (VB6).
// All values are SELECT-only; nothing is written to the database.
export const dynamic = 'force-dynamic';

export async function GET(
    request: Request,
    { params }: { params: Promise<{ idApertura: string }> }
) {
    try {
        const { idApertura } = await params;
        const { searchParams } = new URL(request.url);
        const idSede = searchParams.get('idSede');

        if (!idApertura || !idSede) {
            return NextResponse.json(
                { success: false, message: 'Faltan parámetros idApertura / idSede' },
                { status: 400 }
            );
        }

        const idAp = parseInt(idApertura, 10);
        const idSd = parseInt(idSede, 10);

        // ── Datos de la apertura (formas de pago capturadas + fondo) ──
        const [apRows] = await pool.query(
            `SELECT
                AC.IdApertura,
                AC.IdSede,
                S.Sede,
                AC.FechaApertura AS FechaApertura,
                AC.FechaCierre AS FechaCierre,
                COALESCE(AC.FondoCaja, 0)      AS FondoCaja,
                COALESCE(AC.Efectivo, 0)       AS Efectivo,
                COALESCE(AC.TarjetaCredito, 0) AS TarjetaCredito,
                COALESCE(AC.TarjetaDebito, 0)  AS TarjetaDebito,
                COALESCE(AC.Depositos, 0)      AS Depositos,
                COALESCE(AC.Transferencias, 0) AS Transferencias,
                COALESCE(AC.OpenPay, 0)        AS OpenPay,
                COALESCE(AC.Dolares, 0)        AS Dolares,
                AC.IdSupervisorApertura,
                AC.IdSupervisorCierre,
                COALESCE(UA.Usuario, '')       AS UsuarioApertura,
                COALESCE(UC.Usuario, '')       AS UsuarioCierre,
                COALESCE(CJ.Usuario, '')       AS Cajero
            FROM tblAperturasCierres AC
            LEFT JOIN tblSedes    S  ON AC.IdSede = S.IdSede
            LEFT JOIN tblUsuarios UA ON AC.IdSupervisorApertura = UA.IdUsuario
            LEFT JOIN tblUsuarios UC ON AC.IdSupervisorCierre   = UC.IdUsuario
            LEFT JOIN tblUsuarios CJ ON AC.IdCajero             = CJ.IdUsuario
            WHERE AC.IdApertura = ? AND AC.IdSede = ?
            LIMIT 1`,
            [idAp, idSd]
        ) as any[];

        if (apRows.length === 0) {
            return NextResponse.json(
                { success: false, message: 'Apertura no encontrada' },
                { status: 404 }
            );
        }
        const ap = apRows[0];

        // ── Ventas Membresías: IdTipoProducto < 6, excluye dólares (FP 7) ──
        const [vMemb] = await pool.query(
            `SELECT COALESCE(SUM(A.Pago), 0) AS SumPago
             FROM tblPagos A
             LEFT JOIN tblProductos B ON A.IdProducto = B.IdProducto
             WHERE A.IdSedePago = ? AND A.IdApertura = ?
               AND B.IdTipoProducto < 6 AND A.IdFormaPago <> 7 AND A.Status = 0`,
            [idSd, idAp]
        ) as any[];

        // ── Ventas Uniformes: IdTipoProducto = 6, excluye dólares (FP 7) ──
        const [vUnif] = await pool.query(
            `SELECT COALESCE(SUM(A.Pago), 0) AS SumPago
             FROM tblPagos A
             LEFT JOIN tblProductos B ON A.IdProducto = B.IdProducto
             WHERE A.IdSedePago = ? AND A.IdApertura = ?
               AND B.IdTipoProducto = 6 AND A.IdFormaPago <> 7 AND A.Status = 0`,
            [idSd, idAp]
        ) as any[];

        // ── Ventas en dólares: FormaPago 7 ──
        const [vDol] = await pool.query(
            `SELECT COALESCE(SUM(A.Pago), 0) AS SumPago
             FROM tblPagos A
             LEFT JOIN tblProductos B ON A.IdProducto = B.IdProducto
             WHERE A.IdSedePago = ? AND A.IdApertura = ?
               AND A.IdFormaPago = 7 AND A.Status = 0`,
            [idSd, idAp]
        ) as any[];

        // ── Total gastos (excluye dólares FP 7) ──
        const [gTot] = await pool.query(
            `SELECT COALESCE(SUM(A.Total), 0) AS SumTotal
             FROM tblEgresos A
             WHERE A.IdSedePago = ? AND A.IdApertura = ?
               AND A.Status = 0 AND A.IdFormaPago <> 7`,
            [idSd, idAp]
        ) as any[];

        // ── Ventas en efectivo: FormaPago 1 ──
        const [vEf] = await pool.query(
            `SELECT COALESCE(SUM(A.Pago), 0) AS SumPago
             FROM tblPagos A
             LEFT JOIN tblProductos B ON A.IdProducto = B.IdProducto
             WHERE A.IdSedePago = ? AND A.IdApertura = ?
               AND A.Status = 0 AND A.IdFormaPago = 1`,
            [idSd, idAp]
        ) as any[];

        // ── Gastos en efectivo: FormaPago 1 ──
        const [gEf] = await pool.query(
            `SELECT COALESCE(SUM(A.Total), 0) AS SumTotal
             FROM tblEgresos A
             WHERE A.IdSedePago = ? AND A.IdApertura = ?
               AND A.Status = 0 AND A.IdFormaPago = 1`,
            [idSd, idAp]
        ) as any[];

        const num = (v: any) => Number(v) || 0;

        const fondoCaja      = num(ap.FondoCaja);
        const ventasMembresias = num(vMemb[0].SumPago);
        const ventasUniformes  = num(vUnif[0].SumPago);
        const ventasDolares    = num(vDol[0].SumPago);
        const totalGastos      = num(gTot[0].SumTotal);
        const ventasEfectivo   = num(vEf[0].SumPago);
        const gastosEfectivo   = num(gEf[0].SumTotal);

        const efectivoCap   = num(ap.Efectivo);   // EFECTIVO CAPTURA = forma de pago Efectivo
        const dolaresCap    = num(ap.Dolares);

        // ── Cálculos derivados (CambiaTotales del VB6) ──
        const totalVentas    = ventasMembresias + ventasUniformes;
        const efectivoCaja   = fondoCaja + ventasEfectivo - gastosEfectivo;
        const diferencia     = efectivoCap - efectivoCaja;
        const difDolares     = dolaresCap - ventasDolares;

        // Consistente con el card del kanban y la lista: cerrado = tiene FechaCierre.
        const cerrado = ap.FechaCierre != null;

        return NextResponse.json({
            success: true,
            data: {
                idApertura: ap.IdApertura,
                idSede: ap.IdSede,
                sede: ap.Sede,
                fechaApertura: ap.FechaApertura,
                fechaCierre: ap.FechaCierre,
                usuarioApertura: ap.UsuarioApertura,
                usuarioCierre: ap.UsuarioCierre,
                cajero: ap.Cajero,
                cerrado,
                // Bloque Datos
                fondoCaja,
                ventasMembresias,
                ventasUniformes,
                totalVentas,
                ventasDolares,
                totalGastos,
                // Bloque Captura (formas de pago capturadas)
                captura: {
                    efectivo:       num(ap.Efectivo),
                    tarjetaCredito: num(ap.TarjetaCredito),
                    tarjetaDebito:  num(ap.TarjetaDebito),
                    depositos:      num(ap.Depositos),
                    transferencias: num(ap.Transferencias),
                    openPay:        num(ap.OpenPay),
                    dolares:        num(ap.Dolares),
                },
                // Bloque Efectivo (arqueo)
                ventasEfectivo,
                gastosEfectivo,
                efectivoCaja,
                efectivoCaptura: efectivoCap,
                diferencia,
                difDolares,
            },
        });
    } catch (error) {
        console.error('Error fetching corte:', error);
        return NextResponse.json(
            { success: false, message: 'Error al obtener corte', error: error instanceof Error ? error.message : 'Unknown' },
            { status: 500 }
        );
    }
}
