import { NextResponse } from 'next/server';
import { pool } from '@/lib/db';
import {
    TIPO_PRODUCTO_INSCRIPCION,
    TIPO_PRODUCTO_MENSUALIDAD,
    DIAS_INSCRIPCION_CERCANA,
} from '@/lib/temporada';

export const dynamic = 'force-dynamic';

const MAX_ROWS = 1000;

/**
 * Pagos de un jugador. Si viene temporadaId se acotan a esa temporada;
 * sin ella se devuelve el histórico completo.
 *
 * tblPagos.FechaPago ya está en hora LOCAL (sigue el reloj NOW() del servidor MySQL:
 * el último pago queda a minutos de NOW() y a ~6 h de UTC_TIMESTAMP()), por lo que
 * NO se le aplica CONVERT_TZ. Se formatea en SQL para que ni mysql2 ni el navegador
 * la vuelvan a desplazar.
 */
export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const idJugador = searchParams.get('idJugador');
        const temporadaId = searchParams.get('temporadaId');

        if (!idJugador) {
            return NextResponse.json(
                { success: false, message: 'Se requiere el jugador' },
                { status: 400 }
            );
        }

        /* Ficha del jugador. Va completa aunque la pantalla sea de pagos: quien revisa
           un historial casi siempre necesita a quien llamar, y tener que salirse a otra
           pantalla por un telefono era el paso que sobraba.

           Las fechas se formatean en SQL y viajan como texto: una fecha de nacimiento es
           un dia del calendario, no un instante, y mandarla como DATETIME la corre un dia
           en cuanto el navegador la interpreta en otro huso. */
        const [jugadorRows] = await pool.query(
            `SELECT
                J.IdJugador,
                J.Jugador,
                J.Categoria,
                J.Status,
                J.Beca,
                COALESCE(S.Sede, J.Sede) as SedeNombre,
                DATE_FORMAT(J.FechaNacimiento, '%d/%m/%Y') as FechaNacimiento,
                TIMESTAMPDIFF(YEAR, J.FechaNacimiento, CURDATE()) as Edad,
                J.Genero, J.GeneroDesc, J.CURP, J.Dorsal, J.NumeroSocio, J.Talla,
                J.Padre, J.TelPadre, J.CorreoElectronicoPadre,
                J.Madre, J.TelMadre, J.CorreoElectronicoMadre,
                J.TelCasa, J.ContactoEmergencia, J.ViveCon,
                J.Escuela, J.BecaCopas, J.BecaLigas, J.Coach, J.Grupo,
                J.Calle, J.NumExterior, J.NumInterior, J.Colonia,
                J.CodigoPostal, J.Municipio, J.Estado,
                DATE_FORMAT(J.FechaAlta, '%d/%m/%Y') as FechaAlta,
                J.Alerta, J.Observaciones, J.MotivoBaja,
                -- La foto no viaja aquí: la sirve /api/jugadores/foto. Solo si la hay
                -- y cuándo cambió, que es lo que la pantalla necesita para pedirla.
                CASE WHEN J.Foto IS NOT NULL AND J.Foto <> '' THEN 1 ELSE 0 END AS TieneFoto,
                DATE_FORMAT(J.FechaAct, '%Y%m%d%H%i%s') AS FotoVersion
             FROM tblJugadores J
             LEFT JOIN tblSedes S ON J.IdSede = S.IdSede
             WHERE J.IdJugador = ?`,
            [parseInt(idJugador)]
        ) as any[];

        if (jugadorRows.length === 0) {
            return NextResponse.json(
                { success: false, message: 'Jugador no encontrado' },
                { status: 404 }
            );
        }

        /* Acotar la temporada por P.IdTemporada no sirve para las mensualidades: bajo
           una temporada hay pagos capturados que amparan meses de otro periodo e incluso
           de otro año (p.ej. bajo AGO-DIC 2026 aparecen meses de 2027). Como el módulo
           de inscripciones define la pertenencia por el mes-año que ampara el pago, aquí
           se usa el mismo criterio para que el detalle coincida con los cuadritos.

           Los demás conceptos (inscripción, liga, copa, ropa) no tienen mes que amparar,
           así que esos sí se acotan por la temporada en que se registraron. */
        const where = ['P.IdJugador = ?', 'P.Status = 0'];
        const params: any[] = [];
        const joinParams: any[] = [];
        let temporadaJoin = '';

        if (temporadaId) {
            temporadaJoin = 'INNER JOIN tblTemporadas TT ON TT.IdTemporada = ?';
            joinParams.push(temporadaId);

            where.push(`(
                (
                    PR.IdTipoProducto = ${TIPO_PRODUCTO_MENSUALIDAD}
                    AND P.Anio IS NOT NULL AND P.Mes BETWEEN 1 AND 12
                    AND (P.Anio * 100 + P.Mes)
                        BETWEEN (YEAR(TT.FechaInicio) * 100 + MONTH(TT.FechaInicio))
                            AND (YEAR(TT.FechaFin) * 100 + MONTH(TT.FechaFin))
                )
                OR (
                    COALESCE(PR.IdTipoProducto, 0) <> ${TIPO_PRODUCTO_MENSUALIDAD}
                    AND P.IdTemporada = ?
                )
            )`);
            params.push(temporadaId);
        }

        params.unshift(parseInt(idJugador));

        const [pagos] = await pool.query(
            `SELECT
                P.IdPago,
                DATE_FORMAT(P.FechaPago, '%d/%m/%Y %H:%i') as FechaPago,
                DATE_FORMAT(P.FechaPago, '%Y-%m-%d %H:%i:%s') as FechaOrden,
                ${temporadaId
                    ? 'TIMESTAMPDIFF(MONTH, P.FechaPago, TT.FechaInicio)'
                    : 'NULL'} as MesesAntesDeTemporada,
                P.Pago,
                P.Mes,
                P.Anio,
                P.Recibo,
                P.Referencia,
                COALESCE(PR.Producto, 'PRODUCTO ELIMINADO') as Producto,
                PR.IdTipoProducto,
                COALESCE(TP.TipoProducto, '-') as TipoProducto,
                COALESCE(F.FormaPago, 'EFECTIVO') as FormaPago,
                COALESCE(SP.Sede, '-') as SedePago,
                COALESCE(T.Temporada, '-') as Temporada
             FROM tblPagos P
             LEFT JOIN tblProductos PR ON P.IdProducto = PR.IdProducto
             LEFT JOIN tblTiposProductos TP ON PR.IdTipoProducto = TP.IdTipoProducto
             LEFT JOIN tblFormasPago F ON COALESCE(P.IdFormaPago, 1) = F.IdFormaPago
             LEFT JOIN tblSedes SP ON P.IdSedePago = SP.IdSede
             LEFT JOIN tblTemporadas T ON P.IdTemporada = T.IdTemporada
             ${temporadaJoin}
             WHERE ${where.join(' AND ')}
             ORDER BY P.FechaPago DESC
             LIMIT ${MAX_ROWS}`,
            [...joinParams, ...params]
        ) as any[];

        /* Primer pago de INSCRIPCIÓN (IdTipoProducto = 2): es la fecha de inscripción.
           Se compara por FechaOrden (YYYY-MM-DD HH:mm:ss), que ordena bien como texto,
           y se muestra el FechaPago ya formateado de ese mismo pago. */
        const inscripcion = pagos
            .filter((p: any) => p.IdTipoProducto === TIPO_PRODUCTO_INSCRIPCION)
            .reduce(
                (min: any, p: any) => (!min || p.FechaOrden < min.FechaOrden ? p : min),
                null as any
            );

        const total = pagos.reduce((sum: number, p: any) => sum + Number(p.Pago ?? 0), 0);

        /* Inscripción sugerida: solo cuando se consulta una temporada y el jugador NO
           tiene inscripción en ella (si la tuviera, aparecería arriba en `inscripcion`,
           porque los pagos que no son mensualidad se acotan por IdTemporada).

           Se busca un pago de inscripción del jugador, archivado en OTRA temporada, que
           se haya cobrado cerca (± DIAS_INSCRIPCION_CERCANA) de alguna de sus
           mensualidades de esta temporada. Ese pago casi siempre es la inscripción de
           esta temporada capturada con la temporada equivocada. */
        let inscripcionSugerida: any = null;
        const yaInscrito = pagos.some((p: any) => p.IdTipoProducto === TIPO_PRODUCTO_INSCRIPCION);

        if (temporadaId && !yaInscrito) {
            const [sugeridas] = await pool.query(
                `SELECT
                    INS.IdPago,
                    DATE_FORMAT(INS.FechaPago, '%d/%m/%Y') as FechaPago,
                    INS.Pago,
                    INS.IdTemporada as TemporadaActual,
                    COALESCE(TI.Temporada, 'Sin temporada') as TemporadaActualNombre,
                    COALESCE(PRI.Producto, 'INSCRIPCIÓN') as Producto,
                    MIN(ABS(DATEDIFF(INS.FechaPago, MEN.FechaPago))) as DiasDeDistancia
                 FROM tblPagos INS
                 INNER JOIN tblProductos PRI ON INS.IdProducto = PRI.IdProducto
                    AND PRI.IdTipoProducto = ${TIPO_PRODUCTO_INSCRIPCION}
                 LEFT JOIN tblTemporadas TI ON TI.IdTemporada = INS.IdTemporada
                 INNER JOIN tblTemporadas TT ON TT.IdTemporada = ?
                 INNER JOIN tblPagos MEN ON MEN.IdJugador = INS.IdJugador AND MEN.Status = 0
                 INNER JOIN tblProductos PRM ON MEN.IdProducto = PRM.IdProducto
                    AND PRM.IdTipoProducto = ${TIPO_PRODUCTO_MENSUALIDAD}
                 WHERE INS.IdJugador = ?
                   AND INS.Status = 0
                   AND (INS.IdTemporada <> ? OR INS.IdTemporada IS NULL)
                   AND MEN.Anio IS NOT NULL AND MEN.Mes BETWEEN 1 AND 12
                   AND (MEN.Anio * 100 + MEN.Mes)
                       BETWEEN (YEAR(TT.FechaInicio) * 100 + MONTH(TT.FechaInicio))
                           AND (YEAR(TT.FechaFin)   * 100 + MONTH(TT.FechaFin))
                   AND ABS(DATEDIFF(INS.FechaPago, MEN.FechaPago)) <= ${DIAS_INSCRIPCION_CERCANA}
                 GROUP BY INS.IdPago, INS.FechaPago, INS.Pago, INS.IdTemporada, TI.Temporada, PRI.Producto
                 ORDER BY DiasDeDistancia ASC, INS.FechaPago DESC
                 LIMIT 1`,
                [temporadaId, parseInt(idJugador), temporadaId]
            ) as any[];

            if (sugeridas.length > 0) inscripcionSugerida = sugeridas[0];
        }

        return NextResponse.json({
            success: true,
            data: {
                jugador: jugadorRows[0],
                pagos,
                total,
                fechaInscripcion: inscripcion?.FechaPago ?? null,
                inscripcionSugerida,
            },
        });
    } catch (error) {
        console.error('Error fetching pagos del jugador:', error);
        return NextResponse.json(
            { success: false, message: 'Error al obtener los pagos' },
            { status: 500 }
        );
    }
}
