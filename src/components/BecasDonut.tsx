"use client";

/**
 * Reparto de los inscritos entre quienes no tienen beca y los niveles de beca.
 *
 * Es part-to-whole de un vistazo, con pocos segmentos: la forma correcta para eso es
 * una dona, no una barra apilada, mientras no haya que comparar valores cercanos. Por
 * eso el listado de al lado trae siempre el número y el porcentaje: la comparación fina
 * se hace ahí y no midiendo ángulos.
 *
 * Colores (validados contra el fondo #0f172a con el validador del skill de dataviz):
 *  - "Sin beca" es el resto, o sea contexto: gris neutro que retrocede.
 *  - Los niveles de beca son una escala ORDENADA (100 > 50 > 25), así que llevan una
 *    rampa de un solo tono, no colores distintos. Más beca = más claro, que sobre
 *    fondo oscuro es lo que se lee como "más".
 *  - "Otras becas" no pertenece a la escala, así que sale de ella con un tono aparte.
 * Solo caben tres escalones de un tono que se distingan entre sí con visión normal
 * (ΔE 15.2 sobre un piso de 15), de ahí el tope de tres niveles con nombre.
 */

export const SIN_BECA_COLOR = '#64748b';
/** Rampa ordinal: del nivel de beca más alto al más bajo. */
export const BECA_RAMPA = ['#cde2fb', '#86b6ef', '#3987e5'];
export const OTRAS_BECAS_COLOR = '#d95926';
/** Máximo de niveles con nombre; el resto se agrupa en "Otras becas". */
export const MAX_NIVELES = BECA_RAMPA.length;

import GraficaPastel, { type Rebanada } from '@/components/GraficaPastel';

export type { Rebanada };

/**
 * La dona de becas es la gráfica genérica con hueco: el número de becados vive en ese
 * hueco, así que aquí el agujero no es decoración sino el espacio donde va el dato.
 */
export default function BecasDonut({ rebanadas, total, tamano = 88 }: {
    rebanadas: Rebanada[];
    /** Denominador; normalmente la suma de las rebanadas. */
    total: number;
    tamano?: number;
}) {
    return <GraficaPastel rebanadas={rebanadas} total={total} tamano={tamano} hueco={27} unidad="inscritos" />;
}
