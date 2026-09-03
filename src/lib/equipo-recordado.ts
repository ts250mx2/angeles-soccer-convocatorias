/**
 * El equipo que se estaba viendo, recordado entre pantallas.
 *
 * La Plantilla y la Asistencia son las dos hojas del MISMO equipo y las usa la misma
 * gente: el cuerpo técnico entra a pasar lista, salta a la plantilla a ver quién es
 * quién, y vuelve. Sin esto, cada salto obligaba a elegir otra vez temporada, categoría
 * y letra —tres desplegables— para llegar al equipo del que nunca se movió.
 *
 * Por eso las dos comparten UNA sola clave y no una cada una: elegir el equipo en
 * cualquiera de las dos lo deja elegido en la otra, que es como se leen en papel.
 *
 * ── Qué se guarda y por qué las tres cosas juntas ──
 *
 * El equipo por sí solo no basta: `IdEquipo` no dice de qué temporada salió la lista, ni
 * en qué sede está, ni qué categoría hay que abrir para llegar a él. Guardar los cuatro
 * datos como una unidad es lo que permite restaurar la pantalla completa; guardar solo el
 * id dejaría los desplegables en blanco con un equipo seleccionado que no aparece en
 * ninguno.
 *
 * ── localStorage y no sessionStorage ──
 *
 * Un entrenador atiende al mismo equipo hoy y el jueves, y abrir el navegador de nuevo
 * no debería costarle otra vez los tres desplegables. El riesgo de que quede viejo está
 * cubierto: quien lo lee valida SIEMPRE que el equipo siga existiendo en la lista de la
 * temporada, y si no, lo suelta (ver `equipoSigueVigente` en las pantallas).
 */

const CLAVE = 'equipoRecordado';

export interface EquipoRecordado {
    temporadaId: number;
    /** La sede, que es el PRIMER desplegable: sin ella los otros dos no se pueden llenar. */
    idSede: number;
    /** El año de la categoría ('2023'), el segundo desplegable. */
    anio: string;
    idEquipo: number;
}

/** Lo último que se eligió, o null si no hay nada guardado o quedó ilegible. */
export function leerEquipoRecordado(): EquipoRecordado | null {
    // En el render del servidor no hay localStorage; devolver null deja el valor por omisión.
    if (typeof window === 'undefined') return null;
    try {
        const crudo = window.localStorage.getItem(CLAVE);
        if (!crudo) return null;
        const v = JSON.parse(crudo) as Partial<EquipoRecordado>;
        /* Se exige la selección COMPLETA: media selección restaurada confunde más que
           ninguna. Lo guardado antes de que existiera el paso de sede no trae `idSede`,
           así que se descarta y la pantalla arranca limpia una vez; a partir de ahí se
           recuerda de nuevo. Es preferible a adivinar la sede del equipo y dejar el
           primer desplegable diciendo algo que el usuario no eligió. */
        if (!Number.isInteger(v.temporadaId) || !Number.isInteger(v.idEquipo)) return null;
        if (!Number.isInteger(v.idSede)) return null;
        if (typeof v.anio !== 'string') return null;
        return {
            temporadaId: Number(v.temporadaId),
            idSede: Number(v.idSede),
            anio: v.anio,
            idEquipo: Number(v.idEquipo),
        };
    } catch {
        // Un JSON corrupto o el almacenamiento bloqueado no deben tumbar la pantalla.
        return null;
    }
}

/** Guarda la selección. Con `null` se olvida, que es lo que toca al soltar el equipo. */
export function guardarEquipoRecordado(v: EquipoRecordado | null): void {
    if (typeof window === 'undefined') return;
    try {
        if (v === null) window.localStorage.removeItem(CLAVE);
        else window.localStorage.setItem(CLAVE, JSON.stringify(v));
    } catch {
        /* Modo privado o almacenamiento lleno: recordar es una comodidad, no un requisito. */
    }
}
