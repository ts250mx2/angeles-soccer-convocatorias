/**
 * El color que distingue las copas de las ligas.
 *
 * No es adorno. Tres pantallas están partidas en dos entradas de menú —Convocatorias,
 * Pagos y Catálogo, cada una con su versión de copas y su versión de ligas—, y las dos
 * mitades son la MISMA pantalla con distinto corte: mismo título casi igual, mismas
 * columnas, mismos botones. Sin un color que las separe se acaba dudando de cuál se
 * está viendo, y ese es justo el momento en que alguien captura una copa en las ligas.
 *
 * Ámbar para copas y azul para ligas no se inventa aquí: ya era la convención de los
 * botones de tipo del catálogo y de los bloques de la portada de convocatorias. Lo que
 * cambia es que ahora vive en un solo lugar, para que no se contradigan.
 */

/** Qué torneos pinta una pantalla acotada. Sin tipo, los dos. */
export type TipoTorneo = 'copa' | 'liga';

export interface AcentoTorneo {
    /** Color del icono, en el encabezado y en el menú. */
    icono: string;
    /** Recuadro del icono del encabezado. */
    caja: string;
    /** Entrada del menú seleccionada. */
    menuActivo: string;
    /** Barrita vertical: la del título y la de la entrada seleccionada. */
    barra: string;
    /**
     * Filo de color de la pantalla: arriba de la tarjeta o debajo del encabezado.
     *
     * Va con clases por lado (`border-t-…`) a propósito: la tarjeta ya tiene su
     * `border-white/20` y un color de los cuatro lados se pelearía con él.
     */
    filoSuperior: string;
    filoInferior: string;
    /**
     * Tinte de todo el lienzo de la pantalla.
     *
     * El valor está medido, no elegido a ojo: por debajo del 10% el ámbar no se
     * distingue del degradado azul de la aplicación y la pantalla parece una cualquiera;
     * muy por encima, el fondo compite con las tarjetas y cansa. Las tarjetas van opacas,
     * así que esto solo tiñe el aire de alrededor.
     *
     * Y va con el modificador de siempre (`/15`), no entre corchetes: `bg-amber-500/[0.14]`
     * no genera CSS aquí, así que el tinte quedaba invisible sin que nada fallara.
     */
    fondo: string;
}

export const ACENTO_TORNEO: Record<TipoTorneo, AcentoTorneo> = {
    copa: {
        icono: 'text-amber-400',
        caja: 'bg-amber-500/15 border-amber-500/25',
        menuActivo: 'bg-amber-500/15 text-amber-200 border-amber-500/30',
        barra: 'bg-amber-400',
        filoSuperior: 'border-t-2 border-t-amber-500/60',
        filoInferior: 'border-b-2 border-b-amber-500/60',
        fondo: 'bg-amber-500/15',
    },
    liga: {
        icono: 'text-blue-400',
        caja: 'bg-blue-500/15 border-blue-500/25',
        menuActivo: 'bg-blue-600/20 text-blue-300 border-blue-500/30',
        barra: 'bg-blue-400',
        filoSuperior: 'border-t-2 border-t-blue-500/60',
        filoInferior: 'border-b-2 border-b-blue-500/60',
        fondo: 'bg-blue-500/15',
    },
};

/** El acento de una pantalla acotada. La pantalla completa no lleva: muestra las dos. */
export const acentoDe = (tipo?: TipoTorneo): AcentoTorneo | null =>
    tipo ? ACENTO_TORNEO[tipo] : null;
